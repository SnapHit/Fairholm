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
- A wharf gate on working water tiles (decision 44); the simulation does not have one.
- An action that ships one chosen good to a named settlement (decision 46); only the settlement-wide
  surplus rule exists.
- A per-building shape from `previewProduction` (decision 42); the interface derives it.
- Deleting `C.feel.holdMs`, which nothing reads any more (decision 49).
- Landscape gets the same one-column settlement screen as portrait, centred. A two-column landscape
  arrangement, ring beside buildings, was not attempted.
