import type { CrownDuelsCard, Suit, Rank, RoyalRank } from './types';
import { SUITS, RANKS } from './types';

// ---------------------------------------------------------------------------
// Card creation
// ---------------------------------------------------------------------------

function cardValue(rank: Rank): number {
	if (rank === 'A') return 1;
	if (rank === 'J') return 11;
	if (rank === 'Q') return 12;
	if (rank === 'K') return 13;
	return parseInt(rank, 10);
}

export function makeCard(suit: Suit, rank: Rank): CrownDuelsCard {
	return {
		id: `${rank}-${suit}`,
		suit,
		rank,
		value: cardValue(rank),
	};
}

export function makeJoker(index: number): CrownDuelsCard {
	return {
		id: `joker-${index}`,
		suit: 'joker',
		rank: 'joker',
		value: 0,
	};
}

/**
 * Build a full 54-card deck (52 standard + 2 Jokers).
 * Cards are returned in a deterministic order; call {@link shuffle} before use.
 */
export function createCrownDuelsDeck(): CrownDuelsCard[] {
	const deck: CrownDuelsCard[] = [];
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			deck.push(makeCard(suit, rank));
		}
	}
	deck.push(makeJoker(1));
	deck.push(makeJoker(2));
	return deck;
}

// ---------------------------------------------------------------------------
// Card queries
// ---------------------------------------------------------------------------

export function isRoyal(card: CrownDuelsCard): boolean {
	return card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
}

export function isJoker(card: CrownDuelsCard): boolean {
	return card.suit === 'joker';
}

export function getRoyalRank(card: CrownDuelsCard): RoyalRank | null {
	if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return card.rank;
	return null;
}

/**
 * Get the three royalty cards (J, Q, K) for a given suit,
 * returned in stack order: [Jack (top), Queen (middle), King (bottom)].
 */
export function getRoyaltyForSuit(deck: CrownDuelsCard[], suit: Suit): CrownDuelsCard[] {
	const jack = deck.find((c) => c.suit === suit && c.rank === 'J')!;
	const queen = deck.find((c) => c.suit === suit && c.rank === 'Q')!;
	const king = deck.find((c) => c.suit === suit && c.rank === 'K')!;
	return [jack, queen, king];
}

/**
 * Get all royalty cards NOT belonging to the two chosen suits.
 * These are used to form each player's HP stack (3 cards each).
 */
export function getRemainingRoyalty(deck: CrownDuelsCard[], chosenSuits: Suit[]): CrownDuelsCard[] {
	return deck.filter((c) => isRoyal(c) && !chosenSuits.includes(c.suit as Suit));
}

/**
 * Get all non-royal, non-joker cards from the deck.
 * These 40 cards form the draw pile.
 */
export function getNonRoyalCards(deck: CrownDuelsCard[]): CrownDuelsCard[] {
	return deck.filter((c) => !isRoyal(c) && !isJoker(c));
}

// ---------------------------------------------------------------------------
// Shuffle (Fisher-Yates) — uses boardgame.io's random when available,
// otherwise Math.random for setup/tests.
// ---------------------------------------------------------------------------

export function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

/** Draw `count` cards from the top of the deck. Mutates the deck array. */
export function drawCards(deck: CrownDuelsCard[], count: number): CrownDuelsCard[] {
	return deck.splice(0, Math.min(count, deck.length));
}

/**
 * When the draw deck is empty and we need to draw, shuffle the discard
 * pile back into the draw deck.
 */
export function reshuffleDiscard(
	drawDeck: CrownDuelsCard[],
	discardPile: CrownDuelsCard[],
): void {
	const fromDiscard = discardPile.splice(0, discardPile.length);
	// Jokers are out of play; never recycle them into the draw pile.
	const playable = fromDiscard.filter((c) => !isJoker(c));
	drawDeck.push(...playable);
	shuffle(drawDeck);
}
