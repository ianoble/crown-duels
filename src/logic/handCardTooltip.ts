import type { CrownDuelsCard } from './types';
import { isJoker, isRoyal } from './cards';

const H = '\u2665';
const D = '\u2666';
const C = '\u2663';
const S = '\u2660';
const JK = '\u{1F0CF}';

const SUIT_SYM: Record<CrownDuelsCard['suit'], string> = {
	hearts: H,
	diamonds: D,
	clubs: C,
	spades: S,
	joker: JK,
};

function cardHeader(card: CrownDuelsCard): string {
	const rank = card.rank === 'joker' ? 'JK' : String(card.rank).toUpperCase();
	const sym = SUIT_SYM[card.suit];
	return `${rank}${sym} · Value ${card.value}`;
}

function suitTooltipLines(card: CrownDuelsCard): string[] {
	switch (card.suit) {
		case 'clubs':
			return [
				`${C} Weapon — Attack zone. Strength = highest ${C} + 1 for each other ${C}.`,
			];
		case 'spades':
			return [
				`${S} Armour — Defence zone. Block = highest ${S} + 1 for each other ${S}.`,
			];
		case 'hearts':
			return [
				`${H} Hearts — Ignite (attack), Ward (defence), Siphon (spell zone). Match: if ${H} rank matches a ${C} or ${S} in that zone, add its value again.`,
			];
		case 'diamonds':
			return [
				`${D} Diamonds — Shatter in spell zone. Attack: +1 damage per ${D} (extra +1 if ${D} matches a ${C}). Defence: draw 1 per ${D} when hit (extra +1 if ${D} matches an ${S}).`,
			];
		case 'joker':
			return ['Joker — Removed at setup; not used during play.'];
		default:
			return [];
	}
}

/**
 * Multi-line tooltip copy for a visible hand card (combat reference).
 */
export function handCardTooltipLines(card: CrownDuelsCard): string[] {
	const lines: string[] = [cardHeader(card)];

	if (isJoker(card)) {
		lines.push(...suitTooltipLines(card));
		return lines;
	}

	if (isRoyal(card)) {
		lines.push('Royalty — Normally on your royal stack, not played from hand like a plot card.');
	}

	lines.push(...suitTooltipLines(card));
	return lines;
}
