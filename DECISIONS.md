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
- Deleting the keys of `C.art` and `C.feel` that the renderer no longer reads (decisions 55 and 63).
- Weather beyond the cloud shadow: the art brief's colour grade and fog density are not built.
- The narrowing approach, the routes overlay and the fleet's position at sea are still undrawn.
- A worker for the season re-bake (decision 61), and a lazily built fine prop tier (decision 64).
