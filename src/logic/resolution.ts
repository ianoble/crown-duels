import type {
	CrownDuelsCard,
	CrownDuelsState,
	PlayerState,
	PlayerZones,
	FightDetail,
	RoundResult,
	RevealEvent,
	FightEvent,
} from './types';
import { ROYAL_VITALITY } from './types';
import { drawCards, reshuffleDiscard } from './cards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getActiveVitality(player: PlayerState): number {
	const royal = player.royaltyStack[player.activeRoyalIndex];
	if (!royal) return 3;
	const rank = royal.rank as 'J' | 'Q' | 'K';
	return ROYAL_VITALITY[rank] ?? 3;
}

/** Ensure draw pile has at least `needed` cards (reshuffle discard once or until exhausted). */
export function ensureDeckHasCards(G: CrownDuelsState, needed: number): void {
	while (G.drawDeck.length < needed && G.discardPile.length > 0) {
		reshuffleDiscard(G.drawDeck, G.discardPile);
	}
}

function cardsBySuit(cards: CrownDuelsCard[], suit: string): CrownDuelsCard[] {
	return cards.filter((c) => c.suit === suit);
}

function hasMatchingValue(cards: CrownDuelsCard[], value: number): boolean {
	return cards.some((c) => c.value === value);
}

function countMatchingValues(cards: CrownDuelsCard[], value: number): number {
	return cards.filter((c) => c.value === value).length;
}

function cloneCard(c: CrownDuelsCard): CrownDuelsCard {
	return { ...c };
}

function clonePlayerZones(z: PlayerZones): PlayerZones {
	return {
		attack: z.attack.map(cloneCard),
		defence: z.defence.map(cloneCard),
		spell: z.spell.map(cloneCard),
		corruption: z.corruption.map(cloneCard),
	};
}

// ---------------------------------------------------------------------------
// Phase 2: REVEAL
// ---------------------------------------------------------------------------

/**
 * Reveal phase: flip face-down cards, enforce stacking rules, discard
 * wrong-suit and duplicate-spell cards.
 *
 * Rules:
 * 1. Flip all zone cards face-up (except corruption zone).
 * 2. In attack zone: discard all existing ♣s with higher value than the
 *    lowest newly-revealed ♣.
 * 3. In defence zone: discard all existing ♠s with higher value than the
 *    lowest newly-revealed ♠.
 * 4. Discard all ♣s in defence zone and all ♠s in attack zone.
 * 5. In spell zone: discard all cards that share a suit with another card.
 */
export function resolveReveal(G: CrownDuelsState): RevealEvent[] {
	const events: RevealEvent[] = [];

	for (const pid of Object.keys(G.players)) {
		const p = G.players[pid];

		const newAttackClubs = p.zones.attack.filter((c) => c.faceDown && c.suit === 'clubs');
		const newDefenceSpades = p.zones.defence.filter((c) => c.faceDown && c.suit === 'spades');

		// 1. Flip all non-corruption zone cards face-up
		const flippedCards: CrownDuelsCard[] = [];
		for (const zone of ['attack', 'defence', 'spell'] as const) {
			for (const card of p.zones[zone]) {
				if (card.faceDown) {
					// Clone the card with faceDown=true for animation (before we flip it)
					flippedCards.push({ ...card, faceDown: true });
					card.faceDown = false;
				}
			}
		}
		if (flippedCards.length > 0) {
			events.push({
				step: 1,
				playerId: pid,
				type: 'flip',
				cardIds: flippedCards.map((c) => c.id),
				cards: flippedCards,
				reason: 'Reveal all cards',
			});
		}

		// 2. Attack zone: discard existing ♣s higher than lowest new ♣
		if (newAttackClubs.length > 0) {
			const lowestNewClub = Math.min(...newAttackClubs.map((c) => c.value));
			const toDiscard = p.zones.attack.filter(
				(c) => c.suit === 'clubs' && !newAttackClubs.includes(c) && c.value > lowestNewClub,
			);
			if (toDiscard.length > 0) {
				events.push({
					step: 2,
					playerId: pid,
					type: 'discard',
					zone: 'attack',
					cardIds: toDiscard.map((c) => c.id),
					cards: toDiscard.map((c) => ({ ...c })),
					reason: `♣s higher than ${lowestNewClub} in attack`,
				});
				for (const card of toDiscard) {
					p.zones.attack.splice(p.zones.attack.indexOf(card), 1);
					G.discardPile.push(card);
				}
			}
		}

		// 3. Defence zone: discard existing ♠s higher than lowest new ♠
		if (newDefenceSpades.length > 0) {
			const lowestNewSpade = Math.min(...newDefenceSpades.map((c) => c.value));
			const toDiscard = p.zones.defence.filter(
				(c) => c.suit === 'spades' && !newDefenceSpades.includes(c) && c.value > lowestNewSpade,
			);
			if (toDiscard.length > 0) {
				events.push({
					step: 3,
					playerId: pid,
					type: 'discard',
					zone: 'defence',
					cardIds: toDiscard.map((c) => c.id),
					cards: toDiscard.map((c) => ({ ...c })),
					reason: `♠s higher than ${lowestNewSpade} in defence`,
				});
				for (const card of toDiscard) {
					p.zones.defence.splice(p.zones.defence.indexOf(card), 1);
					G.discardPile.push(card);
				}
			}
		}

		// 4. Discard ♣s in defence zone and ♠s in attack zone
		const wrongSuitDefence = p.zones.defence.filter((c) => c.suit === 'clubs');
		if (wrongSuitDefence.length > 0) {
			events.push({
				step: 4,
				playerId: pid,
				type: 'discard',
				zone: 'defence',
				cardIds: wrongSuitDefence.map((c) => c.id),
				cards: wrongSuitDefence.map((c) => ({ ...c })),
				reason: '♣s cannot be in defence',
			});
			for (const card of wrongSuitDefence) {
				p.zones.defence.splice(p.zones.defence.indexOf(card), 1);
				G.discardPile.push(card);
			}
		}
		const wrongSuitAttack = p.zones.attack.filter((c) => c.suit === 'spades');
		if (wrongSuitAttack.length > 0) {
			events.push({
				step: 4,
				playerId: pid,
				type: 'discard',
				zone: 'attack',
				cardIds: wrongSuitAttack.map((c) => c.id),
				cards: wrongSuitAttack.map((c) => ({ ...c })),
				reason: '♠s cannot be in attack',
			});
			for (const card of wrongSuitAttack) {
				p.zones.attack.splice(p.zones.attack.indexOf(card), 1);
				G.discardPile.push(card);
			}
		}

		// 5. Spell zone: discard all cards of any suit that appears more than once
		const suitCounts = new Map<string, number>();
		for (const card of p.zones.spell) {
			suitCounts.set(card.suit as string, (suitCounts.get(card.suit as string) ?? 0) + 1);
		}
		const duplicateSuits = new Set<string>();
		for (const [suit, count] of suitCounts) {
			if (count > 1) duplicateSuits.add(suit);
		}
		if (duplicateSuits.size > 0) {
			const spellDiscards = p.zones.spell.filter((c) => duplicateSuits.has(c.suit as string));
			events.push({
				step: 5,
				playerId: pid,
				type: 'discard',
				zone: 'spell',
				cardIds: spellDiscards.map((c) => c.id),
				cards: spellDiscards.map((c) => ({ ...c })),
				reason: 'Duplicate suits in spell zone',
			});
			p.zones.spell = p.zones.spell.filter((c) => !duplicateSuits.has(c.suit as string));
			G.discardPile.push(...spellDiscards);
		}
	}

	return events;
}

// ---------------------------------------------------------------------------
// Phase 3: FIGHT — Strength & Block calculation
// ---------------------------------------------------------------------------

/**
 * ♣ in attack zone — Weapons:
 * Add your highest ♣ value to strength, plus 1 for each other lower ♣.
 */
function calcWeaponStrength(attackZone: CrownDuelsCard[]): number {
	const clubs = cardsBySuit(attackZone, 'clubs').sort((a, b) => b.value - a.value);
	if (clubs.length === 0) return 0;
	return clubs[0].value + (clubs.length - 1);
}

/**
 * ♥ in attack zone — Ignite!:
 * For each ♥, add its value to strength.
 * Match bonus: if a ♥ matches a ♣ value in the attack zone, add its value again.
 */
function calcIgniteStrength(attackZone: CrownDuelsCard[]): number {
	const hearts = cardsBySuit(attackZone, 'hearts');
	const clubs = cardsBySuit(attackZone, 'clubs');
	let total = 0;
	for (const h of hearts) {
		total += h.value;
		if (hasMatchingValue(clubs, h.value)) {
			total += h.value;
		}
	}
	return total;
}

/**
 * ♠ in defence zone — Armour:
 * Add your highest ♠ value to block, plus 1 for each other lower ♠.
 */
function calcArmourBlock(defenceZone: CrownDuelsCard[]): number {
	const spades = cardsBySuit(defenceZone, 'spades').sort((a, b) => b.value - a.value);
	if (spades.length === 0) return 0;
	return spades[0].value + (spades.length - 1);
}

/**
 * ♥ in defence zone — Ward!:
 * For each ♥, add its value to block.
 * Match bonus: if a ♥ matches a ♠ value in the defence zone, add its value again.
 */
function calcWardBlock(defenceZone: CrownDuelsCard[]): number {
	const hearts = cardsBySuit(defenceZone, 'hearts');
	const spades = cardsBySuit(defenceZone, 'spades');
	let total = 0;
	for (const h of hearts) {
		total += h.value;
		if (hasMatchingValue(spades, h.value)) {
			total += h.value;
		}
	}
	return total;
}

/**
 * ♦ in attack zone — Critical Hit!:
 * If you hit, for each ♦ deal +1 damage.
 * Match bonus: for each ♦ matching a ♣ value, deal another +1 damage.
 */
function calcCriticalHitDamage(attackZone: CrownDuelsCard[]): number {
	const diamonds = cardsBySuit(attackZone, 'diamonds');
	const clubs = cardsBySuit(attackZone, 'clubs');
	let total = 0;
	for (const d of diamonds) {
		total += 1;
		if (hasMatchingValue(clubs, d.value)) {
			total += 1;
		}
	}
	return total;
}

/**
 * ♦ in defence zone — Exploit!:
 * If you were hit, for each ♦ draw 1 card.
 * Match bonus: for each ♦ matching a ♠ value, draw another card.
 */
function calcExploitDraw(defenceZone: CrownDuelsCard[]): number {
	const diamonds = cardsBySuit(defenceZone, 'diamonds');
	const spades = cardsBySuit(defenceZone, 'spades');
	let total = 0;
	for (const d of diamonds) {
		total += 1;
		if (hasMatchingValue(spades, d.value)) {
			total += 1;
		}
	}
	return total;
}

// ---------------------------------------------------------------------------
// Fight: ♣/♠ spell adjustments (resolved during Fight step)
// ---------------------------------------------------------------------------

interface SpellAdjustment {
	allOutAttack: boolean;
	allOutDefence: boolean;
	effects: string[];
}

function resolveSpellAdjustments(spellZone: CrownDuelsCard[]): SpellAdjustment {
	const result: SpellAdjustment = {
		allOutAttack: false,
		allOutDefence: false,
		effects: [],
	};

	for (const card of spellZone) {
		if (card.suit === 'clubs') {
			result.allOutAttack = true;
			result.effects.push('♣ All Out Attack!: block → strength, block = 0');
		} else if (card.suit === 'spades') {
			result.allOutDefence = true;
			result.effects.push('♠ All Out Defence!: strength → block, strength = 0');
		}
	}

	if (result.allOutAttack && result.allOutDefence) {
		result.effects = ['Face Plant!: strength AND block = 0'];
	}

	return result;
}

// ---------------------------------------------------------------------------
// Phase 4: CAST SPELLS — ♥ Siphon and ♦ Shatter
// (♣/♠ spells are resolved during Fight step above)
// ---------------------------------------------------------------------------

/**
 * ♥ in spell zone — Siphon!:
 * For each ♥, put the top card of the deck face down into your corruption zone.
 * Match bonus: for each ♥, if it matches any ♣ or ♠ in your opponent's
 * attack/defence zones, put another card for each match.
 */
function resolveSiphon(
	player: PlayerState,
	opponent: PlayerState,
	spellZone: CrownDuelsCard[],
	G: CrownDuelsState,
): string[] {
	const hearts = cardsBySuit(spellZone, 'hearts');
	if (hearts.length === 0) return [];

	const effects: string[] = [];
	const opponentClubsAndSpades = [
		...cardsBySuit(opponent.zones.attack, 'clubs'),
		...cardsBySuit(opponent.zones.defence, 'spades'),
	];

	for (const h of hearts) {
		// Base: 1 card into corruption
		let cardsToSiphon = 1;

		// Match bonus: +1 for each ♣ or ♠ in opponent's zones with matching value
		const matches = countMatchingValues(opponentClubsAndSpades, h.value);
		cardsToSiphon += matches;

		ensureDeckHasCards(G, cardsToSiphon);
		const siphoned = drawCards(G.drawDeck, cardsToSiphon);
		for (const card of siphoned) {
			card.faceDown = true;
		}
		player.corruptionStore.push(...siphoned);

		if (matches > 0) {
			effects.push(`♥${h.value} Siphon! ${cardsToSiphon} card(s) → corruption (${matches} match bonus)`);
		} else {
			effects.push(`♥${h.value} Siphon! 1 card → corruption`);
		}
	}

	return effects;
}

/**
 * ♦ in spell zone — Shatter!:
 * For each ♦, out of all the ♣ and ♠ in opponent's attack/defence zones,
 * destroy the one with the lowest number. Ties: ♠ is destroyed.
 *
 * Match bonus: for each ♦, if it matches any ♣ or ♠ in opponent's zones,
 * first destroy ALL such matching cards.
 */
function resolveShatter(
	opponent: PlayerState,
	spellZone: CrownDuelsCard[],
	G: CrownDuelsState,
): string[] {
	const diamonds = cardsBySuit(spellZone, 'diamonds');
	if (diamonds.length === 0) return [];

	const effects: string[] = [];

	for (const d of diamonds) {
		let destroyed = 0;

		// Match bonus first: destroy ALL ♣/♠ in opponent's zones with matching value
		const matchValue = d.value;
		const matchAttack = opponent.zones.attack.filter(
			(c) => c.suit === 'clubs' && c.value === matchValue,
		);
		const matchDefence = opponent.zones.defence.filter(
			(c) => c.suit === 'spades' && c.value === matchValue,
		);

		for (const card of matchAttack) {
			opponent.zones.attack.splice(opponent.zones.attack.indexOf(card), 1);
			G.discardPile.push(card);
			destroyed++;
		}
		for (const card of matchDefence) {
			opponent.zones.defence.splice(opponent.zones.defence.indexOf(card), 1);
			G.discardPile.push(card);
			destroyed++;
		}

		// Base: destroy the lowest ♣/♠ remaining in opponent's zones (♠ loses ties)
		const allTargets: { card: CrownDuelsCard; zone: 'attack' | 'defence' }[] = [];
		for (const c of opponent.zones.attack) {
			if (c.suit === 'clubs') allTargets.push({ card: c, zone: 'attack' });
		}
		for (const c of opponent.zones.defence) {
			if (c.suit === 'spades') allTargets.push({ card: c, zone: 'defence' });
		}

		if (allTargets.length > 0) {
			// Sort: lowest value first; on tie, ♠ (defence) before ♣ (attack)
			allTargets.sort((a, b) => {
				if (a.card.value !== b.card.value) return a.card.value - b.card.value;
				// ♠ is destroyed first on tie
				if (a.card.suit === 'spades' && b.card.suit === 'clubs') return -1;
				if (a.card.suit === 'clubs' && b.card.suit === 'spades') return 1;
				return 0;
			});

			const target = allTargets[0];
			const zoneArr = target.zone === 'attack' ? opponent.zones.attack : opponent.zones.defence;
			zoneArr.splice(zoneArr.indexOf(target.card), 1);
			G.discardPile.push(target.card);
			destroyed++;
		}

		if (destroyed > 0) {
			effects.push(`♦${d.value} Shatter! Destroyed ${destroyed} card(s)`);
		} else {
			effects.push(`♦${d.value} Shatter! No targets`);
		}
	}

	return effects;
}

// ---------------------------------------------------------------------------
// Damage & royal defeat
// ---------------------------------------------------------------------------

/**
 * Apply damage to a player. Each point of damage reduces HP.
 * Returns true if the active royal was defeated (HP reaches 0).
 */
export function applyDamage(player: PlayerState, damage: number): boolean {
	if (damage <= 0) return false;
	player.hp = Math.max(0, player.hp - damage);
	return player.hp <= 0;
}

/**
 * Handle a defeated royal during Clean Up.
 *
 * Rules: Flip defeated royal facedown, add it to HP stack (gaining 1 more
 * vitality slot). Turn all HP cards vertical = full HP. Advance to next royal.
 *
 * Returns true if the King was defeated (potential game end).
 */
export function handleRoyalDefeat(player: PlayerState): boolean {
	const wasKing = player.activeRoyalIndex >= 2;

	if (!wasKing) {
		// Defeated royal goes to HP stack (gaining +1 HP capacity)
		const defeatedRoyal = player.royaltyStack[player.activeRoyalIndex];
		player.hpStack.push(defeatedRoyal);

		// Advance to next royal
		player.activeRoyalIndex++;
		const nextRoyal = player.royaltyStack[player.activeRoyalIndex];
		const rank = nextRoyal.rank as 'J' | 'Q' | 'K';

		// Reset HP to new royal's vitality (all HP cards vertical = full HP)
		player.hp = ROYAL_VITALITY[rank];
	}

	return wasKing;
}

// ---------------------------------------------------------------------------
// Corruption
// ---------------------------------------------------------------------------

/**
 * Check if corruption triggers during Clean Up.
 * Fires when cards in corruption store >= active royal's vitality.
 * All corruption cards move to hand.
 */
export function checkCorruption(player: PlayerState): boolean {
	const threshold = getActiveVitality(player);
	if (player.corruptionStore.length >= threshold) {
		player.hand.push(...player.corruptionStore.splice(0));
		player.justBecameCorrupt = true;
		return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Full round resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a complete round. Mutates G in place.
 *
 * Order: Reveal → Fight (with ♣/♠ spells) → Cast Spells (♥ Siphon, ♦ Shatter) → Damage/Exploit
 */
export function resolveRound(G: CrownDuelsState): RoundResult {
	const pids = Object.keys(G.players);
	const [p0, p1] = [G.players[pids[0]], G.players[pids[1]]];
	const resolveOrder = p0.hasJester ? [0, 1] : [1, 0];

	// --- Phase 2: REVEAL ---
	const revealEvents = resolveReveal(G);

	// Snapshot zones for client fight playback (cleanup strips ♥/♦/spells before next round)
	const fightBoardSnapshot: Record<string, PlayerZones> = {};
	for (const pid of pids) {
		fightBoardSnapshot[pid] = clonePlayerZones(G.players[pid].zones);
	}

	// --- Phase 3: FIGHT (includes ♣/♠ spell adjustments) ---
	const detail0 = buildFightDetail(p0);
	const detail1 = buildFightDetail(p1);

	// Build fight events for animation
	const fightEvents: FightEvent[] = [];
	let stepNum = 1;

	// Step 1: Weapons (♣ in attack)
	for (const [pid, detail] of [[pids[0], detail0], [pids[1], detail1]] as const) {
		if (detail.weaponStrength > 0) {
			fightEvents.push({
				step: stepNum,
				playerId: pid,
				type: 'strength',
				label: '♣ Weapons',
				value: detail.weaponStrength,
				detail: 'Highest ♣ + 1 per other ♣',
			});
		}
	}
	stepNum++;

	// Step 2: Ignite (♥ in attack)
	for (const [pid, detail] of [[pids[0], detail0], [pids[1], detail1]] as const) {
		if (detail.igniteStrength > 0) {
			fightEvents.push({
				step: stepNum,
				playerId: pid,
				type: 'strength',
				label: '♥ Ignite',
				value: detail.igniteStrength,
				detail: '♥ values (double if matches ♣)',
			});
		}
	}
	stepNum++;

	// Step 3: Armour (♠ in defence)
	for (const [pid, detail] of [[pids[0], detail0], [pids[1], detail1]] as const) {
		if (detail.armourBlock > 0) {
			fightEvents.push({
				step: stepNum,
				playerId: pid,
				type: 'block',
				label: '♠ Armour',
				value: detail.armourBlock,
				detail: 'Highest ♠ + 1 per other ♠',
			});
		}
	}
	stepNum++;

	// Step 4: Ward (♥ in defence)
	for (const [pid, detail] of [[pids[0], detail0], [pids[1], detail1]] as const) {
		if (detail.wardBlock > 0) {
			fightEvents.push({
				step: stepNum,
				playerId: pid,
				type: 'block',
				label: '♥ Ward',
				value: detail.wardBlock,
				detail: '♥ values (double if matches ♠)',
			});
		}
	}
	stepNum++;

	// Step 5: Spell adjustments (All Out Attack/Defence)
	for (const [pid, player] of [[pids[0], p0], [pids[1], p1]] as const) {
		const spells = resolveSpellAdjustments(player.zones.spell);
		if (spells.allOutAttack) {
			fightEvents.push({
				step: stepNum,
				playerId: pid,
				type: 'strength',
				label: '♣ All Out Attack!',
				value: 0,
				detail: 'Block → Strength, Block = 0',
			});
		}
		if (spells.allOutDefence) {
			fightEvents.push({
				step: stepNum,
				playerId: pid,
				type: 'block',
				label: '♠ All Out Defence!',
				value: 0,
				detail: 'Strength → Block, Strength = 0',
			});
		}
	}
	stepNum++;

	// Check hits: strength > opponent's block
	const p0Hits = detail0.totalStrength > detail1.totalBlock;
	const p1Hits = detail1.totalStrength > detail0.totalBlock;
	detail0.didHit = p0Hits;
	detail1.didHit = p1Hits;

	// Step 6: Compare strength vs block
	fightEvents.push({
		step: stepNum,
		playerId: pids[0],
		type: 'damage',
		label: p0Hits ? '⚔ HIT!' : '🛡 Blocked',
		value: 0,
		detail: `${detail0.totalStrength} STR vs ${detail1.totalBlock} BLK`,
	});
	fightEvents.push({
		step: stepNum,
		playerId: pids[1],
		type: 'damage',
		label: p1Hits ? '⚔ HIT!' : '🛡 Blocked',
		value: 0,
		detail: `${detail1.totalStrength} STR vs ${detail0.totalBlock} BLK`,
	});
	stepNum++;

	// Step 7: Critical Hit damage (♦ in attack)
	const crit0 = p0Hits ? calcCriticalHitDamage(p0.zones.attack) : 0;
	const crit1 = p1Hits ? calcCriticalHitDamage(p1.zones.attack) : 0;
	
	if (p0Hits) {
		detail0.damageDealt = 1 + crit0;
		detail1.damageTaken = 1 + crit0;
		fightEvents.push({
			step: stepNum,
			playerId: pids[0],
			type: 'damage',
			label: '♦ Critical Hit!',
			value: detail0.damageDealt,
			detail: crit0 > 0 ? `Base 1 + ${crit0} from ♦ (match bonus included)` : 'Base damage: 1',
		});
	}
	if (p1Hits) {
		detail1.damageDealt = 1 + crit1;
		detail0.damageTaken = 1 + crit1;
		fightEvents.push({
			step: stepNum,
			playerId: pids[1],
			type: 'damage',
			label: '♦ Critical Hit!',
			value: detail1.damageDealt,
			detail: crit1 > 0 ? `Base 1 + ${crit1} from ♦ (match bonus included)` : 'Base damage: 1',
		});
	}
	if (p0Hits || p1Hits) stepNum++;

	// Exploit (♦ in defence): draw cards when hit. Jester holder resolves first.
	for (const idx of resolveOrder) {
		const player = idx === 0 ? p0 : p1;
		const detail = idx === 0 ? detail0 : detail1;
		const wasHit = idx === 0 ? p1Hits : p0Hits;

		if (wasHit) {
			const exploitDraw = calcExploitDraw(player.zones.defence);
			if (exploitDraw > 0) {
				ensureDeckHasCards(G, exploitDraw);
				player.hand.push(...drawCards(G.drawDeck, exploitDraw));
				detail.cardsDrawnFromExploit = exploitDraw;
				fightEvents.push({
					step: stepNum,
					playerId: pids[idx],
					type: 'exploit',
					label: '♦ Exploit',
					value: exploitDraw,
					detail: `Drew ${exploitDraw} card${exploitDraw > 1 ? 's' : ''} when hit`,
				});
			}
		}
	}

	// Apply damage
	for (const idx of resolveOrder) {
		const player = idx === 0 ? p0 : p1;
		const detail = idx === 0 ? detail0 : detail1;
		if (detail.damageTaken > 0) {
			applyDamage(player, detail.damageTaken);
		}
	}

	// --- Phase 4: CAST SPELLS (♥ Siphon then ♦ Shatter) ---
	// Siphon: both players resolve ♥ spells
	for (const idx of resolveOrder) {
		const player = idx === 0 ? p0 : p1;
		const opponent = idx === 0 ? p1 : p0;
		const detail = idx === 0 ? detail0 : detail1;
		const siphonEffects = resolveSiphon(player, opponent, player.zones.spell, G);
		detail.spellEffects.push(...siphonEffects);
	}

	// Shatter: both players resolve ♦ spells
	for (const idx of resolveOrder) {
		const player = idx === 0 ? p0 : p1;
		const opponent = idx === 0 ? p1 : p0;
		const detail = idx === 0 ? detail0 : detail1;
		const shatterEffects = resolveShatter(opponent, player.zones.spell, G);
		detail.spellEffects.push(...shatterEffects);
	}

	return {
		roundNumber: G.roundNumber,
		players: {
			[pids[0]]: detail0,
			[pids[1]]: detail1,
		},
		revealEvents,
		fightEvents,
		fightBoardSnapshot,
	};
}

function buildFightDetail(player: PlayerState): FightDetail {
	const weaponStr = calcWeaponStrength(player.zones.attack);
	const igniteStr = calcIgniteStrength(player.zones.attack);
	const armourBlk = calcArmourBlock(player.zones.defence);
	const wardBlk = calcWardBlock(player.zones.defence);

	let totalStr = weaponStr + igniteStr;
	let totalBlk = armourBlk + wardBlk;

	const spells = resolveSpellAdjustments(player.zones.spell);

	if (spells.allOutAttack && spells.allOutDefence) {
		totalStr = 0;
		totalBlk = 0;
	} else if (spells.allOutAttack) {
		totalStr += totalBlk;
		totalBlk = 0;
	} else if (spells.allOutDefence) {
		totalBlk += totalStr;
		totalStr = 0;
	}

	return {
		weaponStrength: weaponStr,
		igniteStrength: igniteStr,
		armourBlock: armourBlk,
		wardBlock: wardBlk,
		spellEffects: [...spells.effects],
		totalStrength: totalStr,
		totalBlock: totalBlk,
		didHit: false,
		damageDealt: 0,
		damageTaken: 0,
		cardsDrawnFromExploit: 0,
		revealDiscards: [],
	};
}

// ---------------------------------------------------------------------------
// Phase 5: CLEAN UP
// ---------------------------------------------------------------------------

/**
 * Clean Up phase. Rules:
 * 1. Discard all cards in spell zones, all ♦ and ♥ from attack/defence zones.
 * 2. If a royal has 0 HP: defeated. Flip facedown, add to HP stack, reset
 *    all HP cards to full, advance to next royal.
 * 3. Each player draws cards equal to their vitality.
 * 4. Corruption check: if corruption zone >= vitality, go corrupt.
 *
 * Game end is checked after this: if a King was defeated, the game ends.
 */
export function cleanupRound(G: CrownDuelsState): void {
	const pids = Object.keys(G.players);
	const resolveOrder = G.players[pids[0]].hasJester ? [0, 1] : [1, 0];

	// 1. Discard spell zones + ♦/♥ from attack/defence
	for (const pid of pids) {
		const p = G.players[pid];

		// Attack zone: keep only ♣ (weapons persist)
		const keepAttack = p.zones.attack.filter((c) => c.suit === 'clubs');
		const discardAttack = p.zones.attack.filter((c) => c.suit !== 'clubs');
		p.zones.attack = keepAttack;
		G.discardPile.push(...discardAttack);

		// Defence zone: keep only ♠ (armour persists)
		const keepDefence = p.zones.defence.filter((c) => c.suit === 'spades');
		const discardDefence = p.zones.defence.filter((c) => c.suit !== 'spades');
		p.zones.defence = keepDefence;
		G.discardPile.push(...discardDefence);

		// Spell zone: discard all
		G.discardPile.push(...p.zones.spell.splice(0));

		// Move corruption zone cards (placed this round) to corruption store
		p.corruptionStore.push(...p.zones.corruption.splice(0));
	}

	// 2. Check for defeated royals (HP = 0)
	let kingDefeated: string[] = [];
	for (const idx of resolveOrder) {
		const pid = pids[idx];
		const p = G.players[pid];

		if (p.hp <= 0) {
			const wasKing = handleRoyalDefeat(p);
			if (wasKing) {
				kingDefeated.push(pid);
			}
		}
	}

	// Game end check
	if (kingDefeated.length === 2) {
		G.gameWinner = 'draw';
	} else if (kingDefeated.length === 1) {
		G.gameWinner = pids.find((pid) => pid !== kingDefeated[0])!;
	}

	console.log('[cleanupRound] gameWinner=%s kingDefeated=%j', G.gameWinner, kingDefeated);
	if (G.gameWinner !== null) return;

	// 3. Each player draws cards equal to their vitality
	console.log('[cleanupRound] calling drawForRound...');
	drawForRound(G);

	// 4. Corruption check
	for (const idx of resolveOrder) {
		const p = G.players[pids[idx]];
		checkCorruption(p);
	}
}

/**
 * Draw cards for the start of a new round. Each player draws
 * cards equal to their active royal's vitality.
 */
export function drawForRound(G: CrownDuelsState): void {
	// Jester holder resolves first when order matters (e.g. reshuffle)
	const pids = Object.keys(G.players);
	const resolveOrder = G.players[pids[0]].hasJester ? [0, 1] : [1, 0];

	console.log('[drawForRound] deck=%d discard=%d', G.drawDeck.length, G.discardPile.length);
	for (const idx of resolveOrder) {
		const p = G.players[pids[idx]];
		const vitality = getActiveVitality(p);
		console.log('[drawForRound] player %s: handBefore=%d vitality=%d deckBefore=%d', pids[idx], p.hand.length, vitality, G.drawDeck.length);
		ensureDeckHasCards(G, vitality);
		const drawn = drawCards(G.drawDeck, vitality);
		console.log('[drawForRound] player %s: drew %d cards, deckAfter=%d', pids[idx], drawn.length, G.drawDeck.length);
		p.hand.push(...drawn);
		console.log('[drawForRound] player %s: handAfter=%d', pids[idx], p.hand.length);
	}
}
