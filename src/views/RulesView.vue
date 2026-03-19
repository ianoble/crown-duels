<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

const sections = [
	{ id: "overview", label: "Overview" },
	{ id: "setup", label: "Setup" },
	{ id: "zones", label: "Card Zones" },
	{ id: "round-flow", label: "Round Flow" },
	{ id: "combat", label: "Combat" },
	{ id: "discard-rules", label: "Discard Rules" },
	{ id: "special-abilities", label: "Special Abilities" },
	{ id: "corruption", label: "Corruption" },
	{ id: "royals", label: "Royal Defeat" },
	{ id: "winning", label: "Win Conditions" },
	{ id: "turn-order", label: "Turn Order" },
];

const activeSection = ref("overview");

function scrollTo(id: string) {
	activeSection.value = id;
	const el = document.getElementById(id);
	if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
	<div class="min-h-screen bg-slate-900 text-white">
		<!-- Header -->
		<header class="border-b border-slate-800 sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
			<div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
				<div class="flex items-center gap-4">
					<button
						class="text-sm text-slate-400 hover:text-white transition-colors"
						@click="router.push('/')"
					>
						&larr; Back to Lobby
					</button>
					<h1 class="text-xl font-bold">How to Play: Crown Duels</h1>
				</div>
			</div>
		</header>

		<div class="max-w-6xl mx-auto px-6 py-8 flex gap-8">
			<!-- Sidebar navigation -->
			<nav class="hidden md:block w-48 shrink-0">
				<ul class="sticky top-24 space-y-1">
					<li v-for="s in sections" :key="s.id">
						<button
							class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
							:class="activeSection === s.id
								? 'bg-slate-700 text-white font-medium'
								: 'text-slate-400 hover:text-white hover:bg-slate-800'"
							@click="scrollTo(s.id)"
						>
							{{ s.label }}
						</button>
					</li>
				</ul>
			</nav>

			<!-- Main content -->
			<main class="flex-1 min-w-0 space-y-12">

				<!-- Overview -->
				<section id="overview">
					<h2 class="text-2xl font-bold mb-4">Overview</h2>
					<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-3 text-slate-300">
						<p>
							Crown Duels is a <strong class="text-white">2-player card duel</strong> where each player commands a royal court — Jack, Queen, and King — and uses a standard 54-card deck to fight for supremacy.
						</p>
						<p>
							Equip <strong class="text-white">weapons</strong> and <strong class="text-white">armour</strong>, cast powerful <strong class="text-white">spells</strong>, and outlast your opponent across multiple rounds to defeat all three of their royals.
						</p>
						<p>
							<strong class="text-white">Goal:</strong> Be the first to defeat all three of your opponent's royals — Jack, then Queen, then King.
						</p>
					</div>
				</section>

				<!-- Setup -->
				<section id="setup">
					<h2 class="text-2xl font-bold mb-4">Setup</h2>
					<div class="space-y-4">
						<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-3 text-slate-300">
							<h3 class="text-lg font-semibold text-white">Choosing Your Suit</h3>
							<p>Each player selects a <strong class="text-white">suit</strong> (♣ Clubs, ♠ Spades, ♥ Hearts, ♦ Diamonds) for their royalty. Your Jack, Queen, and King of that suit form your <strong class="text-white">royal life stack</strong>.</p>
						</div>

						<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-3 text-slate-300">
							<h3 class="text-lg font-semibold text-white">Royal Vitality (HP)</h3>
							<div class="grid grid-cols-3 gap-3">
								<div class="p-3 bg-slate-900 rounded-lg text-center">
									<div class="text-2xl font-bold text-yellow-400">J</div>
									<div class="text-sm text-slate-400 mt-1">Jack</div>
									<div class="text-lg font-semibold text-white">3 HP</div>
								</div>
								<div class="p-3 bg-slate-900 rounded-lg text-center">
									<div class="text-2xl font-bold text-yellow-400">Q</div>
									<div class="text-sm text-slate-400 mt-1">Queen</div>
									<div class="text-lg font-semibold text-white">4 HP</div>
								</div>
								<div class="p-3 bg-slate-900 rounded-lg text-center">
									<div class="text-2xl font-bold text-yellow-400">K</div>
									<div class="text-sm text-slate-400 mt-1">King</div>
									<div class="text-lg font-semibold text-white">5 HP</div>
								</div>
							</div>
							<p>Each royal also determines how many cards you draw per round and your starting hand size. The Jack is always your first active royal.</p>
						</div>

						<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-2 text-slate-300">
							<h3 class="text-lg font-semibold text-white">Draw Pile &amp; Jester Token</h3>
							<ul class="list-disc list-inside space-y-1">
								<li>The 40 non-royal cards from both players' suits are shuffled into your draw pile</li>
								<li>Draw cards equal to your active royal's vitality to form your starting hand</li>
								<li>One player receives the <strong class="text-white">Jester token</strong>, which determines first-turn priority</li>
							</ul>
						</div>
					</div>
				</section>

				<!-- Card Zones -->
				<section id="zones">
					<h2 class="text-2xl font-bold mb-4">Card Zones</h2>
					<p class="text-slate-400 mb-4">Each player has four zones on their board where cards can be placed during the Plot phase.</p>
					<div class="space-y-3">
						<div class="p-4 bg-slate-800 border border-red-900/50 rounded-xl">
							<div class="flex items-start gap-3">
								<span class="text-2xl">⚔️</span>
								<div>
									<h3 class="font-semibold text-red-400">Attack Zone</h3>
									<p class="text-slate-300 text-sm mt-1">Accepts <strong class="text-white">♣ Weapons</strong> and <strong class="text-white">♥ Ignite spells</strong>. Cards here determine your Strength — the damage you deal.</p>
								</div>
							</div>
						</div>
						<div class="p-4 bg-slate-800 border border-blue-900/50 rounded-xl">
							<div class="flex items-start gap-3">
								<span class="text-2xl">🛡️</span>
								<div>
									<h3 class="font-semibold text-blue-400">Defence Zone</h3>
									<p class="text-slate-300 text-sm mt-1">Accepts <strong class="text-white">♠ Armour</strong> and <strong class="text-white">♥ Ward spells</strong>. Cards here determine your Block — the damage you absorb.</p>
								</div>
							</div>
						</div>
						<div class="p-4 bg-slate-800 border border-purple-900/50 rounded-xl">
							<div class="flex items-start gap-3">
								<span class="text-2xl">✨</span>
								<div>
									<h3 class="font-semibold text-purple-400">Spell Zone</h3>
									<p class="text-slate-300 text-sm mt-1">Accepts <strong class="text-white">♣/♠</strong> for combat modifiers, <strong class="text-white">♥</strong> for Siphon, and <strong class="text-white">♦</strong> for Shatter. Triggers special effects each round.</p>
								</div>
							</div>
						</div>
						<div class="p-4 bg-slate-800 border border-yellow-900/50 rounded-xl">
							<div class="flex items-start gap-3">
								<span class="text-2xl">☠️</span>
								<div>
									<h3 class="font-semibold text-yellow-600">Corruption Zone</h3>
									<p class="text-slate-300 text-sm mt-1">Cards accumulate here face-down when your opponent uses Siphon. When the count reaches your active royal's vitality, they all move to your hand and you become <strong class="text-white">Corrupt</strong>.</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				<!-- Round Flow -->
				<section id="round-flow">
					<h2 class="text-2xl font-bold mb-4">Round Flow</h2>
					<p class="text-slate-400 mb-4">Each round consists of five sequential phases.</p>
					<ol class="space-y-4">
						<li class="flex gap-4">
							<span class="shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-sm">1</span>
							<div class="p-4 flex-1 bg-slate-800 border border-slate-700 rounded-xl">
								<h3 class="font-semibold text-white">Plot Phase</h3>
								<p class="text-slate-300 text-sm mt-1">Players take turns placing cards <strong class="text-white">face-down</strong> into their zones. You can also pick up a card you've placed and return it to your hand. When you're ready, confirm your placement. Both players must confirm before the next phase begins.</p>
							</div>
						</li>
						<li class="flex gap-4">
							<span class="shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-sm">2</span>
							<div class="p-4 flex-1 bg-slate-800 border border-slate-700 rounded-xl">
								<h3 class="font-semibold text-white">Reveal Phase</h3>
								<p class="text-slate-300 text-sm mt-1">All placed cards flip face-up. Invalid cards are automatically discarded (wrong suit in a zone, lower weapons/armour, duplicate spell suits). Both players confirm before moving on.</p>
							</div>
						</li>
						<li class="flex gap-4">
							<span class="shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-sm">3</span>
							<div class="p-4 flex-1 bg-slate-800 border border-slate-700 rounded-xl">
								<h3 class="font-semibold text-white">Fight Phase</h3>
								<p class="text-slate-300 text-sm mt-1">Strength and Block are calculated for both players. Damage = <code class="text-yellow-300 bg-slate-900 px-1 rounded">max(0, opponent Strength − your Block)</code>. This damage is subtracted from your active royal's HP.</p>
							</div>
						</li>
						<li class="flex gap-4">
							<span class="shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-sm">4</span>
							<div class="p-4 flex-1 bg-slate-800 border border-slate-700 rounded-xl">
								<h3 class="font-semibold text-white">Cast Spells Phase</h3>
								<p class="text-slate-300 text-sm mt-1"><strong class="text-white">Siphon (♥ spells)</strong> and <strong class="text-white">Shatter (♦ spells)</strong> trigger their effects. See the Special Abilities section for full details.</p>
							</div>
						</li>
						<li class="flex gap-4">
							<span class="shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-sm">5</span>
							<div class="p-4 flex-1 bg-slate-800 border border-slate-700 rounded-xl">
								<h3 class="font-semibold text-white">Clean Up Phase</h3>
								<p class="text-slate-300 text-sm mt-1">Discard per-round cards (spell zone, ♦/♥ from attack/defence); ♣ weapons and ♠ armour persist. Check for royal defeat. Draw new cards equal to your active royal's vitality. Check Corruption threshold.</p>
							</div>
						</li>
					</ol>
				</section>

				<!-- Combat -->
				<section id="combat">
					<h2 class="text-2xl font-bold mb-4">Combat Calculations</h2>
					<div class="space-y-4">
						<div class="p-5 bg-slate-800 border border-red-900/50 rounded-xl space-y-3">
							<h3 class="font-semibold text-red-400">Strength (Attack)</h3>
							<ul class="text-slate-300 text-sm space-y-2">
								<li><strong class="text-white">Weapons (♣):</strong> highest ♣ value + 1 for each additional ♣ card</li>
								<li><strong class="text-white">Ignite (♥ in Attack zone):</strong> sum of all ♥ values; <strong class="text-yellow-300">doubled</strong> if any ♥ value matches a ♣ value</li>
							</ul>
							<div class="text-xs text-slate-500 bg-slate-900 rounded p-3 font-mono">
								Example: ♣8, ♣3, ♥3 in attack<br>
								Weapons: 8 + 1 = 9<br>
								Ignite: 3 × 2 = 6 (♥3 matches ♣3)<br>
								<strong class="text-white">Total Strength: 15</strong>
							</div>
						</div>

						<div class="p-5 bg-slate-800 border border-blue-900/50 rounded-xl space-y-3">
							<h3 class="font-semibold text-blue-400">Block (Defence)</h3>
							<ul class="text-slate-300 text-sm space-y-2">
								<li><strong class="text-white">Armour (♠):</strong> highest ♠ value + 1 for each additional ♠ card</li>
								<li><strong class="text-white">Ward (♥ in Defence zone):</strong> sum of all ♥ values; <strong class="text-yellow-300">doubled</strong> if any ♥ value matches a ♠ value</li>
							</ul>
						</div>

						<div class="p-5 bg-slate-800 border border-purple-900/50 rounded-xl space-y-3">
							<h3 class="font-semibold text-purple-400">Spell Zone Combat Modifiers</h3>
							<div class="space-y-2 text-sm">
								<div class="flex items-start gap-3 p-3 bg-slate-900 rounded-lg">
									<span class="text-white font-bold shrink-0">♣</span>
									<div>
										<strong class="text-white">All Out Attack:</strong>
										<span class="text-slate-300"> Your Block value is added to Strength, then Block becomes 0. High risk, high reward.</span>
									</div>
								</div>
								<div class="flex items-start gap-3 p-3 bg-slate-900 rounded-lg">
									<span class="text-white font-bold shrink-0">♠</span>
									<div>
										<strong class="text-white">All Out Defence:</strong>
										<span class="text-slate-300"> Your Strength value is added to Block, then Strength becomes 0. Purely defensive play.</span>
									</div>
								</div>
								<div class="flex items-start gap-3 p-3 bg-slate-900 rounded-lg">
									<span class="text-white font-bold shrink-0">♣+♠</span>
									<div>
										<strong class="text-white">Face Plant:</strong>
										<span class="text-slate-300"> Both Strength and Block become 0. Neither player deals or absorbs damage this round.</span>
									</div>
								</div>
							</div>
						</div>

						<div class="p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-xl text-sm text-slate-300">
							<strong class="text-yellow-300">Damage Formula:</strong>
							<code class="ml-2 text-yellow-300 bg-slate-900 px-2 py-0.5 rounded">max(0, opponent's Strength − your Block)</code>
							<p class="mt-1 text-slate-400">You cannot take negative damage — excess Block does not heal.</p>
						</div>
					</div>
				</section>

				<!-- Discard Rules -->
				<section id="discard-rules">
					<h2 class="text-2xl font-bold mb-4">Discard Rules (Reveal Phase)</h2>
					<p class="text-slate-400 mb-4">When cards are revealed, invalid ones are automatically discarded before combat is resolved.</p>
					<div class="space-y-3">
						<div class="p-4 bg-slate-800 border border-slate-700 rounded-xl space-y-2 text-sm text-slate-300">
							<h3 class="font-semibold text-white">Attack Zone</h3>
							<ul class="list-disc list-inside space-y-1">
								<li>All ♠ cards are discarded (wrong suit for attack)</li>
								<li>If you place a new ♣, all existing ♣s with a <em>higher</em> value than the lowest newly placed ♣ are discarded</li>
							</ul>
						</div>
						<div class="p-4 bg-slate-800 border border-slate-700 rounded-xl space-y-2 text-sm text-slate-300">
							<h3 class="font-semibold text-white">Defence Zone</h3>
							<ul class="list-disc list-inside space-y-1">
								<li>All ♣ cards are discarded (wrong suit for defence)</li>
								<li>If you place a new ♠, all existing ♠s with a <em>higher</em> value than the lowest newly placed ♠ are discarded</li>
							</ul>
						</div>
						<div class="p-4 bg-slate-800 border border-slate-700 rounded-xl space-y-2 text-sm text-slate-300">
							<h3 class="font-semibold text-white">Spell Zone</h3>
							<ul class="list-disc list-inside space-y-1">
								<li>If any suit appears <strong class="text-white">2 or more times</strong>, all cards of that suit in the spell zone are discarded</li>
							</ul>
						</div>
					</div>
				</section>

				<!-- Special Abilities -->
				<section id="special-abilities">
					<h2 class="text-2xl font-bold mb-4">Special Abilities</h2>
					<div class="space-y-4">
						<div class="p-5 bg-slate-800 border border-pink-900/50 rounded-xl space-y-3">
							<h3 class="font-semibold text-pink-400">Siphon (♥ in Spell Zone)</h3>
							<p class="text-slate-300 text-sm">Siphon drains cards from your opponent's deck into their Corruption store.</p>
							<ul class="text-slate-300 text-sm space-y-1 list-disc list-inside">
								<li>For each ♥ in your spell zone: draw 1 card from opponent's deck face-down into their Corruption store</li>
								<li><strong class="text-white">Bonus:</strong> +1 Siphon for each of your ♣/♠ that share a value with an opponent ♣/♠ in their zones</li>
							</ul>
							<p class="text-xs text-slate-500">Siphon is a long-game strategy — filling the opponent's Corruption store forces them into the Corrupt state.</p>
						</div>

						<div class="p-5 bg-slate-800 border border-orange-900/50 rounded-xl space-y-3">
							<h3 class="font-semibold text-orange-400">Shatter (♦ in Spell Zone)</h3>
							<p class="text-slate-300 text-sm">Shatter destroys the opponent's lowest weapons and armour directly.</p>
							<ul class="text-slate-300 text-sm space-y-1 list-disc list-inside">
								<li>For each ♦ in your spell zone: destroy the lowest-value ♣ or ♠ in the opponent's zones</li>
								<li><strong class="text-white">Chain rule:</strong> if the lowest card shares a value with other cards, all cards of that value are destroyed first before moving on</li>
							</ul>
							<p class="text-xs text-slate-500">Shatter is ideal for disabling an opponent who has built up strong persistent armour or weapons.</p>
						</div>
					</div>
				</section>

				<!-- Corruption -->
				<section id="corruption">
					<h2 class="text-2xl font-bold mb-4">Corruption</h2>
					<div class="p-5 bg-slate-800 border border-yellow-900/50 rounded-xl space-y-3 text-slate-300">
						<p>Corruption cards accumulate in your <strong class="text-white">Corruption store</strong> face-down whenever an opponent's Siphon triggers.</p>

						<div class="p-3 bg-slate-900 rounded-lg text-sm space-y-1">
							<p><strong class="text-white">Corruption Threshold</strong> = your active royal's vitality</p>
							<p class="text-slate-400">Jack = 3 | Queen = 4 | King = 5</p>
						</div>

						<p>When your Corruption store count <strong class="text-white">≥ your active royal's vitality</strong>:</p>
						<ul class="list-disc list-inside space-y-1 text-sm">
							<li>All corruption cards move to your hand immediately</li>
							<li>You become <strong class="text-white">Corrupt</strong> for the next round</li>
						</ul>

						<div class="p-3 bg-yellow-900/20 border border-yellow-800/40 rounded-lg text-sm">
							<strong class="text-yellow-300">While Corrupt:</strong>
							<ul class="list-disc list-inside mt-1 space-y-1 text-slate-300">
								<li>Keep <strong class="text-white">2 cards</strong> between rounds (instead of 1)</li>
								<li>Certain card placements may be restricted</li>
							</ul>
						</div>
					</div>
				</section>

				<!-- Royal Defeat -->
				<section id="royals">
					<h2 class="text-2xl font-bold mb-4">Royal Defeat &amp; Progression</h2>
					<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-3 text-slate-300">
						<p>When your active royal's HP reaches 0 or below at the end of the Fight phase:</p>
						<ol class="list-decimal list-inside space-y-2 text-sm">
							<li>The royal is flipped face-down and moved to the HP stack (defeated pile)</li>
							<li>The next royal in line becomes active with <strong class="text-white">full HP</strong></li>
							<li>Jack → Queen → King is the order of succession</li>
						</ol>

						<div class="grid grid-cols-3 gap-3 mt-4 text-center text-sm">
							<div class="p-3 bg-slate-900 rounded-lg">
								<div class="font-bold text-yellow-400">Jack</div>
								<div class="text-slate-400 mt-1">First active</div>
								<div class="text-slate-500 text-xs mt-1">3 HP</div>
							</div>
							<div class="flex items-center justify-center text-slate-600 text-lg">&rarr;</div>
							<div></div>
							<div class="p-3 bg-slate-900 rounded-lg">
								<div class="font-bold text-yellow-400">Queen</div>
								<div class="text-slate-400 mt-1">Second</div>
								<div class="text-slate-500 text-xs mt-1">4 HP</div>
							</div>
							<div class="flex items-center justify-center text-slate-600 text-lg">&rarr;</div>
							<div></div>
							<div class="p-3 bg-slate-900 rounded-lg">
								<div class="font-bold text-yellow-400">King</div>
								<div class="text-slate-400 mt-1">Last stand</div>
								<div class="text-slate-500 text-xs mt-1">5 HP</div>
							</div>
						</div>

						<p class="text-sm text-slate-400">Persistent cards (♣ weapons, ♠ armour) in zones carry over after a royal is defeated — but the new royal's reduced hand size may change your strategy.</p>
					</div>
				</section>

				<!-- Win Conditions -->
				<section id="winning">
					<h2 class="text-2xl font-bold mb-4">Win Conditions</h2>
					<div class="space-y-3">
						<div class="p-5 bg-green-900/20 border border-green-800/50 rounded-xl">
							<h3 class="font-semibold text-green-400 mb-2">Victory</h3>
							<p class="text-slate-300">Defeat all three of your opponent's royals — their Jack, Queen, and King. When the King is defeated, the game ends and you win.</p>
						</div>
						<div class="p-5 bg-yellow-900/20 border border-yellow-800/50 rounded-xl">
							<h3 class="font-semibold text-yellow-400 mb-2">Draw</h3>
							<p class="text-slate-300">If <strong class="text-white">both Kings are defeated in the same round</strong>, the game ends in a draw — neither player wins.</p>
						</div>
					</div>
				</section>

				<!-- Turn Order -->
				<section id="turn-order">
					<h2 class="text-2xl font-bold mb-4">Turn Order (Plot Phase)</h2>
					<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-4 text-slate-300">
						<p>Who places first each round is determined by these rules, in order:</p>
						<ol class="space-y-3">
							<li class="flex gap-3 text-sm">
								<span class="shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs">1</span>
								<div><strong class="text-white">More cards in hand:</strong> the player with more cards in hand places first</div>
							</li>
							<li class="flex gap-3 text-sm">
								<span class="shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs">2</span>
								<div><strong class="text-white">Tied hand sizes:</strong> the Jester holder passes the Jester to their opponent; the new Jester holder places first</div>
							</li>
							<li class="flex gap-3 text-sm">
								<span class="shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs">3</span>
								<div><strong class="text-white">Round 1 (no previous round):</strong> the Jester holder places first</div>
							</li>
						</ol>
						<p class="text-sm text-slate-400">Players continue alternating placements until both have confirmed. You may place multiple cards per turn until you confirm.</p>
					</div>
				</section>

			</main>
		</div>
	</div>
</template>
