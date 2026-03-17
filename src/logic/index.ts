import { defineGame, redactCards } from '@engine/client';
import type { BaseGameState } from '@engine/client';
import { CrownDuelsGame } from './game';
import type { CrownDuelsState, CrownDuelsCard } from './types';
import { ZONES } from './types';

export type { CrownDuelsState, CrownDuelsCard, PlayerState, Zone, Suit, RoundResult, FightDetail } from './types';
export { PLAYER_COLORS, SUITS, ZONES, ROYAL_VITALITY } from './types';
export type { PlayerColor } from './types';

// ---------------------------------------------------------------------------
// stripSecretInfo — hide opponent's hand and face-down zone cards
// ---------------------------------------------------------------------------

function stripSecretInfo(G: CrownDuelsState, playerID: string | null): BaseGameState {
	const stripped = structuredClone(G) as CrownDuelsState;

	for (const pid of Object.keys(stripped.players)) {
		if (pid === playerID) continue;

		// Redact opponent's hand
		stripped.players[pid].hand = redactCards(
			stripped.players[pid].hand,
		) as unknown as CrownDuelsCard[];

		// Redact face-down zone cards (placed this round, not yet revealed)
		for (const zone of ZONES) {
			stripped.players[pid].zones[zone] = stripped.players[pid].zones[zone].map((card) => {
				if (card.faceDown) {
					return { hidden: true } as unknown as CrownDuelsCard;
				}
				return card;
			});
		}

		// HP stack is always hidden
		stripped.players[pid].hpStack = redactCards(
			stripped.players[pid].hpStack,
		) as unknown as CrownDuelsCard[];

		// Corruption store count is visible but card contents are hidden
		stripped.players[pid].corruptionStore = redactCards(
			stripped.players[pid].corruptionStore,
		) as unknown as CrownDuelsCard[];
	}

	// Draw deck is always hidden
	stripped.drawDeck = redactCards(stripped.drawDeck) as unknown as CrownDuelsCard[];

	return stripped;
}

// ---------------------------------------------------------------------------
// Game definition (engine registration)
// ---------------------------------------------------------------------------

export const gameDef = defineGame<CrownDuelsState>({
	game: CrownDuelsGame,
	id: 'crown-duels',
	displayName: 'Crown Duels',
	description: 'A 2-player royal combat card game. Equip weapons, don armour, and cast spells to defeat your rival\'s royalty!',
	minPlayers: 2,
	maxPlayers: 2,
	stripSecretInfo,

	validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
		if (moveName === 'chooseSuit') {
			if (G.players[playerID]?.chosenSuit !== null) return 'Already chose a suit';
			const suit = args[0] as string;
			if (!['hearts', 'diamonds', 'clubs', 'spades'].includes(suit)) return 'Invalid suit';
			const taken = Object.values(G.players).some(
				(p) => (p as any).chosenSuit === suit,
			);
			if (taken) return 'Suit already taken';
			return true;
		}

		if (playerID !== currentPlayer) return 'Not your turn';

		if (moveName === 'placeCard') {
			const [handIndex, zone] = args as [number, string];
			if (typeof handIndex !== 'number') return 'Invalid hand index';
			if (!ZONES.includes(zone as any)) return 'Invalid zone';
			const player = G.players[playerID] as any;
			if (!player) return 'Player not found';
			if (player.donePlacing) return 'Already finished placing';
			if (handIndex < 0 || handIndex >= player.hand.length) return 'Card index out of range';
			if (zone === 'corruption' && player.justBecameCorrupt) {
				return 'Cannot place in corruption zone this round';
			}
			return true;
		}

		if (moveName === 'removeFromZone') {
			const [zone, zoneIndex] = args as [string, number];
			if (!ZONES.includes(zone as any)) return 'Invalid zone';
			if (typeof zoneIndex !== 'number') return 'Invalid zone index';
			const player = G.players[playerID] as any;
			if (!player) return 'Player not found';
			if (player.donePlacing) return 'Already finished placing';
			const zoneCards = player.zones[zone];
			if (zoneIndex < 0 || zoneIndex >= zoneCards.length) return 'Zone index out of range';
			if (!zoneCards[zoneIndex].faceDown) return 'Can only remove cards placed this round';
			return true;
		}

		if (moveName === 'confirmPlacement') {
			return true;
		}

		return 'Unknown move';
	},
});

// ---------------------------------------------------------------------------
// Scoring / rankings (for game-over display)
// ---------------------------------------------------------------------------

export function getPlayerRankings(G: CrownDuelsState) {
	const pids = Object.keys(G.players);
	return pids.map((pid) => {
		const p = G.players[pid];
		return {
			playerId: pid,
			royalsDefeated: p.activeRoyalIndex,
			isWinner: G.gameWinner === pid,
			activeRoyal: p.royaltyStack[p.activeRoyalIndex]?.rank ?? '?',
			hp: p.hp,
		};
	});
}
