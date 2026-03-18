import { watch, onUnmounted, type Ref } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { gameDef } from '../logic/index';
import type { CrownDuelsState, Zone } from '../logic/types';
import { SUITS, ZONES } from '../logic/types';
import { SERVER_URL } from '../config';

/**
 * Crown Duels bots:
 * - Suit selection phase: Choose a random available suit
 * - Placement phase: Place cards randomly, then confirm
 */
export function useBotPlayers(matchIDRef: Ref<string>, _humanPlayerID: Ref<string>) {
	const botClients: Array<{ playerID: string; client: ReturnType<typeof Client> }> = [];

	function getBotCreds(matchID: string): Record<string, string> {
		const key = `bgf:bots:${gameDef.id}:${matchID}`;
		try {
			return JSON.parse(localStorage.getItem(key) || '{}');
		} catch {
			return {};
		}
	}

	type ClientMoves = {
		chooseSuit?: (suit: string) => void;
		placeCard?: (handIndex: number, zone: string) => void;
		confirmPlacement?: () => void;
		confirmReveal?: () => void;
	};

	function makeSuitSelectionMove(client: ReturnType<typeof Client>, state: unknown, botPlayerID: string) {
		const s = state as {
			G?: CrownDuelsState;
			ctx?: { phase?: string; currentPlayer?: string };
		};
		const G = s.G;
		const ctx = s.ctx;
		const moves = (client as unknown as { moves?: ClientMoves }).moves;

		if (ctx?.phase !== 'suitSelection' || !moves?.chooseSuit) return;
		if (ctx.currentPlayer !== botPlayerID) return;

		// Check if this bot already chose a suit
		const botPlayer = G?.players?.[botPlayerID];
		if (botPlayer?.chosenSuit !== null) return;

		// Find available suits (not taken by other players)
		const takenSuits = new Set(
			Object.values(G?.players ?? {})
				.map((p) => p.chosenSuit)
				.filter((s) => s !== null)
		);
		const availableSuits = SUITS.filter((s) => !takenSuits.has(s));

		if (availableSuits.length === 0) return;

		// Choose a random available suit
		const chosenSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
		console.log(`[Crown Duels Bot ${botPlayerID}] Choosing suit: ${chosenSuit}`);
		moves.chooseSuit(chosenSuit);
	}

	function makePlacementMove(client: ReturnType<typeof Client>, state: unknown, botPlayerID: string) {
		const s = state as {
			G?: CrownDuelsState;
			ctx?: { phase?: string; currentPlayer?: string };
		};
		const G = s.G;
		const ctx = s.ctx;
		const moves = (client as unknown as { moves?: ClientMoves }).moves;

		if (ctx?.phase !== 'placement' || !moves?.placeCard) return;
		if (ctx.currentPlayer !== botPlayerID) return;

		const botPlayer = G?.players?.[botPlayerID];
		if (!botPlayer) return;

		// If already done placing, nothing to do
		if (botPlayer.donePlacing) return;

		// If we have cards in hand, place one randomly
		if (botPlayer.hand.length > 0) {
			const handIndex = Math.floor(Math.random() * botPlayer.hand.length);

			// Choose a random zone (excluding corruption if just became corrupt)
			let availableZones: Zone[] = [...ZONES];
			if (botPlayer.justBecameCorrupt) {
				availableZones = availableZones.filter((z) => z !== 'corruption');
			}
			const zone = availableZones[Math.floor(Math.random() * availableZones.length)];

			console.log(`[Crown Duels Bot ${botPlayerID}] Placing card ${handIndex} in ${zone}`);
			moves.placeCard(handIndex, zone);
			return;
		}

		// If hand is empty or we have 1-2 cards left, confirm placement
		if (moves.confirmPlacement) {
			console.log(`[Crown Duels Bot ${botPlayerID}] Confirming placement`);
			moves.confirmPlacement();
		}
	}

	function makeRevealMove(client: ReturnType<typeof Client>, state: unknown, botPlayerID: string) {
		const s = state as {
			G?: CrownDuelsState;
			ctx?: { phase?: string; currentPlayer?: string };
		};
		const G = s.G;
		const ctx = s.ctx;
		const moves = (client as unknown as { moves?: ClientMoves }).moves;

		if (ctx?.phase !== 'reveal' || !moves?.confirmReveal) return;
		if (ctx.currentPlayer !== botPlayerID) return;

		const botPlayer = G?.players?.[botPlayerID];
		if (!botPlayer) return;

		// If already confirmed, nothing to do
		if (botPlayer.confirmedReveal) return;

		console.log(`[Crown Duels Bot ${botPlayerID}] Confirming reveal (continue to fight)`);
		moves.confirmReveal();
	}

	function startBots(matchID: string) {
		stopBots();
		const creds = getBotCreds(matchID);
		const botPlayerIDs = Object.keys(creds);
		if (!botPlayerIDs.length || !SERVER_URL) return;

		const game = gameDef.game;
		for (const botPlayerID of botPlayerIDs) {
			const credentials = creds[botPlayerID];
			const client = Client({
				game,
				multiplayer: SocketIO({ server: SERVER_URL }),
				matchID,
				playerID: botPlayerID,
				credentials,
			} as Parameters<typeof Client>[0]);

			let lastTurn = -1;
			let lastCurrent = '';
			let lastPhase = '';
			let lastHandLen = -1;
			let lastConfirmedReveal = false;

			client.subscribe((state) => {
				const ctx = state?.ctx as {
					phase?: string;
					currentPlayer: string;
					turn?: number;
					gameover?: unknown;
				} | undefined;
				if (ctx?.gameover) return;

				const currentPlayer = ctx?.currentPlayer ?? '';
				const turn = ctx?.turn ?? -1;
				const phase = ctx?.phase ?? '';

				// Only act when it's this bot's turn
				if (currentPlayer !== botPlayerID) return;

				const G = state?.G as CrownDuelsState | undefined;
				const handLen = G?.players?.[botPlayerID]?.hand?.length ?? -1;
				const confirmedReveal = G?.players?.[botPlayerID]?.confirmedReveal ?? false;

				// React when turn, phase, hand length, or confirmedReveal changes
				if (
					turn === lastTurn &&
					currentPlayer === lastCurrent &&
					phase === lastPhase &&
					handLen === lastHandLen &&
					confirmedReveal === lastConfirmedReveal
				) {
					return;
				}

				lastTurn = turn;
				lastCurrent = currentPlayer;
				lastPhase = phase;
				lastHandLen = handLen;
				lastConfirmedReveal = confirmedReveal;

				// Add a small delay so the UI can update
				setTimeout(() => {
					if (phase === 'suitSelection') {
						makeSuitSelectionMove(client, state, botPlayerID);
					} else if (phase === 'placement') {
						makePlacementMove(client, state, botPlayerID);
					} else if (phase === 'reveal') {
						makeRevealMove(client, state, botPlayerID);
					}
				}, 300);
			});

			client.start();
			botClients.push({ playerID: botPlayerID, client });
		}
	}

	function stopBots() {
		for (const { client } of botClients) {
			try {
				client.stop();
			} catch {}
		}
		botClients.length = 0;
	}

	watch(
		matchIDRef,
		(matchID) => {
			if (!matchID) {
				stopBots();
				return;
			}
			const creds = getBotCreds(matchID);
			if (Object.keys(creds).length > 0) startBots(matchID);
		},
		{ immediate: true }
	);

	onUnmounted(stopBots);
}
