<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useGame, useCardDrag } from "@engine/client";
import type { CrownDuelsState, CrownDuelsCard, Zone, PlayerState, RevealEvent, FightEvent } from "../logic/index";
import { ZONES, ROYAL_VITALITY } from "../logic/index";
import type { VisibleCard } from "@engine/client/index";

defineProps<{ headerHeight: number }>();
defineEmits<{ "back-to-lobby": [] }>();

const { state, ctx, move, isMyTurn, playerID } = useGame();
const { registerDropZone, unregisterDropZone, startDrag, state: dragState, onDrop } = useCardDrag();

const G = computed(() => state.value as unknown as CrownDuelsState | undefined);
const myPID = computed(() => playerID?.value ?? null);
const currentPhase = computed(() => ctx.value?.phase ?? "placement");

// Backup check: if pendingRevealEvents exists, we're in reveal phase
const isInRevealPhase = computed(() => {
	return currentPhase.value === "reveal" || (G.value?.pendingRevealEvents && G.value.pendingRevealEvents.length > 0);
});
const showHelp = ref(false);

// Reveal animation state
const isPlayingReveal = ref(false);
const revealStepIndex = ref(0);
const currentRevealEvents = ref<RevealEvent[]>([]);
const REVEAL_STEP_DELAY = 1500; // ms between steps
let revealTimer: ReturnType<typeof setTimeout> | null = null;

const REVEAL_STEP_TITLES: Record<number, string> = {
	1: "Flip all cards face up",
	2: "Discard higher ♣s in attack zone",
	3: "Discard higher ♠s in defence zone",
	4: "Discard wrong-suit cards",
	5: "Discard duplicate spell suits",
};

const currentRevealStep = computed(() => {
	if (!isPlayingReveal.value || revealStepIndex.value >= currentRevealEvents.value.length) return null;
	return currentRevealEvents.value[revealStepIndex.value];
});

// Cards currently being highlighted in reveal animation
const revealHighlightCards = computed(() => {
	if (!isPlayingReveal.value || !currentRevealStep.value) return new Set<string>();
	return new Set(currentRevealStep.value.cardIds);
});

// Check if a card should be highlighted during reveal
function isRevealHighlighted(cardId: string | undefined): boolean {
	if (!cardId) return false;
	return revealHighlightCards.value.has(cardId);
}

// Get current step number in the reveal animation
const currentRevealStepNum = computed(() => currentRevealStep.value?.step ?? 0);

// Build virtual zone cards during reveal animation
// Returns cards that should be shown (including ones about to be discarded)
function getRevealZoneCards(pid: string, zone: Zone): CrownDuelsCard[] {
	if (!isPlayingReveal.value) return [];

	const events = currentRevealEvents.value;
	const currentStep = currentRevealStepNum.value;

	// Get current cards from actual state
	const player = G.value?.players[pid];
	if (!player) return [];

	const currentCards = (player.zones[zone] ?? []) as CrownDuelsCard[];
	const currentCardIds = new Set(currentCards.map((c) => c.id));

	// Find step 1 event for this player (flip event)
	const step1Event = events.find((e) => e.playerId === pid && e.step === 1);
	const step1CardIds = new Set(step1Event?.cardIds ?? []);

	// During step 1, show flipped cards as face-down
	if (currentStep === 1 && step1Event?.cards) {
		// Build a map of card ID -> face-down card from step 1
		const step1CardMap = new Map(step1Event.cards.map((c) => [c.id, c]));

		// For each card in the current zone, use the face-down version if available
		return currentCards.map((c) => {
			const faceDownVersion = step1CardMap.get(c.id);
			return faceDownVersion ?? c;
		});
	}

	// For steps 2+, collect pending discards and already-discarded cards
	const pendingCards: CrownDuelsCard[] = [];
	const discardedIds = new Set<string>();

	for (const evt of events) {
		if (evt.playerId !== pid || evt.zone !== zone || !evt.cards) continue;
		if (evt.step === 1) continue; // Skip flip events

		if (evt.step > currentStep) {
			// Not yet discarded - add cards that aren't in current state
			for (const card of evt.cards) {
				if (!currentCardIds.has(card.id)) {
					pendingCards.push(card);
				}
			}
		} else if (evt.step <= currentStep) {
			// Already discarded in animation
			evt.cardIds.forEach((id) => discardedIds.add(id));
		}
	}

	// Combine current cards with pending (not-yet-discarded) cards
	const allCards = [...currentCards, ...pendingCards];

	// Filter out cards that have been discarded in the animation
	return allCards.filter((c) => !discardedIds.has(c.id));
}

// Virtual zone cards for each player during reveal
const revealOppAttack = computed(() => (opp.value ? getRevealZoneCards(oppPID.value!, "attack") : []));
const revealOppDefence = computed(() => (opp.value ? getRevealZoneCards(oppPID.value!, "defence") : []));
const revealOppSpell = computed(() => (opp.value ? getRevealZoneCards(oppPID.value!, "spell") : []));
const revealOppCorruption = computed(() => (opp.value ? getRevealZoneCards(oppPID.value!, "corruption") : []));
const revealMyAttack = computed(() => (me.value ? getRevealZoneCards(myPID.value!, "attack") : []));
const revealMyDefence = computed(() => (me.value ? getRevealZoneCards(myPID.value!, "defence") : []));
const revealMySpell = computed(() => (me.value ? getRevealZoneCards(myPID.value!, "spell") : []));
const revealMyCorruption = computed(() => (me.value ? getRevealZoneCards(myPID.value!, "corruption") : []));

// Get zone cards to display (either reveal animation cards or actual cards)
function getDisplayZoneCards(actualCards: CrownDuelsCard[] | undefined, revealCards: CrownDuelsCard[]): CrownDuelsCard[] {
	if (isPlayingReveal.value && revealCards.length > 0) {
		return revealCards;
	}
	return (actualCards ?? []) as CrownDuelsCard[];
}

function startRevealPlayback(events: RevealEvent[]) {
	if (events.length === 0) return;
	currentRevealEvents.value = events;
	revealStepIndex.value = 0;
	isPlayingReveal.value = true;
	advanceRevealStep();
}

function advanceRevealStep() {
	if (revealTimer) clearTimeout(revealTimer);
	if (revealStepIndex.value >= currentRevealEvents.value.length) {
		isPlayingReveal.value = false;
		return;
	}
	revealTimer = setTimeout(() => {
		revealStepIndex.value++;
		advanceRevealStep();
	}, REVEAL_STEP_DELAY);
}

function skipReveal() {
	if (revealTimer) clearTimeout(revealTimer);
	isPlayingReveal.value = false;
}

// Fight animation state
const isPlayingFight = ref(false);
const fightStepIndex = ref(0);
const currentFightEvents = ref<FightEvent[]>([]);
const FIGHT_STEP_DELAY = 2500;
let fightTimer: ReturnType<typeof setTimeout> | null = null;

const currentFightStep = computed(() => {
	if (!isPlayingFight.value || fightStepIndex.value >= currentFightEvents.value.length) return null;
	return currentFightEvents.value[fightStepIndex.value];
});

// Get all events for the current step number
const currentFightStepEvents = computed(() => {
	if (!isPlayingFight.value || currentFightEvents.value.length === 0) return [];
	const currentStep = currentFightEvents.value[fightStepIndex.value]?.step;
	if (currentStep === undefined) return [];
	return currentFightEvents.value.filter((e) => e.step === currentStep);
});

function startFightPlayback(events: FightEvent[]) {
	if (events.length === 0) return;
	currentFightEvents.value = events;
	fightStepIndex.value = 0;
	isPlayingFight.value = true;
	advanceFightStep();
}

function advanceFightStep() {
	if (fightTimer) clearTimeout(fightTimer);
	if (fightStepIndex.value >= currentFightEvents.value.length) {
		isPlayingFight.value = false;
		return;
	}
	// Find the next step number
	const currentStep = currentFightEvents.value[fightStepIndex.value]?.step;
	fightTimer = setTimeout(() => {
		// Skip to the first event of the next step
		const nextIdx = currentFightEvents.value.findIndex((e, i) => i > fightStepIndex.value && e.step !== currentStep);
		fightStepIndex.value = nextIdx >= 0 ? nextIdx : currentFightEvents.value.length;
		advanceFightStep();
	}, FIGHT_STEP_DELAY);
}

function skipFight() {
	if (fightTimer) clearTimeout(fightTimer);
	isPlayingFight.value = false;
}

// Fight animation helpers - determine which cards/zones to highlight
const fightHighlightSuit = computed(() => {
	const label = currentFightStep.value?.label ?? '';
	if (label.includes('♣')) return 'clubs';
	if (label.includes('♦')) return 'diamonds';
	if (label.includes('♥')) return 'hearts';
	if (label.includes('♠')) return 'spades';
	return null;
});

const fightHighlightZone = computed(() => {
	const label = currentFightStep.value?.label ?? '';
	const type = currentFightStep.value?.type;
	if (type === 'strength' || label.includes('Weapons') || label.includes('Ignite') || label.includes('Critical') || label.includes('Attack')) {
		return 'attack';
	}
	if (type === 'block' || label.includes('Armour') || label.includes('Ward') || label.includes('Exploit') || label.includes('Defence')) {
		return 'defence';
	}
	if (type === 'damage') return 'royalty';
	return null;
});

// Check if a specific card should be highlighted during fight animation
function isFightHighlighted(card: CrownDuelsCard, zone: Zone, playerId: string): boolean {
	if (!isPlayingFight.value || !currentFightStep.value) return false;
	
	const evt = currentFightStep.value;
	const highlightZone = fightHighlightZone.value;
	const highlightSuit = fightHighlightSuit.value;
	
	// Only highlight cards for the player mentioned in the event
	if (evt.playerId !== playerId) return false;
	
	// Check if this zone matches
	if (highlightZone !== zone) return false;
	
	// If we have a suit to match, check it
	if (highlightSuit && card.suit !== highlightSuit) return false;
	
	return true;
}

// Check if royalty should show damage animation
const fightDamageTarget = computed(() => {
	if (!isPlayingFight.value) return null;
	const evt = currentFightStep.value;
	if (!evt) return null;
	// Show damage on HIT or Critical Hit events
	if (evt.type === 'damage' && evt.label.includes('HIT')) {
		// The OPPONENT of the attacker takes damage
		return evt.playerId === myPID.value ? oppPID.value : myPID.value;
	}
	if (evt.label.includes('Critical Hit')) {
		return evt.playerId === myPID.value ? oppPID.value : myPID.value;
	}
	return null;
});

// Floating damage number to display
const fightDamageValue = computed(() => {
	if (!isPlayingFight.value || !currentFightStep.value) return 0;
	const evt = currentFightStep.value;
	if (evt.label.includes('Critical Hit') || (evt.type === 'damage' && evt.label.includes('HIT'))) {
		return evt.value || 1;
	}
	return 0;
});

// Check if attack line should be shown
const showAttackLine = computed(() => {
	if (!isPlayingFight.value || !currentFightStep.value) return false;
	const label = currentFightStep.value.label;
	return label.includes('HIT') || label.includes('Critical');
});

const attackLinePlayerId = computed(() => {
	if (!showAttackLine.value) return null;
	return currentFightStep.value?.playerId ?? null;
});

// During reveal phase, just show the banner briefly then let player confirm
// No complex animation needed - cards are already face-up in state

// Watch for round results to play fight animation
let lastSeenRound = 0;
watch(
	() => G.value?.lastRoundResult,
	(result) => {
		if (result && result.roundNumber > lastSeenRound) {
			lastSeenRound = result.roundNumber;
			// Start fight animation after reveal
			if (result.fightEvents?.length > 0) {
				// Small delay to let the UI update
				setTimeout(() => startFightPlayback(result.fightEvents), 300);
			}
		}
	}
);

const me = computed(() => {
	const pid = myPID.value;
	if (!G.value?.players || pid == null) return null;
	return G.value.players[pid] ?? null;
});

const oppPID = computed(() => {
	const pid = myPID.value;
	if (!G.value?.players || pid == null) return null;
	return Object.keys(G.value.players).find((id) => id !== pid) ?? null;
});

const opp = computed(() => {
	const oid = oppPID.value;
	if (!G.value?.players || oid == null) return null;
	return G.value.players[oid] ?? null;
});

const canPlace = computed(() => isMyTurn.value && me.value && !me.value.donePlacing);

const SYM: Record<string, string> = {
	hearts: "♥",
	diamonds: "♦",
	clubs: "♣",
	spades: "♠",
	joker: "🃏",
};

function cardTxt(c: CrownDuelsCard) {
	const r = c.rank === "joker" ? "JK" : String(c.rank).toUpperCase();
	return r + (SYM[c.suit] ?? "");
}

function isRed(suit: string) {
	return suit === "hearts" || suit === "diamonds";
}

function isHidden(c: unknown): c is { hidden: true } {
	return typeof c === "object" && c !== null && "hidden" in c && (c as any).hidden === true;
}

// Combat calculation helpers
function calcWeaponStrength(attackZone: CrownDuelsCard[]): number {
	const clubs = attackZone.filter((c) => c.suit === "clubs" && !c.faceDown);
	if (clubs.length === 0) return 0;
	const highest = Math.max(...clubs.map((c) => c.value));
	return highest + (clubs.length - 1);
}

function calcIgniteStrength(attackZone: CrownDuelsCard[]): number {
	const hearts = attackZone.filter((c) => c.suit === "hearts" && !c.faceDown);
	const clubs = attackZone.filter((c) => c.suit === "clubs" && !c.faceDown);
	let total = 0;
	for (const h of hearts) {
		total += h.value;
		if (clubs.some((c) => c.value === h.value)) {
			total += h.value; // Match bonus
		}
	}
	return total;
}

function calcArmourBlock(defenceZone: CrownDuelsCard[]): number {
	const spades = defenceZone.filter((c) => c.suit === "spades" && !c.faceDown);
	if (spades.length === 0) return 0;
	const highest = Math.max(...spades.map((c) => c.value));
	return highest + (spades.length - 1);
}

function calcWardBlock(defenceZone: CrownDuelsCard[]): number {
	const hearts = defenceZone.filter((c) => c.suit === "hearts" && !c.faceDown);
	const spades = defenceZone.filter((c) => c.suit === "spades" && !c.faceDown);
	let total = 0;
	for (const h of hearts) {
		total += h.value;
		if (spades.some((c) => c.value === h.value)) {
			total += h.value; // Match bonus
		}
	}
	return total;
}

// Computed combat values for display
const myStrength = computed(() => {
	if (!me.value || !isInRevealPhase.value) return 0;
	const attack = (me.value.zones.attack ?? []) as CrownDuelsCard[];
	return calcWeaponStrength(attack) + calcIgniteStrength(attack);
});

const myBlock = computed(() => {
	if (!me.value || !isInRevealPhase.value) return 0;
	const defence = (me.value.zones.defence ?? []) as CrownDuelsCard[];
	return calcArmourBlock(defence) + calcWardBlock(defence);
});

const oppStrength = computed(() => {
	if (!opp.value || !isInRevealPhase.value) return 0;
	const attack = (opp.value.zones.attack ?? []) as CrownDuelsCard[];
	return calcWeaponStrength(attack) + calcIgniteStrength(attack);
});

const oppBlock = computed(() => {
	if (!opp.value || !isInRevealPhase.value) return 0;
	const defence = (opp.value.zones.defence ?? []) as CrownDuelsCard[];
	return calcArmourBlock(defence) + calcWardBlock(defence);
});

function royalRank(p: PlayerState) {
	return p.royaltyStack[p.activeRoyalIndex]?.rank?.toUpperCase() ?? "?";
}

function vitality(p: PlayerState) {
	const r = p.royaltyStack[p.activeRoyalIndex];
	return r ? ROYAL_VITALITY[r.rank as "J" | "Q" | "K"] ?? 0 : 0;
}

function zoneCorruptDisabled(zone: Zone) {
	return zone === "corruption" && me.value?.justBecameCorrupt;
}

// Drop zone refs
const attackZoneRef = ref<HTMLElement | null>(null);
const defenceZoneRef = ref<HTMLElement | null>(null);
const spellZoneRef = ref<HTMLElement | null>(null);
const corruptionZoneRef = ref<HTMLElement | null>(null);

// Hand drag state
const hoveredHandIndex = ref<number | null>(null);
const overZoneId = ref<string | null>(null);
let pointerStartX = 0;
let pointerStartY = 0;
let pendingHandIndex: number | null = null;

const FAN_DEG_PER_CARD = 3;
const FAN_OVERLAP_PX = 20;

const myHand = computed(() => {
	if (!me.value) return [];
	return me.value.hand ?? [];
});

function fanStyle(idx: number): { transform: string; marginLeft: string } {
	const n = myHand.value.length;
	const center = (n - 1) / 2;
	const deg = (idx - center) * FAN_DEG_PER_CARD;
	const marginLeft = idx === 0 ? "0" : `-${FAN_OVERLAP_PX}px`;
	return {
		transform: `rotate(${deg}deg)`,
		marginLeft,
	};
}

function fanStyleHover(idx: number): { transform: string; marginLeft: string; zIndex: number } {
	const base = fanStyle(idx);
	return {
		...base,
		transform: `translateY(-16px) scale(1.15) ${base.transform}`,
		zIndex: 20,
	};
}

// Drag ghost
const dragGhostCard = computed(() => {
	if (!dragState.isDragging || !dragState.payload) return null;
	return dragState.payload.card as CrownDuelsCard;
});

const GHOST_WIDTH = 56;
const GHOST_HEIGHT = 80;
const customGhostStyle = computed(() => ({
	position: "fixed" as const,
	left: `${dragState.pointerX - GHOST_WIDTH / 2}px`,
	top: `${dragState.pointerY - GHOST_HEIGHT / 2}px`,
	width: `${GHOST_WIDTH}px`,
	height: `${GHOST_HEIGHT}px`,
	pointerEvents: "none" as const,
	zIndex: 9999,
}));

function registerZoneDropZones() {
	const zones: Array<{ id: Zone; ref: typeof attackZoneRef }> = [
		{ id: "attack", ref: attackZoneRef },
		{ id: "defence", ref: defenceZoneRef },
		{ id: "spell", ref: spellZoneRef },
		{ id: "corruption", ref: corruptionZoneRef },
	];
	for (const { id, ref } of zones) {
		const el = ref.value;
		if (el) registerDropZone({ id, el });
	}
}

function onHandPointerDown(idx: number, ev: PointerEvent) {
	if (ev.button !== 0) return;
	if (!canPlace.value) return;

	pendingHandIndex = idx;
	pointerStartX = ev.clientX;
	pointerStartY = ev.clientY;
	document.addEventListener("pointermove", onDocPointerMove);
	document.addEventListener("pointerup", onDocPointerUp);
	document.addEventListener("pointercancel", onDocPointerCancel);
}

function onDocPointerMove(ev: PointerEvent) {
	if (pendingHandIndex == null) return;
	const dx = ev.clientX - pointerStartX;
	const dy = ev.clientY - pointerStartY;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist > 6) {
		const idx = pendingHandIndex;
		pendingHandIndex = null;
		document.removeEventListener("pointermove", onDocPointerMove);
		document.removeEventListener("pointerup", onDocPointerUp);
		document.removeEventListener("pointercancel", onDocPointerCancel);
		beginDrag(idx, ev);
	}
}

function onDocPointerUp() {
	pendingHandIndex = null;
	document.removeEventListener("pointermove", onDocPointerMove);
	document.removeEventListener("pointerup", onDocPointerUp);
	document.removeEventListener("pointercancel", onDocPointerCancel);
}

function onDocPointerCancel() {
	pendingHandIndex = null;
	document.removeEventListener("pointermove", onDocPointerMove);
	document.removeEventListener("pointerup", onDocPointerUp);
	document.removeEventListener("pointercancel", onDocPointerCancel);
}

function beginDrag(idx: number, moveEv: PointerEvent) {
	const card = myHand.value[idx];
	if (!card || isHidden(card)) return;

	const handCards = document.querySelectorAll(".hand-card");
	const originEl = handCards[idx] as HTMLElement | undefined;
	if (!originEl) return;

	registerZoneDropZones();
	const rect = originEl.getBoundingClientRect();
	startDrag({ card: card as VisibleCard, sourceIndex: idx, sourceId: "hand" }, rect, moveEv);
}

function onDragPointerMove(ev: PointerEvent) {
	if (!dragState.isDragging) return;
	const zones: Zone[] = ["attack", "defence", "spell", "corruption"];
	const refs: Record<Zone, typeof attackZoneRef> = {
		attack: attackZoneRef,
		defence: defenceZoneRef,
		spell: spellZoneRef,
		corruption: corruptionZoneRef,
	};
	let foundZone: string | null = null;
	for (const zone of zones) {
		const el = refs[zone].value;
		if (el) {
			const rect = el.getBoundingClientRect();
			if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
				foundZone = zone;
				break;
			}
		}
	}
	overZoneId.value = foundZone;
}

function onHandPointerUp() {
	hoveredHandIndex.value = null;
}

function removeCard(zone: Zone, idx: number) {
	move("removeFromZone", zone, idx);
}

onMounted(() => {
	onDrop.value = (zoneId: string, payload) => {
		if (!canPlace.value) return;
		const zone = zoneId as Zone;
		if (!ZONES.includes(zone)) return;
		if (zoneCorruptDisabled(zone)) return;

		const handIndex = (payload as { sourceIndex?: number }).sourceIndex;
		if (typeof handIndex === "number") {
			move("placeCard", handIndex, zone);
		}
		overZoneId.value = null;
	};
	document.addEventListener("pointermove", onDragPointerMove);
	nextTick(registerZoneDropZones);
});

watch(
	() => G.value?.roundNumber,
	() => nextTick(registerZoneDropZones),
	{ immediate: true }
);

onBeforeUnmount(() => {
	document.removeEventListener("pointermove", onDragPointerMove);
	for (const zone of ZONES) unregisterDropZone(zone);
	onDrop.value = null;
});
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
					:class="{ red: isRed(suit) }"
					@click="move('chooseSuit', suit)"
				>
					<span class="suit-big">{{ SYM[suit] }}</span>
					<span class="suit-name">{{ suit }}</span>
				</button>
			</div>
		</div>

		<!-- Waiting for opponent to choose suit -->
		<div v-else-if="G && G.roundNumber === 0" class="phase-select">
			<h2 class="select-title">{{ SYM[me?.chosenSuit ?? ""] }} {{ me?.chosenSuit }}</h2>
			<p class="select-sub">
				You chose <strong>{{ me?.chosenSuit }}</strong
				>. Waiting for opponent to choose their suit…
			</p>
		</div>

		<!-- ===================== GAME TABLE ===================== -->
		<div v-else-if="G && me && G.roundNumber > 0" class="table">
			<!-- Reveal phase banner -->
			<!-- <div v-if="isInRevealPhase && !isPlayingFight" class="reveal-banner">
				<span class="rb-phase">▶ REVEAL</span>
				<span class="rb-step">All cards revealed! Review the board, then continue.</span>
			</div> -->

			<!-- Fight animation banner (on-board, non-blocking) -->
			<div v-if="isPlayingFight" class="fight-banner" @click="skipFight">
				<div class="fb-step">Step {{ currentFightStep?.step ?? 1 }}</div>
				<div class="fb-label">{{ currentFightStep?.label ?? 'Fight!' }}</div>
				<div class="fb-events">
					<div
						v-for="(evt, i) in currentFightStepEvents"
						:key="i"
						class="fb-event"
						:class="{
							'fb-mine': evt.playerId === myPID,
							'fb-opp': evt.playerId !== myPID,
						}"
					>
						<span class="fbe-who">{{ evt.playerId === myPID ? 'You' : 'Opp' }}</span>
						<span v-if="evt.value > 0" class="fbe-val">+{{ evt.value }}</span>
						<span v-if="evt.detail" class="fbe-detail">{{ evt.detail }}</span>
					</div>
				</div>
				<div class="fb-progress">
					<div class="fb-progress-bar" :style="{ width: `${((fightStepIndex + 1) / currentFightEvents.length) * 100}%` }" />
				</div>
				<span class="fb-skip">click to skip</span>
			</div>

			<!-- Attack line SVG overlay -->
			<svg v-if="showAttackLine" class="attack-line-svg">
				<defs>
					<linearGradient id="attackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" :stop-color="attackLinePlayerId === myPID ? '#ef4444' : '#f97316'" />
						<stop offset="100%" :stop-color="attackLinePlayerId === myPID ? '#fbbf24' : '#fb923c'" />
					</linearGradient>
				</defs>
				<line
					:x1="attackLinePlayerId === myPID ? '25%' : '75%'"
					:y1="attackLinePlayerId === myPID ? '70%' : '30%'"
					:x2="attackLinePlayerId === myPID ? '50%' : '50%'"
					:y2="attackLinePlayerId === myPID ? '30%' : '70%'"
					stroke="url(#attackGrad)"
					stroke-width="4"
					stroke-linecap="round"
					class="attack-line"
				/>
			</svg>

			<!-- Round result banner -->
			<div v-if="G.lastRoundResult && !isPlayingReveal" class="round-banner">
				<span class="rb-title">Round {{ G.lastRoundResult.roundNumber }}</span>
				<span class="rb-stat">
					Dealt <strong>{{ G.lastRoundResult.players[myPID!]?.damageDealt ?? 0 }}</strong> · Took
					<strong>{{ G.lastRoundResult.players[myPID!]?.damageTaken ?? 0 }}</strong>
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
							<div v-if="isInRevealPhase" class="combat-value block-value">
								<span class="cv-num">{{ oppBlock }}</span>
								<span class="cv-lbl">BLK</span>
							</div>
							<div
								v-for="c in getDisplayZoneCards(opp?.zones.defence as CrownDuelsCard[], revealOppDefence)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown || isHidden(c),
									r: !c.faceDown && !isHidden(c) && isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
									'reveal-discard': currentRevealStep?.type === 'discard' && isRevealHighlighted(c.id),
									'fight-hl': !isHidden(c) && isFightHighlighted(c as CrownDuelsCard, 'defence', oppPID ?? ''),
								}"
							>
								<template v-if="!c.faceDown && !isHidden(c)">{{ cardTxt(c) }}</template>
							</div>
						</div>
					</div>
				</div>

				<div class="col-center">
					<div class="zone-box sm">
						<span class="z-lbl">✦ SPELL</span>
						<div class="z-cards">
							<div
								v-for="c in getDisplayZoneCards(opp?.zones.spell as CrownDuelsCard[], revealOppSpell)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown || isHidden(c),
									r: !c.faceDown && !isHidden(c) && isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
									'reveal-discard': currentRevealStep?.type === 'discard' && isRevealHighlighted(c.id),
								}"
							>
								<template v-if="!c.faceDown && !isHidden(c)">{{ cardTxt(c) }}</template>
							</div>
						</div>
					</div>

					<div class="royal-box" :class="{ 'taking-damage': fightDamageTarget === oppPID }">
						<template v-if="opp">
							<span class="royal-rank" :class="{ r: opp.chosenSuit && isRed(opp.chosenSuit) }">
								{{ royalRank(opp) }}{{ SYM[opp.chosenSuit ?? ""] }}
							</span>
							<span class="royal-hp">{{ opp.hp }}/{{ vitality(opp) }}</span>
							<div v-if="fightDamageTarget === oppPID && fightDamageValue > 0" class="damage-floater">
								-{{ fightDamageValue }}
							</div>
						</template>
					</div>

					<div class="zone-box sm">
						<span class="z-lbl">☠ CORRUPTION</span>
						<div class="z-cards">
							<div
								v-for="c in getDisplayZoneCards(opp?.zones.corruption as CrownDuelsCard[], revealOppCorruption)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown || isHidden(c),
									r: !c.faceDown && !isHidden(c) && isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
								}"
							>
								<template v-if="!c.faceDown && !isHidden(c)">{{ cardTxt(c) }}</template>
							</div>
						</div>
						<span v-if="opp?.corruptionStore.length" class="store-n">Store: {{ opp.corruptionStore.length }}</span>
					</div>
				</div>

				<div class="col-zone" @click.stop>
					<div class="zone-box">
						<span class="z-lbl">⚔ ATTACK</span>
						<div class="z-cards">
							<div
								v-for="c in getDisplayZoneCards(opp?.zones.attack as CrownDuelsCard[], revealOppAttack)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown || isHidden(c),
									r: !c.faceDown && !isHidden(c) && isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
									'reveal-discard': currentRevealStep?.type === 'discard' && isRevealHighlighted(c.id),
									'fight-hl': !isHidden(c) && isFightHighlighted(c as CrownDuelsCard, 'attack', oppPID ?? ''),
								}"
							>
								<template v-if="!c.faceDown && !isHidden(c)">{{ cardTxt(c) }}</template>
							</div>
							<div v-if="isInRevealPhase" class="combat-value strength-value">
								<span class="cv-num">{{ oppStrength }}</span>
								<span class="cv-lbl">STR</span>
							</div>
						</div>
					</div>
				</div>

				<!-- <div class="col-side">
					<div class="deck-mini">
						<span class="dm-icon">♛</span>
						<span class="dm-lbl">HP</span>
					</div>
				</div> -->
			</section>

			<!-- ========== SHARED DECKS ========== -->
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

				<div class="col-zone">
					<div
						ref="attackZoneRef"
						class="zone-box drop-zone"
						:class="{
							'drop-target': dragState.isDragging && overZoneId === 'attack',
							active: dragState.isDragging,
						}"
					>
						<span class="z-lbl">⚔ ATTACK</span>
						<div class="z-cards">
							<div v-if="isInRevealPhase" class="combat-value strength-value">
								<span class="cv-num">{{ myStrength }}</span>
								<span class="cv-lbl">STR</span>
							</div>
							<div
								v-for="c in getDisplayZoneCards(me.zones.attack as CrownDuelsCard[], revealMyAttack)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown,
									mine: c.faceDown,
									r: isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
									'reveal-discard': currentRevealStep?.type === 'discard' && isRevealHighlighted(c.id),
									'fight-hl': isFightHighlighted(c as CrownDuelsCard, 'attack', myPID ?? ''),
								}"
							>
								<span class="cd-txt">{{ cardTxt(c) }}</span>
							</div>
						</div>
					</div>
				</div>

				<div class="col-center">
					<div
						ref="spellZoneRef"
						class="zone-box sm drop-zone"
						:class="{
							'drop-target': dragState.isDragging && overZoneId === 'spell',
							active: dragState.isDragging,
						}"
					>
						<span class="z-lbl">✦ SPELL</span>
						<div class="z-cards">
							<div
								v-for="c in getDisplayZoneCards(me.zones.spell as CrownDuelsCard[], revealMySpell)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown,
									mine: c.faceDown,
									r: isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
									'reveal-discard': currentRevealStep?.type === 'discard' && isRevealHighlighted(c.id),
								}"
							>
								<span class="cd-txt">{{ cardTxt(c) }}</span>
							</div>
						</div>
					</div>

					<div class="royal-box mine" :class="{ 'taking-damage': fightDamageTarget === myPID }">
						<span class="royal-rank" :class="{ r: me.chosenSuit && isRed(me.chosenSuit) }">
							{{ royalRank(me) }}{{ SYM[me.chosenSuit ?? ""] }}
						</span>
						<span class="royal-hp">{{ me.hp }}/{{ vitality(me) }}</span>
						<span class="royal-lbl">Round {{ G.roundNumber }}</span>
						<div v-if="fightDamageTarget === myPID && fightDamageValue > 0" class="damage-floater">
							-{{ fightDamageValue }}
						</div>
					</div>

					<div
						ref="corruptionZoneRef"
						class="zone-box sm drop-zone"
						:class="{
							'drop-target': dragState.isDragging && overZoneId === 'corruption' && !zoneCorruptDisabled('corruption'),
							active: dragState.isDragging && !zoneCorruptDisabled('corruption'),
							locked: zoneCorruptDisabled('corruption'),
						}"
					>
						<span class="z-lbl">☠ CORRUPTION</span>
						<div class="z-cards">
							<div
								v-for="c in getDisplayZoneCards(me.zones.corruption as CrownDuelsCard[], revealMyCorruption)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown,
									mine: c.faceDown,
									r: isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
								}"
							>
								<span class="cd-txt">{{ cardTxt(c) }}</span>
							</div>
						</div>
						<span v-if="me.corruptionStore.length" class="store-n">Store: {{ me.corruptionStore.length }}/{{ vitality(me) }}</span>
					</div>
				</div>

				<div class="col-zone">
					<div
						ref="defenceZoneRef"
						class="zone-box drop-zone"
						:class="{
							'drop-target': dragState.isDragging && overZoneId === 'defence',
							active: dragState.isDragging,
						}"
					>
						<span class="z-lbl">🛡 DEFENCE</span>
						<div class="z-cards">
							<div
								v-for="c in getDisplayZoneCards(me.zones.defence as CrownDuelsCard[], revealMyDefence)"
								:key="c.id"
								class="cd"
								:class="{
									back: c.faceDown,
									mine: c.faceDown,
									r: isRed(c.suit),
									'reveal-hl': isRevealHighlighted(c.id),
									'reveal-discard': currentRevealStep?.type === 'discard' && isRevealHighlighted(c.id),
									'fight-hl': isFightHighlighted(c as CrownDuelsCard, 'defence', myPID ?? ''),
								}"
							>
								<span class="cd-txt">{{ cardTxt(c) }}</span>
							</div>
							<div v-if="isInRevealPhase" class="combat-value block-value">
								<span class="cv-num">{{ myBlock }}</span>
								<span class="cv-lbl">BLK</span>
							</div>
						</div>
					</div>
				</div>

				<!-- <div class="col-side">
					<div class="deck-mini hp">
						<span class="dm-icon">♛</span>
						<span class="dm-lbl">HP</span>
					</div>
				</div> -->
			</section>

			<!-- ========== STATUS ========== -->
			<div class="action-bar">
				<template v-if="isInRevealPhase">
					<template v-if="me.confirmedReveal">
						<span class="muted">Waiting for opponent to continue…</span>
					</template>
					<template v-else>
						<button class="confirm-fight-btn" @click="move('confirmReveal')">Continue to Fight ⚔</button>
					</template>
				</template>
				<template v-else>
					<span v-if="me.donePlacing" class="muted">Waiting for opponent…</span>
					<span v-else-if="!isMyTurn" class="muted">Opponent is placing…</span>
					<span v-else class="muted turn-hint">Drag cards to place • Keep {{ me.justBecameCorrupt ? 2 : 1 }} in hand</span>
				</template>
				<button class="help-btn" @click="showHelp = !showHelp">{{ showHelp ? "✕" : "?" }}</button>
			</div>

			<!-- ========== HELP PANEL ========== -->
			<div v-if="showHelp" class="help-panel">
				<button class="help-close" @click="showHelp = false">✕</button>
				<h3 class="help-title">Combat Reference</h3>
				<div class="help-section">
					<h4 class="help-subtitle strength">⚔ STRENGTH (Attack Zone)</h4>
					<p><span class="suit-icon clubs">♣</span> <strong>Weapons:</strong> Highest ♣ value + 1 per other ♣</p>
					<p>
						<span class="suit-icon hearts">♥</span> <strong>Ignite:</strong> Each ♥ adds its value.
						<em>Match bonus: if ♥ matches a ♣, add again</em>
					</p>
				</div>
				<div class="help-section">
					<h4 class="help-subtitle block">🛡 BLOCK (Defence Zone)</h4>
					<p><span class="suit-icon spades">♠</span> <strong>Armour:</strong> Highest ♠ value + 1 per other ♠</p>
					<p>
						<span class="suit-icon hearts">♥</span> <strong>Ward:</strong> Each ♥ adds its value.
						<em>Match bonus: if ♥ matches a ♠, add again</em>
					</p>
				</div>
				<div class="help-section">
					<h4 class="help-subtitle spell">✦ SPELLS (Spell Zone)</h4>
					<p><span class="suit-icon clubs">♣</span> <strong>All Out Attack:</strong> Block → Strength, then Block = 0</p>
					<p><span class="suit-icon spades">♠</span> <strong>All Out Defence:</strong> Strength → Block, then Strength = 0</p>
					<p><span class="suit-icon hearts">♥</span> <strong>Siphon:</strong> Put cards into corruption store</p>
					<p><span class="suit-icon diamonds">♦</span> <strong>Shatter:</strong> Destroy opponent's ♣/♠ cards</p>
				</div>
				<div class="help-section">
					<h4 class="help-subtitle damage">💥 DAMAGE</h4>
					<p>Hit if your Strength &gt; opponent's Block</p>
					<p>
						<span class="suit-icon diamonds">♦</span> <strong>Critical Hit (Attack):</strong> +1 damage per ♦.
						<em>Match bonus: +1 if ♦ matches ♣</em>
					</p>
					<p>
						<span class="suit-icon diamonds">♦</span> <strong>Exploit (Defence):</strong> Draw 1 card per ♦ when hit.
						<em>Match bonus: +1 if ♦ matches ♠</em>
					</p>
				</div>
			</div>
		</div>

		<!-- ========== HAND (teleported to fixed tray, only during game) ========== -->
		<Teleport v-if="G && G.roundNumber > 0" to="#game-hand-tray">
			<div
				class="hand-tray flex flex-col items-center justify-end py-3 px-4 pointer-events-auto"
				:class="{ 'hand-tray-dragging': dragState.isDragging }"
			>
				<div v-if="!me || myHand.length === 0" class="hand-fan flex items-center justify-center gap-2 min-h-[7rem] text-slate-500">
					<p class="text-sm">No cards in hand</p>
				</div>
				<div v-else class="hand-fan flex justify-center items-end">
					<div
						v-for="(card, idx) in myHand"
						:key="isHidden(card) ? `hidden-${idx}` : (card as CrownDuelsCard).id"
						class="hand-card select-none touch-none rounded-lg border-2 flex flex-col items-center justify-center shrink-0 transition-transform duration-150"
						:class="[
							hoveredHandIndex === idx ? 'hand-card-hover' : '',
							canPlace ? 'border-amber-500/50 cursor-grab active:cursor-grabbing' : 'border-slate-600 cursor-default',
							isHidden(card) ? '' : (isRed((card as CrownDuelsCard).suit) ? 'card-red' : 'card-black'),
						]"
						:style="[{ background: '#f5f0e6' }, hoveredHandIndex === idx ? fanStyleHover(idx) : fanStyle(idx)]"
						@pointerdown="onHandPointerDown(idx, $event)"
						@pointerup="onHandPointerUp"
						@pointerleave="
							() => {
								onHandPointerUp();
								hoveredHandIndex = null;
							}
						"
						@pointercancel="onHandPointerUp"
						@mouseenter="hoveredHandIndex = idx"
						@mouseleave="hoveredHandIndex = null"
					>
						<template v-if="isHidden(card)">
							<span class="text-slate-500 text-2xl">🂠</span>
						</template>
						<template v-else>
							<span class="hc-rank" :class="{ r: isRed((card as CrownDuelsCard).suit) }">
								{{ (card as CrownDuelsCard).rank === "joker" ? "JK" : String((card as CrownDuelsCard).rank).toUpperCase() }}
							</span>
							<span class="hc-suit" :class="{ r: isRed((card as CrownDuelsCard).suit) }">
								{{ SYM[(card as CrownDuelsCard).suit] }}
							</span>
						</template>
					</div>
				</div>
				<p v-if="me?.justBecameCorrupt" class="corrupt-warn mt-2">⚠ Corrupted — cannot place in corruption zone this round</p>
			</div>
		</Teleport>

		<!-- Custom drag ghost -->
		<Teleport to="body">
			<div v-if="dragGhostCard" class="drag-ghost-wrapper" :style="customGhostStyle">
				<div class="drag-ghost-card" :class="isRed(dragGhostCard.suit) ? 'card-red' : 'card-black'">
					<span class="drag-ghost-rank">
						{{ dragGhostCard.rank === "joker" ? "JK" : String(dragGhostCard.rank).toUpperCase() }}
					</span>
					<span class="drag-ghost-suit">
						{{ SYM[dragGhostCard.suit] }}
					</span>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
/* ===== BOARD ROOT ===== */
.cd-board {
	width: 100%;
	display: flex;
	flex-direction: column;
	color: #e4e4e7;
	font-family: system-ui, -apple-system, sans-serif;
	padding-bottom: 200px; /* space for fixed hand tray */
}

/* ===== SUIT SELECTION ===== */
.phase-select {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1rem;
	min-height: 300px;
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
	position: relative;
	flex: 1;
	display: grid;
	grid-template-columns: 1fr 3.5rem;
	grid-template-rows: auto auto auto auto;
	grid-template-areas:
		"banner  banner"
		"opp     decks"
		"mine    decks"
		"actions actions";
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
	grid-template-columns: 3rem 1fr 1fr 1fr; /* 3rem; */
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
	padding: 0.5rem;
	display: flex;
	flex-direction: column;
	min-height: 9rem;
	background: #111317;
	transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.zone-box.sm {
	min-height: 4.5rem;
}
.zone-box.active {
	border-color: #6366f1;
	background: rgba(99, 102, 241, 0.05);
}
.zone-box.drop-target {
	border-color: #fbbf24 !important;
	background: rgba(251, 191, 36, 0.1) !important;
	box-shadow: 0 0 16px rgba(251, 191, 36, 0.3);
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
	align-items: center;
	flex: 1;
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
}
.cd.back .cd-txt {
	display: none;
}
.cd.back::after {
	content: "✦";
	color: #3d7a5a;
	font-size: 0.7rem;
}
/* Your own face-down cards - blue tint to distinguish */
.cd.back.mine {
	background: #1a243e;
	border-color: #2d4a7a;
	cursor: pointer;
	transition: all 0.15s ease;
}
.cd.back.mine::after {
	color: #4a6a9a;
}
/* Peek at your own cards on hover */
.cd.back.mine:hover {
	background: #f5f0e6;
	border-color: #6366f1;
}
.cd.back.mine:hover .cd-txt {
	display: block;
	color: inherit;
}
.cd.back.mine:hover::after {
	display: none;
}
/* Red suit text color on hover */
.cd.back.mine.r:hover .cd-txt {
	color: #dc2626;
}

/* Make ALL cards in Attack/Defence zones much bigger */
.zone-box:not(.sm) .cd {
	width: 5rem;
	height: 7rem;
	font-size: 1.2rem;
	border-width: 2px;
	border-radius: 0.5rem;
}
.zone-box:not(.sm) .cd.back::after {
	font-size: 2rem;
}
.zone-box:not(.sm) .z-cards {
	justify-content: center;
	gap: 0.75rem;
}

/* Combat value display (inside zone box) */
.combat-value {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	min-width: 3rem;
	height: fit-content;
	align-self: center;
}
.cv-num {
	font-size: 2rem;
	font-weight: 800;
	line-height: 1;
}
.cv-lbl {
	font-size: 0.65rem;
	font-weight: 600;
	letter-spacing: 0.05em;
	opacity: 0.8;
}
.strength-value {
	background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.3) 100%);
	border: 1px solid rgba(239, 68, 68, 0.5);
}
.strength-value .cv-num {
	color: #ef4444;
}
.strength-value .cv-lbl {
	color: #fca5a5;
}
.block-value {
	background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.3) 100%);
	border: 1px solid rgba(59, 130, 246, 0.5);
}
.block-value .cv-num {
	color: #3b82f6;
}
.block-value .cv-lbl {
	color: #93c5fd;
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

/* ===== HAND TRAY (fixed bottom) ===== */
.hand-tray {
	background: linear-gradient(to top, rgba(17, 19, 23, 0.98) 0%, rgba(17, 19, 23, 0.9) 70%, transparent 100%);
	border-top: 1px solid rgba(251, 191, 36, 0.2);
	transition: transform 0.22s ease-out;
}
.hand-tray-dragging {
	transform: translateY(300px);
}
.hand-fan {
	min-height: 8.5rem;
}

/* ===== HAND CARD ===== */
.hand-card {
	width: 5.5rem;
	aspect-ratio: 2.5 / 3.5;
	will-change: transform;
}
.hand-card.card-red {
	color: #dc2626;
}
.hand-card.card-black {
	color: #1c1917;
}
.hc-rank {
	font-size: 1.5rem;
	font-weight: 800;
	line-height: 1;
}
.hc-rank.r {
	color: #dc2626;
}
.hc-suit {
	font-size: 1.75rem;
	line-height: 1;
}
.hc-suit.r {
	color: #dc2626;
}

.corrupt-warn {
	font-size: 0.7rem;
	color: #f59e0b;
}

/* ===== ACTION BAR ===== */
.action-bar {
	grid-area: actions;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0.35rem;
	gap: 0.5rem;
	position: relative;
}
.confirm-fight-btn {
	padding: 0.75rem 2rem;
	background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
	border: 2px solid #f87171;
	border-radius: 0.5rem;
	color: white;
	font-size: 1.1rem;
	font-weight: 700;
	cursor: pointer;
	transition: all 0.15s ease;
	box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
.confirm-fight-btn:hover {
	transform: scale(1.05);
	box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
}
.help-btn {
	position: absolute;
	right: 1rem;
	top: 50%;
	transform: translateY(-50%);
	width: 1.75rem;
	height: 1.75rem;
	border-radius: 50%;
	background: #334155;
	border: 1px solid #475569;
	color: #e2e8f0;
	font-weight: 700;
	cursor: pointer;
	font-size: 0.9rem;
}
.help-btn:hover {
	background: #475569;
}

/* Help Panel */
.help-panel {
	position: absolute;
	right: 1rem;
	bottom: 3rem;
	width: 340px;
	max-height: 60vh;
	overflow-y: auto;
	background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
	border: 1px solid #475569;
	border-radius: 0.75rem;
	padding: 1rem;
	z-index: 50;
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}
.help-close {
	position: absolute;
	top: 0.5rem;
	right: 0.5rem;
	width: 1.5rem;
	height: 1.5rem;
	border-radius: 50%;
	background: #475569;
	border: none;
	color: #e2e8f0;
	font-size: 0.8rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
}
.help-close:hover {
	background: #64748b;
}
.help-title {
	font-size: 1.1rem;
	font-weight: 700;
	color: #fbbf24;
	margin-bottom: 0.75rem;
	text-align: center;
}
.help-section {
	margin-bottom: 0.75rem;
	padding-bottom: 0.75rem;
	border-bottom: 1px solid #334155;
}
.help-section:last-child {
	border-bottom: none;
	margin-bottom: 0;
	padding-bottom: 0;
}
.help-subtitle {
	font-size: 0.85rem;
	font-weight: 600;
	margin-bottom: 0.4rem;
}
.help-subtitle.strength {
	color: #ef4444;
}
.help-subtitle.block {
	color: #3b82f6;
}
.help-subtitle.spell {
	color: #a855f7;
}
.help-subtitle.damage {
	color: #f97316;
}
.help-section p {
	font-size: 0.75rem;
	color: #cbd5e1;
	margin: 0.25rem 0;
	line-height: 1.4;
}
.help-section em {
	color: #94a3b8;
	font-style: italic;
}
.help-section strong {
	color: #f1f5f9;
}
.suit-icon {
	font-weight: 700;
	margin-right: 0.25rem;
}
.suit-icon.clubs {
	color: #22c55e;
}
.suit-icon.spades {
	color: #3b82f6;
}
.suit-icon.hearts {
	color: #ef4444;
}
.suit-icon.diamonds {
	color: #f97316;
}

/* ===== DRAG GHOST ===== */
.drag-ghost-wrapper {
	user-select: none;
	-webkit-user-select: none;
	pointer-events: none;
}
.drag-ghost-card {
	width: 4rem;
	aspect-ratio: 2.5 / 3.5;
	background: #f5f0e6;
	border: 2px solid #c8c0b0;
	border-radius: 0.5rem;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.25rem;
	transform: scale(1.1) rotate(-3deg);
	box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2);
}
.drag-ghost-card.card-red {
	color: #dc2626;
	border-color: #fca5a5;
}
.drag-ghost-card.card-black {
	color: #1c1917;
}
.drag-ghost-rank {
	font-size: 1.25rem;
	font-weight: 800;
	line-height: 1;
}
.drag-ghost-suit {
	font-size: 1.5rem;
	line-height: 1;
}

/* ===== REVEAL BANNER ===== */
.reveal-banner {
	position: fixed;
	top: 5rem;
	left: 0;
	right: 0;
	z-index: 50;
	background: linear-gradient(90deg, #1e293b 0%, #0f172a 50%, #1e293b 100%);
	border-bottom: 2px solid #fbbf24;
	padding: 0.75rem 1.5rem;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 1rem;
	/* cursor: pointer; */
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}
.rb-phase {
	font-size: 1.1rem;
	font-weight: 700;
	color: #fbbf24;
	letter-spacing: 0.1em;
}
.rb-step {
	font-size: 1rem;
	color: #e2e8f0;
}
.rb-skip {
	font-size: 0.75rem;
	color: #64748b;
}

/* Reveal highlight animation on cards */
.cd.reveal-hl {
	animation: reveal-pulse 0.8s ease-in-out infinite alternate;
	box-shadow: 0 0 12px 4px rgba(251, 191, 36, 0.7);
}
@keyframes reveal-pulse {
	from {
		box-shadow: 0 0 8px 2px rgba(251, 191, 36, 0.5);
		transform: scale(1);
	}
	to {
		box-shadow: 0 0 16px 6px rgba(251, 191, 36, 0.9);
		transform: scale(1.05);
	}
}

/* Cards being discarded during reveal */
.cd.reveal-discard {
	animation: discard-flash 0.5s ease-in-out infinite alternate;
	box-shadow: 0 0 12px 4px rgba(239, 68, 68, 0.7) !important;
}
@keyframes discard-flash {
	from {
		box-shadow: 0 0 8px 2px rgba(239, 68, 68, 0.5);
		opacity: 1;
	}
	to {
		box-shadow: 0 0 16px 6px rgba(239, 68, 68, 0.9);
		opacity: 0.6;
	}
}

/* ===== FIGHT BANNER (on-board) ===== */
.fight-banner {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 60;
	background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%);
	border: 2px solid #ef4444;
	border-radius: 1rem;
	padding: 1rem 2rem;
	text-align: center;
	min-width: 280px;
	box-shadow: 0 0 30px rgba(239, 68, 68, 0.4), 0 0 60px rgba(239, 68, 68, 0.2);
	cursor: pointer;
	animation: fight-banner-appear 0.3s ease-out;
}
@keyframes fight-banner-appear {
	from {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.8);
	}
	to {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}
}
.fb-step {
	font-size: 0.7rem;
	color: #94a3b8;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	margin-bottom: 0.25rem;
}
.fb-label {
	font-size: 1.4rem;
	font-weight: 700;
	color: #ef4444;
	margin-bottom: 0.5rem;
	text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
}
.fb-events {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	margin-bottom: 0.75rem;
}
.fb-event {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	font-size: 0.85rem;
	padding: 0.25rem 0.5rem;
	border-radius: 0.25rem;
}
.fb-event.fb-mine {
	background: rgba(59, 130, 246, 0.2);
	border-left: 3px solid #3b82f6;
}
.fb-event.fb-opp {
	background: rgba(249, 115, 22, 0.2);
	border-left: 3px solid #f97316;
}
.fbe-who {
	font-weight: 600;
	color: #e2e8f0;
	min-width: 2.5rem;
}
.fbe-val {
	font-weight: 700;
	color: #fbbf24;
	font-size: 1rem;
}
.fbe-detail {
	font-size: 0.75rem;
	color: #94a3b8;
}
.fb-progress {
	height: 3px;
	background: #334155;
	border-radius: 2px;
	overflow: hidden;
	margin-bottom: 0.5rem;
}
.fb-progress-bar {
	height: 100%;
	background: linear-gradient(90deg, #ef4444, #f97316);
	transition: width 0.3s ease;
}
.fb-skip {
	font-size: 0.65rem;
	color: #64748b;
	text-transform: uppercase;
}

/* ===== FIGHT CARD HIGHLIGHT ===== */
.cd.fight-hl {
	animation: fight-pulse 0.6s ease-in-out infinite alternate;
	box-shadow: 0 0 15px 5px rgba(239, 68, 68, 0.7);
	z-index: 10;
}
@keyframes fight-pulse {
	from {
		box-shadow: 0 0 10px 3px rgba(239, 68, 68, 0.5);
		transform: scale(1);
	}
	to {
		box-shadow: 0 0 20px 8px rgba(239, 68, 68, 0.9);
		transform: scale(1.08);
	}
}

/* ===== DAMAGE FLOATER ===== */
.royal-box {
	position: relative;
}
.royal-box.taking-damage {
	animation: damage-shake 0.15s ease-in-out 3;
}
@keyframes damage-shake {
	0%, 100% { transform: translateX(0); }
	25% { transform: translateX(-4px); }
	75% { transform: translateX(4px); }
}
.damage-floater {
	position: absolute;
	top: -1rem;
	left: 50%;
	transform: translateX(-50%);
	font-size: 1.8rem;
	font-weight: 900;
	color: #ef4444;
	text-shadow: 0 0 10px rgba(239, 68, 68, 0.8), 2px 2px 0 #000;
	animation: damage-float 1.5s ease-out forwards;
	z-index: 100;
}
@keyframes damage-float {
	0% {
		opacity: 1;
		transform: translateX(-50%) translateY(0) scale(0.5);
	}
	20% {
		transform: translateX(-50%) translateY(-10px) scale(1.2);
	}
	100% {
		opacity: 0;
		transform: translateX(-50%) translateY(-40px) scale(1);
	}
}

/* ===== ATTACK LINE SVG ===== */
.attack-line-svg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	z-index: 55;
}
.attack-line {
	stroke-dasharray: 20 10;
	animation: attack-dash 0.4s linear infinite, attack-glow 0.3s ease-in-out infinite alternate;
}
@keyframes attack-dash {
	to {
		stroke-dashoffset: -30;
	}
}
@keyframes attack-glow {
	from {
		filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.5));
	}
	to {
		filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.9));
	}
}

/* ===== PHASE OVERLAYS (Fight) ===== */
.phase-overlay {
	position: fixed;
	inset: 0;
	z-index: 100;
	background: rgba(0, 0, 0, 0.85);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
}
.phase-card {
	background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
	border: 2px solid #fbbf24;
	border-radius: 1rem;
	padding: 2rem 3rem;
	text-align: center;
	max-width: 450px;
	min-width: 320px;
	box-shadow: 0 0 40px rgba(251, 191, 36, 0.3);
}
.phase-title {
	font-size: 1.5rem;
	font-weight: 700;
	margin-bottom: 1.5rem;
	letter-spacing: 0.1em;
}
.reveal-title {
	color: #fbbf24;
}
.fight-title {
	color: #ef4444;
}
.fight-card {
	border-color: #ef4444;
	box-shadow: 0 0 40px rgba(239, 68, 68, 0.3);
}
.phase-step {
	margin-bottom: 1.5rem;
}
.phase-step-title {
	font-size: 1.1rem;
	color: #e2e8f0;
	margin-bottom: 0.5rem;
}
.phase-step-detail {
	font-size: 0.9rem;
	color: #94a3b8;
	margin-bottom: 0.5rem;
}
.phase-step-cards {
	font-size: 0.85rem;
	color: #f87171;
	font-weight: 600;
}
.phase-skip {
	font-size: 0.75rem;
	color: #64748b;
	margin-bottom: 1rem;
}
.phase-progress {
	height: 4px;
	background: #334155;
	border-radius: 2px;
	overflow: hidden;
}
.phase-progress-bar {
	height: 100%;
	background: linear-gradient(90deg, #fbbf24, #f59e0b);
	transition: width 0.3s ease;
}
.fight-progress-bar {
	background: linear-gradient(90deg, #ef4444, #dc2626);
}

/* Fight events */
.fight-events {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	margin-bottom: 1.5rem;
}
.fight-event {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	border-radius: 0.5rem;
	background: rgba(255, 255, 255, 0.05);
	border-left: 3px solid #64748b;
}
.fight-event.event-mine {
	background: rgba(34, 197, 94, 0.1);
	border-left-color: #22c55e;
}
.fight-event.event-strength {
	border-left-color: #ef4444;
}
.fight-event.event-block {
	border-left-color: #3b82f6;
}
.fight-event.event-damage.event-mine {
	border-left-color: #22c55e;
}
.event-player {
	font-size: 0.75rem;
	font-weight: 600;
	color: #94a3b8;
	min-width: 60px;
}
.event-label {
	font-size: 0.95rem;
	font-weight: 600;
	color: #e2e8f0;
}
.event-value {
	font-size: 1.1rem;
	font-weight: 700;
	color: #fbbf24;
}
.event-detail {
	font-size: 0.75rem;
	color: #64748b;
	width: 100%;
}

/* ===== UTILITIES ===== */
.muted {
	font-size: 0.75rem;
	color: #52525b;
}
.turn-hint {
	color: #6ee7b7;
}
</style>
