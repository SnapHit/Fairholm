# Decisions made during the build

Every ambiguity the briefs left open, and every place the build departed from them, with the reason,
the file it lives in, the symptom that would show the call was wrong, what to change if so, and how
confident the builder was. Nothing here has been verified by play; where a number was chosen it is a
starting value in `src/sim/constants.ts` and should be tuned at the table, not in this document.

**Order.** The list is sorted so that low confidence and high blast radius come first. The numbering
is the original order of decision, kept so that `RISKS.md`, `TUNING.md` and code comments can refer
to a decision by number. Read the first section before reading the code.

Confidence means: **high**, I would be surprised to be wrong; **medium**, a reasonable reading that
play may overturn; **low**, a guess made to keep the build moving.

---

## Read these first: low confidence, high blast radius

### 15. Rival expansion slows with size and is capped by map

**What.** Progress per turn toward a new rival settlement is
`expansionBase / (1 + held * expansionPerSettlement) * rivalExpansion` and all rivals together hold
at most 7, 11, 15 or 20 settlements by map size. The first number tried gave 34 rival settlements on
a small map by turn 226. `src/sim/rivals.ts`, `C.rivals.expansionBase`, `expansionPerSettlement`,
`settlementCap`.

**Measured on this build** (`tests/rivals.test.ts`, play stream fixed, player passive, rival
settlements held by all three rivals together):

| Map | Terms | Turn 100 | Turn 250 | Turn 480 | Cap |
|---|---|---|---|---|---|
| small | generous | 6 | 7 | 7 | 7 |
| small | standard | 6 | 7 | 7 | 7 |
| small | hard | 6 | 7 | 7 | 7 |
| small | punitive | 7 | 7 | 7 | 7 |
| standard | generous | 6 | 9 | 11 | 11 |
| standard | standard | 6 | 11 | 11 | 11 |
| standard | hard | 6 | 11 | 11 | 11 |
| standard | punitive | 9 | 11 | 11 | 11 |
| large | generous | 6 | 9 | 11 | 15 |
| large | standard | 6 | 12 | 15 | 15 |
| large | hard | 6 | 12 | 15 | 15 |
| large | punitive | 9 | 15 | 15 | 15 |

Every row but one is at the cap by turn 250. The cap, not the rate, is what sets the number of rival
settlements the player sees, and the four charter terms are indistinguishable by turn 250 on small
and standard maps. The early game (turn 100) is the only place the rate shows: six settlements across
three rivals, nine at punitive.

**Symptom if wrong.** Rival settlement count flat at the cap from around turn 200 on every map; a
burst of rival founding in the first hundred turns and then nothing for three hundred; charter terms
making no difference to how crowded the coast is.

**What to change.** Short term, `C.rivals.expansionBase` (lower) and `expansionPerSettlement`
(higher) to make the curve rather than the cap bind, then raise `settlementCap` until it stops
binding on standard terms. Verify with `tests/rivals.test.ts`.

**Recommendation for a later pass, not built.** Thirty-four settlements means rival expansion had
no natural brake, and the cap is a patch rather than a fix. The player is slowed by three compounding
soft pressures: administrative overhead (clerks required as population grows), the resolve fraction
that penalises unresolved settlements, and freight loss by distance from the landing. Observable-depth
rivals simulate none of them, so nothing in their growth costs them anything. The honest fix is an
expansion rate that decays with size in the same shape those pressures impose on the player: each
new settlement a rival holds should raise the cost of the next in proportion to its distance from the
rival's landing and to the rival's total population, so that a rival with eight settlements feels the
same drag a player with eight does. Then the cap can go. This belongs in `src/sim/rivals.ts` with
the shape of the curve in `C.rivals`, and it should be tuned against the player's own settlement count
at turn 250 on standard terms.

A caution for whoever does that pass: of the three player-side pressures, only freight loss and the
resolve fraction are real in this build. The clerk rule (`clerksRequired` in `src/sim/labour.ts`)
currently does nothing but excuse that many idle colonists from the idle card; `clerkShortfall` is
defined and never read, so administrative overhead costs the player nothing either. Give the player
the drag first, then give it to the rivals.

**Confidence: low.** The table above is the reason. The rate was chosen to stop a runaway, not to
match anything.

### 21. Waves launch after the window and then about every five turns

**What.** After the six-turn muster window a wave sails; further waves sail roughly every
`waveInterval` turns with a sixty per cent chance on each due turn, never two at sea at once, each
with a blockade ship off the landing. The win check runs after any launch in the same turn.
`src/sim/fleet.ts`, `C.military.waveSize`, `waveInterval`, `declarationWindow`.

**Symptom if wrong.** A fleet of five or six (the size grievance produces in a normal game) is one
wave and the war is over in ten turns, which is too little to earn the declaration. A fleet of forty
is eight waves over fifty or more turns, which drags. Either way the player reports the war feeling
like an appendix rather than the climax.

**What to change.** `waveSize` and `waveInterval` first; the `0.6` launch chance is a literal in
`fleet.ts` and should move into `C.military`. If the fleet is usually small, make waves smaller and
more frequent so there are at least three landings to fight.

**Confidence: low.** The cadence was never seen by a person. The autopilot saw one wave.

### 22. Intervention is bought with 1200 wartime grievance at three per meeting house per turn

**What.** After declaring, every settlement with a meeting house adds three a turn toward
`interventionGrievance`; at the threshold a rival not at war removes forty per cent of the remaining
fleet pool and damages the blockade ships. `src/sim/fleet.ts`.

**Symptom if wrong.** Intervention never happens. With four meeting houses it takes a hundred turns
of war; wars under decision 21 last ten to fifty. The feature exists only in the glossary.

**What to change.** Accrue the actual grievance gathered (`grievanceGathered` in
`src/sim/grievance.ts`) during the war instead of a flat three, or lower `C.military.interventionGrievance`
to something a twenty-turn war can reach.

**Confidence: low.** The accrual rate was written without doing the arithmetic above.

### 5. Goods in transit under a surplus rule are abstract

**What.** A settlement whose surplus rule is "ship to X" moves goods as a `transits` record that
arrives after `ceil(distance / 2)` turns (four with roads at both ends) and waits, without moving,
while hostile units are within three tiles of either end. Hauler units with real cargo exist only
for hand-run circuits. `src/sim/orders.ts`, `src/sim/state.ts`.

**Symptom if wrong.** Nobody ever equips a hauler, because the abstract transit is safe, free and
needs no road. Inland settlements become as good as coastal ones the moment a second settlement
exists. Raiders and war parties never touch goods on the road.

**What to change.** The speed and the hostile radius are literals in `shipSurplus`; make the transit
require a hauler unit in the sending settlement, or charge horses per trip, or add a loss chance on
the road. Moving the literals into `C.orders` is the first step either way.

**Confidence: low.** This is the decision that most changes what the hauler is for, and the brief
clearly wanted haulers to matter.

### 12. Blockade is scoped to waves at sea

**What.** Passages and consignments stop only while a Company wave is at sea (and passages stop for
good once the war is won). The declaration alone does not blockade. `src/sim/fleet.ts`,
`src/sim/market.ts` (`canConsign`), `src/sim/labour.ts`.

**Symptom if wrong.** Between waves the player keeps consigning at the smuggler's rate and the war
costs nothing but militia; or, if the brief meant a permanent blockade, the muster window and the
intervals are periods of free income that were never intended.

**What to change.** The condition in `canConsign` and the `blockaded` expression in `labour.ts`. If
a permanent blockade is wanted, return to testing `declaration.declared && !won`.

**Confidence: medium.** The military brief says the blockade accompanies the fleet; a blockade from
the turn of declaration would make the six-turn window pointless, so this reading was preferred.

### 20. The Company sacks rather than holds

**What.** A Company unit that beats the last defender of any settlement but the landing throws down
its works and takes half the store, then marches on. Only the landing falling ends the war.
`src/sim/military.ts` (`takeSettlement`).

**Symptom if wrong.** The whole war is fought at the landing; outlying settlements are sacked every
few turns with nothing to be done about it; a player who garrisons the landing alone cannot lose.

**What to change.** `takeSettlement` for the Company branch. Holding the settlement as a Company
garrison that must be retaken would give the war a front.

**Confidence: medium.** It keeps the loss condition clean, which matters more in version one than a
front does.

### 13. Predecessor trade pays in gold, with gifts in kind

**What.** "Trade in kind" was read as: they pay gold from their own purse with no Company charge, at
`basePriceFraction` of the Company price times the strong or minor premium, and a quarter of the
time add twenty of the crop they grow. A sale is bounded by `transactionCap`, by their purse
(`(wealth + 200) / price` units), and by never buying the same good twice running. Their purse
refills at three a turn and trade lifts their prices by up to half. `src/sim/predecessors.ts`.

**Symptom if wrong.** Either predecessors are a gold faucet (the strong premium of 1.8 on a good
with no charge beats the Company every time, bounded only by the purse) or they are irrelevant
(the purse empties after one trade and refills too slowly to matter). The sheet will show refusals
for lack of purse in the second case.

**What to change.** The purse rule and the refill are literals in `offerToPredecessor` and the
predecessors system; the premiums and the cap are in `C.predecessors`.

**Confidence: low.** Gold was the simplest way to make the sale count without a second inventory
and a second picker. The brief's intent may have been goods for goods.

### 10. Inland consignment requires a consignment office, and 11, freight loss by distance

**What.** A settlement consigns only if it is coastal or holds a consignment office; otherwise goods
must be hauled to the coast. Consignments lose 0.4 per cent per tile of distance from the landing,
capped at 25 per cent. `src/sim/market.ts`, `C.market.freightLossPerTile`, `freightLossMax`.

**Symptom if wrong.** Players never found inland, because without a route-authoring sheet hauling is
manual tedium; or inland settlements fill and spoil while the queue says "haul to the coast" every
turn. The first signatory becomes mandatory rather than valuable.

**What to change.** `canConsign` for the rule; the two freight constants for the pressure. If inland
founding is dead, let coastal settlements within a few tiles count as the port for an inland one.

**Confidence: medium.** It is what makes the first signatory worth having, which the remaining
systems proposal wanted, but the missing hauling interface makes the rule harsher than designed.

### 18. An undefended rival settlement still resists with its people

**What.** When the last defender of a rival settlement is beaten, the settlement is taken only if the
attacker wins one more exchange against militia defence times the works multiplier; otherwise "held
behind its people". `src/sim/military.ts` (`attackWith`).

**Symptom if wrong.** Taking a rival settlement takes many turns of repeated attacks against a
settlement with no garrison, each attack costing a move and risking degradation; or one militia takes
any rival settlement on the first try.

**What to change.** The resist formula in `attackWith`; a dedicated constant in `C.military` would
be better than the reuse of militia defence.

**Confidence: medium.** Without it rivals were undefended; with it they may be too sticky.

### 17. Rival war parties and 16, relations by events only

**What.** At war a rival spawns a militia (or, thirty per cent of the time, an outrider) at its
nearest settlement with probability 0.08 a turn, capped by strength. Relations move from peace to
tense by crowding within four tiles or suspicion, and to war only by suspicion reaching 1.0 (five
raiders caught in the act) or by the player attacking. `src/sim/rivals.ts`, `C.rivals.*`.

**Symptom if wrong.** Rivals never go to war unless attacked, because raiders are rare (0.03 a turn
across all rivals) and rarely caught; so the rival war party code is reachable only by the player
starting a war. Once at war, single militia arrive every ten to fifteen turns and die on the palisade,
which farms promotions.

**What to change.** `C.rivals.crowdingRelationPerTurn`, `suspicionPerRaid`, `tenseAt`, `warAt`,
`C.naval.rivalRaidChancePerTurn`; the 0.08 and the `strength / 4` cap are literals in `rivals.ts`
and should move into `C.rivals`.

**Confidence: low for the numbers, medium for the structure.** The structure is what the rival
charters brief asked for; the numbers were never observed.

### 8. Starvation after three turns of deficit

**What.** `C.labour.starvationTurns: 3`. A settlement with a food deficit and an empty store loses its
most recent arrival after three consecutive turns.

**Symptom if wrong.** Deaths in the first twenty turns before the player has learnt what food is,
which the onboarding brief forbids; or hunger with no teeth, so the hunger card is ignored.

**What to change.** The constant. Raising it is safe; the queue item fires from the first turn of
deficit regardless.

**Confidence: medium.** The colonists brief gave a hunger condition without a number.

### 9. A settlement's own tile yields its food free and half its best other yield free

**What.** The centre tile is worked without a colonist; it gives its full food and half of its best
other good. `src/sim/settlement.ts` (`produce`).

**Symptom if wrong.** A settlement of one colonist feeds itself and produces, so founding many tiny
settlements is always right; or a new settlement starves before its first worker is placed.

**What to change.** The two lines in `produce`; a constant in `C.labour` for the fraction would let
it be tuned without a code change.

**Confidence: medium.** The brief said the centre tile is worked free; which good was open.

---

## Medium confidence

### 19. Captured colonists join the victor as debtors; captured Company regulars are removed

**What.** The bottom of the degrade ladder for an unarmed unit is capture. A colonist the player
captures joins the player's first settlement as a debtor; a colonist the player loses is gone.
`src/sim/military.ts` (`degrade`).

**Symptom if wrong.** Since rivals never field colonists and the Company's regulars are removed
rather than captured, the capture-to-debtor branch is reachable only in tests. If rivals later field
colonists it becomes a free immigration engine.

**What to change.** `degrade`. Consider capture only for units that were carrying a body.

**Confidence: medium.** Matches "degrade not die" to its natural end; the asymmetry is acceptable.

### 23. Naval engagements resolve on guns

**What.** Best of three on `guns / (guns_a + guns_b + 1)`; the loser takes one damage (one speed and
one gun), yields sixty per cent of its cargo, and founders when damage exceeds its speed. A rival
raider engages only a player hull beside it and only if at least as fast, else on a coin toss. Player
hulls never initiate; there is no action for a hull to attack. `src/sim/naval.ts`.

**Symptom if wrong.** A cutter is useless because it cannot be told to attack; raiders are only ever
met by accident; a lighter with no guns always loses and the player learns not to sail.

**What to change.** Add `attack` support for hulls in `attackWith` (it currently rejects anything
`isArmed` does not cover, and hulls are not armed by that predicate); the speed rule in `engage`.

**Confidence: medium for the maths, low for the experience.** The brief says speed decides who can
bring whom to action; this approximates it.

### 14. A debtor cannot be taught by a predecessor people

**What.** Mirrors the school rule. `src/sim/predecessors.ts`.

**Symptom if wrong.** The spare colonist at landing is a debtor and is the only unit the player has,
so the first "they would teach bloom" opportunity is refused for a reason the card does not explain.

**What to change.** One line in `learnFromPredecessor`, and the queue item should then filter for
standing, which it already does.

**Confidence: medium.**

### 1. Anchorage spacing five and twelve coast tiles per anchorage

**What.** Tightened from seven and twenty-two so small maps reliably offer three landing sites;
viable coves within eighteen tiles of the player's landing are promoted when fewer than three
anchorages exist. `src/sim/worldgen.ts`, `C.worldgen.anchorageSpacing`, `anchoragePerCoastTiles`.

**Symptom if wrong.** Waves landing on top of each other or at a cove with one land tile; the
narrowing approach ruling out coast that was never plausible; worldgen retrying often (the
`worldgenProblem` flag set in `state.flags`).

**What to change.** The two constants; `landingViable` for what counts as a cove.

**Confidence: medium.** Validated across sizes, shapes and seeds in `tests/worldgen.test.ts`, not by
eye on a phone.

### 25. The hold ring shows from the first frame and the path is previewed on the first hold frame

**What.** `src/ui/input.ts`, `src/ui/app.ts` (`holdRing`). A Dijkstra search with a 400-node bound
runs at the start of every hold when a unit is active.

**Symptom if wrong.** A stutter at the start of every hold on a large map with a far target; a ring
flashing on every quick tap.

**What to change.** The `maxLen` default of `findPath` in `src/sim/units.ts` or debounce the preview
in `holdRing`.

**Confidence: medium.** The feel brief asks for both behaviours; the cost was not measured on a phone.

### 27. Tapping a landing card lands; "Look" glides there

**What.** `src/ui/app.ts` (`renderLanding`), and a tap on the map within three tiles of a site lands.

**Symptom if wrong.** Accidental landings on the first tap of the game, and no way back except a new
game.

**What to change.** Make the map tap select and the card commit, in `tap` and `renderLanding`.

**Confidence: medium.** The onboarding brief says one tap starts; it did not say the map tap should.

### 29. Sheets take the bottom 42 per cent in portrait and the right 40 per cent in landscape

**What.** `src/ui/app.ts` (`layout`), `src/ui/style.css`.

**Symptom if wrong.** On a short phone the map is under three hundred pixels tall and working zoom
shows six tiles; in landscape the sheet is too narrow for the settlement sheet's rows.

**What to change.** The `0.58` in `layout` and the grid rows in `style.css`; both should be one
constant.

**Confidence: medium.** Checked at 390 by 844 and its rotation only.

### 31. Rivers and roads are lifted two hundredths above the terrain

**What.** `src/render/ribbons.ts`. Sinking them hid most of the ribbon under the jittered surface.

**Symptom if wrong.** Ribbons visibly floating at mountain edges or cut by the surface in hollows.

**What to change.** The lift values in `buildRibbons`; a better fix samples the terrain at more points
along the ribbon.

**Confidence: medium.** Looked right in one screenshot.

---

## High confidence, or low blast radius

### 2. Everything starts explored; fog of war is off

`C.flags.fogOfWar: false`. The `explored` flag is kept on every tile and the renderer can dim
unexplored ground, so fog can be switched on later without a schema change. Symptom if wrong: none in
version one. Change: the flag, then review every system that sets `explored`. **Confidence: high**
for version one.

### 3. The massive map generates but is unvalidated

`C.flags.massiveValidated: false`; offered marked untested. Symptom if wrong: generation over two
seconds, or fewer than three sites, on massive only. Change: add massive to `tests/worldgen.test.ts`
and fix what fails. **Confidence: high** that it is unvalidated; unknown whether it works.

### 4. Telemetry is local only

Counters in localStorage, shown at the foot of the menu; hooks in `src/io/telemetry.ts`. Symptom
if wrong: none; nothing is sent anywhere. Change: add an endpoint in `telemetry.ts` and a privacy
paragraph. **Confidence: high.**

### 6. Undo instead of confirmation, by structured clone, eight deep, cleared at end of turn

`src/ui/app.ts`. The play RNG stream is carried across an undo so the same dice are never replayed.
Symptom if wrong: a pause after every tap on a massive map (a clone of five thousand tiles). Change:
the depth, or snapshot only the touched settlement. **Confidence: high** for correctness; the cost
on a massive map is unmeasured.

### 7. The renderer's deterministic jitter uses a hash of the seed, never the sim RNG

`src/render/seed.ts`. Symptom if wrong: terrain jitter differing between sessions of the same seed.
**Confidence: high.**

### 24. Stacked units open a chooser; a single unit activates directly

`src/ui/app.ts`, `src/ui/sheets.ts` (`stackSheet`). With a unit already active, tapping a stack of
your own units keeps the active one and previews the path. Symptom if wrong: a chooser for one unit,
or the wrong unit activated from a stack. **Confidence: high.**

### 26. Double tap snaps between overview and working zoom on the tapped tile

`src/ui/app.ts` (`doubleTap`). Symptom if wrong: zoom ping-pong when the threshold (eighty per cent
of working zoom) sits between the two levels after a pinch. **Confidence: high.**

### 28. Tiles pickable only at 44 pixels or above; markers keep a hit area at every zoom

`src/render/picking.ts`, `C.feel.tileTapFloor`. Symptom if wrong: mis-taps at overview or markers
stealing taps from tiles at working zoom (the marker radius is 18 to 34 pixels by zoom).
**Confidence: high**; the radii are literals that belong in `C.feel`.

### 30. Ten draw calls at working zoom

One mesh for rivers and roads with vertex colours; two instanced meshes for settlements; three for
props. Symptom if wrong: frame time on a phone above sixteen milliseconds while pinching at detail
zoom with a forested screen. Change: instance counts and the LOD cull in `src/render/scene.ts`.
**Confidence: high** for the count; the phone was never measured.

### 32. Turn zero is new green

`src/sim/turn.ts` clamps turn zero to the first season. Before the fix the arrival frame rendered
black. **Confidence: high.** Pinned by the smoke script.

---

## Left out of version one

- Rival diplomacy offers (`C.flags.rivalDiplomacyOffers: false`).
- Fog of war (`C.flags.fogOfWar: false`, structure in place).
- A goods-for-goods predecessor exchange (decision 13).
- Patrol and haul orders have no sheet to author them; the sim runs them and the unit sheet can
  clear them. A route-building sheet is the next interface piece.
- An attack action for hulls (decision 23).
- The surplus destination "offer to a predecessor people" exists in the types and the orders sheet
  does not offer it, and `src/sim/orders.ts` does not execute it.
- Garrison capacity and battery slots per works tier are in `C.military` and enforced nowhere.
- Signatory seven (cheaper batteries) has no effect; `equipCost` does not read signatories.
- The Roboto Light size 10 document preference applies to documents, not to this repository's
  Markdown.
