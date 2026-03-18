import type { BaseGameState, VisibleCard } from '@engine/client';

// ---------------------------------------------------------------------------
// Card types
// ---------------------------------------------------------------------------

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

export const ZONES = ['attack', 'defence', 'spell', 'corruption'] as const;
export type Zone = (typeof ZONES)[number];

export type RoyalRank = 'J' | 'Q' | 'K';

export interface CrownDuelsCard extends VisibleCard {
	suit: Suit | 'joker';
	rank: Rank | 'joker';
	/** Numeric value: A=1, 2–10 face, J=11, Q=12, K=13, Joker=0. */
	value: number;
	/** True while the card is face-down, waiting for the Reveal phase. */
	faceDown?: boolean;
}

/** Vitality drives starting HP, draw count per round, and corruption threshold. */
export const ROYAL_VITALITY: Record<RoyalRank, number> = { J: 3, Q: 4, K: 5 };

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------

export interface PlayerZones {
	attack: CrownDuelsCard[];
	defence: CrownDuelsCard[];
	spell: CrownDuelsCard[];
	corruption: CrownDuelsCard[];
}

export interface PlayerState {
	chosenSuit: Suit | null;
	/** The player's own royalty ordered [Jack (top), Queen (middle), King (bottom)]. */
	royaltyStack: CrownDuelsCard[];
	/** Index into royaltyStack for the current active royal (0=J, 1=Q, 2=K). */
	activeRoyalIndex: number;
	/** Current hit points of the active royal. */
	hp: number;
	/** Face-down royalty cards used as HP tokens. Turned sideways (removed) when damage is taken. */
	hpStack: CrownDuelsCard[];
	hand: CrownDuelsCard[];
	/**
	 * The four zones surrounding the royal. Attack/defence cards (♣/♠)
	 * persist across rounds; other cards and spells are discarded during cleanup.
	 */
	zones: PlayerZones;
	/** Accumulated corruption zone cards (persist until the royal goes corrupt). */
	corruptionStore: CrownDuelsCard[];
	hasJester: boolean;
	/**
	 * True on the round immediately after corruption triggered.
	 * Prevents placing cards into corruption zone and means the player
	 * keeps 2 cards in hand instead of 1 at end of Plot.
	 */
	justBecameCorrupt: boolean;
	/** Whether this player has finished placing cards this round. */
	donePlacing: boolean;
	/** Whether this player has confirmed seeing the revealed cards. */
	confirmedReveal: boolean;
}

// ---------------------------------------------------------------------------
// Round resolution results (stored for UI playback)
// ---------------------------------------------------------------------------

/** A single event that happened during reveal (for step-by-step animation) */
export interface RevealEvent {
	step: 1 | 2 | 3 | 4 | 5;
	playerId: string;
	type: 'flip' | 'discard';
	zone?: Zone;
	cardIds: string[];
	cards?: CrownDuelsCard[]; // Full card data for rendering during animation
	reason?: string;
}

/** A single event that happened during fight (for step-by-step animation) */
export interface FightEvent {
	step: number;
	playerId: string;
	type: 'strength' | 'block' | 'damage' | 'exploit';
	label: string;
	value: number;
	detail?: string;
}

export interface FightDetail {
	weaponStrength: number;
	igniteStrength: number;
	armourBlock: number;
	wardBlock: number;
	spellEffects: string[];
	totalStrength: number;
	totalBlock: number;
	didHit: boolean;
	damageDealt: number;
	damageTaken: number;
	cardsDrawnFromExploit: number;
	revealDiscards: string[];
}

export interface RoundResult {
	roundNumber: number;
	players: Record<string, FightDetail>;
	/** Step-by-step reveal events for animation playback */
	revealEvents: RevealEvent[];
	/** Step-by-step fight events for animation playback */
	fightEvents: FightEvent[];
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export interface CrownDuelsState extends BaseGameState {
	players: Record<string, PlayerState>;
	drawDeck: CrownDuelsCard[];
	discardPile: CrownDuelsCard[];
	roundNumber: number;
	/** Last round's resolution result, for UI display. */
	lastRoundResult: RoundResult | null;
	/** Reveal events for the current round (before fight confirmation). */
	pendingRevealEvents: RevealEvent[] | null;
	/** Set when game is over. */
	gameWinner: string | null;
}

// ---------------------------------------------------------------------------
// Player colors (required by engine shell)
// ---------------------------------------------------------------------------

export type PlayerColor = 'crimson' | 'royalblue';

export const PLAYER_COLORS: PlayerColor[] = ['crimson', 'royalblue'];
