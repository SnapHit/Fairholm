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

**Changed 3 October 2026.** The recommendation below is built: decision 149 replaces the cap with a
drag in the shape of the player's own pressures and keeps the cap as a backstop. The table below is
the one that pass measured against.

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

**Changed 3 October 2026.** 360 now, decision 155; it fires around the third wave for a colony with four meeting houses.

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

**Superseded by decision 33.** The map now fills the viewport at all times and sheets slide over it.
What follows is the original entry, kept because the reasoning is still the argument against the
change and someone may want to weigh it again.


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

## The settlement screen and the layout, session of 23 August 2026

Settlement screen and layout brief, version 2, and section 6 of the feel brief. This session changed
only `/src/ui`, the stylesheet, `index.html` and one new read-only helper in `/src/render`. Nothing in
`/src/sim` was touched, so several of the calls below are the interface working around a gap in the
simulation rather than closing it. Those are marked.

### 33. The map fills the viewport at all times; the queue is a bar over it

**What.** `#map` is `position: absolute; inset: 0` in both orientations and `App.layout` sizes the
canvas to the whole root. Over it sit two thin strips: the intent and state at the top, the queue bar
at the bottom. Every sheet slides up over the map and goes away by a tap outside it or a swipe down
on its grip. Measured at rest on a 390 by 844 screen the map is 100 per cent of the height and the
two strips cover 13.6 per cent of it. `src/ui/app.ts`, `src/ui/style.css`. **Supersedes decision 29.**

**Why.** Section 1 of the brief: "everything reachable lives in the bottom third" was a rule about
thumb reach, not a rule that a third of the display is spent on furniture.

**Symptom if wrong.** The player cannot find a control they used to see, or the strips creep back
into a panel. **Change:** the strips are `#hud` and `#queuebar`; both are one flex row.
**Confidence: high.**

### 34. Resolving or dismissing collapses the queue back to its bar

**What.** `App.resolved` puts the queue away after any choice made from an expanded queue card. One
tap on the bar brings it back. `src/ui/app.ts`.

**Why.** The brief's own section 9 names this as its riskiest claim: if a busy turn keeps the list
open, the bar becomes a panel by another route. Collapsing is the version that keeps the promise.

**Symptom if wrong.** Working through six items on a bad turn takes six extra taps and feels like
being shooed out of the room. **Change:** collapse only when the queue empties, one line in
`resolved`. **Confidence: low.** This is the call most likely to be reversed by play.

### 35. The queue bar stays over every sheet, including the settlement screen

**What.** `#queuebar` sits above `#sheet` in the stack and every sheet reserves `--bar-h` of bottom
padding. So "End turn" is one tap from anywhere, and a quiet turn is still one tap.
`src/ui/style.css`.

**Why.** Acceptance check five. Putting the bar behind the sheets would have made the settlement
screen a place you must leave before you can finish the turn.

**Symptom if wrong.** The bar reads as clutter on the settlement screen, or a player ends a turn by
accident while assigning workers. **Change:** hide `#queuebar` while `#sheet.full` is open.
**Confidence: medium.**

### 36. Every stylistic decision lives in `src/ui/theme.ts`

**What.** One file holds every colour, space, radius, type size, weight, border, shadow, duration and
grid dimension, as a token map written onto the document root by `installTheme()`, plus the handful
of numbers the gesture code needs by name. `src/ui/style.css` contains no literal values at all; it
is structure and `var()` references. Changing the whole look means editing that one file.

**Why.** The brief asks for it as a hard requirement, and it is the same discipline `C` already
applies to the simulation's numbers.

**Symptom if wrong.** A colour or a size appears in the stylesheet or in a component. That is a bug,
not a style. **Change:** move it into `TOKENS`. **Confidence: high.**

**One cost.** The stylesheet loads before the module that installs the tokens, so on a cold load
there is a frame in which the custom properties are undefined. `index.html` carries
`<meta name="color-scheme" content="dark">` so that frame is dark rather than white. The page has no
content at that point.

### 37. The type scale is in rem, and the reflow is decided in code, not in a media query

**What.** `--text-*` are rem, so all text follows the reader's own font size. Whether the flanking
building columns sit beside the ring or below it is decided by `shouldReflow(width, rootFontPx)` in
`src/ui/theme.ts`, called from `App.layout`, which sets a `narrow` class on `#app`.

**Why.** A media query cannot see the root font size: `em` inside one is always the initial 16px. A
larger system font needs the wider stacked slots sooner, and the only way to know that is to measure.
Verified: at a 20px root on a 390 point screen the layout stacks and the building slots go from 56 to
122 points wide, and nothing is cut off.

**Symptom if wrong.** The layout flips between the two forms while resizing, or reflows too eagerly
on a large phone. **Change:** `REFLOW_PX`. **Confidence: medium.**

### 38. The ring gives way before the flanks; 88 points is a ceiling, not a floor

**What.** The flanks are a fixed `--slot-w` (56) and the ring takes what is left, capped at
`88 * 3`. At 390 points the ring cell comes out at 82 rather than 88; at 430 and at every stacked
width it is 88.

**Why.** The brief's arithmetic, 264 plus 56 plus 56 equals 376 in 390, leaves 14 points for two
gaps, two margins and two safe-area insets. Something had to give, and section 8 of the brief lists
this exact split as a thing to tune by playing. 82 is still nearly double the 44 point tap floor.

**Symptom if wrong.** The ring feels cramped on a 390 point phone. **Change:** `RING_CELL_PX` and
`SLOT_W_PX` in the theme; the layout follows. **Confidence: medium.**

### 39. A flanking slot is as tall as a row of the ring, not 56 points square

**What.** `.st-flank` is `grid-template-rows: repeat(3, 1fr)` inside a row whose height the ring
sets, so B1 lines up with the ring's first row, B2 with the second and B3 with the third.

**Why.** That is what the brief's diagram shows; 56 is the flank's width. Square slots left a third
of the flank empty and gave the names one line instead of two.

**Confidence: high.**

### 40. Ring cells draw the map's own ground, as colour and gradients, not as an image

**What.** `src/render/tiles.ts` is a read-only helper returning a tile's season-graded colour and its
features. The ring paints the colour as a background and the features as CSS gradients built from the
same palette: forest as canopy blobs, a river as a band, a road as a dashed track, worked ground as
furrows, a prime as a dot. `tileLook` applies the terrain shader's own lighting for a surface facing
straight up, so a swatch reads at the same weight as level ground on the map.

**Why.** Section 6, point 1 of the brief: the ring inherits every improvement to the palette or the
season without a second art pipeline. A canvas or an image set would have been that second pipeline.

**Symptom if wrong.** The ring and the map disagree about what a tile looks like after a renderer
change. **Change:** `graded()` in `src/render/tiles.ts` is the only place the two could drift.
**Confidence: medium.** The lighting constant is a stand-in for a real surface normal.

### 41. A 56 point slot cannot carry everything the brief asks of it

**What.** The brief asks a building slot for its name, its tier, two worker slots, what it converts,
its output this turn and a warning mark. At 56 points wide and 11px type that is about six characters
a line. The slot carries the name over two lines, the conversion over two, the crew dots and the
output on one, and the warning as a corner mark; the tier is implicit in the name, because the three
tiers have different names. Long names still truncate: "Carpenter's shop" reads as "Carpente shop".
The full name and the warning are on the element's label and in the sheet a tap away, and under a
larger font the layout stacks and the names fit whole.

**Why.** Reported rather than worked around: this is the brief's second arithmetic problem after
section 9's. **Change:** widen `SLOT_W_PX` to about 72 and let the ring fall to about 75, or reflow
at every width. **Confidence: high** that it is a real limit; **low** on which way to resolve it.

### 42. Per-building output is derived in the interface, not exposed by the simulation

**What.** `previewProduction` returns totals per good. The slot needs them per building, so
`buildingOutputs` in `src/ui/selectors.ts` mirrors that function's building branch and returns the
same numbers split by the line that makes them.

**Why.** The instruction for this session was not to change `/src/sim` to suit the view. This is a
read-only selector, as directed.

**Symptom if wrong.** The slot's number and the settlement's total disagree after a change to
`previewProduction`. **Change:** the two functions must move together; the comment in `selectors.ts`
says so. **Confidence: medium.** A `previewProduction` that returned both shapes would be better and
belongs in the simulation session.

### 43. "Near failure" for an imported machine is derived from the constants, not a new threshold

**What.** `machineNearFailure` warns when the machine is starved of instruments, or when the age term
of its failure chance has overtaken its base term: `years * importedFailPerYear >= importedFailBase`.

**Why.** Every number lives in `C`, and this session may not add to `C`. Expressing the threshold as
a relation between two existing constants keeps it tunable from the simulation without inventing an
interface constant. **Confidence: medium.**

### 44. A ring cell is dimmed for three reasons; water without a wharf is not one of them

**What.** Dimmed and unavailable: worked by another settlement, ground another charter holds,
predecessor territory, or nothing grows or is dug there. The brief also lists "water without a wharf".
The simulation does not gate water: `tileOffers` gives water three food and `assignWorker` accepts it,
and the old workers sheet carried a wharf check that was disabled in place (`|| true`). Gating it in
the interface alone would have produced a greyed tile with a worker standing on it, because
`autoAssign` would still use it.

**Why.** Reported rather than papered over. **Change:** the gate belongs in `assignWorker` and
`defaultJob`, in the simulation session. **Confidence: high** that this is the right way round.

Of the three that are dimmed, only "worked by another settlement" is enforced by the simulation. The
other two are the interface telling the truth about ground it should not take; `autoAssign` could
still place someone there.

### 45. Assignment is two taps either way round, and a swap is three actions in one undo step

**What.** Tap a tile or a slot and a sheet lists everyone, best first, with what each would make
there. Tap an idle colonist and every useful destination lights up; tap one to place them. Tapping an
occupied place offers a swap with the person in it, or a straight take-over when the newcomer is
idle. `App.assign` runs the swap as three `assignWorker` actions inside one snapshot, so it is one
line of undo and the simulation never sees two people on one tile.

**Why.** Section 3 of the brief, and no drag and drop anywhere. The three-step swap is because
`assignWorker` refuses a tile that is already worked, quite rightly.

**Symptom if wrong.** A failed middle step leaves someone idle. `App.assign` restores the snapshot on
a throw. **Confidence: high.**

### 46. Hold and send are the settlement's surplus rule, and the goods strip says so

**What.** Tapping a good offers consign and buy for that good, and then the settlement's surplus rule
with hold, consign and send to a named settlement. The brief reads as though hold and send were per
good; the simulation keeps one surplus rule per settlement and has no action that ships a chosen good
once. Rather than imply otherwise, the sheet is headed "What this settlement does with its surplus".

**Why.** Saying it applies to one good would be a lie the save would not keep. **Change:** a
`shipGoods` action in the simulation would let the brief's version be built. **Confidence: high.**

### 47. The old settlement sheet survives as "Everything here"

**What.** The long scrolling settlement sheet is now `settlementDetail`, reachable from the new
screen's "Also" row. Nothing that used to be reachable stopped being reachable.

**Why.** The new screen is a summary. Passages, grievance totals, the clerk count and the full
production list still need somewhere to live, and losing them to a redesign would have been a
regression. **Confidence: high.**

### 48. Music starts on the first tap, and every tap after it quietly tries again

**What.** `MusicPlayer.unlock` is called from a capturing `pointerdown` on the document that is no
longer `once`, and directly from `App.land`, which is the landing tap itself. The first call streams
track one and fades it in over two seconds; later calls resume a player that a browser refused.
A quarter-second watchdog retries a paused track, and an `error` or `stalled` on the current element
moves to the next track rather than sitting silent. `src/ui/audio.ts`.

**Why.** The brief's five second target, and the report that music only played after "next track".

**What was actually found.** The reported failure did not reproduce in a headless Chromium on this
build: with the old code, track one already started on the landing tap and reached 1.5 seconds of
playback about two seconds after it. Measured on the new code, the element is 1.9 seconds in and
audible about 1.9 seconds after the tap, well inside five. So the cause of the failure on the real
device is still unknown, and everything above is defence rather than a fix for a diagnosed bug: the
plausible causes it now covers are a refused `play()` on the first gesture, a source that fails to
load, and a track that stalls. `RISKS.md` section 1 item 10 stands: this has still never been heard.
**Confidence: low** that the original cause is understood; **high** that the player is now hard to
leave silent.

### 49. The hold is 450 milliseconds and lives in the theme; `C.feel.holdMs` is now unread

**What.** `HOLD_MS` in `src/ui/theme.ts`, read by `src/ui/input.ts`. The ring still fills from the
first frame of contact across the whole 450, moving past `C.feel.holdCancelPx` still turns it into a
pan, and an early release still does nothing.

**Why.** 250 fired by accident. The instruction was to put the value in the theme or constants layer,
and `/src/sim` was out of bounds this session.

**The debt this leaves.** `C.feel.holdMs` is now a constant nothing reads, which is exactly the kind
of trap `RISKS.md` section 3 catalogues. Delete it in the simulation session, or move `HOLD_MS` back
into `C.feel` and have the theme read it. The other gesture numbers (`holdCancelPx`, `tapMaxMs`,
`tapMaxPx`, `doubleTapMs`) still come from `C`, so there is exactly one of these, and this is it.
**Confidence: high** on the value; **high** that the split is temporary.

Note that the tap window is `C.feel.tapMaxMs + 200`, which is 460. A press released between 450 and
460 milliseconds now fires the hold rather than the tap, and one released earlier is a tap, which
selects. Selecting is always safe, so "releasing early cancels with no effect" holds for the hold's
own effect.

### 50. The settlement screen is a full screen, not a bottom sheet

**What.** `isFullScreenSheet` in `src/ui/app.ts` gives the settlement screen the whole display, with
the brief's own header and its close control. Every other sheet is a bottom sheet over the map.

**Why.** The brief's diagram has a header with a close control and a screen's worth of content. A
72 per cent sheet would have put the goods strip below the fold on every visit.
**Confidence: high.**

### 51. The menu moved to the top strip and the dispatch into the expanded queue

**What.** The old bar carried Menu, Dispatch and End turn. The queue bar carries the top queue item
and End turn. Menu is a "⋯" at the start of the state line; Dispatch is a control in the expanded
queue.

**Why.** The bottom third is for what is used every turn. Neither of those is.
**Confidence: medium** on the menu's new home, which is deliberately outside the thumb zone, like the
speaker.

### 52. `scripts/shots.mjs` looks at the layout; `scripts/smoke.mjs` still answers the ten checks

**What.** A second Playwright script screenshots the map at rest, the settlement screen at 320, 390
and 430, an assignment in both directions, a second settlement, a larger system font and landscape,
and asserts that nothing overflows and that the music is audible within five seconds of the first tap
by watching `currentTime` advance. `scripts/smoke.mjs` keeps the ten acceptance checks and was
updated for the new selectors; check nine now also asserts the map is edge to edge in both
orientations. Both take `OUT` for the screenshot directory and `CHROMIUM` for a browser path.

**Confidence: high.**

### 53. `index.html` gains a colour scheme and an empty icon

**What.** `<meta name="color-scheme" content="dark">` so the first frame is dark before the tokens
are installed, and `<link rel="icon" href="data:,">` so the browser stops asking for a favicon that
does not exist and logging a 404 on every load. The `theme-color` value now matches the interface's
base surface rather than the water.

**Confidence: high.**


## The map, session of 23 August 2026

Art direction and rendering brief. This session changed only `/src/render` and added three tiling
textures under `/public/textures`. Nothing in `/src/sim` was touched, so a few of the calls below are
the renderer declining to read a constant it can no longer use rather than changing it.

### 54. The map's look lives in `src/render/look.ts`, a second theme file

**What.** Every colour and every magnitude the map uses: the four seasons as complete palettes, the
surface and its elevation, the shadow bake, prop density and size, the settlement kit, and how the
light is applied. `src/ui/theme.ts` holds the interface's half. A component that holds a colour or a
number is a bug, not a style.

**Why two files rather than one.** These are three-dimensional quantities, light colours and world
distances that a CSS custom property cannot carry, and `/src/render` importing from `/src/ui` would
invert the layering the repository is arranged around. Each file names the other.

**Symptom if wrong.** Someone changes a colour and has to look in two places. **Confidence: medium**
on the split; **high** that neither file should have a sibling.

### 55. `C.art` is now read only for the summer ground ramp

**What.** `look.ts` takes `C.art.palette` as deep summer's ground colours and defines everything else
itself. `C.art.subdivisions`, `jitter`, `blendRadius`, `shoreBand`, `sunElevation`, `seasonHueShift`,
`seasonSaturation`, `cloudScale`, `cloudSpeed` and `cloudStrength` are no longer read by anything.

**Why.** The renderer needed values `C.art` does not have, in shapes it does not have them in, and
`/src/sim` was out of bounds this session. This is the same debt as `C.feel.holdMs` in decision 49
and wants the same fix: delete those keys, or move the whole block into `look.ts` and have `C.art`
hold nothing. **Confidence: high** that it is temporary.

### 56. Two textures, against the brief, and worth it

**What.** Three seamless greyscale patterns, forty seven kilobytes for all three, tiled at high
frequency and multiplied over the vertex colour. Section 1 of the art brief says no textures anywhere
and section 13 rejects them.

**Why the brief was right and this is still right.** What the brief rejected was terrain art: painted
tiles, per-biome sheets, an atlas, seams, download weight. None of that is here. What is here is one
tooth, and its main job is not the colour it multiplies but the way it bends the surface normal, so
that a raking sun catches something. Switching them off (`scripts/ablate.mjs`, case `no-textures`)
leaves the ground a smooth plastic gradient and the water a flat sheet.

**Cost.** The payload goes from zero downloaded assets to forty seven kilobytes. Total over the wire
is about 265 kB gzipped against a one megabyte budget. **Confidence: high.**

### 57. There are no three.js lights in the scene

**What.** Every material on the map is one custom shader in `src/render/shading.ts`. The
`DirectionalLight` and `AmbientLight` are gone.

**Why.** The ground already had a custom shader and the props had a Lambert material, so the two were
lit by different models and could not agree about where the sun was. One shader also means the shadow
map, the flat shading and the rim are available to everything.

**Symptom if wrong.** A new mesh added with a stock three.js material renders black, because nothing
lights it. Use `surfaceMaterial` from `shading.ts`. **Confidence: high.**

### 58. Flat shading comes from the derivative of the world position

**What.** `facetNormal` in `shading.ts` takes the cross product of the screen-space derivatives of the
world position and orients it by the interpolated normal.

**Why.** Flat shading normally means a non-indexed mesh with a normal per triangle, which would
triple the terrain's vertex count: about 190,000 vertices on a standard map and 530,000 on a massive
one. The derivative gives the same exact per-face normal for nothing, on the indexed mesh.

**What it costs.** Derivatives are a fragment shader feature and are per two-by-two pixel quad, so a
facet edge can be one pixel soft. Nothing else. **Confidence: high.**

### 59. Shadows are baked in two layers at two resolutions

**What.** `src/render/shadow.ts` marches a ray toward the sun from every texel of a coarse grid, lifts
the result onto a grid of twelve texels a tile, and stamps every tree, boulder, roof and unit onto
that. The base is baked with the world and re-baked when the season moves the sun; the settlements
and units are stamped again whenever the dynamic layers rebuild, over one typed-array copy.

**Why two resolutions.** A ridge's shadow is broad and its march is the expensive half; a tree's
shadow is a hand's breadth and needs the fine grid, but stamping one is nearly free. At six texels a
tile a tree's shadow was one texel across and vanished into the blur.

**Why the march uses part of the height.** The ground's relief is exaggerated so a top-down view has
something to shade. Marching it at full height threw two-tile shadows off an ordinary hillside, which
reads as a slab of black. `SHADOW.terrainScale` is the fraction used. **Confidence: medium**, and the
number is the first thing to move if shadows look wrong.

**The sea is clamped to zero for the march.** Without that, the land throws a long shadow across the
water as though the water were not there.

### 60. Water holds a cast shadow only weakly

**What.** `LIGHT.waterShadow` mixes the sampled shadow toward full light before the water uses it.

**Why.** At full strength a headland lays a rectangle of black on the sea beside it, which is the one
thing on the map that looked worse with shadows than without. **Confidence: medium.**

### 61. Seasons are four palettes, re-baked, not a tint

**What.** Each season carries its own light colour and strength, sun elevation and azimuth, sky
colour, shadow colour and strength, rim, contrast, ground ramp, canopy colours, water, shore, road,
river, snow line and clear colour. A season turning re-bakes the terrain's vertex colours, rebuilds
the props and re-bakes the shadow base: about 105 ms on a small map, 300 ms on a large one, four
times a game year.

**Why.** The previous version was a saturation multiplier and a small grade added in the shader, and
winter looked like summer with the colour turned down. Winter is the season this had to fix.

**Symptom if wrong.** A visible hitch on the turn a season changes. **Change:** the recolour is the
expensive part and could be moved to a worker. **Confidence: high** on the direction, **medium** on
paying for it every third turn.

### 62. A settlement clears the ground it stands on

**What.** No props on a settlement's own tile and a third of the usual density on the ring around it.
The props are rebuilt when the set of settlement tiles changes, which they were not before: they were
built once with the world, before the first settlement existed, and never told about it.

**Why.** A settlement founded in a wood was simply invisible under the canopy.

**Confidence: high.** The simulation does not clear forest when a settlement is founded; this is the
renderer telling the truth about what a town looks like rather than the simulation changing.

### 63. Levels of detail no longer use `C.feel.lodCull` and `lodRestore`

**What.** `PROPS.coarseCull` is 26 and `coarseRestore` 34; the fine tier culls at 52 and restores at
60.

**Why.** `C.feel.lodCull` is 40 and `lodRestore` 48. Working zoom, which is the default view of the
game, is 44: it sits inside that band, so whether the default view had any props in it at all
depended on which side the player had last come from. Arriving from overview, it had none.

**Confidence: high.** Add this to the list in decision 55 of constants the simulation session should
remove.

### 64. Boot is about two and a half times slower than it was

**What.** The smoke script measures 2.1 to 2.4 seconds to a coastline in a headless software
rasteriser, against 0.8 before and an acceptance threshold of 2.5.

**Where it goes.** The world bake is about 230 ms on a small map: 150 terrain, 25 props, 60 shadow.
The rest is module parse and shader compilation, and software shader compilation is the part that
does not resemble a real device. Halving the terrain's subdivisions moved the total by 120 ms, so the
bake is not the cost.

**Symptom if wrong.** Acceptance check one fails on a slower machine. **Change:** defer the fine prop
tier until its zoom is first reached, and drop `SURFACE.subdivisions` to five.
**Confidence: low** that two and a half seconds is safe; it has never been measured on a phone.

### 65. What the ablation found, including what it found against

`scripts/ablate.mjs` renders the same frame with one thing switched off and measures the difference.
Recorded because the answer was not what was expected in two places.

| Off | Effect |
|---|---|
| The low warm sun | mean luminance +77 per cent, spread +52. By far the largest single thing |
| Cast and contact shadows | mean +36 per cent, contrast at the middle scale +44 |
| Every prop | contrast down 56, 49 and 36 per cent at the three scales |
| The widened value range | spread down 14 per cent, contrast down 15 at every scale |
| The fine prop tier | fine contrast down 14 per cent, and only at detail zoom |
| The rim light | fine contrast down 12 per cent |
| The tiling textures | see below |
| Occlusion baked into vertex colours | fine contrast down 9 per cent |
| The procedural grain | fine contrast down 8 per cent |
| Real terrain elevation | fine contrast down 8 per cent, one hue fewer |
| Pitched roofs, per-instance variation | not measurable in a whole frame |

**The textures read backwards and are the reason this table exists.** Switching them off *raises*
measured fine contrast by thirty per cent, because part of what the tooth does is mask the mesh's own
facet edges. The picture is plainly worse without them. A metric that counts local contrast cannot
tell tooth from faceting, and neither can anything but looking.

**Terrain elevation is the weakest of the geometric items.** It shows as broad shading across open
ground, and open ground is most of what the props now cover. It earns its place through the shadows
it casts rather than through its own shading.


## The drawn settlements, the shadows and the open ground, session of 23 August 2026

### 66. The baked drop shadows in the settlement sheet stay, and the sun turns to meet them

The brief offered two ways round the fact that the seven early era buildings are drawn with their
light already in them: measure the baked direction and rotate the scene's sun to match, or strip the
baked shadows at load and let the engine stamp its own. The first was to be tried first.

It is the one that was done, and the second turns out not to be available. The drop shadows are not
on a layer of their own and they are not soft: the sheet's alpha is ninety-nine per cent hard, the
shadows sit inside the same silhouette as the walls, and their colour overlaps the thatch. Measured
in saturation against value, a shadow on the white of the background reads 0.32 and the pale roofs
read 0.27, so any threshold that takes the shadows takes the roofs first. Tried at 0.235 and the
barn and the yard came away with holes in their roofs. There is no colour test that separates them.

So the sun mirrors instead. It was at azimuth -52 to -6 across the year, which puts it over the
player's right shoulder; it is now -140 to -172, which puts it over the left, matching the sheet's
own light from the upper left and its shadows to the lower right. The seasonal swing narrows from
fifty degrees to thirty so the agreement holds in every season. Verified by baking the shadow map
and looking at it, and by shooting the same frame at four known azimuths.

The one thing that was separable is the checkerboard the extractor left behind wherever a drop
shadow had darkened the background enough to stop it reading as background. That is genuinely
neutral where nothing in the drawing is, and it comes away cleanly. See `scripts/clean-sprites.mjs`.

### 67. Both settlement tiers are built and the zoom picks between them

A settlement below the zoom where props cull is one mark in owner colour, per art brief section 10.
That could have been a rebuild on the zoom crossing, and the first attempt was: `buildSettlements`
took a level of detail argument. It never fired, because a zoom change does not rebuild anything,
and it must not: a rebuild during a gesture is the one thing the renderer never does. Both tiers are
built and `updateLod` switches their visibility, like the two prop tiers.

### 68. The billboards do not depth test, and the units and rings are pushed after them

A picture of a building has no depth. Depth testing it against a tree makes any overlapping tree
punch a hole in it, and depth writing makes two overlapping buildings fight. So the sprite layer
tests nothing, writes nothing, and relies on instance order for the sort, which is why the layout
sorts by world z before it is filled.

The cost is that everything drawn before it is covered by it. Two things must not be: the selection
rings, which are now transparent with a render order of ten, and the units, whose material is now
transparent with a render order of two, so a garrison in a settlement is still visible. Neither
change moves anything on screen; both only move it in the queue.

### 69. A prop's shadow offset comes from its height, not from its altitude

A prop samples the light a little toward the sun so it does not stand in the shadow it is itself
casting. That offset was a fixed multiple of the fragment's world height, which is two mistakes: it
is right at one sun elevation and wrong at every other, and world height on a mountain is two and a
half tiles, so a boulder up there was reading the light of somewhere three tiles away while a tuft
in a marsh read its own.

It is now the prop's height over the tangent of the sun's elevation, capped at 3.2 tiles, with the
height itself capped at 0.55 tiles, about the tallest prop there is. The shader has only the world
height and not the height above the ground, so the second cap is an approximation; carrying a base
height per instance would be exact and was not thought worth an attribute.

### 70. The terrain carries the colour of the props it is not wearing

The complaint that the map changes colour with zoom is real, and the cause is not what it looks
like. Measured over the same four tiles of ground at three zooms, with the same reading size, the
ground's own colour is constant: 1.3 per cent of luminance and under three degrees of hue. Nothing
in the shading varies with camera distance. What varies is what is drawn on it.

Pulling back takes twenty thousand props off the map at a stroke, and the same wood goes from
canopies with shadow between them to a flat rectangle of one green. So the terrain now carries a
second colour per vertex, being what the props standing there would average to and how much of the
ground they cover, and blends to it by exactly the amount that is not being drawn. It reads the
light where their tops would have been as well, or a wood at overview zoom is the dark floor under
the trees while the same wood at detail zoom is the lit tops of them.

Both are derived from the same constants the props are placed from, in `groundCover`, so the two
cannot drift apart. The cap is 0.8: a wood floor is still visible between the trees.

### 71. The film grain is measured in pixels

It was a fixed number of cycles per tile, which at overview zoom is twelve cycles per pixel. That is
not a grain, it is speckle, and it was plainly visible on the open sea. In pixels it is the same
grain at every zoom. Measuring it did not show the palette moving either way, so this is a fix to
an artefact rather than to the palette; it is recorded because the palette is what it was changed
for.

### 72. Props are stamped onto the shadow map after the blur, at half depth

The reason nothing could be seen on a phone. The bake stamped every prop and then ran two passes of
a three by three blur over the whole map, and a tree's shadow is three or four texels across. The
blur belongs to the ray marched ground shadow, which is coarse and needs it. Props go on afterwards.

Half depth rather than full, because they accumulate: at full depth the first tree takes all the
light there is and a wood of forty of them bakes to one black blob with no shadow shapes in it. Also
sixteen texels per tile rather than twelve, a reach of fourteen tiles rather than eight, and a sun
five to eight degrees lower in every season, because the length of a shadow is the height of the
thing over the tangent of the sun's elevation and nothing else.

### 73. Boot time check one is flaky in this environment, and was already

`npm run smoke` check one allows two and a half seconds from navigation to a playable state. On this
machine, under software rendering, it comes in either side of that, and it does so on the commit
before this session's work as well: three runs there gave 2384, 2337 and 3341 milliseconds. Eight
runs after it gave 1371, 1939, 2028, 2029, 2346, 2650, 2897 and 3510. The spread is in two clusters
about a second apart and does not track the size of the world generated, which says it is the
machine's scheduling rather than anything the renderer is doing.

Three things were done about the renderer's own share of it anyway, and all three are worth keeping
whatever the check does:

- **The surface is coloured a tile at a time.** Every vertex asked its nine neighbours for a colour
  and a standard map has seventy thousand vertices, so two thousand tiles were being asked six
  hundred thousand times. Once each now, into two flat arrays. `Math.hypot` went with it: it is slow
  and it was being called a million times to measure a distance two multiplies would give. Terrain
  build on a standard map, 273 milliseconds before and 168 after, with nearly twice the props on it.
- **The settlement sheet is fetched after the first frame**, like the audio and the save, per the
  note at the top of `main.ts`. A hundred and thirty seven kilobytes fetched and decoded inside the
  boot is competition for the frame that has to arrive in about a second, and taking it out of that
  window moved three consecutive runs from around three seconds to 1371, 2160 and 2218.
- **The first shadow bake waits for the first frame.** Everything else about the map is in that
  frame. The bake is a hundred and fifty milliseconds on a standard map and more on a large one, and
  the shadows can arrive on the frame after the coastline rather than before it. It runs at the end
  of the first `draw`, not on a timer, so it cannot be lost in a hidden tab.

### 74. What was tried on the atlas and did not work

Kept because the next person to look at that sheet will try the same things.

- **Separating the drop shadow by colour.** Covered in decision 66. Not possible.
- **Detecting the checkerboard by its own frequency.** The residue is a two level pattern at a known
  period, so a local correlation against a square wave at the right phase ought to find it. The
  phase is findable, and the correlation lights up on the silhouette edges instead, because a hard
  alpha edge has far more energy at that frequency than the checkerboard does.
- **Reconstructing the shadow as a ratio against the checkerboard underneath.** The surviving grey
  really is background times a shadow factor, and the two levels really are 204 and 255, so
  dividing one by the other would give a clean soft shadow with the grid taken out. It needs the
  period and the phase per piece, which needs the correlation above.

What is left is a handful of shadow darkened checker squares inside drop shadows that were staying
anyway. At working zoom they are five pixels across inside a shadow. They are not visible.


## The people, drawn, session of 5 September 2026

### 75. One billboard layer for everything drawn, not one per kind of thing

The settlement buildings had a sprite layer of their own. The obvious way to add the people was a
second one. That is wrong, and the reason is not tidiness.

A billboard has no depth. The only sort that works on it is the painter's, back to front down the
screen, and people and buildings overlap: a colonist walks in front of a barn and behind a longhouse.
Two layers means two independent sorts and no way to interleave them, so the people would be either
always in front of every building or always behind every one. One layer, every picture in it, sorted
by world z once when the turn is built, and instances draw in index order.

`src/render/billboards.ts` is that layer. It holds the sheet loading, the quad, the shader and the
build; `sprites.ts` keeps the settlement composition and `units.ts` gains the unit composition, and
both now return a list of billboards for the scene to merge and hand over. Two sheets are drawn from
in one call: a per instance attribute says which, and both are sampled so the mip level is chosen
outside the branch. A third sheet is a third sampler and a wider attribute.

### 76. What the light does to a picture is a per instance thing

The building sheet arrives already lit, from the upper left, which is why decision 66 turned the
scene's sun to meet it. The units sheet does not: it is a flat frontal drawing with no baked shadow
and no light direction in it, so none of that applies and the sun was left alone.

That difference is now carried per instance rather than per shader. `exposure` is what full sun does
to the drawing. `sunSide` is how much brighter its sunward side is than its far side, which is zero
for a sheet that already has its own modelling and 0.3 for one that has none: a standing figure
catches a low sun on one flank, and without it the figure reads as a flat cut-out standing in a lit
landscape. The side it lightens follows the sun's screen x, so it turns with the season.

It moves the key and leaves the fill, which is what `shade` does with a normal. Scaling the finished
colour instead, which is what it did first, is a grey multiply: the shaded half of a figure keeps
exactly the hue of its lit half while every other surface on the map turns cool going into shadow,
and standing next to a timber wall whose shaded side drops thirteen degrees in hue, that is the thing
that gives a drawing away as a drawing.

### 77. Owner colour is a ring on the ground, and it goes under the feet

The figure is cream and tan. Tinting it with a charter's crimson would destroy the drawing, and at
forty-five device pixels a coloured coat would not read as a coat anyway. It is a thin ring on the
ground under the feet instead, in charter colour, lit by the same sun as everything else.

Two things had to be got right and both were wrong first time.

It has to be drawn *under* the figure. The unit group is pushed after the billboards so that a
militia block standing in a settlement is not hidden by a building, and the ring inherited that, so
the ring's near arc crossed the boots and the figure read as a person standing inside a hoop. The
ring is its own mesh at render order minus two, drawn before the billboards, writing no depth.

It has to be quiet. At the first size and full strength, in bone, it measured brighter than the
figure's own brightest pixels, and read as a selection highlight rather than as a mark of ownership.
It is thinner now, darker than the charter colour it carries, and at 0.85 opacity, which is why
`surfaceMaterial` has an opacity: a thing that is only partly there is still lit by the same sun, so
this belongs in the shared material rather than in a flat one of its own.

It reads the light where it lies, which took a second fix. Every other surface samples the shadow map
a little toward the sun so a thing standing up does not stand in its own shadow, and the offset comes
from world height because the shader has no other measure of how tall a thing is. A mark lying on the
ground is not tall, and on high ground that offset had the ring reading the light of somewhere over a
tile away: it stayed one value while the ground under it changed threefold, glowing in shade and
going muddy in sun. The ring's material now points at its own zero for that one uniform, leaving
every other material pointing at the shared one.

And it keeps its depth test, unlike the figures, which was the part that took three goes. Without the
test it painted over the foliage standing in front of it and read as a decal laid on the picture
rather than as paint on the ground. With the test, and at the first lift of a hundredth of a tile, it
disappeared: `heightAt` snaps to the nearest vertex of a jittered mesh rather than interpolating, so
the height under the feet is already wrong by up to half a cell of slope, and a flat disc a quarter
of a tile across lies partly inside any ground that is not flat. It now sits at the highest of nine
samples across its own footprint, plus the spread of those samples again as an estimate of the error
between them, plus a flat lift. Checked by putting a figure on grassland, downs, dry, marsh, highland
and mountain and looking: it reads on all six. On a mountain it is largely hidden behind boulders,
which is the depth test doing exactly what it was turned on for.

### 78. Only the colonist and the improver are drawn, and the seam is sized by the drawing

There is one figure on the sheet and five kinds of land unit. The colonist is the colonist. The
improver borrows it, through an alias table in the theme layer. Militia, outriders and batteries keep
the forms they have had all along; nothing is stretched or recoloured to stand in for them, because a
recoloured colonist standing in for a cannon is worse than a wedge that has never claimed to be one.

The lookup is by the kind's own name first and the alias second, so when a real improver drawing
arrives under the name `improver` it wins and the alias falls silent without an edit.

The size seam is the part worth recording. Every figure could have been scaled to one height in
tiles, and that is what the first cut did, which would have made a cannon exactly as tall as a
person. Each piece is now scaled against a reference height the way the settlement pieces are scaled
against a reference width, so a drawing two thirds of a figure's height on the same sheet stands two
thirds of a figure's height on the ground. Adding a piece stays a manifest change: a new name in the
json, drawn to the same scale, and it is a unit.

### 79. The manifest is imported, not fetched, and it is checked

The sheet's json is imported from `/public` at build time rather than fetched at run time. The
renderer needs the piece sizes to lay a unit out before the image has arrived, and a fetch would mean
either a wait or a first frame with the geometry wrong. The cost is that a new manifest needs a
rebuild, which is true of every other asset in the project.

It is validated rather than trusted, in `manifestFrom`. The sheets are a drop point for artwork made
elsewhere, and a manifest with a missing anchor should say which piece and which field at load rather
than draw nothing and say nothing.

### 80. Two things the reviewers caught that looking would not have

Kept because both were invisible in a screenshot and would have shipped.

**The figure was lit from the wrong side.** The sheet is flat, so the shader adds a side: brighter
toward the sun, darker away from it. The sign was inverted, so every figure was lit from screen right
while every building and every tree was lit from screen left, and the coat carried a near-white rim
down the edge that should have been its darkest. It is measurable and it is not obvious: a judge
comparing the figure's left half against its right half found it, and four people looking at the
picture had not.

**Widening the stack pushed units out of their own tile.** Units on one tile fan out so they read as
several, and the fan had to widen once each figure had a ring under it. The fan is added to a nudge
that shifts units clear of a settlement's buildings, and at the wider spacing the third unit on a
settlement tile stood a tile and a bit east of its own tile's centre. That position is not only where
the unit is drawn: it is what a tap is measured against in `picking.ts`. So the third unit in a
settlement would have been untappable where it lived and tappable where it did not. The fan and the
nudge are now clamped inside the tile, which also fixes the same overflow at seven units, which was
there before this change.

### 81. What did not work the way the brief assumed

- **"It casts a real shadow onto the ground like a tree does."** It does, and for a while it could
  not be seen, for a reason that is not the figure's. A settlement's own buildings stamp enough
  overlapping shadow to take the shadow map to nothing across the whole tile and its neighbours, and
  this settlement also sits in a pocket of wood. A figure standing there casts into ground that has
  no light left to remove. Measured along the shadow line, the map reads zero for two tiles in every
  direction. So the shot rig now walks a figure out onto open ground, which is the only place the
  question can be answered, and there the map reads zero for the first half tile from the feet and
  seventy-eight of two hundred and fifty-five at eight tenths of a tile: a real shadow, lying with
  the trees'. The figure's occluder is also wider than a person is, because a shadow's length is its
  height over the tangent of the sun and a figure's is spread over nearly two tiles, which at a true
  shoulder's width is two texels of the shadow map and invisible beside a boulder that puts the same
  darkness into a quarter of the distance.
- **"Cull to a marker below overview zoom."** There was no such switch to hook into for units. The
  settlements had one, added last session, and the units did not: they were drawn identically at
  every zoom. The tier now exists for them, sharing the settlements' threshold, and the visibility
  switching for both moved into one place in the scene because it was already being set in two.
- **The figure needed the units to stand further apart.** Three units on one tile fanned out by 0.16
  tiles, which was fine for discs a quarter of a tile across and not fine once each of them had a
  ring a third of a tile across. They stand 0.34 apart now.
- **The payload has crossed a megabyte.** 1,003 kB raw excluding audio, against a budget of one
  megabyte, of which the units sheet is 20 kB and the rest is three.js and the game. Over the wire it
  is about 420 kB gzipped, which is what actually ships and is well inside. Recorded rather than
  fixed: nothing in this session's scope would move it, and the figure to reduce is the bundle.


## The drawings, session of 1 October 2026

### 82. The units are keyed by level, not by phase, and a patch of board is told from a sail by holding both greys

The settlement sheet was cut by sampling the checkerboard by phase: a pixel is board if it is
neutral and near the grey of the square it falls in. That cannot cut the lander. Its board is three
boards pasted together: a neutral checker above the hull on the 25.6 px grid, a blue grey one below
it on a grid about 23 px wide and out of phase, with the junction running through the pontoons. A
single neutrality threshold fails on the lower band's tint, and a phase model fails on its grid.

So the unit extractor keys by level alone, per band of rows, with a tint taken off first: a pixel is
board if it is neutral once the band's tint is removed and lies between the dark square's grey and
the light one's. That leaves the question a phase model answered for free, which is whether a pale
neutral patch inside the drawing is board the drawing encloses (between a wheel's spokes, between
two shrouds) or a pale part of the drawing (a sail, a canopy). The answer is that a patch of board
holds both of the board's greys and a sail holds one: a region that is at least twelve per cent near
each grey is board. Twenty-three such patches came out of the trader and nineteen out of the hauler
and no sail went with them.

The hand repairs the prompt asked for are jobs in the same table. The ship's rigging goes: a plain
thinness test on the silhouette failed, because a bundle of shrouds a few pixels apart is one wide
band in the silhouette, so the ropes are found in the dark part of the silhouette only (under a lum
of 200), opened by a three pixel disc, and each goes with the chroma it bled into the board beside
it; the masts, yards, sails and bowsprit stay. The blank nameplates on the cannon's trail and the
ship's stern are painted over by walking along the planking's grain to the nearest unpainted pixel
either way and blending by distance, so the plank lines run through where the plate was. The
lander's steam goes, everything pale above the hull's top, to come back as a live effect. Every
piece is then de-fringed by pulling its edge colour two pixels in, and resampled premultiplied so
the board's grey cannot bleed back in at the edge.

### 83. One sheet, a person is 144 px, six bits a channel, the hulls at six tenths

Eight new pieces at the colonist's 200 px person came to 663 kB on one 1024 square sheet, against a
budget of about 250 kB. Three things brought it to 238 kB on a 1024 by 512:

- A standing person is 144 px, not 200. At the closest zoom on a two times phone a person is 75
  device pixels tall, so 144 is still nearly twice oversampled. The colonist was carried over from
  its one piece sheet and cut down to agree, through the same pipeline.
- Colour is kept to six bits a channel. The drawings are flat colour and soft gradients that a jpeg
  had roughened, and the quantisation takes the roughness out of the png without putting a step
  into the gradients at the size they are seen. About thirty per cent of the weight.
- The trader and the lander, which between them were more than half the sheet, are stored at six
  tenths of the common resolution. A hull three people tall is still 1.15 times oversampled at the
  closest zoom. The manifest carries how many pixels a person is in each piece (`personPx`), so a
  piece stored small still stands at its own height on the ground; see 85.

The packer also writes two contact sheets to `art/units`, every piece on mid grey at the sheet's
pixels and again at the size it stands on a phone at working zoom, with its anchor marked. They were
looked at. Nothing was lost: the cannon's rammer, the horse's reins, the ship's anchor and the
lander's ramp all survived, and no checker residue is left.

### 84. The gallery is a stage, not a save

`/?gallery` is a view for looking at the drawings on the real map under the real light. It is the
production renderer with nothing swapped: the same terrain, shadow bake, season palettes and
billboard layer. What it stands on them is a state built by hand around a real game's charters and
market: a flat coast of ploughed grassland with every kind of unit in every owner's colour in a row
beside a colonist for scale, three settlements of two, six and twelve behind them, every hull on the
water with one row under way, an unflagged raider and the Company's ship, the lander offshore with
the boat, a wave of the recall fleet at sea, a stack of three, and a wood at one side to compare
shadows against. A strip over it picks the season; the pinch and the drag are the map's own.

It never reads or writes the player's save: `main.ts` branches to it before the save is touched. It
is a separate chunk of 3.7 kB that nothing in the game imports or links to; the address is the whole
of its interface. The ground is ploughed because the renderer rolls a landform under every map that
can carry low ground under the waterline, and a stage wants its floor above it everywhere; ploughed
ground is flattened to less than half the roll.

### 85. Scale is in world terms, and the manifest carries it

The prompt's table (person 1, outrider 1.35, hauler 1 and about 2.4 long, battery 0.6, cabin to the
ridge 1.4, trader to the masthead 3, lander 1.8) is applied where the pixels are made, in the
extractor's job table, not in the renderer. Each piece is cut so that its height in people times the
sheet's person is its height in pixels, and the manifest carries the person for each piece. The
renderer has one number, how tall a person stands in tiles (0.52), and every piece stands against
that by its own pixels. A new drawing cut by the pipeline needs nothing in the renderer, including a
drawing stored at a lower resolution.

One piece breaks the table on purpose: the improver stands 1.16 people tall because its pick and
shovel stand over its hat. Its person is measured from the hat's crown down, so the person is a
person's height and the tools stand above that, as they would.

### 86. A profile is mirrored in the picture, and the light stays where it is

The outrider, hauler, battery and trader are drawn facing left. A unit going right is drawn
mirrored, where going right means the first tile of its path, or the tile its order is taking it to,
is to the right of where it stands; a standing unit faces the way it was drawn. The flip is a
per instance flag that reads the sheet from right to left. The quad is not turned, so the side light
term, which brightens the side of the quad the sun is on, still brightens the left: a mirrored hauler
standing alone on open ground beside a drawn one measured within three per cent of it on the canopy
and on the horse, both lit from the upper left.

### 87. Aliases, never fakes

Kinds without a drawing of their own borrow one as it is, at a share of its size, and are told apart
by their ring, their badge or their damage:

| Kind | Draws | At |
|---|---|---|
| regulars, horse | company-regular | 1 |
| siegeTrain, damagedSiegeTrain | battery | 1 |
| damagedBattery | battery | 1 |
| lighter | trader | 0.6 |
| raider | trader | 0.85 |
| cutter | trader | 0.95 |
| companyShip | trader | 1 |

Nothing is stretched, recoloured or composited. A damaged battery is the battery with its tint taken
down to 0.72, drained toward grey by 0.55 before the light is applied so it still takes the light,
and turned seven degrees on the ground about its anchor. The table is `UNIT_SPRITE.pieces` and
`UNIT_SPRITE.scale`; a drawing arriving on the sheet under a kind's own name wins over both.

### 88. The pool of shade had one cause, and it was not the one assumed

The prompt supposed each building was shading twice, once by its baked drop shadow and once by the
engine's stamp, with the stamps saturating where they overlapped. The baked drop shadows are inside
the drawn silhouette and shade nothing outside it. The engine's stamp was the whole of the cause, and
in two parts.

A shadow was a trail of up to twenty-six soft discs, each taken out of the light one after another.
The discs of one trail overlap heavily, so one tree's shadow summed to black along its whole length
whatever the depth said, which is why decision 72 had to halve the depth to see any shape at all. A
settlement then stamped seven of these on top of one another. A shadow is now composed as a whole,
the deepest bite at each texel, and taken out of the light once, so a lone shadow is as dark as its
depth says and no darker where its own discs overlap. Different things still add, so a wood is
darker than a tree. A settlement's buildings compose as one group, so the ground under a settlement
is no darker than under one building. The depth went from 0.5 to 0.86, which is a lone tree's shadow
reaching what it did before. Measured on the stage, the ground through a settlement of six now reads
138 to 234 of 255 where it read 0 for two tiles.

The one thing left of the old assumption is a probe: a unit reads its light a little toward the sun
by its own height, and a ship three people tall read it three tiles away, which was the next ship's
shadow. The probe is capped at the same height the props' is.

### 89. Settlements at the person's scale, four buildings at most

The buildings were scaled against a reference width, and a person stood 2.8 times a cabin's wall.
The sheet is now scaled from one measurement: the cabin's drawn wall is 70 px tall under its anchor,
and a cabin's wall is about a person tall. The drawing looks down at the cabin from about thirty
degrees, which shortens a standing height by its cosine, so the drawn wall is 0.87 of a person. A
colonist beside a cabin stands at the eave; the roof above is what the drawing says, which puts the
ridge a little over the brief's 1.4 people once the roof's depth is counted. A building is now a
tile and more across and a settlement of four is well over its tile, which is the point: one tile of
gameplay and rather more than one tile of place.

A settlement shows at most four buildings, chosen by what it holds rather than shuffled: a dwelling
always (the longhouse once eight live there, the cabin before), the hall where there is a meeting
house, a press or a school, the frame of whatever is being built, then the barn for food or storage,
the steading for horses, and the yard for industry, a wharf or works. Two to begin with, three at
three people, four at six. The four stand on a small lattice, far ones first so the hall stands
behind, mirrored or not from the settlement's id so two places are not the same picture.

### 90. The arrival, drawn, and a frame loop while the lander steams

The lander and the boat are the sheet's drawings. A hull is a water billboard: anchored at its
waterline rather than its keel, with the hull below the line faded out over a short distance so the
bow and the stern go under the way a hull does, reading its light at the waterline, and riding the
water a little in the vertex shader as the frame clock runs (`uTime`, a uniform every material can
read). The steam is a live effect, as asked: seven soft quads off the stacks in one instanced draw,
each on its own phase of a 3.2 second cycle, rising up the screen and drifting off the wind, growing
from a tenth of a tile to a third and thinning as they go.

The architecture rule is that the renderer draws continuously only during a gesture, momentum, a
glide or the arrival animation, and idle draws nothing. The opening image is a lander down and
steaming, and steam that does not move is not steaming, so the arrival animation is read to begin
when the game opens: while the game waits for its first tap the frame loop runs, at full resolution
rather than the moving resolution, and the plume drifts. It ends with the landing. A wave's lander,
which steams on the turn it came down, does not keep the loop running for a whole turn: its steam
moves while the map is moved and stands still otherwise. That is the call: the opening image is
seconds long and is the first thing anyone sees, and a turn is as long as the player makes it.

Each wave of the recall fleet stands offshore as a lander while it is at sea, from the turn it splashes
down until it lands, with steam on the first. Where it stands is offshore of the middle of the coast
the wave might still land on, less what its heading has ruled out, which is exactly what the player
is allowed to know and no more; a lander standing at the anchorage would give the landing away. The
candidate anchorages are read through `src/render/selectors.ts`, a read-only copy of the fleet's own
reading of the world, because the simulation does not export it and this session was not to touch
the simulation. If the fleet's rule changes, the selector has to follow it, and that is written on
both.

### 91. An unflagged raider carries no ring; a flagged one carries its owner's

The prompt said raiders show no owner ring or flag. The rival charters brief, section 8, says the
mechanic is attribution: an unflagged raider is unattributed, and it becomes flagged when its charter
is at war with you or when it is caught. The ring follows the attribution: a raider the simulation
holds unflagged has no ring at all, and a raider it holds flagged has its owner's, because by then
you know whose it is. The rings on the water lie at the waterline, under the hull, and the hull is
drawn over them, so what shows is the ring's lower half below the hull, which reads as a mark on the
water rather than a hoop the ship is standing in.

### 92. The stack count is DOM, and it counts what the chooser lists

Several of the player's units on one tile fan out and are told apart by the stack sheet when the tile
is tapped. The count that says there are several before the tap counts the same thing the sheet
lists, the player's units on the tile, so the two never disagree. It is a strip of DOM over the map
rather than something drawn, because the map draws no text; it follows the camera from the renderer's
frame hook and is hidden below the zoom where a unit is a mark, because a mark is one mark however
many stand there. Quality is drawn: one chevron beside the ring for hardened and two for sworn, in
the ring's colour, nothing for raw.

### 93. What did not work the way the prompt assumed

- **The lander's background is three boards, not two**, and the lower one is on a different grid.
  See 82: this is why the whole extractor went to levels.
- **"Drop the ship's rigging if it will not key cleanly."** It would not, and the obvious thinness
  test did not drop it either; see 82 for what did. The rigging is gone and the ship is better for it
  at the size it is seen.
- **"Each building shades twice."** It did not; see 88. The fix was to the cause, which was in the
  bake, and the test rig was not touched.
- **The budget could not be met at the old person.** See 83. Nothing was dropped to meet it; two
  pieces are stored smaller and every piece lost two bits a channel.
- **Commit at the end of each phase.** Phases five and six landed in one commit: a hull drawn at its
  waterline is the same code as the lander drawn at its waterline, and the two could not be split
  across commits without one of them being broken. The chevrons of phase seven landed in the same
  pass through the unit builder; the stack count is its own commit.
- **The gallery's flat coast was under water.** The renderer's landform noise rolls under every map
  and put most of the stage below the waterline; ploughed ground flattens it, so the stage is
  ploughed. See 84.
- **A ship read the next ship's shadow.** See 88, the probe.
- **Smoke check one (boot under 2.5 s)** is environment bound, as decision 73 records: it failed at
  3 to 4.5 s on this container earlier in the session and passed at 1.55 s on the final run, with
  the same code either side of the difference. All ten passed on the final run.
- **Scout.** The prompt says a scout uses the outrider. There is no scout kind in the state; the
  outrider is the scout. No alias was added for a kind that does not exist.

### Art debt

Every drawing the game is still owed, and what stands in for it now:

| Owed | Stands in now |
|---|---|
| Lighter | the trader at six tenths; wants a small open boat |
| Raider | the trader at 0.85; wants a lean fast hull with no flag |
| Cutter | the trader at 0.95; wants a heavier gun deck |
| The boat that comes off the lander | the lighter's stand in at six tenths |
| Company horse | the Company regular at full size, told by its ring; wants a rider |
| Siege train, and damaged | the battery; wants a heavier piece on a limber |
| Damaged battery | the battery darkened, drained and tilted; wants a broken carriage |
| Company ship | the trader with the Company's dark ring; wants a darker, larger hull |
| Middle era buildings (worked stone) | the built roof kit of `settlements.ts` |
| Late era buildings (brick and metal) | the built roof kit |
| The lander broken up on the shore after landing | nothing is drawn |
| Predecessor settlements | built round roofs in ochre |
| A colonist at work (a tile worker) | nothing on the tile; the settlement's buildings |
| The early era frame piece as a building under construction | drawn only while something is being built |

The seam for each is the same: a piece on the units sheet under the kind's own name, cut by
`scripts/extract-sprites.py` from a job row giving its height in people and which way it faces, and
packed by `scripts/clean-sprites.mjs`. Nothing in the renderer changes.

## The opening at sea, session of 1 and 2 October 2026

The three offered landing sites and the anchorages are gone. The game opens with the lander at sea in
fog, the player sails until land is sighted and founds nearly anywhere, and the fog is on. Setting
brief section 7, onboarding brief section 2, session brief section 8, military brief sections 9 to 11
and art direction brief section 10a were changed first; these are the calls the build made under them.

### 94. The lander sails one tile a turn, and the splashdown is four to six tiles out

**Superseded by 114.** The voyage was a crawl; the lander now sails six tiles a turn.

**What.** `C.lander.moves` is 1 and the one named distance is `C.lander.voyageTurns` 5 with
`voyageSlack` 1, so a splashdown lies four to six tiles of open water from the nearest viable coast
and the voyage is four to six turns. `src/sim/worldgen.ts`, `voyageBand`.

**Why.** The prompt asked for four to six turns' sailing and left the speed open. At two tiles a turn
the band is eight to twelve tiles, and on a small continent map open sea that far from every viable
coast often does not exist: the generator found no splashdown on half the small seeds tried and fell
back to the edge on most of the rest. At one tile a turn the band is four to six tiles and every one
of twenty-seven seed, size and shape combinations found four splashdowns within it, nothing in sight
at any of them. A capsule with a boat's motor is not fast, and a turn of the voyage is a heading and a
tap, so the pace is right for what it is. Measured: the autopilot sights land on turn two or three
and founds on turns three to seven across those twenty-seven worlds.

**Symptom if wrong.** The voyage feels like filler. **Change** `voyageTurns` first, `moves` second,
and know that the second needs a larger map.

### 95. A viable coast needs water within reach, not a river

**What.** `landingViable` counts sea or river as the fresh water a coast must have within reach,
as it did for the old landing sites. `src/sim/worldgen.ts`.

**Why.** The prompt's "fresh water" read strictly is a river within reach. Measured strictly, several
small maps had five or six viable coast tiles and one large continent had none, which starves the
splashdown search and makes the first game a hunt for one bay. The loose rule keeps the band
meaningful on every map, and the autopilot's site score still prefers a river. **Confidence** medium.

### 96. The predecessors' alarm has a crowding term

**What.** A player settlement within `C.predecessors.crowdingReach` (3) tiles of a predecessor
centre counts as one of their tiles taken, every turn, on top of tiles actually worked.
`src/sim/predecessors.ts`.

**Why.** Founding near the predecessors must raise their alarm as it did. With settlements three tiles
apart in every direction (decision 98) a ring never overlaps their territory, so the old alarm, which
counted worked tiles of theirs, could never fire from founding alone. The crowding term is what
"founding near them raises alarm" means once rings cannot overlap. **Confidence** medium.

### 97. The rivals' landers carry no one, and their first settlement is called by their name

**What.** A rival's lander has an empty `aboard`; when it founds, the settlement gets
`abstractPop` 3 and the name "<first word of the charter> Landing". `src/sim/rivals.ts`,
`rivalVoyages`.

**Why.** Rival population has been abstract since the first build; putting named colonists aboard a
rival lander would have made them the only rival people with names. They sail by the same autopilot
the tests use and found by the player's own rules, which is what the prompt asked; their founding is
logged only when the tile is in sight.

### 98. Spacing is three in every direction, and a tile two clear tiles away is the nearest allowed

**What.** `foundingProblem` refuses a tile whose Chebyshev distance to any settlement or predecessor
centre is below `C.founding.spacing` (3), and the reason names the settlement. `src/sim/settlement.ts`.

**Why.** "Fewer than two clear tiles between" and "at least three tiles apart in every direction" are
the same rule said twice, and Chebyshev distance is the one under which a ring never shares a tile.
The forty-settlement stress test moved to a larger map rather than relaxing it.

### 99. The Company's ships do not march

**What.** `moveHostiles` skips anything afloat, and the threat items do too. `src/sim/military.ts`.

**Why.** The first whole-game run under the new fleet lost The Landing to the Company before any wave
had landed: the escort that lies off the settlement a wave makes for was an armed hostile unit on a
tile beside the settlement, and the march loop walked it in from the water and took the undefended
place. A ship blockades and fights ships; it does not take ground.

### 100. The spare colonist is gone

**What.** Everyone the lander carries becomes the settlement's people; there is no separate colonist
unit on landing. To put a colonist on the map, equip one as `colonist` from the roster, which costs
nothing. `src/sim/actions.ts`.

**Why.** The old landing dropped a debtor unit beside the settlement when three or more colonists
arrived, so that there was something to move on turn one. Now the player has sailed for four turns
and the thing to move is the boat; a loose colonist with nothing to do was a queue item, not a
beginning. The difficulty table still decides how many are aboard.

### 101. Ships unload beside a coastal settlement; the shore itself has no store

**What.** `load` and `unload` work for a hull on water beside one of the player's coastal settlements,
as well as for a unit standing in one. Nothing is unloaded onto open ground. `src/sim/actions.ts`,
`settlementToTrade`.

**Why.** "Ships may unload onto any coastal land tile" is read as: a ship needs no wharf and no
anchorage to trade with a settlement on the coast, any coast. Goods put down on a bare beach would need
a stockpile model the game does not have and would spoil by the existing rule anyway. Freight landers
come down offshore of any coastal settlement the player owns by the same reading.

### 102. `Charter.landing` is where the first settlement was founded

**What.** Before founding it holds the splashdown; after, the first settlement's tile. `src/sim/state.ts`,
`actions.ts`. `landingSettlement` reads it as before.

**Why.** Everything that said "the Landing" (passages arriving, the Company marching, the loss
condition) keyed on this field. Keeping the field and changing what fills it left those rules standing.

### 103. The fog is one texture and one function, and the haze is the season's own

**What.** The scene writes a texture a texel a tile after every state change: red explored, green in
sight now, blue how deep into the unknown, by a breadth first spread from the explored tiles out to
`FOG.depthTiles`. Every fragment shader on the map calls `fogged()` from `shading.ts`, which samples
that texture four times half a tile apart, wanders the frontier with a slow noise, blends the lit colour
toward a haze that is lighter at the frontier and deeper beyond it, dims and greys remembered ground
out of sight, and gives the haze the same grain as everything else. The haze's two colours are per
season in `look.ts` beside the water's. The drift reads the cloud clock, which advances only when a
frame is drawn. Nothing beyond the map is known, so the water plane past the edge and the clear colour
are haze too. `src/render/shading.ts`, `scene.ts`, `look.ts` (`FOG`).

**Why.** Art brief section 10a as written: not black, the sea's blue-grey, brighter toward the edge of
the known, land fading in rather than stopping, one mask, no alpha layers, drift only when drawn.
Applying it after `finish()` rather than before keeps the haze the colour the file says. The frontier
soft band and the wander together take about a tile, which is about the terrain's own blend radius.
Ten draw calls either way.

**Symptom if wrong.** The frontier reads as a square: raise `FOG.edgeSoft` or `edgeWander`. The haze
reads as a void: raise `hazeEdge` or `driftStrength`.

### 104. What is unseen is not built

**What.** `buildUnits`, `buildSettlements`, `buildArrival` and `pick` take the fog as a filter: a
unit out of sight, a settlement never seen or a predecessor people never found is not built at all,
so it cannot be drawn, tapped, counted on a tile sheet or found by the stack count. A rival settlement
out of sight is built from its `seen` snapshot, the people and buildings it had when last seen. The
recall fleet's landers are drawn through the fog by a per instance flag. With the flag off nothing is
filtered. `src/render/*.ts`, `src/sim/fog.ts`.

**Why.** Drawing a hidden unit in haze colour would still leave it tappable, and the stack count would
still count it. Filtering at the build is the only place all three agree. The predecessors use their
existing `scouted` flag, which `reveal` now also sets.

### 105. The opening's lines are the display face at twenty-two pixels

**What.** `--text-opening` is 1.375rem and the five lines use it; the display size is 1.625rem.
`src/ui/theme.ts`, `style.css`, `opening.ts`.

**Why.** At twenty-six pixels on a 390 wide phone the five sentences wrapped to twelve rows and covered
the picture they are meant to sit over, lander included. At twenty-two they take under half the
screen above the lander and are legible over the haze with a doubled text shadow. The prompt says
the theme's display type; the theme has one face, and this is it one size down.

### 106. A splashdown prefers to lie clear of the map's edge

**What.** The generator prefers splashdown candidates whose whole sight square lies on the map and
falls back to the rest only when a tight map leaves nothing else. `src/sim/worldgen.ts`, `offEdge`,
`preferOffEdge`.

**Why.** The first opening shot had the lander two tiles from the map's edge with its known square cut
off on one side, and the camera could not centre on it. Made a rule rather than a preference it starved
small continent maps of splashdowns (two found where four are needed), so it is a preference. It moved
the fifty turn pin, which is re-recorded with its old values in `tests/pins.test.ts`.

### 107. The scrim dismisses on pointerdown, not click

**What.** `#scrim` closes the sheet on `pointerdown`. `src/ui/app.ts`.

**Why.** Found by the opening rig's one real touch tap: a tap on the map opened a tile sheet, the
scrim came up under the finger before the browser's synthesised click arrived, the click landed on the
scrim and closed the sheet the same tap had opened. The dismissing tap begins on the scrim; the
browser's click does not. This predates the session and would have shown on a real phone.

### 108. The founding control: the shore as chips, the ring as a preview, the hold as a shortcut

**The hold as a shortcut is superseded by 132.** A hold no longer founds; it points the founding
control at the shore, and the control founds.

**What.** The lander's sheet lists each land tile beside it as a chip (bearing and ground words).
Picking one shows the nine tiles the settlement would work with the best yield of each, a sentence
about the ground, and the one control that founds; or "Not here" and the reason: water, mountain, or
too close to which settlement, with the spacing rule in a sentence. A colonist standing on legal
ground gets the same once the first settlement exists. The map paints the ring in bone or in the loss
colour while the control is in focus and glides so the shore sits in the strip above the sheet. A hold
on the shore with the lander active founds too, as the hold commits a move; undo takes it back. One of
the lander's people can go ashore to scout and come back aboard. `src/ui/sheets.ts`,
`landerControls`, `foundPreview`; `app.ts`, `setFoundTarget`, `found`, `showAboveSheet`.

**Why.** Interaction brief section 8 (every hold action has a control in the bottom third; no
confirmation dialogs, undo instead) and the prompt's preview. Unexplored ring tiles show as unknown,
because the player has not seen them.

### 109. The beaching is a picture over a state that has already moved on

**What.** `App.found` works out the ids the action will give the settlement and the boat
(`settlements.length`, `nextId`), tells the scene to hold those at nothing, applies the action, then
runs the beaching: a billboard of the lander moves from where it lay onto the shore and fades while
the settlement's pictures and the boat come up, over `ARRIVAL.beach.ms`. The settlement screen opens
when it is done. Nothing in the state moves during it. `src/render/scene.ts`, `prepareBeaching`,
`animateBeaching`; `billboards.ts`, `aFade` and `setBillboardFade`.

**Why.** The state is the truth and the renderer draws it; an animation that lagged the state would
have let a tap land on a settlement that was not yet drawn. Predicting the ids is the one coupling,
and it holds because `foundSettlement` and `makeUnit` take them from the state in order.

### 110. Coastal batteries fire from the settlement, once a turn, before the ships do

**What.** Every battery standing on one of the player's settlements fires once a turn at each hostile
armed ship on the water beside the settlement; a hit does a round's damage. A hull founders by the
naval rule; the Company's landing craft, which has no hull entry, is driven off after
`C.naval.batteryFire.companyShipEndurance` hits. A damaged battery hits half as often. A raider hit
from the shore is flagged. `src/sim/naval.ts`, `batteryFire`.

**Why.** Military brief section 11 says batteries fire on adjacent hostile ships automatically and
the prompt said "as before", but nothing before did it; this is the first implementation. Battery
slots per works tier are still not enforced (the long standing gap), so every battery on the tile
fires. **Confidence** low on every number.

### 111. The plausible coast is painted while a wave is at sea

**What.** While a wave is at sea the coast it might still come ashore on is tinted in the loss colour,
faint at first and stronger as the approach narrows. `src/render/scene.ts`, `look.ts` (`WAVE_COAST`).

**Why.** Military brief section 10 wants three turns of visible, progressively narrowing approach,
and art brief section 11 forbids permanent overlays. A wave at sea is three turns of war, not a
permanent state, and the landers are already drawn through the fog; the coast they might reach is
the other half of the same picture. It is on by itself because a player who has to find an overlay
mode to see where the enemy may land has already lost the three turns.

### 112. The settlement screen never dimmed water for lack of a wharf

**What.** Nothing was removed. `ringCells` in `src/ui/selectors.ts` dims a cell for being worked by
another settlement, held by another charter, predecessor ground or barren; there was no wharf rule to
take out, and `workableTiles` in the simulation had none either (decision 44 left it out). Water
tiles show their food in the founding preview and the ring without a wharf, as the prompt asks.

### 113. What did not work the way the prompt assumed

- **"Fresh water" as a river.** See 95: on some maps there are no such coasts at all.
- **Two tiles a turn.** See 94: the band at that speed finds no open sea on small continents.
- **Settlements two clear tiles apart never overlap predecessor territory**, so the old alarm could
  not rise from founding; see 96.
- **A splashdown clear of the edge as a rule** starved small maps; it is a preference. See 106.
- **"Coastal batteries fire on adjacent hostile ships as before."** Nothing before fired. See 110.
- **"Settlement screen stops dimming water for lack of a wharf."** It never did. See 112.
- **The display type for the five lines** covered the picture at its own size. See 105.
- **The adversarial review workflow** the session was to run on phase one hit the account's session
  limit and returned nothing; a self review stood in for it, and the opening rig's first real touch
  tap found the scrim bug (107) that a code review would not have.
- **The build specification's acceptance check two** still says three landing sites are offered. The
  specification is not one of the seven briefs the prompt named, so it was left as written and the
  check's wording in `CLAUDE.md` and in `scripts/smoke.mjs` was changed to what the game now does.
- **The military brief's section 3 table** carries two em dashes from before this session, on
  lines the prompt did not ask to change; they are left and noted here.
- **The old save key** carried the schema version, so a save from an earlier build was never read
  and the player saw a silent new game rather than the plain message the prompt asked for.
  `readLocal` now finds a save under any earlier key so that `fromSave` can refuse it in words and
  the boot can say so and clear it.
- **The voyage itself.** One tile a turn made the several turns before founding time spent reaching
  land rather than choosing it. Decisions 114 to 126 below make the lander fast.

### Art debt, continued

| Owed | Stands in now |
|---|---|
| The lander beached and broken up on the shore | the beaching fades the lander's own picture out over the shore; nothing remains drawn |
| The Company's landers at sea | the lander's own drawing |

## The fast lander, session of 2 October 2026

The lander sails six tiles a turn and sees three, the splashdown moves in so that land is sighted in
the first move or two, one gesture sails the whole distance and is drawn travelling with the fog
lifting and the camera following. Setting brief section 7, onboarding brief sections 2, 5, 6 and 12
and session brief section 8 were changed first, each with a dated line at its top.

### 114. Six tiles a turn, sight three, and a splashdown five to eight tiles out

**What.** `C.lander.moves` 6; the lander's sight is 3 (`sightOf` in `src/sim/fog.ts`); the
splashdown band is `C.lander.splashdown`, near 5 and far 8 tiles of open water from the nearest
viable coast. Rival landers read the same `maxMoves`. The recall fleet's landers do not: their
approach is `C.military.approachTurns` 3 at `C.military.approachMoves` 1 tile a turn, its own
constant, exactly as before. The boat the lander leaves is a lighter at the lighter's speed.
`WORLDGEN_VERSION` is 3, so every seed makes a new world and older saves are refused in words.

**Why.** The near edge is the sight and two: nothing in sight at splashdown, and a tile of haze
beyond it, so the opening shows open sea and nothing else. The far edge is a move and the sight less
one: a lander sailing straight at the coast it was measured against sights land within its first
move from anywhere in the band. Measured before placement was tuned: every splashdown in the band
sighted land on the first move when sailed straight at its coast. The autopilot looks three turns
of sailing out (`C.lander.autopilot`), which at this speed is eighteen tiles.

**Symptom if wrong.** Land is in sight too soon and there is no voyage: raise `near`. Land takes
more than two moves: lower `far`. The coast is reached before anything has been compared: lower
`moves`, and know the band follows from it.

### 115. "Any sensible direction" means toward the coast, within forty five degrees

**What.** From a splashdown, the sensible headings are those of the eight within forty five degrees
of the bearing to the coast it was measured against (`sensibleHeadings`), and on every one of them
land is sighted within `C.worldgen.sightedWithinMoves` 2 moves (`sightsLandSensibly`). The generator
places in tiers: every charter sensible, then the player only, then none; clear of the edge for
everyone, then for the player only, then anyone; full separation before six tenths of it; and the
most headings with land in two moves before fewer. Last, a rival may come down
`C.worldgen.rivalSplashdownGive` 1 tile nearer its coast than the player. Validation refuses a world
whose player splashdown fails the sensible rule, and the generator tries again, up to
`C.worldgen.maxAttempts` 24. `src/sim/worldgen.ts`.

**Why.** "Any direction" cannot hold: from open sea out of sight of land, the land lies on one side.
A player who heads anywhere near the right way should see it within a move or two; one who sails
straight away from it should not. Measured on sixty seeds a shape: every small, standard and large
world valid with the player sensible (180 of 180 small, 120 of 120 small archipelago, 60 of 60
standard, 30 of 30 large); every charter sensible on 143 of 180 small, 58 of 60 standard, 30 of 30
large; at most six attempts and 67 ms for the slowest world.

**Symptom if wrong.** A player who sails a reasonable way sees nothing for three moves: check
`sightedWithinMoves` and `far` together.

### 116. A course is planned on what is known and stops at the coast it meets

**What.** The player's paths are planned on what is known: water nobody has seen counts as open
(`findPath`, `blind`). The unit lifts the fog from every tile it passes (`revealFrom` at every step
of `advance`), and a course that meets land it did not know of stops beside it with the order
cleared; one that meets a settlement it did not know of stops before it. Of two ways equally long,
the straighter is planned: a diagonal step is reckoned `C.terrain.diagonalTieBreak` dearer.
`src/sim/units.ts`, `src/sim/orders.ts`.

**Why.** Planning round land the player has not seen would tell them where it is. The tie break was
found by looking: a lander sent due south zigzagged on an equally short course into unseen water and
found the coast there, three tiles short of where it was sent. It moved no pin.

### 117. Movement comes back at the start of the turn loop

**What.** Every unit's moves are restored at the start of `runTurn`, before orders run, rather than
at its end. `src/sim/turn.ts`.

**Why.** A course longer than a turn's sailing goes as far as it can this turn and carries on at the
end of it; restored at the end, the carried move waited a whole turn with full moves sitting unused.
Now it continues on the new turn's movement: a twelve tile course sent on turn one is done as turn
two begins, not as turn three does. This moved the fifty turn pin, re-recorded in
`tests/pins.test.ts` with its old values.

### 118. The move is a picture over a state that has already moved, and the sheet waits for it

**What.** `moveTo` and the end of a turn take the units' picture before the action
(`scene.prepareMove`), apply it, and draw the move after (`scene.animateMoves`): each unit travels
the tiles it went through at `MOVE.tileMs` 150 a tile, the fog lifts tile by tile as it comes into
sight, the camera follows the lander with a look ahead and keeps it in the map above the sheet. The
camera's pull is per sixtieth of a second, so a phone dropping frames keeps up. While a move is drawn
the moving unit's sheet and the queue bar keep what they said before it and cannot be pressed; they
catch up when it ends, and the camera then keeps the unit above the sheet as it now stands.
`src/render/scene.ts`, `src/ui/app.ts`, `MOVE` in `src/render/look.ts`.

**Why.** The prompt wanted the move visible, not instant. Art direction brief section 7 allows no
rigs and no animation data, so the moving picture is the unit's own still drawing carried along the
way, turning when its heading does, and nothing more. The sheet waits because it was rendered from
the moved state and named the shore beside the lander before the picture had reached it.

### 119. A move that shows new ground cannot be undone

**What.** An action after which more tiles are explored than before clears the undo stack and
offers no undo. `dispatch` in `src/ui/app.ts`.

**Why.** Ground once seen stays seen. A move, a look and an undo would be a free scout, and undoing
an earlier action would take the new ground with it.

### 120. The compass: eight headings in the lander's sheet

**Superseded by 131.** The compass is gone; a far destination is reached by panning or by holding at
a wider zoom.

**What.** The lander's sheet carries eight headings round an empty hub. A heading shows a turn's
sailing that way, as far as the map and known land allow, with water nobody has seen taken as open;
the planned way, its length and Go sit beside the compass. A tap on a heading only shows; Go sails.
The compass is hidden while a shore is in focus for founding. The sheet keeps to what sailing needs:
the cargo is a quiet line, and the open sea line says "Land in sight" once it is.
`compass` in `src/ui/sheets.ts`, `headingTarget` and `previewHeading` in `src/ui/app.ts`.

**Why.** At forty four pixels a tile, the smallest a tile may be and still be tapped, a phone held
upright shows about four tiles either side of the lander, so a hold on the map cannot reach a six
tile move without a pan first. CLAUDE.md wants every hold to have a control in the bottom third. The
opening rig's first move, by a real hold, reached three tiles; the compass reaches six.

### 121. The map stays live under a unit's sheet

**What.** No scrim is drawn while the sheet holds one of the player's own units. Every other sheet
keeps the scrim and is dismissed by a tap away from it, as decision 107 has it. `renderSheet` in
`src/ui/app.ts`.

**Why.** Found by the rig's first real hold: with the lander's sheet open, the hold landed on the
scrim and only closed the sheet, so a move took two gestures. With a unit selected, the map is its
target: a tap there plans a way and a hold goes.

### 122. The camera may pass the map's edge while the lander is at sea

**What.** `Camera.overhang`, set to `C.feel.openingOverhang` 4 tiles until the first settlement and
nought after, lets the camera's centre go past where the map would cover the screen. Past the edge
the haze deepens at the rate it does inside, from wherever the edge has it, rather than going to its
deepest within a tile and a half. `src/render/camera.ts`, `knownHere` in `src/render/shading.ts`.

**Why.** The edge preference of decision 106 cannot hold on small maps: the player comes down
within four tiles of the edge on 164 of 180 small worlds and 104 of 120 small archipelagos, where the
open sea a band this near needs is only found near the edge. The opening shot had the lander against
the screen's edge. With the overhang it sits in the middle; with the haze continued, the map's edge
does not show as a rectangle in the fog.

### 123. Land is never drawn under the sea

**What.** A soft floor, `SURFACE.landFloor`, keeps land at least a twentieth of a tile above the
water, eased in from the shore inland so the beach still slopes. `src/render/terrain.ts`.

**Why.** Found by looking. The rolling landform can take low grassland half a tile down, under the
water plane at nought, and on the opening rig's seed a whole stretch of the coast the player was
meant to find was drawn as open sea while the sheet offered plains to found on. It predates this
session and would have shown on any map where the landform dips near a coast.

### 124. Rivals keep clear of the player's lander and found on arrival

**What.** A rival makes for a site at least `C.rivals.landingClearance` 6 from any other charter's
settlement and `C.rivals.playerLanderClearance` 10 from the player's lander while it is at sea; where
that leaves nothing in reach, 6 from the lander; then anywhere legal. A rival that arrives beside its
site founds the same turn. "The Sable Company" lands at Sable Landing: the name drops a leading
"The", which made it The Landing, the player's own default. `src/sim/rivals.ts`,
`bestLanding` in `src/sim/autopilot.ts`.

**Why.** As fast as the player, a rival took the very coast the player's splashdown had been measured
against on the first turn of the rig's seed, six tiles from the player's lander. Ten is the band's
far edge and two. Measured on thirty seeds: on small maps the nearest rival settlement is six or
more tiles from the player's on 29 of 30, every rival is ashore by turn seven, most by turn three;
on standard maps six or more on all 30. The name was wrong since decision 97.

### 125. Only what the player knows is named

**What.** The planned way's words say "Into the fog" for a destination nobody has seen and "Across
open water" for known water, name a settlement only if it has been seen and a unit only if it is in
sight, and say a course through unseen water stops at any coast. A hold attacks only an enemy in
sight. The control that clears an order says what it stops ("Stop going there") rather than the
order's code name. A save from an earlier version is refused on import in the same plain words as on
load. `src/ui/sheets.ts`, `src/ui/app.ts`, `SaveVersionError` in `src/io/save.ts`.

**Why.** The preview said "To Water" and could name ground and units in the fog; the hold could
attack a hidden unit. The import said "Save was generated by worldgen 2, this build is 3".

### 126. What did not work the way the prompt assumed

- **"Sailing in any sensible direction"** cannot mean any of the eight: land lies on one side. It
  means within forty five degrees of the way to the coast. See 115.
- **"Tap and hold a destination"** cannot reach six tiles on a phone at a zoom where tiles can be
  tapped. The compass does. See 120.
- **The hold on the map** with the lander's sheet open landed on the scrim. See 121.
- **Clear of the map's edge** is out of reach on most small maps once the band is this near. The
  camera goes past the edge instead. See 122.
- **Rivals at the player's speed** came ashore on the player's coast on turn one. See 124.
- **The rig's seed showed two older bugs:** land drawn under the sea (123) and a rival's settlement
  named The Landing (124).
- **A headless browser draws a few frames a second.** The move's midpoint is caught with a
  verification hold (`scene.holdMoveAt`), the rig holds a tap well past its length, and the camera's
  per frame pull lagged until it was made per sixtieth of a second (118).
- **Equal length courses zigzagged** into unseen water. See 116.
- **Every splashdown out of sight of land and every charter's sensible headings** do not both hold on
  small maps for all four charters; the player's always do, the rivals' on 143 of 180 small worlds.

## Movement by plotted route, session of 2 October 2026

All movement is one gesture: tap and hold the tile to go to. The hold plots the route and moves
nothing; a tap on the route's end, or the Go control in the bottom third, commits it. Feel brief
sections 1, 4 and 5, the gesture list in `CLAUDE.md` and the onboarding brief's first queue item were
changed first, each brief with a dated line at its top.

### 127. A hold plots; the route's end or Go commits; a tap elsewhere puts it away

**What.** With one of the player's units selected, a hold on a tile plots a route there and changes
nothing in the state (`plot` in `src/ui/app.ts`). A tap on the route's end commits it, and so does
Go, or Attack, or Go aboard, in the sheet (`commitRoute`). The end answers a tap across the whole
tile and never less than `C.feel.routeEndHitPx` 22 pixels either side of its middle, so it can be
tapped at a zoom where tiles cannot. A hold on another tile plots again. Any other tap puts the route
away first; a tap on a unit, a settlement or a predecessor then does what a tap does, and a tap on
plain ground only puts the route away and leaves the unit selected, ready for another hold. A hold
works down to `C.feel.routeHoldFloor` 16 pixels a tile, the overview zoom; below it, or with nothing
selected, a hold is a tap. The ring that fills under the finger no longer previews anything, so a
hold let go early, or turned into a pan, leaves everything as it was.

**Why.** The prompt. A tap on plain ground keeps the unit because "tap anywhere else to clear the
route" is a cancel, not a deselect: the player who plotted the wrong tile wants to hold again, not
to find the unit again. The floor is the overview zoom because the numbered turn ends of a slow
unit's route sit a tile apart and begin to overlap below it. The ring's preview went because it set
the route before the hold completed, so a hold turned into a pan left a route behind that a tap
would have committed.

### 128. The plan is a function in the simulation, and committing it is the ordinary action

**What.** `planRoute` in `src/sim/route.ts` returns a route or the reason there is none, as data and
plain words. The path is `findPath`'s, planned on what the player knows; each tile carries whether
nobody had seen it; the turn ends come from walking the path the way `advance` does, a turn's
movement at a time from what the unit has left now; an attack's odds come from `attackOdds` in
`src/sim/military.ts`, which reads the strengths from `fightStrengths`, the same function `fight`
now uses, so the odds shown and the fight cannot drift apart. They are shown only while the target is
in sight. Committing a move is the `moveUnit` action, which plans the same way from the same state,
so what is drawn is what happens. An attack or a boarding is a walk to beside the target and then the
last step, taken in the same commit only if the unit arrives with movement left; otherwise it waits
beside the target and the player plots the last step again.

**Why.** Headless and testable, `tests/route.test.ts`. The last step is not carried over to a later
turn because the target may have moved or changed by then and the odds the player agreed to would no
longer be the odds.

### 129. The player's ways go round others' armed units the player can see

**What.** `findPath` for a unit of the player's treats a tile holding another charter's or the
Company's armed unit, where the player can see it, as closed, except the destination. A sixth
argument, `ignoreUnits`, lifts that, and the planner uses it only to tell "others' armed units stand
across the way" from "there is no way". `src/sim/units.ts`.

**Why.** `advance` already stopped a unit before such a tile, so a route drawn straight through one
would not have been the move made. No pin moved.

### 130. The route is drawn over the map as SVG

**What.** `src/ui/route.ts` draws the route in a layer of SVG over the canvas, placed every frame
from the renderer's frame hook as the stack counts are: a bone line on a dark halo, dotted where
nobody has seen the ground, the loss colour and dashes for an attack's last step, a numbered disc
where each turn's movement runs out, the end as an accent ring the size of the tile and never
smaller than a thumb, an attack's odds in a pill above it, and a cross on a tile that cannot be
reached. The colours and widths are tokens in `src/ui/theme.ts`. While a route shows, the selection
ring stays on the unit and the route's end marks the tile held. The old overlay tint of path tiles
is gone from `src/render/scene.ts`.

**Why.** The map draws no text, a line of fixed width in pixels stays legible at the wide zooms a
destination may be held at, and it sits above the fog, where the terrain's overlay could not show a
route into the unknown. It is a preview the player summoned and puts away, so it is not data laid
on the map (art direction brief section 11).

### 131. The compass is gone, and so is "Go back aboard the lander"

**What.** The lander's compass, its heading code and its styles are removed. A colonist goes back
aboard by holding the lander: the route ends in a boarding, and Go aboard or a tap on its end
commits it. The colonist's sheet says so when the lander is beside it. Two controls that are not a
move to a tile stay: a colonist's "Explore by itself", which is a standing order, and the lander's
"Send one ashore to scout", which unloads a passenger rather than moving the lander.

**Why.** "No other way to move." The two that stay are listed here so they can be taken out too if
they are meant to go.

### 132. The lander holding land is pointed at the founding control

**What.** The lander holding the shore beside it plots nothing: the founding control in its sheet
looks at that shore, the map paints the ring a settlement there would work, and the sheet says "Go
ashore here". The control founds. Holding land further off says that the lander goes ashore by
founding and how. A hold never founds any more.

**Why.** The prompt. It also keeps founding behind the same deliberate second step as every other
commitment.

### 133. Why a tile cannot be reached, in the planner's words

**What.** `It is already here.` A unit with no movement left: `No moves left this turn. It can go
again next turn.` A ship holding land that is not a port, a land unit holding water, a hauler holding
ground too rough for it, an unarmed unit holding something of others' (`A colonist cannot attack.`,
and for a ship, that ships fight when they meet), others' armed units across the way, and no way at
all over land or by water. Land nobody has seen is not known to be land, so a hold on it plots a
course into the fog.

**Why.** The prompt's list. The queue's unit labels carry their articles ("A colonist", "The
lander", "Company regulars"), so the planner composes its sentences with them rather than adding
another.

### 134. What did not work the way the prompt assumed

- **"A unit with no moves left" as a reason** means such a unit cannot be given a course now for next
  turn, which `moveUnit` used to allow by setting a goto. The player plots it next turn instead.
- **"Tap anywhere else to clear the route"** and "tap selects and inspects" meet on plain ground: a
  tap there only clears the route and keeps the unit, and a second tap inspects. See 127.
- **The setting brief, section 7,** still says "one gesture sends it the whole way through the fog".
  It is now a hold and a tap. The prompt named only the feel and onboarding briefs to change, so it
  is left as written; feel brief section 4 is the authority.
- **The feel brief's 250 ms hold** is 450 ms in `src/ui/theme.ts` (`HOLD_MS`), a tuning recorded
  there before this session. Section 4 keeps its starting value.
- **The Company's regulars have no drawing**, so the target of the attack picture is a small dark
  form. Art debt, as before.
- **The route's words pushed its end under the sheet** when it was first written; the sheet was cut
  to two lines and a row of controls, and the camera now moves only if the end would be covered.
- **A short move can be over before a software renderer draws two frames,** so the smoke test now
  catches the drawn move as it starts rather than watching frames for it.

## Choosing a unit, session of 3 October 2026

Tested on a real phone: the lander was hard to choose because taps were resolved by tile and its
picture runs over the tiles beside it; nothing showed which unit was chosen; and a chosen unit's
sheet covered the lower half of the map. Section 1 of the layout brief now says the map is the hero
and every panel opens at the smallest size that answers the question; section 3 of the feel brief
now carries the hit-area and highlight rules. Each has a dated line at its top. Nothing in
`/src/sim` changed.

### 135. A tap is measured against the pictures, front-most first, then the tile

**What.** `pick` in `src/render/picking.ts` tries each unit's picture as the scene last drew it, the
box `pictureBox` in `src/render/billboards.ts` works out with the same arithmetic that places the
quad, front-most first (the larger foot is drawn later, in front). Inside a box, the sheet's own
alpha decides: `pictureCover` reads each sheet's image once, the first time a tap needs it, and
below `TAP.solid` the tap goes through to what is drawn behind. A unit beats a settlement's building
wherever the unit itself is drawn, even behind one. A unit's clear corners, and a margin that makes
its target at least `TAP_MIN_PX` (44) points each way, count where no unit is drawn and no building
is drawn in front of it. Then the settlement and predecessor marks, then the tile, and a tile with
one of the player's units on it is a tap on that unit, so the water just under the lander's hull is
the lander too. At far zoom, where a unit is a mark, its box is `TAP.markBox`, grown the same way.

**Why.** The prompt asked for rectangles front-most first. Rectangles alone were wrong twice in the
rig: a tap on a militia whose figure showed through the clear corner of a building's rectangle
opened the settlement; and the lander's foot sits off its tile's middle, so a tap on its own tile
under the hull fell through to a tile card. The old picking's rule, that units beat settlements when
the tap is clearly on the unit, is kept: a settlement has its whole picture and its mark besides.

### 136. A hold aims at a unit's picture too

**What.** A hold on another unit's drawn pixels is a hold on that unit's tile; its margins do not
count, so a hold aims at a tile unless it is plainly on a unit. A colonist holding the lander where
its hull hangs over the next tile plots going aboard; a militia holding an enemy's picture plots the
attack. `App.hold`.

**Why.** Found by the rig: holding the lander's picture plotted a walk to the tile under the finger.

### 137. The chosen unit: a ring under it, an outline over it, and nothing moving

**What.** `SelectionMark` in `src/render/selection.ts`. A flat ring in the owner's colour, the bone
of `C.art.palette.player` for the player, on a dark halo, drawn under the pictures and sized from the
picture's width; and an outline drawn over everything, found from the sheet's alpha in sixteen
directions at a fixed width in pixels, bone inside a dark band, so it reads the same at every zoom
and on grass, sand, water and haze. The tile ring shows only for a tile looked at. There is no flash
at all. A unit hidden behind a building still shows its outline. The look is `SELECTION` in
`src/render/look.ts`.

**Why.** The prompt allowed a brief flash; nothing needed it, and a flash is frames.

### 138. The steam blows away, so the frame loop can go idle

**What.** The lander's steam rises for `ARRIVAL.steamSeconds` (14) from the turn's first picture of
it and thins over `steamFadeSeconds` (2.5), through a `uSteam` uniform; then `Scene.steaming` is
false and the loop stops. Measured in the rig: no frames drawn in three seconds with the lander
sitting chosen.

**Why.** Steam kept the loop running through the whole of turns one and two, which is when the
lander is chosen most. The opening's five lines are read in about ten seconds, under the steam.

### 139. A slim card takes the queue bar's place

**What.** `src/ui/card.ts`, drawn by `App.renderQueueBar`. A title with the moves left beside it; one
line, which is what is aboard, its standing, quality, order or cargo, or the plotted route ("4 tiles,
1 turn", "Attack Company regulars, 2 in 10") or why there is none; up to three actions by context,
Found here, Go, Go aboard, Go ashore, Attack and Clear; then More and End turn, which are not counted
among the three. End turn is always at the bottom right, where it is in the queue bar; with nothing
to do but look the card is one row. A tapped tile gets the same card: its ground and yields, or
another's unit with its attack and defence, or another's settlement, with More for the tile sheet.
While a sheet is up the bar is the queue bar as before. Measured at 390 by 844: with a unit chosen
the top strip (59 points) and the card (56) cover 13.6 per cent of the screen; with a route plotted
or Found here offered, 18.6; with a tile looked at, 15.2.

**Why.** The prompt. It replaces decision 121: with a unit chosen no sheet sits over the map, so
every sheet has its scrim again and a tap on the map puts it away. The undo toast now sits above
whatever runs along the bottom.

### 140. More is the full detail, and one tap or a swipe puts it away

**What.** More opens the unit's sheet, or the tile's, over the scrim, and the camera keeps the unit
in the strip of map above it. A tap on the map, a swipe down on the grip, or the back arrow puts it
away; the card comes back with any route still plotted, and the unit still chosen. A tap on the map
with nothing up then lets the unit go. Opening a unit from the queue, the stack chooser or a tile's
list chooses it and brings up its card rather than its sheet.

### 141. Founding from the card

**What.** The lander chosen beside known land looks at the best shore it could found on, by
`siteScore`, when it is chosen and when a move that brought it there has been drawn; the map paints
the ring that shore would work and the card says which way it is and what it is, with Found here. A
hold on another shore beside it moves the look there, as decision 132 had it. A colonist outside a
settlement offers Found here when founding there is allowed, once the first settlement stands; the
preview with its ring is in More. A tap on the shore no longer looks at it: the shore is empty map,
and a tap there lets the lander go.

### 142. A passenger goes ashore by a hold, and the scout control is gone

**What.** The lander's detail lists who is aboard in the order they step off, under "Aboard". The
disembark action puts off the last one aboard, and the simulation was not to change, so the next one
off is the one with Choose. Choosing brings up the passenger's card; a hold on known ground beside
the lander that is not a mountain plots their step ashore, drawn as a boarding is, the other way;
Go ashore puts them off and chooses them. The last one aboard may go, and the card says the lander
cannot found until someone is back, as the old control warned. Back aboard is a hold on the lander
with the colonist chosen (136). "Send one ashore to scout" is gone.

**Why.** The prompt. It did not work before: nothing let a passenger be chosen.

### 143. The shell never scrolls

**What.** Any scroll of the app's root is put straight back to nothing. `App` constructor.

**Why.** Found by the rig: a browser bringing a control in a sheet into view scrolled the root by
about a hundred points, though it hides its overflow, and every tap after that landed two tiles off.
A focused field on a phone can do the same.

### 144. The Company's regulars are drawn with the soldier, and always were

**What.** `UNIT_SPRITE.pieces` in `src/render/look.ts` maps `regulars` and `horse` to
`company-regular`, and the live game draws them with it; the rig reads the piece back from the
picture the scene drew. Nothing in the mapping needed fixing.

**Why.** The report came from decision 134's last session, which said they had no drawing. They were
standing in deep tree shade at a small zoom in that session's pictures and read as a dark form. That
line was wrong.

### 145. What did not work the way the prompt assumed

- **"Company regulars have no drawing"**: they have, with the soldier (144).
- **"Test taps against each visible picture's screen rectangle"**: rectangles alone hand a tap on a
  unit to the clear corner of a building in front of it; the sheets' alpha decides within the
  rectangle (135).
- **"Front-most first"** would leave a figure standing just north of a settlement, wholly behind a
  building, impossible to choose; a unit's own pixels beat a building's (135). Such a figure is still
  hidden in the picture, and only its outline shows when it is chosen. Art debt.
- **Looking at founding by tapping the shore** met "a tap on empty map deselects"; the look is now a
  hold (141).
- **"At most three actions"** leaves More and End turn uncounted; both are always there.
- **"All interface together covers no more than about a fifth"**: the top strip counts. At rest it is
  13.6 per cent, at most 18.6 with a second row of actions. More, when asked for, covers 79.
- **The frame loop** was not idle with the lander chosen on turns one and two, because of the steam,
  not the choice (138).

## Making the whole game reachable, session of 3 October 2026

The game opened properly and could not be played to the end: the rates were derived one at a time
and never summed against a turn count (`RISKS.md` section 1). This run makes every era reachable. Its
phases are housekeeping, the two defects that would corrupt the measurement, tuning to outcomes
against an autopilot that plays sensibly, per-good surplus rules, predecessor barter, and orders that
outlast the turn. Each phase is committed on its own.

### 146. Housekeeping: the specification, two briefs, and what "two em dashes" turned out to be

**What.** `docs/build-specification.md` now describes the opening at sea where it described landing
sites and anchorages: the state's `splashdowns`, the turn counter's first month at sea, splashdown
placement on the world stream, build step nineteen, and acceptance check two, which reads as
`CLAUDE.md` has it. The section 3 table of the military brief carries "none" where it carried em
dashes; there were three, not two (the colonist's two cells and the improver's attack), and all
three are changed. The setting brief's section 7 says a hold plots a course and the route's end or
Go sails it, and its vocabulary paragraph in section 12 no longer contrasts signatories with a term
from the forbidden list. Each changed brief has a dated line at its top, the repository's convention
for marking a change, though the prompt asked for nothing but the changes themselves.

### 147. The passenger shortcut: Found here and Go ashore on one hold

**What.** With the lander chosen, a hold on the shore beside it puts Found here and Go ashore on the
card with Clear: two touches from hold to landing. Go ashore sends the next one off onto that tile
and chooses them. The `disembark` action takes an optional `aboard` index, so the Aboard list in More
can choose any passenger, not only the next one off; a hold on the shore then sends that one.
`sendAshore` in `src/ui/app.ts`, `noRouteWords` and `canStepAshore` in `src/ui/card.ts`,
`aboardSection` in `src/ui/sheets.ts`. The three-action row tightens its buttons so the labels stay
on one line at 390 points.

**Why.** The prompt. Decision 142's version needed More, Choose, a hold and Go ashore: four touches.

### 148. No unit is ever fully hidden: a silhouette through the building in front

**What.** `buildSilhouettes` in `src/render/billboards.ts`: for every drawn unit whose picture a
settlement building's picture in front of it overlaps (the building's foot further down the screen,
so drawn later), one more quad placed exactly as the unit's own, drawn just after the sorted layer
at render order -0.9, in the owner's colour darkened by `SILHOUETTE.shade` at `SILHOUETTE.alpha`,
only where both the unit's drawing and the building's are solid above `SILHOUETTE.solid`. The
building's alpha is read in the fragment shader from the point on the ground the fragment stands
on, so a clear corner of the building's rectangle draws nothing. The layer's sort is untouched; the
pass fades with the unit's own picture (the beaching) and hides with it below the zoom where units
are marks. `SILHOUETTE` in `src/render/look.ts`; the unit's owner colour rides on its billboard.
This is the one change to `/src/render` in this run.

**Why.** Decision 145 called a figure behind a building art debt; the prompt made it a render
rule. A depth buffer trick was considered and rejected: the billboards write no depth on purpose
(decision 68), and writing a false one for them would have changed what every later transparent
mesh is tested against. Pairing on the CPU costs one quad per covered unit and touches nothing else.
Measured in `scripts/phase0.mjs`: a militia north of The Landing's hall, wholly behind it, shows as a
faint bone figure through the wall and is chosen by a tap on it.

### 149. Rivals expand against a drag; the cap is a backstop

**What.** A rival's progress toward its next settlement each turn is
`expansionBase * terms / drag`, where `drag = 1 + held * expansionPerSettlement + pop *
expansionPerPop + spread * expansionPerTile`: one term for every settlement held, one for every
person across them, one for how far on average the holdings lie from the rival's landing. These are
the three soft pressures the player is under, the resolve fraction, administrative overhead and
freight loss, in the shape decision 15 asked for. `expansionPerSettlement` rises from 0.7 to 1.0,
`expansionPerPop` is 0.02 and `expansionPerTile` 0.05. `settlementCap` rises to 12, 16, 22 and 30
by size and is a backstop only; `tests/rivals.test.ts` asserts that on standard terms the curve, not
the cap, set the count at the end of every size's game. `src/sim/rivals.ts`, `C.rivals`.

**Measured on this build** (`tests/rivals.test.ts`, play stream fixed, player passive, rival
settlements held by all three rivals together; the end is each size's last turn, 300, 480 and 660):

| Map | Terms | Before: turn 100 | turn 250 | end | cap | After: turn 100 | turn 250 | end | cap |
|---|---|---|---|---|---|---|---|---|---|
| small | generous | 6 | 7 | 7 | 7 | 3 | 6 | 9 | 12 |
| small | standard | 6 | 7 | 7 | 7 | 6 | 9 | 9 | 12 |
| small | hard | 6 | 7 | 7 | 7 | 6 | 9 | 12 | 12 |
| small | punitive | 7 | 7 | 7 | 7 | 6 | 12 | 12 | 12 |
| standard | generous | 6 | 9 | 11 | 11 | 3 | 6 | 9 | 16 |
| standard | standard | 6 | 11 | 11 | 11 | 6 | 9 | 12 | 16 |
| standard | hard | 6 | 11 | 11 | 11 | 6 | 9 | 15 | 16 |
| standard | punitive | 9 | 11 | 11 | 11 | 6 | 12 | 15 | 16 |
| large | generous | 6 | 9 | 12 | 15 | 3 | 6 | 12 | 22 |
| large | standard | 6 | 12 | 15 | 15 | 6 | 9 | 15 | 22 |
| large | hard | 6 | 12 | 15 | 15 | 6 | 9 | 17 | 22 |
| large | punitive | 9 | 15 | 15 | 15 | 6 | 12 | 18 | 22 |

Before, every row but one sat at the cap by turn 250 and the four charter terms could not be told
apart. After, the count still climbs at the end of every game, generous and punitive are six
settlements apart on standard and large, and the cap binds only at hard and punitive on the smallest
map in the last turns, which is a backstop doing its job. Per rival on standard terms: three on
small by turn 300, four on standard by 480, five on large by 660; the second settlement at about
turn 75, the third at about 175, the fourth at about 310.

**Why these numbers.** Decision 15 said to tune the curve against the player's own settlement count
at turn 250 on standard terms. The competent policy that gives that count is built in the next
phase, so these are provisional: chosen so that a rival on small holds three by the end, the number
a careful player can plausibly hold there, and so that the terms stay distinguishable to the last
turn. Re-tuned if the competent policy's count says otherwise; the per-size table in the next
phase's decisions carries both. Decision 15's caution still stands: the player's own overhead
pressure is not real in this build (the clerk rule costs nothing), so the drag the rivals feel is
modelled on three pressures of which the player feels two.

**Symptom if wrong.** A player on small boxed in by turn 250 with nowhere legal to found: the rivals
find sites by the same spacing rule and avoid ground within four tiles of the player's settlements,
so this would show as the player's own second and third settlements having to go inland or far up
the coast. Lower `expansionBase`, or raise `expansionPerSettlement`, and rerun the test.

### 150. Dumping by standing order is never silent

**What.** Every automatic sale, by consignment office or by the `consign` surplus rule, writes a
dispatch line in the same words a player's own consignment gets: the units sold, the opening price,
the price it fell to, the gold due and when, and in the why, how far the good now stands below where
it would be with nothing sold. The price table keeps `autoPressure`, the share of each good's
pressure that automatic selling put there, recovering in step with the whole. When a good stands at
least `dumpingAlertDrop` of its baseline below it and at least `dumpingAlertShare` of that fall is
the player's own automation, and the fall is at least `dumpingAlertMinPoints` (two, so that a cheap
raw good falling its one point to the floor on any sale does not nag), a type one card, "Your
standing orders are dumping linen", names the price, the fall, the share, and the settlement selling
most of it, and opens the orders sheet.
Type one, so it never folds. `dumpedGoods` in `src/sim/market.ts`, `C.market.dumpingAlertShare`
and `dumpingAlertDrop`, `PriceEntry.autoPressure` in `src/sim/state.ts`. Saves from before this
build load with the share at zero.

**Why.** `RISKS.md` risk seven: the surplus rule and the office sold silently, so a player who set a
low threshold on turn twenty would reach the war with every good at the floor and never have been
told. The acceptance check that the price visibly falls when a lot is dumped was true only of the
player's own tap. The card's thresholds are the first numbers tried: half the fall and a quarter of
the baseline, so a good sold a little by a standing order does not nag, and a good walked well down
does. Tested in `tests/systems.test.ts`: a surplus rule over a pile of linen writes the line, the
share is positive and bounded by the pressure, the card is shown at type one, and holding the good
for eighty quiet turns lets it go.

### 151. Four defaults that made the economy unplayable, fixed before any constant moved

**What.** Found by playing whole games with the machine (decision 158) and fixed first, because
tuning against them would have tuned the wrong thing.

- A settlement whose ground suggested a crop began with that crop's refinery and no carpenter's
  shop, and frame comes from nowhere else, so it could never build anything. Every settlement now
  begins with a carpenter's shop as well as the line its ground suggests. `foundSettlement` in
  `src/sim/settlement.ts`.
- The surplus rule's default threshold was forty, which is the base storage, and the rule waited
  for a full lot above the threshold, so with no granary a standing order could never sell: the
  store filled to forty and spoiled. The default threshold is `C.market.defaultSurplusThreshold`,
  twenty, and when the store is full the rule sells what is above the threshold short of a lot,
  never a dribble under `fullStoreMinSale`.
- Horses were kept back from the surplus rule as capability, so a settlement whose ground was
  pasture earned nothing and spoiled nine horses a turn for three hundred turns. A stud of twice the
  threshold is kept and the rest are sold.
- `defaultJob` put every new arrival on the purpose good after food, so a settlement with a build
  waiting on frame and no one in the forest never built it. While something is being built and the
  shop has no timber, the default is the carpenter's shop and then the forest. `src/sim/labour.ts`.

**Why.** `RISKS.md` section 1 said the rates were never summed; these were not rates but defaults,
and each one alone made a settlement of the kind the generator most often gives inert. The lazy
policy, which plays nothing but the defaults, could not consign once in three hundred turns before
them and consigns on its sixth turn after.

### 152. Everyone eats one, the granary is a hundred, the first passage is twenty

**What.** `C.labour.eats` 2 to 1; `granaryThreshold` 160 to 100; `firstPassageWord` 30 to 20.
The copy that said two reads the constant.

**Why.** The colonists brief's own derivation (section 3) has a healthy settlement banking five or
six food a turn, which at two a head and three a tile means a settlement of eight with six of its
eight on food. At one a head, three on food and the settlement's own tile give four, which is the
brief's shape of a settlement (four on the ground, two in buildings) and the brief's number. Food
remains a pressure: a settlement of twelve still needs three on food to stand still. The granary at
160 then gave the first child at 53 turns after founding; at 100 with the lander's twenty food it
comes at eighteen, which is the target of about fifteen; the late game's births, every twenty turns
or so in a settlement with a surplus of five, are what carries the population to the brief's
hundred and twenty on a standard map. The first passage at twenty Word is what the first lot of
linen pays, so the second source of people opens with the first sale, as the brief intends
("immigration must carry the first fifty turns").

**Symptom if wrong.** Pop twenty-five arriving before a third of a small game, or settlements
outgrowing their nine tiles with half their people idle: raise the granary. Births never coming in a
settlement of three: lower it.

### 153. Resolve needs 150 a head, scaled by the one per-size pace factor and the charter's terms

**What.** `C.grievance.perPopulationForResolve` 250 to 150, multiplied by `C.session.pace[size]`
(small 1, standard 1.15, large 1.6, massive 2.1) and by the terms' `resolveNeed` (generous 0.85,
standard 1, hard 1.15, punitive 1.3). `resolveNeed` in `src/sim/grievance.ts`. The fleet's growth
with grievance is divided by the same pace factor, so a long game's larger total does not buy a
proportionally larger fleet.

**Why.** The pace factor was needed, and this is where. The early milestones are the same number of
turns after founding on every size, and the economy's rates are per turn, so they need no scaling;
but the declaration is wanted at the same fraction of the game on every size, and with one rate the
competent policy opened it at 69 per cent on small, 47 on standard and 35 on large. It is less than
the game's length over the small game's (1.6, 2.2, 3) because a bigger map carries more settlements
and more people and they take longer to bring round by themselves: measured, not derived. The
proposal's 250 was derived for a settlement of eight at twelve a turn over a third of a 480 turn
game; 150 times 1.15 on standard is 172, which is the same derivation with the settlement sizes the
policies actually hold. The terms factor is new: nothing in the difficulty bundle touched grievance
before, so generous and punitive reached the gate on the same turn.

**Symptom if wrong.** The declaration opening before half the game or after four fifths of it for a
player who staffs the meeting houses: move the pace factor for that size, not the base.

### 154. The war's rules, where the machine found them wrong

**What.** Four changes in `src/sim/military.ts` and `src/sim/fleet.ts`, each found by watching the
competent policy's war.

- A sacked settlement is sacked once and left alone for `C.military.sackCooldown` turns (twelve);
  before, every Company unit beside an undefended outpost sacked it again every turn, five lines a
  turn for ten turns. Decision 20 stands: the Company marches on. And it marches on the Landing from
  wherever it can reach it, not only from within twelve tiles: a wave that came ashore far from the
  Landing used to sit beside the nearest outpost and sack it every cooldown to the last turn, and
  since the war is won by destroying the fleet, not by waiting, the war never ended.
- Works are breached one tier every `breachThreshold` turns per settlement, however many siege
  trains batter them. The brief's section 11 says a train accumulates progress and at the threshold
  the fortification drops a tier; with six trains in a fleet of thirty, read per train, a bastion
  fell in five turns, and the sally the brief calls the answer cannot pick a train out of a stack
  screened by regulars. Read per settlement a wall is the clock the brief wants.
- A wave never comes ashore on a settlement's own tile: `landingCoast` excludes them. Before, a
  wave could land in the settlement, capture the garrison standing there and never be fought.
- The fight line names the loser as it was before it lost ("the militia lost its arms"), not as it
  is after ("the colonist lost its arms"), and no longer reads "your A colonist". `plainLabel`.

### 155. The fleet grows at 0.0025 a point and intervention costs 360

**What.** `C.military.fleetPerGrievance` 0.004 to 0.0025; `interventionGrievance` 1200 to 360.

**Why.** With resolve at 150 a head and the meeting houses staffed, the competent policy's total
grievance on small runs to about five thousand by the declaration; at 0.004 that was a fleet of
twenty-nine against a colony that can field three batteries and a few militia, and the war was lost
every time. At 0.0025 it is sixteen to nineteen on small, which is the target of fifteen to
twenty-five, and the war is four waves over thirty turns. Intervention at 1200 accrued three a turn
per meeting house and never fired in a thirty turn war (decision 22); at 360 a colony with four
meeting houses sees it around the third wave, which is "reachable" and no more.

### 156. Rivals leave peace: crowding at six tiles, and undercutting their trade

**What.** `C.rivals.crowdingRadius` 4 to 6, and a new cause of suspicion in `src/sim/rivals.ts`:
each rival lives by a third of the goods the rivals trade, and when one of those stands below
`undercutBelow` (0.75) of its baseline in the Company's book because of what the player has sold,
that rival's suspicion rises by `suspicionPerUndercut` (0.012) a turn, as far as tense and no
further. The dispatch says which goods. War still needs proof: a raider caught, or an attack.

**Why.** The rival charters brief, section 5: crowding, undercutting and attacking move relations.
Undercutting was not built. Crowding at four never happened, because the rivals settle no nearer
than four to the player and the competent policy no nearer than four to them. In the measured runs
before this no rival left peace in half the games; after it one does before halfway in every run,
at 11 to 51 per cent of the game. A first version let undercutting carry a rival to war, and the
rivals' war parties then took the competent policy's undefended settlements one after another;
trade now makes a rival tense and no more.

### 157. A lot moves the price, and a quiet turn mends twice as much

**What.** Every good's `volumeToShift` is half the proposal's table and every good's `recovery`
twice it. `C.market.goods`.

**Why.** Acceptance check six says the price visibly falls when a lot is dumped. At the proposal's
numbers a lot of twenty-five linen moved the price 0.28 of a point, which rounds to nothing, and the
dumping lesson was taught by no single sale; the competent policy first saw a fall at 33 to 105
turns after founding, the lazy policy never. At half, a lot of linen shows the fall on the first
sale, at fifteen turns after founding for the competent policy. Halving the volume alone let a
settlement's steady output walk its own price to the floor in ninety turns, so recovery is doubled
with it: a settlement selling what two workers make now holds its price, and only a colony that
sends more than that walks it down, which is the lesson.

### 158. The three policies, and the tables they measured

**What.** `src/sim/policy.ts` plays whole games through `applyAction`, like a player's taps, in
three ways. Lazy does what the cards suggest and no more: auto-assigns the idle, queues the first
building it could finish without buying anything, staffs the meeting house once a settlement is five,
founds one more settlement, lets the Company's silence rule answer its demands, and declares the turn
the gate opens. Competent plans its workers (food to a surplus, the carpenter while something is
being built, the meeting house, then the best of everything else, the ledger's clerks left idle),
builds what the settlement needs in order, consigns a lot when it holds one at a fair price, founds
on the best ground within reach up to a count by size, keeps settlements at twelve by sending
children and the idle to smaller ones, seeks the voice signatories once civic work begins, accepts
the Company's demands to a charge of 35 per cent, musters from 45 per cent of the game (works at
the landing, three batteries, 160 arms bought a lot at a time where the colony cannot make them)
and declares when ready or at 85 per cent of the game, then sallies against what it can beat.
Strong is competent with sharper knobs and a compact colony: civic from three, fewer settlements
kept at ten, more arms, an earlier muster. The knobs are `C.autopilot`. `tests/pace.test.ts` runs
them and prints the tables; its assertions are the targets below as windows for the competent policy
on small.

**The targets, and what the competent policy on small at standard terms measures** (two seeds):

| Milestone | Target | Before (decision 151 in, nothing tuned) | After |
|---|---|---|---|
| First consignment, turns after founding | about 8 | 14 | 15, 15 |
| First new colonist | about 15 | 36 | 18, 18 |
| First visible price fall from own selling | about 20 | 33 | 15, 15 |
| Second settlement | about 35 | 40 | 27, 28 |
| Tier two building, share of game | about 25% | 91% | 30%, 25% |
| Pop 25 | about 50% | 100% | 41%, 38% |
| Declaration available | 65 to 75% | never | 63%, 66% |
| Declared | | never | 73%, 79% |
| War over, won | last 25%, 3 to 5 waves | never | 88% and 92%, won both, 4 waves |
| Fleet | 15 to 25 | | 16, 17 |
| A rival leaves peace | before halfway | never | 51%, 11% |

**Every policy on every size, standard terms, two seeds** (turns after founding for the early
columns, share of the game for the rest; "open" is the declaration available):

| Policy | Size | Consign | Colonist | Price fall | 2nd | Tier 2 | Pop 25 | Rival | Open | Declared | Over | Won | Waves | Fleet | Pop | Settlements |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lazy | small | 6, 3 | 13, 16 | never | 41, 70 | never | never | 23%, 34% | never | never | | | | | 19, 23 | 2 |
| lazy | standard | 4, 9 | 16, 14 | never | 80, 72 | never | never | 16%, 15% | 75%, 62% | 75%, 62% | 78%, 64% | no, no | 1, 1 | 8, 9 | 20, 23 | 2 |
| lazy | large | 6, 5 | 13, 11 | never | 46, 53 | never | never, 69% | 10%, 11% | 55%, 98% | 55%, 98% | 57%, 99% | no, no | 1, 1 | 9, 10 | 23, 26 | 2 |
| competent | small | 15, 15 | 18, 18 | 15, 15 | 27, 28 | 30%, 25% | 41%, 38% | 51%, 11% | 63%, 66% | 73%, 79% | 88%, 92% | yes, yes | 4, 4 | 16, 17 | 79, 84 | 5 |
| competent | standard | 17, 9 | 20, 27 | 17, 74 | 23, 44 | 17%, 24% | 29%, 28% | 40%, 20% | 77%, 64% | 77%, 64% | 83%, 70% | yes, yes | 4, 4 | 23, 24 | 103, 106 | 9 |
| competent | large | 25, 35 | 27, 44 | 50, 41 | 52, 47 | 19%, 12% | 23%, 19% | 42%, 12% | 79%, 62% | 79%, 62% | 87%, 67% | yes, yes | 6, 6 | 42, 46 | 186, 227 | 14 |
| strong | small | 37, 12 | 27, 20 | 61, 127 | 29, 22 | 31%, 22% | 40%, 36% | 29%, 30% | 59%, 46% | 70%, 60% | 79%, 68% | yes, yes | 4, 3 | 18, 14 | 81, 64 | 5 |
| strong | standard | 12, 25 | 21, 27 | 63, 75 | 23, 29 | 18%, 27% | 28%, 33% | 9%, 34% | 45%, 69% | 51%, 70% | 57%, 77% | yes, yes | 3, 4 | 17, 21 | 76, 91 | 8 |
| strong | large | 73, 12 | 73, 16 | 127, 41 | 76, 18 | 40%, 12% | 34%, 15% | 29%, 13% | 12%, 65% | 85%, 65% | not over, 72% | , yes | 6, 7 | 46, 54 | 237, 251 | 12 |

Before this run the same table read: lazy never consigned on small; competent never reached the
declaration on any size and reached pop 25 at the last turn of a small game; strong declared at 80
per cent on standard and large with wars it lost or did not finish; no policy saw the price fall on
small before 33 turns.

**The charter's terms, competent on small, two seeds:** the declaration opens at 52% and 49% on
generous, 63% and 66% on standard, 71% and 88% on hard, 94% and 90% on punitive, which is generous
earlier and punitive later but within the game, as asked. The wars on punitive are lost: a fleet of
25 to 43 against a colony on two starting colonists.

**Lazy on generous, two seeds:** the declaration opens at 96% and 78% on small, 61% and 25% on
standard, 82% and 41% on large; lazy declares the turn it opens, with nothing armed, and loses in
one wave. It reaches the declaration, which is what was asked of it; what it does with it is its own
affair.

**Pins changed in this run**, each in the same commit as its cause, with old value, new value and
why in the test: the market recovery pin (decision 149), the fifty turn aggregates (every number
that moved is named in the test), and the grievance gate pin (125 turns and 750 to 64 turns and 384,
with the roster held at five by a hold order).

**What did not work the way the prompt assumed.** The prompt's milestone list assumes a game in
which only the rates were wrong. Four defaults had to be fixed first (151), four war rules (154),
and two causes of rival feeling (156), before a constant could be tuned against anything. The
per-size pace factor was needed, for the declaration and the fleet only. One seed per cell is
noise; the tables carry two, and the pace test's windows are wide for that reason. The clerk rule
still costs nothing (RISKS.md), so the policies leave the ledger's bodies idle by choice and a
player need not; and the predecessors play no part in any policy's game, which phase 4 should
change.

### 159. A surplus rule for one good

**What.** `StandingOrders.goods`, a per-good rule over the settlement's surplus rule: its own
destination (consign, hold, send to a named settlement) and, when set, its own threshold. The market
system's standing orders and the orders system's shipping read `surplusRuleFor(st, good)`, the good's
own rule where there is one, else the settlement's. A hold holds whether or not there is a
consignment office. Tooling, arms and instruments, which the settlement's rule never moves, ship
under a rule of their own. The action is `setGoodRule`, with `settlement: -1` meaning every
settlement of the player's, and `null` clearing the rule. In the interface the good panel, opened
from the goods strip, carries the chips for that good alone and says whose rule is in force; the strip
says what each good's rule does with it; the orders sheet lists the per-good rules and removes them.
The dumping card's one choice is "Hold linen everywhere". The competent and strong policies hold a
good that stands below `C.autopilot.holdBelow` of its baseline and sell it again at `sellAgainAt`.
Saves from before this load with no per-good rules.

**Why.** The prompt, and the settlement screen brief section 4: "tapping a good opens consign, hold,
or send to a named settlement". Decision 150's card told the player a good was being dumped and
could only offer the settlement's whole rule in answer; the panel said as much in its own copy. One
good is the unit the player thinks in.

### 160. The predecessors trade in kind, and a surplus rule can offer to them

**What.** Each people keeps a store: the crop it teaches comes in at `C.predecessors.storePerTurn`
a turn to `storeCap`, and what it takes in trade goes into it. An offer may name a good wanted in
kind: it is paid in that good at the Company's buy price over `barterBonus` (1.25), as far as their
store and the carrier's room allow, and the rest in gold. Goods in kind need something that carries,
a hauler or a hull. `offerTerms` in `src/sim/predecessors.ts` is one function the action and the
sheet both read, so what the sheet shows is what happens; the predecessor sheet lists what they have
and, for every good aboard, the gold it would fetch and each good it could fetch instead. The
surplus destination "offer to a people", in the type since the first build and never handled, now
works: a settlement's surplus of a manufactured good above its threshold goes to a known people
within `offerReach` tiles for gold on their terms, one good a turn, the anti-repetition rule
included; alarm or closure blocks it and the order conditions say so. The good panel and the orders
sheet offer the chip for every known people within reach. Saves from before this have empty stores.

**Why.** The proposal, section 5: "they trade in kind as well as coin ... a way to obtain goods
without gold, which is a genuinely different proposition from the Company market and it matters
early". Decision 160 is that proposition. The bonus is what makes it one: without it barter is a
roundabout way to spend gold. It is the first number tried.

**Symptom if wrong.** Every lot of linen going to the predecessors for flax and nothing to the
Company: lower the bonus. Nobody bothering: raise it, or the store's rate.

## Left out of version one

- Rival diplomacy offers (`C.flags.rivalDiplomacyOffers: false`).
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
- A wharf gate on working water tiles (decision 44); the simulation does not have one.
- An action that ships one chosen good to a named settlement (decision 46); only the settlement-wide
  surplus rule exists.
- A per-building shape from `previewProduction` (decision 42); the interface derives it.
- Deleting `C.feel.holdMs`, which nothing reads any more (decision 49).
- Landscape gets the same one-column settlement screen as portrait, centred. A two-column landscape
  arrangement, ring beside buildings, was not attempted.
- Deleting the keys of `C.art` and `C.feel` that the renderer no longer reads (decisions 55 and 63).
- Weather beyond the cloud shadow: the art brief's colour grade and fog density are not built.
- The routes overlay named in `ViewState` is still undrawn.
- Rival charters' ships and landers are drawn only in sight, and a rival's later settlements are
  founded only within six tiles of its own; nothing lets a rival expand across water.
- Battery slots per works tier: every battery on a settlement fires (decision 110).
- Signatory six (reveal terrain) is still inert with the fog on.
- A worker for the season re-bake (decision 61), and a lazily built fine prop tier (decision 64).
