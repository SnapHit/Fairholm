# Risks: where the bodies are buried

Written by the builder immediately after the build, before anyone had played it. This is the
knowledge that is cheap to write down today and expensive to reconstruct later. It is blunt on
purpose. `DECISIONS.md` has the judgement calls; this has the doubts, the shortcuts, the couplings
the structure does not show, and the rules nothing enforces.

---

## 1. What I am least confident in, ranked

These are finished and might be wrong. Unfinished things are in the README and at the end of
`DECISIONS.md`.

1. **The pace of the whole economy.** Growth needs 160 banked food and a settlement banks two or
   three a turn, so a birth every sixty to eighty turns. Word needs a consignment and the first
   passage costs 30 Word at one point per ten units of standard value, so the first immigrant needs
   roughly 300 units of value consigned. The autopilot had five people at turn 226 on a small map.
   On a 300-turn map the population may never reach the size the buildings assume (the tier two gate
   is five people, tier three is nine). Nothing in the briefs was checked against a turn count; all
   the rates were set independently and never summed. `C.labour.granaryThreshold`, `eats`,
   `firstPassageWord`, `passageWordStep`, `difficulty.*.wordPerValue`.

2. **Grievance is too slow to reach the declaration in a normal game.** Two meeting-house workers
   gather six a turn (cap twelve), resolve needs 250 per head, the gate is sixty per cent. A
   settlement of five doing nothing else reaches it on turn 126 (pinned in `tests/pins.test.ts`); a
   real settlement with two civic workers out of ten reaches it around turn 400. On small and
   standard maps the declaration is therefore something the player forces late or never sees. The
   fleet it produces is small in proportion: 750 grievance gives 5.8 units on generous terms. The
   endgame the fiction is built on may be unreachable in play. `C.grievance.perWorker`,
   `maxPerSettlement`, `perPopulationForResolve`, `declarationGate`.

3. **The recall fleet is a skirmish.** `fleetBase` 4 plus 0.004 per grievance point means twenty
   units needs four thousand grievance on standard terms. Most games will face one or two waves of
   five. The narrowing approach, the blockade, the breach and the intervention are all built for a
   war that lasts; the numbers produce one that does not. Intervention, accruing three per meeting
   house a turn toward 1200, effectively never fires (see decision 22).

4. **Rivals are passive.** Relations reach war only through suspicion from raiders caught in the act
   (0.2 each, war at 1.0) or the player attacking. Raiders appear with probability 0.03 a turn across
   all rivals and are caught only when they lose. In the twelve measured runs to turn 480 no rival
   ever left peace. The war-party code, the threat cards and the rival-side combat are therefore
   reachable in practice only by the player starting a war. Expansion, meanwhile, is set by a cap
   (decision 15). On hard and punitive the rivals all declare against their own Companies by turn
   480, which is probably too often (0.004 a turn after turn 150 compounds to near certainty).

5. **The predecessor economy is tiny.** Their purse starts at zero, so the first sale is bounded by
   `(0 + 200) / price` units: ten units of a twenty-gold good. The purse refills three a turn. Teaching
   is the real value; trade will feel like a gesture. `C.predecessors.*` and the purse literals in
   `src/sim/predecessors.ts`.

6. **Combat odds.** The tables match the brief and are pinned by sampling, but the experience of
   best-of-three with degrade-not-die has not been felt. Three militia against one regular in the
   open is about a one in five chance each; the player may read that as hopeless rather than as
   "raise works and use cover".

7. **The consignment office and the surplus rule share one code path** in `src/sim/market.ts` and
   both sell everything above a threshold every turn. With the office, threshold is
   `min(orders threshold, 60)`. A settlement producing a hundred linen a turn will crash its own
   price every turn, automatically, and the queue will not say so because automatic sales are logged
   as dispatch events, not as queue items. This is the dumping lesson taught by a machine the player
   did not watch.

8. **The queue rank formula makes persistence cosmetic.** `typeWeight` steps are at least 100 apart
   and `persistenceBoost` is 0.15 a turn, so a condition never climbs a type by persisting; it only
   reorders within its type. That may be what the brief meant. If it is not, `C.queue.persistenceBoost`
   is the knob.

9. **The crisis flag is unreachable.** It fires when more than eight type-one groups are shown, but
   grouping collapses every settlement's hunger into one group, every spoilage into one, and so on.
   There are four type-one groups in the whole game (`hunger`, `spoilage`, `threat`, `unitContact`).
   The "more losses than fit" banner will never be seen.

10. **The audio player has never played audio.** It was written to the feel brief and typechecks;
    headless Chromium cannot exercise it. Autoplay policy, the crossfade at the wrap, the two-element
    handoff and the visibility pause are all untested in a browser with a speaker.

11. **Worldgen site descriptions and validation** were tested for existence, not for honesty. "Good
    timber, poor ore, a river" is computed from reach-two tiles; nobody has checked that it matches
    what the player sees on landing.

## 2. What was rushed, and what more room would have bought

- **The sheets.** Every sheet exists and is reachable, but none of them was designed. The settlement
  sheet is a long scroll of sections; the workers sheet sorts by yield with a regex on its own text
  (`workersSheet` in `src/ui/sheets.ts`, see the `sort` on `textContent`), which is fragile and
  slow. There is no sheet for authoring a haul circuit or a patrol, no "offer to a predecessor people"
  surplus destination, no way to choose which good a predecessor is offered beyond the active unit's
  cargo. With room: one more day on the settlement sheet alone.
- **Rival behaviour.** Rivals grow numbers, found settlements, sell into the market, and at war spawn
  single militia. They have no ships, no improvers, no roads, no response to being attacked except
  more militia. Observable depth was the brief's instruction; this is shallower than observable.
- **The fleet's narrowing approach is invisible on the map.** The wave card says how many stretches
  of coast remain; nothing is drawn. The threat overlay shows landed units only.
- **Naval.** Engagement rules are a sketch. Player hulls cannot be ordered to attack. Raiders go
  home after one raid by being deleted. Blockade ships never move.
- **Onboarding beyond the queue.** The intent ladder (fed, first consignment, second settlement,
  refine) and the one-sentence explanations are in; there is no guidance on the first hold, no
  highlighting of the first tappable tile, and the landing cards are the only scripted moment.
- **The return screen's "what moved"** takes the last three dispatch entries of the current turn,
  which after a reload is usually empty because the save is written after the turn's dispatch is
  already in the log for the previous turn. It works; it is often thin.
- **Massive maps**, landscape on a real device, iOS Safari storage limits, and the export share sheet
  were not exercised.
- **Telemetry** has no reader but the menu footer.

## 3. Hidden coupling

Places where a change in one file breaks something in a distant file without the structure saying so.

- **Signatory indices are hard-coded in seven files.** `SIGNATORIES` in `src/sim/grievance.ts` is
  the list; its effects are checked by bare integers elsewhere: 0 and 9 in `src/sim/settlement.ts`
  (`buildable`), 1 in `src/sim/market.ts` (`buyPrice`), 3 in `src/sim/orders.ts`, 4 in
  `src/sim/settlement.ts` (`foundSettlement`), 7 and 8 in `src/sim/military.ts`, 11 in
  `src/sim/labour.ts` (both passage costs), 2, 5, 7 and 10 in `grievance.ts` itself, and the UI
  reads the list by index. Reordering the list, or inserting a thirteenth, silently changes what the
  signatories do. A named enum would fix it.
- **Forest placement, `forestClearsTo`, and the save's delta list must agree.** Worldgen places
  forest on ground that clearing changes on roughly twenty tiles of a standard map;
  `C.terrain.forestClearsTo` changes the terrain on clearing; `DELTA_FIELDS` in `src/io/save.ts`
  does not include `terrain`. So a cleared tile's new yields revert on the next load. This is a
  live bug, documented as an expected failure in `tests/pins.test.ts`. Fix in either place, but
  know that both places exist.
- **`C.flags` is copied into `state.flags` at creation and then ignored.** Every system's `enabled`
  and every sheet reads `C.flags`, the constant. A saved game's `flags` field controls nothing except
  `worldgenProblem`. Anyone who toggles a flag on a saved state and expects a change will be puzzled.
- **Queue group names are free strings shared by three files.** `src/sim/settlement.ts`,
  `orders.ts`, `grievance.ts`, `military.ts`, `naval.ts`, `predecessors.ts`, `rivals.ts`,
  `market.ts`, `fleet.ts` and `queue.ts` each invent group keys; `GROUP_TITLES` in `queue.ts` maps
  some of them to plural titles; `app.ts` marks `explained[group]` by the same string; the
  adversarial test lists them by name. A typo makes a new group with no plural title and no explain
  suppression, and nothing notices.
- **Condition keys are the same kind of string.** `settlement.conditions['buildBlocked']` is set in
  `settlement.ts` and read in `settlement.ts`; `orderBlocked` and `orderUnsatisfiable` are set and
  read in `orders.ts`; `hunger`, `spoilage`, `idle`, `reviewOrders`, `growthAsk`, `purposeLost` are
  set in one function and read in another. They are the only stored queue input and the save keeps
  them, so a renamed key strands old saves with a condition nothing clears.
- **`consume` sorts the colonist roster in place** when someone starves
  (`st.colonists.sort(...)` in `src/sim/settlement.ts`). The UI's workers sheet and the
  `assignWorker` and `educate` actions address colonists by array index. A starvation event while a
  sheet is open can reassign the wrong person. Also `defaultJob` and `autoAssign` depend on roster
  order for tie-breaks, so a sort changes who gets which tile.
- **`renderQueue` writes state during render.** `src/ui/app.ts` calls
  `applyAction(markExplained)` while building the queue panel so the explain sentence shows once.
  It goes through `applyAction`, so the rule holds technically, but it is a mutation inside a render
  and it is not undoable or snapshotted. A future "render is pure" assumption will break here.
- **The pristine-world cache in `src/io/save.ts`** keys on `settings` minus `audio`, `pace`,
  `firstGame`, `difficulty`, `turns` and `crossing`. If a new `Settings` field ever affects worldgen
  and is added to that exclusion list, two games with different worlds share a cached pristine and
  the delta diff is wrong. If it is not excluded, the cache just misses. The safe direction is to
  exclude nothing new.
- **`charter.unlocked` and `charter.explained` are `Record<string, boolean>`.** The onboarding
  gates (`market`, `orders`, `grievance`, `signatories`, `predecessors`, `rivals`, `military`,
  `naval`, `fleet`, `demands`) are strings set in nine files and read in the queue items. A typo
  means a system that never unlocks and never says why.
- **Settlement id equals array index; charter id equals array index.** `settlementOf`, the
  `settlement` field on queue items, `transits.to`, `orders.surplus.destination.settlement`,
  `growth.settlement`, `tile.worked` and every sheet assume it. Never remove or reorder a settlement;
  a captured settlement keeps its index and changes owner for exactly this reason.
- **Owner `-1` is the Company** everywhere, by convention: units, `isHostileTo`, `ownerName`, the
  renderer's colour lookup, the picking sheet's label. A new owner value (a fallen rival's Company
  holdings, say) would need every one of those touched; the renderer would crash on
  `s.charters[owner].colour`.
- **Difficulty's `startingColonists` and the landing's spare colonist.** `land` in `actions.ts`
  puts `startingColonists` in the settlement and adds a separate debtor unit when the count is at
  least three, so generous terms give six people, punitive two. The grievance gate test depends on
  the five.
- **The fleet cadence reads `waves.length`** to decide when the next wave is due; the win check
  reads the pool and the units. Both are in `fleet.ts` but `military.ts` removes Company units and
  `naval.ts` removes blockade ships, so the win condition is spread across three files.
- **Rivals are founded by `foundRivals` from the `land` action**, not by the rivals system, and
  only if `s.flags.rivals`, the state copy, is true. The rivals system checks `C.flags.rivals`. They
  agree today only because the copy is made from the constant.
- **`withTerms` in `app.ts` wraps any word that is a glossary key.** The glossary keys include
  every good, `turn`, `free`, `master`, `works`, `quality`. Adding a key such as `the` or `turn`
  variants would make every card a mess of dotted underlines; adding `free` already underlines the
  word free in ordinary prose.
- **`GOOD_NAMES`, `TERRAIN_NAMES`, `FOREST_NAMES`, `PRIME_NAMES`** in `src/ui/sheets.ts` and the
  building names in `C.buildings.lines` are the only place ids become words. A new good or prime
  with no entry renders as `undefined`.
- **The telemetry hook for turn seconds** reads the queue derived before the turn, so the "queue
  length per turn" metric is the queue the player saw, not the one produced. That is the right
  metric, but it is the opposite of what the name suggests.

## 4. Invariants held by convention, not by types or tests

A future agent could violate any of these and neither the compiler nor the suite would notice.

- **`/src/sim` imports nothing from `/render`, `/ui`, `window` or `document`.** Enforced by a grep
  in the build notes and by the fact that the tests run in Node. There is no lint rule and no test
  that fails on a stray import of `three`.
- **Nothing writes to `GameState` except `applyAction`** (and the systems it runs through
  `endTurn`). The UI honours it; the tests do not (they mutate freely, by design); `App.undo`
  replaces the whole object; `App.newGame` and `importSave` do too. Nothing freezes the state.
- **The queue is derived, never stored.** `opportunitiesShown` and `settlement.conditions` are the
  only stored inputs. Anyone who adds a `queue` field to the state to "cache" it breaks the design
  and the save, and no test would catch it unless the stress test happened to differ.
- **Two RNG streams, and systems use only `ctx.rngPlay`.** A system that calls `next(s.rng.world)`
  during play advances the world stream, which is saved, and the next load regenerates a different
  world... no, it regenerates the same world because worldgen reseeds from the seed string, so the
  damage is silent: `rngWorld` in the save becomes meaningless. There is no test that `s.rng.world`
  is untouched after a turn; there should be.
- **Every number lives in `C`.** Violated already by: the layout split `0.58` in `app.ts`; the
  marker hit radius `18..34` in `picking.ts`; the arrival zoom `working * 0.75`; the surplus
  threshold chips `[20, 40, 60, 100, 150]` and the consign default of two lots in `sheets.ts`; the
  war-party chance `0.08` and cap `strength / 4` and the rival building chances in `rivals.ts`; the
  launch chance `0.6` and intervention accrual `3` in `fleet.ts`; the transit speeds `2` and `4` and
  the hostile radius `3` in `orders.ts`; the resist formula, the sack fraction `0.5` and the ambush
  terrain set in `military.ts`; the purse rule `(wealth + 200) / price`, the `0.35` and `0.1` wealth
  changes and the `+3` refill in `predecessors.ts`; the raider go-home rule in `naval.ts`; and most
  of the renderer's sizes and jitters. `TUNING.md` lists the ones that matter for play.
- **Settlement and charter ids equal their array indices.** See section 3.
- **`SIGNATORIES` order is the effect table.** See section 3.
- **`setStandingOrder` takes `value: unknown`** and stores it without checking its shape. A sheet
  bug writes a malformed surplus rule into the save forever.
- **Queue item keys are unique.** Assumed by dismiss and by the fold; violated today by the threat
  item (keyed by settlement, not by hostile unit), documented as an expected failure in
  `tests/pins.test.ts`.
- **Each queue group has a plural title in `GROUP_TITLES`** if it can hold more than one item.
  Groups without one fall back to "N items: first title".
- **`explain` is one sentence, shown once, per group.** Nothing checks it is one sentence.
- **The save schema.** `SCHEMA_VERSION` is 1. `transits` was added to `GameState` after the first
  saves existed and `fromSave` tolerates its absence with `?? []`. The next field added must either
  do the same or bump the version; nothing reminds anyone.
- **`forestClearsTo` agrees with worldgen's forest placement.** It does not, see section 3.
- **Garrison capacity and battery slots** (`C.military.garrisonCapacity`, `batterySlots`) are
  constants nothing reads. A tuner will change them and see nothing happen.
- **The forbidden vocabulary.** Enforced by a grep at build time and by whoever reads the diff.
- **No em or en dashes.** Convention.
- **The turn order in `src/sim/systems.ts`** matches build specification section 6. The fifty-turn
  pin in `tests/pins.test.ts` is the only thing that would notice a reordering, and it would notice
  it as a diff without saying why.

## 5. Where the code diverges from the briefs

Including the simplifications. Decisions with a number are explained in `DECISIONS.md`.

- **Hold-ring feedback is under the thumb.** The interface brief says selection feedback appears
  above the touch point, never under it. `#holdring` in `style.css` is centred on the contact point.
- **Player hulls cannot attack.** `attackWith` requires `isArmed`, which excludes hulls. The naval
  brief's "speed decides who can bring whom to action" is one-directional: raiders choose, the
  player never does.
- **Garrison caps and battery slots per works tier are not enforced.** Constants exist; nothing
  limits how many units sit inside a palisade or how many batteries count.
- **Signatory seven (cheaper batteries) grants nothing.** `equipCost` ignores signatories.
  Signatory six (reveal terrain) is a no-op while fog is off. The build specification said effects
  beyond the first four may be inert; the first four all work, and eight of the remaining eight
  work, with these two exceptions.
- **The clerk rule has no teeth.** `clerksRequired` only excuses that many idle colonists from the
  idle card. `clerkShortfall` is never read, so administrative overhead does not reduce output. The
  colonists brief describes it as a soft pressure on size; here it is a label.
- **The press worker adds half a share of grievance** on top of the press multiplier. The brief has
  the press as a multiplier only. Small, and in `grievanceGathered`.
- **Haggling is unlimited.** The brief allows one haggle per transaction; each offer action carries
  its own haggle flag and there is no memory, so a player can haggle every time. The success roll is
  play RNG so it cannot be save-scummed, which limits the damage.
- **Predecessor trade is gold, not kind** (decision 13). **The "offer to a predecessor people"
  surplus destination is never executed** by the orders system.
- **Transits are abstract** (decision 5); the turn-queue brief's haul circuits with a risk posture
  exist only for hand-equipped haulers, and no sheet authors a circuit.
- **Blockade is scoped to waves at sea** (decision 12). **The Company sacks rather than holds**
  (decision 20). **Intervention** is a flat accrual (decision 22).
- **Rival declarations** on hard and punitive resolve by a coin weighted on strength, at random,
  with no war on the map. The rival charters brief describes a war the player can see.
- **The market's rival coupling** adds 0.3 of each rival's sales as pressure on two random goods a
  turn, not on the goods the rival actually produces. The brief's "market footprint" was by
  production; here rival production is abstract, so the goods are drawn from a fixed list.
- **Spoilage** applies to everything but food above the storage cap at the end of the turn, with no
  grace period. The remaining systems proposal implied a per-good rate; this is a hard cap.
- **Imported machines** fail on a rising chance with age; the proposal gave no curve, so it is
  linear in `consume`.
- **The narrowing approach** excludes a share of anchorages each turn at random rather than by
  distance from the wave. The brief wanted the coast to rule itself out plausibly.
- **Season affects only colour.** The session brief says so; some readers expected yields.
- **"Everything reachable lives in the bottom third."** The speaker icon and the intent line are
  at the top, per the feel brief's own exception for the speaker; the intent line is editable from
  the top.
- **The return screen** shows three queue titles and the last dispatch entries, not the brief's
  "what moved" as a narrative.
- **Overlays** are territory, yields and threat; the routes overlay named in `ViewState` is not
  drawn.

## 6. What the tests do not cover

Honestly: most of the product surface.

- **The entire interface** except the ten acceptance checks in `scripts/smoke.mjs`, which is not
  part of `npm test` and needs Playwright and a Chromium download. No test touches a sheet's
  contents, the glossary, the stacked-unit chooser, the hold ring, the path preview, the undo stack,
  the return screen, the end screens, the menu, import from a file, or landscape beyond "the class
  is set".
- **Audio.** Nothing.
- **The renderer** beyond "it drew frames without a page error and used nine draw calls". No
  screenshot comparison, no test of the LOD hysteresis, the deferred rebuild during a gesture, the
  overlays, or context loss in a real browser.
- **Predecessor actions.** Zero tests call `offer`, `learn` or `stationAgent`. The alarm and closure
  logic, the preference rotation and the gift are untested.
- **Naval.** Zero tests of `buildHull`, `engage`, raider spawning, repair, cargo capture, blockade
  ship behaviour.
- **Rival war parties, rival declarations, relations changing.** The rivals test checks counts and
  the absence of crashes only; in it no rival ever left peace.
- **Siege breach, sacking, the loss condition, the landing falling, capture.** The autopilot in
  `tests/systems.test.ts` happened to lose the landing once; nothing asserts the mechanism.
- **Intervention.** Never triggered in any run.
- **Education, imported machines, storage tiers, spoilage amounts, growth "send to", transits
  arriving and being blocked, standing orders changing output, review-orders, demands accepted and
  refused (effects on charge and embargo), embargo shield, signatory effects other than one and two.**
- **Worldgen fallbacks**: the promoted-cove path and the `worldgenProblem` flag are not exercised
  by a seed known to need them.
- **Massive maps.**
- **Export and import** in the sim tests (the smoke script covers them in the browser).
- **Telemetry counters.**
- **Determinism of the world stream** across play (that `s.rng.world` is untouched by a turn).
- **The queue's opportunity lapsing** (`noteUnresolved` counting appearances) and the `dismiss`
  action's effect on subsequent turns.
- **Any balance claim whatsoever.** The pins say the formulas do what they did on this build; they
  say nothing about whether those numbers make a good game.
