import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { CrownDuelsState, CrownDuelsCard, PlayerState, Zone, Suit } from './types';
import { SUITS, ZONES, ROYAL_VITALITY } from './types';
import {
	createCrownDuelsDeck,
	getRoyaltyForSuit,
	getRemainingRoyalty,
	getNonRoyalCards,
	shuffle,
} from './cards';
import {
	resolveRound,
	resolveReveal,
	cleanupRound,
	getActiveVitality,
	ensureDeckHasCards,
} from './resolution';
import { drawCards } from './cards';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function createEmptyZones() {
	return {
		attack: [] as CrownDuelsCard[],
		defence: [] as CrownDuelsCard[],
		spell: [] as CrownDuelsCard[],
		corruption: [] as CrownDuelsCard[],
	};
}

function createPlayer(): PlayerState {
	return {
		chosenSuit: null,
		royaltyStack: [],
		activeRoyalIndex: 0,
		hp: 0,
		hpStack: [],
		hand: [],
		zones: createEmptyZones(),
		corruptionStore: [],
		hasJester: false,
		justBecameCorrupt: false,
		donePlacing: false,
		confirmedReveal: false,
		confirmedFightDone: false,
	};
}

function setup(ctx: Ctx): CrownDuelsState {
	const players: Record<string, PlayerState> = {};
	for (let i = 0; i < ctx.numPlayers; i++) {
		players[String(i)] = createPlayer();
	}
	return {
		players,
		drawDeck: [],
		discardPile: [],
		roundNumber: 0,
		lastRoundResult: null,
		pendingRevealEvents: null,
		gameWinner: null,
		history: [],
	};
}

// ---------------------------------------------------------------------------
// Suit-selection phase helpers
// ---------------------------------------------------------------------------

function allSuitsChosen(G: CrownDuelsState): boolean {
	return Object.values(G.players).every((p) => p.chosenSuit !== null);
}

function suitAlreadyTaken(G: CrownDuelsState, suit: Suit): boolean {
	return Object.values(G.players).some((p) => p.chosenSuit === suit);
}

/**
 * After both players chose suits, build royalty stacks, HP stacks,
 * draw deck, assign Jester, and deal initial hands (3 cards each).
 */
function initializeAfterSuitSelection(G: CrownDuelsState): void {
	const deck = createCrownDuelsDeck();
	const pids = Object.keys(G.players);
	const chosenSuits = pids.map((pid) => G.players[pid].chosenSuit!);

	for (const pid of pids) {
		const suit = G.players[pid].chosenSuit!;
		G.players[pid].royaltyStack = getRoyaltyForSuit(deck, suit);
		G.players[pid].activeRoyalIndex = 0;
		G.players[pid].hp = ROYAL_VITALITY['J'];
	}

	const remaining = shuffle([...getRemainingRoyalty(deck, chosenSuits)]);
	G.players[pids[0]].hpStack = remaining.slice(0, 3);
	G.players[pids[1]].hpStack = remaining.slice(3, 6);

	G.drawDeck = shuffle([...getNonRoyalCards(deck)]);
	G.discardPile = [];

	// Jokers are not used in play; do not put them in discardPile — reshuffle would
	// recycle them into the draw deck and they could be dealt to a hand.
	const jesterHolder = pids[Math.floor(Math.random() * pids.length)];
	G.players[jesterHolder].hasJester = true;

	// Initial draw: 3 cards each (per setup rules)
	for (const pid of pids) {
		G.players[pid].hand.push(...G.drawDeck.splice(0, 3));
	}

	G.roundNumber = 1;
}

// ---------------------------------------------------------------------------
// Plot phase helpers
// ---------------------------------------------------------------------------

/**
 * How many cards a player must keep in hand at end of Plot
 * (1 normally, 2 if they just became corrupt).
 */
function cardsToKeep(player: PlayerState): number {
	return player.justBecameCorrupt ? 2 : 1;
}

/** A player is done placing when they have cardsToKeep() or fewer cards left. */
function isPlayerDonePlacing(player: PlayerState): boolean {
	return player.hand.length <= cardsToKeep(player);
}

/**
 * Determine who should go first this round in the Plot phase.
 *
 * Rules:
 * - Player with the most cards in hand goes first.
 * - If tied: pass the Jester to the other player; that player goes first.
 * - Exception: in round 1, the Jester holder goes first without passing.
 *
 * Returns the player ID who goes first.
 */
function determineFirstPlayer(G: CrownDuelsState): string {
	const pids = Object.keys(G.players);
	const [p0, p1] = [G.players[pids[0]], G.players[pids[1]]];

	if (p0.hand.length > p1.hand.length) return pids[0];
	if (p1.hand.length > p0.hand.length) return pids[1];

	// Tied — pass the Jester (except round 1)
	if (G.roundNumber > 1) {
		const currentJesterHolder = p0.hasJester ? pids[0] : pids[1];
		const newJesterHolder = currentJesterHolder === pids[0] ? pids[1] : pids[0];
		G.players[currentJesterHolder].hasJester = false;
		G.players[newJesterHolder].hasJester = true;
		return newJesterHolder;
	}

	// Round 1: Jester holder goes first
	return p0.hasJester ? pids[0] : pids[1];
}

/**
 * After a player places a card, determine whose turn it is next.
 *
 * Rules:
 * - If you still have more cards than your opponent, continue placing.
 * - Once equal, your opponent places one, then you, alternating.
 * - A player is done when they have 1 card left (2 if corrupt).
 *
 * Returns the player ID who should go next, or null if both are done.
 */
function getNextPlayer(G: CrownDuelsState, currentPid: string): string | null {
	const pids = Object.keys(G.players);
	const otherPid = pids.find((id) => id !== currentPid)!;
	const current = G.players[currentPid];
	const other = G.players[otherPid];

	// Check if both are done
	if (current.donePlacing && other.donePlacing) return null;

	// If current player is done, other goes
	if (current.donePlacing) return other.donePlacing ? null : otherPid;
	if (other.donePlacing) return current.donePlacing ? null : currentPid;

	// If current player still has more cards, they continue
	if (current.hand.length > other.hand.length) return currentPid;

	// Otherwise alternate to other player
	return otherPid;
}

/**
 * Called after both players finish placing. Discard remaining hand cards.
 * Each player discards their last card (or 2 if corrupt).
 */
function discardRemainingHands(G: CrownDuelsState): void {
	for (const pid of Object.keys(G.players)) {
		const p = G.players[pid];
		G.discardPile.push(...p.hand.splice(0));
	}
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function chooseSuit(
	{ G, ctx, events }: { G: CrownDuelsState; ctx: Ctx; events: any },
	suit: Suit,
) {
	const pid = ctx.currentPlayer;
	if (!SUITS.includes(suit)) return INVALID_MOVE;
	if (G.players[pid].chosenSuit !== null) return INVALID_MOVE;
	if (suitAlreadyTaken(G, suit)) return INVALID_MOVE;

	G.players[pid].chosenSuit = suit;

	if (allSuitsChosen(G)) {
		initializeAfterSuitSelection(G);
		events.setPhase('placement');
	} else {
		events.endTurn();
	}
}

function placeCard(
	{ G, ctx, events }: { G: CrownDuelsState; ctx: Ctx; events: any },
	handIndex: number,
	zone: Zone,
) {
	const pid = ctx.currentPlayer;
	const player = G.players[pid];
	if (!player) return INVALID_MOVE;
	if (player.donePlacing) return INVALID_MOVE;
	if (!ZONES.includes(zone)) return INVALID_MOVE;
	if (handIndex < 0 || handIndex >= player.hand.length) return INVALID_MOVE;

	// Can't place in corruption zone right after becoming corrupt
	if (zone === 'corruption' && player.justBecameCorrupt) return INVALID_MOVE;

	// Place card face-down in the zone
	const card = player.hand.splice(handIndex, 1)[0];
	card.faceDown = true;
	player.zones[zone].push(card);

	// Check if this player is now done placing
	if (isPlayerDonePlacing(player)) {
		player.donePlacing = true;
	}

	// Check if both players are done
	const pids = Object.keys(G.players);
	const allDone = pids.every((id) => G.players[id].donePlacing);

	if (allDone) {
		// Discard remaining hand cards
		discardRemainingHands(G);
		// Run reveal phase (flip cards, discard invalid ones)
		executeRevealOnly(G);
		// Transition to reveal phase for confirmation
		events.setPhase('reveal');
	} else {
		const nextPid = getNextPlayer(G, pid);
		if (nextPid && nextPid !== pid) {
			events.endTurn();
		}
		// If nextPid === pid, current player continues (no endTurn)
	}
}

function removeFromZone(
	{ G, ctx }: { G: CrownDuelsState; ctx: Ctx },
	zone: Zone,
	zoneIndex: number,
) {
	const pid = ctx.currentPlayer;
	const player = G.players[pid];
	if (!player) return INVALID_MOVE;
	if (player.donePlacing) return INVALID_MOVE;
	if (!ZONES.includes(zone)) return INVALID_MOVE;

	// Only allow removing cards placed this round (face-down)
	const cards = player.zones[zone];
	if (zoneIndex < 0 || zoneIndex >= cards.length) return INVALID_MOVE;
	if (!cards[zoneIndex].faceDown) return INVALID_MOVE;

	const card = cards.splice(zoneIndex, 1)[0];
	card.faceDown = false;
	player.hand.push(card);
}

function confirmPlacement(
	{ G, ctx, events }: { G: CrownDuelsState; ctx: Ctx; events: any },
) {
	const pid = ctx.currentPlayer;
	const player = G.players[pid];
	if (player.donePlacing) return INVALID_MOVE;

	player.donePlacing = true;

	const pids = Object.keys(G.players);
	const allDone = pids.every((id) => G.players[id].donePlacing);

	if (allDone) {
		// Discard remaining hand cards
		discardRemainingHands(G);
		// Run reveal phase (flip cards, discard invalid ones)
		executeRevealOnly(G);
		// Transition to reveal phase for confirmation
		events.setPhase('reveal');
	} else {
		events.endTurn();
	}
}

function confirmReveal(
	{ G, ctx, events }: { G: CrownDuelsState; ctx: Ctx; events: any },
) {
	const pid = ctx.currentPlayer;
	const player = G.players[pid];
	if (player.confirmedReveal) return INVALID_MOVE;

	player.confirmedReveal = true;

	const pids = Object.keys(G.players);
	const allConfirmed = pids.every((id) => G.players[id].confirmedReveal);

	if (allConfirmed) {
		for (const id of pids) {
			G.players[id].confirmedFightDone = false;
		}
		// Resolve fight on the board; cleanup (discard ♥/♦, draw) waits until both ack fightResolution
		executeFightWithoutCleanup(G);
		events.setPhase('fightResolution');
	} else {
		events.endTurn();
	}
}

function ackFightComplete({
	G,
	ctx,
	events,
}: {
	G: CrownDuelsState;
	ctx: Ctx;
	events: { endTurn: () => void; setPhase: (p: string) => void };
}) {
	const pid = ctx.currentPlayer;
	const player = G.players[pid];
	if (ctx.phase !== 'fightResolution' || !player || player.confirmedFightDone) {
		return INVALID_MOVE;
	}

	player.confirmedFightDone = true;

	const pids = Object.keys(G.players);
	const allDone = pids.every((id) => G.players[id].confirmedFightDone);

	if (allDone) {
		const pids2 = Object.keys(G.players);
		console.log('[ackFightComplete] allDone! hands before cleanup:', pids2.map(id => `${id}:${G.players[id].hand.length}`).join(', '));
		cleanupRound(G);
		console.log('[ackFightComplete] after cleanup: gameWinner=%s hands:', G.gameWinner, pids2.map(id => `${id}:${G.players[id].hand.length}`).join(', '));
		if (G.gameWinner !== null) return;
		prepareNextRound(G);
		console.log('[ackFightComplete] after prepareNextRound: round=%d hands:', G.roundNumber, pids2.map(id => `${id}:${G.players[id].hand.length}`).join(', '));
		events.setPhase('placement');
	} else {
		events.endTurn();
	}
}

// ---------------------------------------------------------------------------
// Round resolution & preparation
// ---------------------------------------------------------------------------

function executeRevealOnly(G: CrownDuelsState): void {
	// Run reveal: flip cards, discard invalid ones, store events for animation
	const revealEvents = resolveReveal(G);
	// Store reveal events for UI animation
	G.pendingRevealEvents = revealEvents;
}

/** Fight + spells + damage; leaves zones intact for UI until {@link cleanupRound}. */
function executeFightWithoutCleanup(G: CrownDuelsState): void {
	const pendingRevealEvents = G.pendingRevealEvents ?? [];
	G.pendingRevealEvents = null;

	const result = resolveRound(G);
	result.revealEvents = pendingRevealEvents;
	G.lastRoundResult = result;
}

function prepareNextRound(G: CrownDuelsState): void {
	G.roundNumber++;

	for (const pid of Object.keys(G.players)) {
		const p = G.players[pid];
		p.donePlacing = false;
		p.confirmedReveal = false;
		p.confirmedFightDone = false;
		// justBecameCorrupt lasts only one round (the Plot phase restriction)
		p.justBecameCorrupt = false;
	}
	// Card draw already happened inside cleanupRound
}

/**
 * Runs when entering the Plot phase. Resets placement flags (safety net if state was
 * inconsistent) and refills hands if cleanup draw was skipped or lost.
 */
function onBeginPlacement({ G }: { G: CrownDuelsState }): CrownDuelsState {
	const pids = Object.keys(G.players);
	console.log('[onBeginPlacement] round=%d gameWinner=%s hands:', G.roundNumber, G.gameWinner, pids.map(id => `${id}:${G.players[id].hand.length}`).join(', '));
	for (const pid of pids) {
		G.players[pid].donePlacing = false;
	}
	if (G.gameWinner !== null) {
		return G;
	}
	const resolveOrder = G.players[pids[0]].hasJester ? [0, 1] : [1, 0];
	for (const idx of resolveOrder) {
		const p = G.players[pids[idx]];
		const vitality = getActiveVitality(p);
		console.log('[onBeginPlacement] player %s: hand=%d vitality=%d deck=%d', pids[idx], p.hand.length, vitality, G.drawDeck.length);
		if (p.hand.length < vitality) {
			const needed = vitality - p.hand.length;
			ensureDeckHasCards(G, needed);
			p.hand.push(...drawCards(G.drawDeck, needed));
			console.log('[onBeginPlacement] player %s: drew %d, handAfter=%d', pids[idx], needed, p.hand.length);
		}
	}
	return G;
}

// ---------------------------------------------------------------------------
// Game definition (boardgame.io)
// ---------------------------------------------------------------------------

export const CrownDuelsGame: Game<CrownDuelsState> = {
	name: 'crown-duels',
	setup: ({ ctx }: { ctx: Ctx }) => setup(ctx),

	phases: {
		suitSelection: {
			start: true,
			next: 'placement',
			turn: {
				minMoves: 1,
				maxMoves: 1,
			},
			moves: { chooseSuit },
		},
		placement: {
			onBegin: onBeginPlacement,
			turn: {
				minMoves: 0,
				maxMoves: 99,
			},
			moves: { placeCard, removeFromZone, confirmPlacement },
		},
		reveal: {
			turn: {
				minMoves: 1,
				maxMoves: 1,
			},
			moves: { confirmReveal },
		},
		fightResolution: {
			turn: {
				minMoves: 1,
				maxMoves: 1,
			},
			moves: { ackFightComplete },
		},
	},

	endIf: ({ G }) => {
		if (G.gameWinner === 'draw') {
			return { isDraw: true };
		}
		if (G.gameWinner !== null) {
			return { winner: G.gameWinner };
		}
		return undefined;
	},
};
