<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGame } from '@engine/client';
import type { CrownDuelsState, CrownDuelsCard, Zone, PlayerState } from '../logic/index';
import { ZONES, ROYAL_VITALITY } from '../logic/index';

defineProps<{ headerHeight: number }>();
defineEmits<{ 'back-to-lobby': [] }>();

const { state, move, isMyTurn, playerID } = useGame();
const G = computed(() => state.value as unknown as CrownDuelsState | undefined);
const myPID = computed(() => playerID?.value ?? null);

const me = computed(() => {
	const pid = myPID.value;
	if (!G.value?.players || pid == null) return null;
	return G.value.players[pid] ?? null;
});

const opp = computed(() => {
	const pid = myPID.value;
	if (!G.value?.players || pid == null) return null;
	const oid = Object.keys(G.value.players).find((id) => id !== pid);
	return oid ? G.value.players[oid] : null;
});

const canPlace = computed(() => isMyTurn.value && me.value && !me.value.donePlacing);

const selectedIdx = ref<number | null>(null);

function toggleSelect(idx: number) {
	if (!canPlace.value) return;
	selectedIdx.value = selectedIdx.value === idx ? null : idx;
}

function placeIn(zone: Zone) {
	if (selectedIdx.value == null || !canPlace.value) return;
	if (zone === 'corruption' && me.value?.justBecameCorrupt) return;
	move('placeCard', selectedIdx.value, zone);
	selectedIdx.value = null;
}

function removeCard(zone: Zone, idx: number) {
	move('removeFromZone', zone, idx);
}

const SYM: Record<string, string> = {
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
	spades: '♠',
	joker: '🃏',
};

function cardTxt(c: CrownDuelsCard) {
	const r = c.rank === 'joker' ? 'JK' : String(c.rank).toUpperCase();
	return r + (SYM[c.suit] ?? '');
}

function isRed(suit: string) {
	return suit === 'hearts' || suit === 'diamonds';
}

function isHidden(c: unknown): c is { hidden: true } {
	return typeof c === 'object' && c !== null && 'hidden' in c && (c as any).hidden === true;
}

function royalRank(p: PlayerState) {
	return p.royaltyStack[p.activeRoyalIndex]?.rank?.toUpperCase() ?? '?';
}

function vitality(p: PlayerState) {
	const r = p.royaltyStack[p.activeRoyalIndex];
	return r ? (ROYAL_VITALITY[r.rank as 'J' | 'Q' | 'K'] ?? 0) : 0;
}

function zoneIcon(zone: Zone) {
	return { attack: '⚔', defence: '🛡', spell: '✦', corruption: '☠' }[zone];
}

function zoneCorruptDisabled(zone: Zone) {
	return zone === 'corruption' && me.value?.justBecameCorrupt;
}
</script>

<template>
	<div class="cd-board" :style="{ '--hdr': headerHeight + 'px' }">
		<!-- ===================== SUIT SELECTION ===================== -->
		<div v-if="!me?.chosenSuit" class="phase-select">
			<h2 class="select-title">Choose Your Suit</h2>
			<p class="select-sub">Your royalty line: Jack → Queen → King</p>
			<div class="suit-btns">
				<button
					v-for="suit in ['hearts', 'diamonds', 'clubs', 'spades']"
					:key="suit"
					class="suit-btn"
					:class="{ red: isRed(suit), disabled: !isMyTurn }"
					:disabled="!isMyTurn"
					@click="move('chooseSuit', suit)"
				>
					<span class="suit-big">{{ SYM[suit] }}</span>
					<span class="suit-name">{{ suit }}</span>
				</button>
			</div>
			<p v-if="!isMyTurn" class="muted">Waiting for opponent…</p>
		</div>

		<!-- ===================== GAME TABLE ===================== -->
		<div v-else-if="G && me" class="table">
			<!-- Round result banner -->
			<div v-if="G.lastRoundResult" class="round-banner">
				<span class="rb-title">Round {{ G.lastRoundResult.roundNumber }}</span>
				<span class="rb-stat">
					Dealt <strong>{{ G.lastRoundResult.players[myPID!]?.damageDealt ?? 0 }}</strong>
					· Took <strong>{{ G.lastRoundResult.players[myPID!]?.damageTaken ?? 0 }}</strong>
				</span>
				<template v-for="eff in (G.lastRoundResult.players[myPID!]?.spellEffects ?? [])" :key="eff">
					<span class="rb-spell">{{ eff }}</span>
				</template>
			</div>

			<!-- ========== OPPONENT AREA ========== -->
			<section class="area opp-area">
				<div class="col-jest">
					<div class="jester-slot" :class="{ has: opp?.hasJester }">
						<span v-if="opp?.hasJester">🃏</span>
					</div>
					<span class="col-lbl">JESTER</span>
				</div>

				<div class="col-zone" @click.stop>
					<div class="zone-box">
						<span class="z-lbl">🛡 DEFENCE</span>
						<div class="z-cards">
							<template v-for="(c, i) in opp?.zones.defence" :key="i">
								<div v-if="isHidden(c)" class="cd back" />
								<div v-else class="cd" :class="{ r: isRed((c as CrownDuelsCard).suit) }">{{ cardTxt(c as CrownDuelsCard) }}</div>
							</template>
						</div>
					</div>
				</div>

				<div class="col-center">
					<div class="zone-box sm">
						<span class="z-lbl">✦ SPELL</span>
						<div class="z-cards">
							<template v-for="(c, i) in opp?.zones.spell" :key="i">
								<div v-if="isHidden(c)" class="cd back" />
								<div v-else class="cd" :class="{ r: isRed((c as CrownDuelsCard).suit) }">{{ cardTxt(c as CrownDuelsCard) }}</div>
							</template>
						</div>
					</div>

					<div class="royal-box">
						<template v-if="opp">
							<span class="royal-rank" :class="{ r: opp.chosenSuit && isRed(opp.chosenSuit) }">
								{{ royalRank(opp) }}{{ SYM[opp.chosenSuit ?? ''] }}
							</span>
							<span class="royal-hp">{{ opp.hp }}/{{ vitality(opp) }}</span>
						</template>
					</div>

					<div class="zone-box sm">
						<span class="z-lbl">☠ CORRUPTION</span>
						<div class="z-cards">
							<template v-for="(c, i) in opp?.zones.corruption" :key="i">
								<div v-if="isHidden(c)" class="cd back" />
								<div v-else class="cd" :class="{ r: isRed((c as CrownDuelsCard).suit) }">{{ cardTxt(c as CrownDuelsCard) }}</div>
							</template>
						</div>
						<span v-if="opp?.corruptionStore.length" class="store-n">Store: {{ opp.corruptionStore.length }}</span>
					</div>
				</div>

				<div class="col-zone" @click.stop>
					<div class="zone-box">
						<span class="z-lbl">⚔ ATTACK</span>
						<div class="z-cards">
							<template v-for="(c, i) in opp?.zones.attack" :key="i">
								<div v-if="isHidden(c)" class="cd back" />
								<div v-else class="cd" :class="{ r: isRed((c as CrownDuelsCard).suit) }">{{ cardTxt(c as CrownDuelsCard) }}</div>
							</template>
						</div>
					</div>
				</div>

				<div class="col-side">
					<div class="deck-mini">
						<span class="dm-icon">♛</span>
						<span class="dm-lbl">HP</span>
					</div>
				</div>
			</section>

			<!-- ========== SHARED DECKS (right edge) ========== -->
			<div class="shared-col">
				<div class="deck-stack discard">
					<span class="ds-count">{{ G.discardPile.length }}</span>
					<span class="ds-lbl">DISCARD</span>
				</div>
				<div class="deck-stack draw">
					<span class="ds-count">{{ G.drawDeck.length }}</span>
					<span class="ds-lbl">DRAW</span>
				</div>
			</div>

			<!-- ========== MY AREA ========== -->
			<section class="area my-area">
				<div class="col-jest">
					<div class="jester-slot" :class="{ has: me.hasJester }">
						<span v-if="me.hasJester">🃏</span>
					</div>
					<span class="col-lbl">JESTER</span>
				</div>

				<div class="col-zone" @click="placeIn('defence')">
					<div class="zone-box" :class="{ target: selectedIdx != null, active: selectedIdx != null }">
						<span class="z-lbl">🛡 DEFENCE</span>
						<div class="z-cards">
							<div
								v-for="(c, i) in me.zones.defence"
								:key="(c as CrownDuelsCard).id ?? i"
								class="cd"
								:class="{
									r: isRed((c as CrownDuelsCard).suit),
									fd: (c as CrownDuelsCard).faceDown,
								}"
							>
								{{ cardTxt(c as CrownDuelsCard) }}
								<button
									v-if="(c as CrownDuelsCard).faceDown && canPlace"
									class="cd-remove"
									@click.stop="removeCard('defence', i)"
								>✕</button>
							</div>
						</div>
					</div>
				</div>

				<div class="col-center">
					<div
						class="zone-box sm"
						:class="{ target: selectedIdx != null, active: selectedIdx != null }"
						@click="placeIn('spell')"
					>
						<span class="z-lbl">✦ SPELL</span>
						<div class="z-cards">
							<div
								v-for="(c, i) in me.zones.spell"
								:key="(c as CrownDuelsCard).id ?? i"
								class="cd"
								:class="{
									r: isRed((c as CrownDuelsCard).suit),
									fd: (c as CrownDuelsCard).faceDown,
								}"
							>
								{{ cardTxt(c as CrownDuelsCard) }}
								<button
									v-if="(c as CrownDuelsCard).faceDown && canPlace"
									class="cd-remove"
									@click.stop="removeCard('spell', i)"
								>✕</button>
							</div>
						</div>
					</div>

					<div class="royal-box mine">
						<span class="royal-rank" :class="{ r: me.chosenSuit && isRed(me.chosenSuit) }">
							{{ royalRank(me) }}{{ SYM[me.chosenSuit ?? ''] }}
						</span>
						<span class="royal-hp">{{ me.hp }}/{{ vitality(me) }}</span>
						<span class="royal-lbl">Round {{ G.roundNumber }}</span>
					</div>

					<div
						class="zone-box sm"
						:class="{
							target: selectedIdx != null && !zoneCorruptDisabled('corruption'),
							active: selectedIdx != null && !zoneCorruptDisabled('corruption'),
							locked: zoneCorruptDisabled('corruption'),
						}"
						@click="placeIn('corruption')"
					>
						<span class="z-lbl">☠ CORRUPTION</span>
						<div class="z-cards">
							<div
								v-for="(c, i) in me.zones.corruption"
								:key="(c as CrownDuelsCard).id ?? i"
								class="cd"
								:class="{
									r: isRed((c as CrownDuelsCard).suit),
									fd: (c as CrownDuelsCard).faceDown,
								}"
							>
								{{ cardTxt(c as CrownDuelsCard) }}
								<button
									v-if="(c as CrownDuelsCard).faceDown && canPlace"
									class="cd-remove"
									@click.stop="removeCard('corruption', i)"
								>✕</button>
							</div>
						</div>
						<span v-if="me.corruptionStore.length" class="store-n">
							Store: {{ me.corruptionStore.length }}/{{ vitality(me) }}
						</span>
					</div>
				</div>

				<div class="col-zone" @click="placeIn('attack')">
					<div class="zone-box" :class="{ target: selectedIdx != null, active: selectedIdx != null }">
						<span class="z-lbl">⚔ ATTACK</span>
						<div class="z-cards">
							<div
								v-for="(c, i) in me.zones.attack"
								:key="(c as CrownDuelsCard).id ?? i"
								class="cd"
								:class="{
									r: isRed((c as CrownDuelsCard).suit),
									fd: (c as CrownDuelsCard).faceDown,
								}"
							>
								{{ cardTxt(c as CrownDuelsCard) }}
								<button
									v-if="(c as CrownDuelsCard).faceDown && canPlace"
									class="cd-remove"
									@click.stop="removeCard('attack', i)"
								>✕</button>
							</div>
						</div>
					</div>
				</div>

				<div class="col-side">
					<div class="deck-mini hp">
						<span class="dm-icon">♛</span>
						<span class="dm-lbl">HP</span>
					</div>
				</div>
			</section>

			<!-- ========== HAND ========== -->
			<div class="hand-tray">
				<span class="hand-lbl">HAND ({{ me.hand.length }})</span>
				<div class="hand-cards">
					<div
						v-for="(c, i) in me.hand"
						:key="(c as CrownDuelsCard).id ?? i"
						class="hcard"
						:class="{
							r: !isHidden(c) && isRed((c as CrownDuelsCard).suit),
							selected: selectedIdx === i,
							pickable: canPlace,
						}"
						@click="toggleSelect(i)"
					>
						<template v-if="!isHidden(c)">
							<span class="hc-rank">{{ (c as CrownDuelsCard).rank === 'joker' ? 'JK' : String((c as CrownDuelsCard).rank).toUpperCase() }}</span>
							<span class="hc-suit">{{ SYM[(c as CrownDuelsCard).suit] }}</span>
						</template>
						<span v-else class="hc-back">🂠</span>
					</div>
				</div>
				<p v-if="me.justBecameCorrupt" class="corrupt-warn">⚠ Corrupted — cannot place in corruption zone this round</p>
			</div>

			<!-- ========== ACTIONS ========== -->
			<div class="action-bar">
				<button
					v-if="canPlace"
					class="btn-confirm"
					@click="move('confirmPlacement')"
				>
					Confirm Placement
				</button>
				<span v-else-if="me.donePlacing" class="muted">Waiting for opponent…</span>
				<span v-else-if="!isMyTurn" class="muted">Opponent is placing…</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
/* ===== BOARD ROOT ===== */
.cd-board {
	width: 100%;
	height: calc(100vh - var(--hdr, 0px));
	display: flex;
	flex-direction: column;
	color: #e4e4e7;
	font-family: system-ui, -apple-system, sans-serif;
}

/* ===== SUIT SELECTION ===== */
.phase-select {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1rem;
}
.select-title {
	font-size: 1.5rem;
	font-weight: 700;
	color: #fbbf24;
}
.select-sub {
	color: #8b8d98;
	font-size: 0.875rem;
}
.suit-btns {
	display: flex;
	gap: 0.75rem;
}
.suit-btn {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	padding: 0.75rem 1.25rem;
	border-radius: 0.5rem;
	border: 2px solid #3f3f46;
	background: #1a1d27;
	color: #a1a1aa;
	cursor: pointer;
	transition: all 0.15s;
}
.suit-btn:hover:not(.disabled) {
	border-color: #71717a;
	background: #27272a;
}
.suit-btn.red {
	color: #f87171;
}
.suit-btn.disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.suit-big {
	font-size: 2rem;
}
.suit-name {
	font-size: 0.75rem;
	text-transform: capitalize;
}

/* ===== TABLE LAYOUT ===== */
.table {
	flex: 1;
	display: grid;
	grid-template-columns: 1fr 3.5rem;
	grid-template-rows: auto auto auto auto auto;
	grid-template-areas:
		'banner  banner'
		'opp     decks'
		'mine    decks'
		'hand    hand'
		'actions actions';
	align-content: center;
	row-gap: 0.5rem;
	overflow: hidden;
}
.round-banner {
	grid-area: banner;
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.35rem 0.75rem;
	background: rgba(120, 53, 15, 0.25);
	border-bottom: 1px solid rgba(180, 83, 9, 0.3);
	font-size: 0.75rem;
	color: #fbbf24;
	overflow-x: auto;
	white-space: nowrap;
}
.rb-title {
	font-weight: 700;
}
.rb-stat strong {
	color: #fde68a;
}
.rb-spell {
	color: #c084fc;
	font-size: 0.65rem;
}

/* ===== SHARED DECK COLUMN ===== */
.shared-col {
	grid-area: decks;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.25rem;
	border-left: 1px solid #2a2d3a;
}
.deck-stack {
	width: 2.5rem;
	height: 3.5rem;
	border-radius: 0.25rem;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	font-size: 0.6rem;
	line-height: 1.2;
}
.deck-stack.draw {
	background: #1e3a2e;
	border: 1px solid #2d5a42;
	color: #6ee7b7;
}
.deck-stack.discard {
	background: #2a1f1f;
	border: 1px solid #5a3535;
	color: #fca5a5;
}
.ds-count {
	font-size: 1rem;
	font-weight: 700;
}
.ds-lbl {
	font-size: 0.5rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	opacity: 0.7;
}

/* ===== PLAYER AREA ===== */
.area {
	display: grid;
	grid-template-columns: 3rem 1fr 1fr 1fr 3rem;
	gap: 0.25rem;
	padding: 0.25rem;
	min-height: 0;
}
.opp-area {
	grid-area: opp;
	border-bottom: 1px solid #2a2d3a;
}
.my-area {
	grid-area: mine;
	border-top: 1px solid #2a2d3a;
}

/* ===== COLUMNS ===== */
.col-jest {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.25rem;
}
.jester-slot {
	width: 2.25rem;
	height: 3.25rem;
	border-radius: 0.25rem;
	border: 2px dashed #3f3f46;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.25rem;
	background: #18181b;
}
.jester-slot.has {
	border-color: #eab308;
	background: #1c1a0f;
}
.col-lbl {
	font-size: 0.5rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: #71717a;
}

.col-zone {
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.col-center {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	min-height: 0;
}

.col-side {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

/* ===== ZONE BOX ===== */
.zone-box {
	flex: 1;
	border: 1px solid #2a2d3a;
	border-radius: 0.375rem;
	padding: 0.25rem;
	display: flex;
	flex-direction: column;
	min-height: 3.5rem;
	background: #111317;
	transition: border-color 0.15s, background 0.15s;
}
.zone-box.sm {
	min-height: 2rem;
}
.zone-box.target {
	border-color: #4f46e5;
	cursor: pointer;
}
.zone-box.active {
	background: rgba(79, 70, 229, 0.08);
}
.zone-box.locked {
	border-color: #7f1d1d;
	opacity: 0.5;
	cursor: not-allowed;
}

.z-lbl {
	font-size: 0.55rem;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: #52525b;
	margin-bottom: 0.15rem;
	flex-shrink: 0;
}

.z-cards {
	display: flex;
	flex-wrap: wrap;
	gap: 0.2rem;
	align-items: start;
}

.store-n {
	font-size: 0.55rem;
	color: #a855f7;
	margin-top: 0.15rem;
}

/* ===== CARD (zone size) ===== */
.cd {
	width: 2rem;
	height: 2.75rem;
	border-radius: 0.2rem;
	background: #f5f0e6;
	border: 1px solid #c8c0b0;
	color: #1c1917;
	font-size: 0.55rem;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
	line-height: 1;
	flex-shrink: 0;
}
.cd.r {
	color: #dc2626;
}
.cd.back {
	background: #1a2e24;
	border-color: #2d5a42;
	color: transparent;
}
.cd.back::after {
	content: '✦';
	color: #3d7a5a;
	font-size: 0.7rem;
}
.cd.fd {
	border-style: dashed;
	border-color: #6366f1;
}
.cd-remove {
	position: absolute;
	top: -0.3rem;
	right: -0.3rem;
	width: 0.9rem;
	height: 0.9rem;
	border-radius: 50%;
	background: #ef4444;
	color: white;
	border: none;
	font-size: 0.45rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transition: opacity 0.1s;
}
.cd:hover .cd-remove {
	opacity: 1;
}

/* ===== ROYAL BOX ===== */
.royal-box {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 0.25rem;
	border: 1px solid #2a2d3a;
	border-radius: 0.375rem;
	background: #15151a;
	gap: 0.1rem;
}
.royal-box.mine {
	border-color: #92400e;
	background: #1a1510;
}
.royal-rank {
	font-size: 1rem;
	font-weight: 800;
	color: #fbbf24;
}
.royal-rank.r {
	color: #f87171;
}
.royal-hp {
	font-size: 0.65rem;
	color: #ef4444;
	font-weight: 700;
}
.royal-lbl {
	font-size: 0.5rem;
	color: #71717a;
}

/* ===== DECK MINI ===== */
.deck-mini {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.1rem;
}
.dm-icon {
	font-size: 1rem;
	color: #71717a;
}
.deck-mini.hp .dm-icon {
	color: #ef4444;
}
.dm-lbl {
	font-size: 0.45rem;
	text-transform: uppercase;
	color: #52525b;
}

/* ===== HAND TRAY ===== */
.hand-tray {
	grid-area: hand;
	padding: 0.35rem 0.5rem;
	border-top: 1px solid #2a2d3a;
	background: #111317;
}
.hand-lbl {
	font-size: 0.6rem;
	text-transform: uppercase;
	color: #52525b;
	letter-spacing: 0.06em;
}
.hand-cards {
	display: flex;
	gap: 0.35rem;
	flex-wrap: wrap;
	padding: 0.25rem 0;
}
.corrupt-warn {
	font-size: 0.65rem;
	color: #f59e0b;
	margin-top: 0.25rem;
}

/* ===== HAND CARD ===== */
.hcard {
	width: 3rem;
	height: 4.25rem;
	border-radius: 0.3rem;
	background: #f5f0e6;
	border: 2px solid #c8c0b0;
	color: #1c1917;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.1rem;
	cursor: default;
	transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
	flex-shrink: 0;
	position: relative;
}
.hcard.r {
	color: #dc2626;
}
.hcard.pickable {
	cursor: pointer;
}
.hcard.pickable:hover {
	transform: translateY(-0.25rem);
	border-color: #818cf8;
}
.hcard.selected {
	transform: translateY(-0.5rem);
	border-color: #6366f1;
	box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
}
.hc-rank {
	font-size: 0.85rem;
	font-weight: 800;
	line-height: 1;
}
.hc-suit {
	font-size: 1rem;
	line-height: 1;
}
.hc-back {
	font-size: 1.5rem;
}

/* ===== ACTION BAR ===== */
.action-bar {
	grid-area: actions;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0.35rem;
	gap: 0.5rem;
}
.btn-confirm {
	padding: 0.4rem 1.5rem;
	border-radius: 0.375rem;
	background: #065f46;
	color: #6ee7b7;
	border: 1px solid #047857;
	font-weight: 600;
	font-size: 0.8rem;
	cursor: pointer;
	transition: background 0.15s;
}
.btn-confirm:hover {
	background: #047857;
}

/* ===== UTILITIES ===== */
.muted {
	font-size: 0.75rem;
	color: #52525b;
}
</style>
