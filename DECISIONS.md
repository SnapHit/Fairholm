# Decisions made during the build

Every ambiguity the briefs left open, and every place the build departed from them, is recorded
here with the reason and the file it lives in. Entries are in the order they were decided. Nothing
here has been verified by play; where a number was chosen it is a starting value in
`src/sim/constants.ts` and should be tuned at the table, not in the document.

## Architecture

1. **Anchorage spacing tightened to five tiles and the per-coast-tile count to twelve** so that
   three landing sites can be guaranteed on every small map. Where fewer than three anchorages fall
   within eighteen tiles of the player's landing, viable coves are promoted to anchorages.
   `src/sim/worldgen.ts`.
2. **Everything starts explored and fog of war is off** (`flags.fogOfWar: false`). The explored
   flag is kept on every tile and the renderer can dim unexplored ground, so fog can be switched on
   later without a schema change. Reason: the first session has enough to learn without a hidden
   map, and the art direction wants the coast to read at a glance. `src/sim/constants.ts`,
   `src/render/scene.ts`.
3. **The massive map generates but is unvalidated** (`flags.massiveValidated: false`). It is offered
   in the new game sheet marked untested. Section 12 of the build specification.
4. **Telemetry is local only.** Anonymous counters live in localStorage and are shown at the foot
   of the menu. No endpoint exists in version one; the hooks are all in `src/io/telemetry.ts` so an
   endpoint is a single change. Reason: nothing to receive it yet, and shipping a network call to
   nowhere is worse than none.
5. **Goods in transit between settlements under a surplus rule are abstract**, not hauler units.
   They travel as a `transits` record arriving after a number of turns set by distance and roads,
   and they wait rather than move while hostile units are within three tiles of either end.
   Hauler units with real cargo exist for hand-built circuits. Reason: automation never fights,
   and an automatic hauler on the map would either fight or need an answer for what it does when
   something is in the way. `src/sim/orders.ts`, `src/sim/state.ts`.
6. **Undo instead of confirmation.** Every action within a turn snapshots the state (structured
   clone) before applying and offers undo on the toast for five seconds, up to eight deep. The
   play RNG stream is carried across an undo so the same dice are never replayed. Ending the turn
   clears the stack. `src/ui/app.ts`.
7. **The renderer never touches the sim RNG.** Deterministic jitter in the terrain and props uses a
   stable integer hash of the seed string (`src/render/seed.ts`).

## Economy and labour

8. **Starvation after three turns of deficit** (`starvationTurns: 3`). The colonists brief gives a
   hunger condition without a number.
9. **A settlement's own tile yields its food free and half its best other yield free.** The brief
   says the centre tile is worked for free; which good was open.
10. **Inland consignment requires a consignment office**; otherwise goods must be hauled to a
    coastal settlement. Section 4 of the remaining systems proposal allows the office to work
    inland and this is what makes the first signatory worth having. `src/sim/market.ts`.
11. **Freight loss** of 0.4 per cent per tile from the landing, capped at 25 per cent, is the third
    soft pressure toward the coast. `src/sim/constants.ts`.
12. **Blockade is scoped to waves at sea.** Passages and consignments stop only while a Company
    wave is at sea (or for good once the war is won, for passages). The military brief says the
    blockade accompanies the fleet; a permanent blockade from the turn of declaration would make
    the muster window pointless. `src/sim/fleet.ts`, `src/sim/market.ts`, `src/sim/labour.ts`.
13. **Predecessor trade pays in gold, with gifts in kind.** "Trade in kind" is read as: they pay
    from their own purse with no Company charge, and a quarter of the time add a gift of the crop
    they grow. Their purse refills slowly and trade lifts their prices by up to half. A literal
    goods-for-goods exchange needs an inventory for every predecessor settlement and a second
    picker in the interface; deferred. `src/sim/predecessors.ts`.
14. **A debtor cannot be taught by a predecessor people**, matching the school rule that debtors
    cannot be schooled.

## Rivals and war

15. **Rival expansion slows with size and is capped by map**: progress per turn is
    `expansionBase / (1 + held * 0.7)` and all rivals together hold at most 7, 11, 15 or 20
    settlements by map size. The first autopilot run produced 34 rival settlements on a small map,
    which is not the observable-depth rival the brief describes. `src/sim/rivals.ts`.
16. **Rival relations move only by events**: crowding within four tiles, suspicion from raiders
    caught in the act, and attack. `flags.rivalDiplomacyOffers` is false and there is no diplomacy
    sheet. At hard and punitive a rival may declare after turn 150 with more than twenty people
    and then, at random, win or fall.
17. **Rival war parties** are a militia or outrider spawned at the rival's nearest settlement while
    at war, capped by strength. Rivals do not simulate colonists.
18. **An undefended rival settlement still resists with its people** at militia defence times the
    works multiplier. Without this, one militia takes any rival settlement without a garrison.
19. **Captured colonists join the victor as debtors**; captured Company regulars are removed. The
    brief says degrade not die; the bottom of the ladder for an unarmed unit is capture.
20. **The Company sacks rather than holds.** A Company unit that beats the last defender of any
    settlement but the landing throws down its works and takes half the store, then marches on.
    Only the landing falling ends the war. `src/sim/military.ts`.
21. **Waves launch after the six-turn window and then roughly every five turns**, sixty per cent
    likely on each due turn, never two at sea at once. Each wave brings a blockade ship that sits
    off the landing. The win check runs after any launch in the same turn, so a wave that has just
    sailed cannot count as spent.
22. **Intervention** is bought with 1200 points of wartime grievance, accrued at three per
    settlement with a meeting house per turn, and removes forty per cent of the remaining pool
    and damages the blockade ships. A rival at peace or tense is chosen at random.
23. **Naval engagements** resolve on guns as best of three; a loser takes one damage (speed and
    guns), yields sixty per cent of its cargo, and founders when damage exceeds its speed. Raiders
    caught in the act become flagged and add suspicion to their charter.

## Interface

24. **Stacked units open a chooser sheet**; a single unit activates directly. With a unit already
    active, tapping a stack of your own units keeps the active one and previews the path instead.
25. **The hold ring shows from the first frame of contact** and the path preview is computed on
    the first hold frame, so the target tile shows what will happen before the hold completes.
26. **Double tap snaps between overview and working zoom**, centred on the tapped tile.
27. **The first landing site card is tapped to land**; "Look" glides the camera there without
    landing. The three cards carry the generated one-line descriptions.
28. **Tiles are pickable only at 44 pixels or above**; settlements, units and predecessor
    settlements keep a marker hit area at every zoom.
29. **Sheets are plain DOM in the bottom 42 per cent in portrait and the right 40 per cent in
    landscape**, with the end-turn bar between map and sheet in portrait and at the top of the
    panel in landscape.

## Rendering

30. **Rivers and roads share one mesh** with vertex colours, and settlements use two instanced
    meshes (boxes for roofs, chimneys, bastions, banners and wharves; a torus for works rings).
    Props are three instanced meshes (canopies, rocks and reeds, old workings). A settled frame at
    working zoom is ten draw calls including the water plane.
31. **Rivers and roads are lifted two hundredths of a unit above the terrain** rather than sunk,
    because the jittered surface otherwise hides most of the ribbon.
32. **Turn zero is new green.** The season function clamps turn zero to the first season; before
    the fix the arrival frame rendered black because the season index went negative.

## Left out of version one

- Rival diplomacy offers (`flags.rivalDiplomacyOffers: false`).
- Fog of war (`flags.fogOfWar: false`, structure in place).
- A goods-for-goods predecessor exchange (see 13).
- Patrol and haul orders have no sheet to author them; they exist in the sim and the orders
  system runs them, and the unit sheet can clear them. A route-building sheet is the next
  interface piece.
- The Roboto Light size 10 document preference applies to documents, not to this repository's
  Markdown.
