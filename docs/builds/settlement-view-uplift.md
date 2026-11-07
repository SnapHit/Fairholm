# Build brief: the settlement view uplift

Written 7 November 2026 for one coding session. The design is version 3 of
`docs/settlement-screen-and-layout-brief.md`; this file says how to build it and how to show it works.
`CLAUDE.md` overrides anything here. Where this file and the design brief disagree, the design brief
wins.

## The goal

Today the settlement screen is text and swatches: flat colour cells with circles for trees, letters for
workers, buildings as grey cards in 56 point columns, goods as sentences, and the bottom half of a
phone empty. Make it rich at a glance by letting pictures carry the information. The ring becomes the
real map. Colonists stand where they work. Buildings are drawn as a street. Anything being built shows
its frame. Goods become compact and show how full their store is.

## Read first

- `src/ui/settlement.ts`: the screen as it is. `src/ui/selectors.ts`: `ringCells`, `buildingSlots`,
  `goodsStrip`, `destinationsFor`. Every number the screen needs already exists; **nothing under
  `/src/sim` changes in this work**
- `src/render/scene.ts`: `readFrame` (render target and read back), `updateLod`, `lockLod`,
  `applyTierVisibility`, `updateRings`. `src/render/camera.ts` for the orientation (`up` is `-z`)
- `src/render/tiles.ts` (`tileLook`) and `terrainLayers` in `settlement.ts`: keep both, as the
  fallback and for the founding preview (decision 108), which this work leaves alone
- `src/render/sprites.ts` and `src/render/settlement-atlas.ts`: the early era sheet, seven pieces,
  `frame` among them. `public/textures/units.json`: the `colonist` piece
- `src/ui/style.css` (the settlement section), `src/ui/theme.ts`, `src/render/look.ts`
- `DECISIONS.md` 34 to 50 (the version 2 screen), 40 (the swatches, which this supersedes) and 108

## Phase 0: the rig, and a before picture

Write `scripts/settlement-view.mjs`, modelled on the existing rigs. It opens the settlement screen and
shoots into `shots/settlement-view/`:

- Portrait 390 by 844, portrait 393 by 742 (the owner's phone), portrait 390 by 664 (a phone with
  browser bars), narrow 320 by 640, landscape 844 by 390, and 390 by 844 with a 20 pixel root font
- Two settlements: an early one (founding plus a few turns, three colonists) and a mature one (eight to
  twelve colonists, four or more buildings, something under construction, someone idle). Get the
  mature one by playing the competent policy from `src/sim/policy.ts` inside the page, or by laying a
  state out through `applyAction`
- One shot with an idle colonist picked, showing where they could go; one just after an assignment

Run it once before changing anything and keep those as `before-*.png`. Commit the rig and the before
set.

## Phase 1: the ring is the map

- A Scene method that draws the nine tiles around a tile into something the DOM can show: its own
  orthographic camera, straight down and oriented exactly as the map's, framing the three by three plus
  a margin of about a quarter tile for the soft edge. For that one render: the full detail tier on
  (props, fine props, close settlements and units, billboards), selection marks and overlays hidden,
  the terrain's own grid drawn or not, whichever reads better under the hairlines. Restore everything
  after. Render target, `readRenderTargetPixels`, flip rows, `putImageData` into a 2D canvas
- **Never a second WebGL context. Never move the player's camera.**
- Pixel size: the ring's CSS size times `min(devicePixelRatio, cap)`, the cap a number in `look.ts`
- **Colours must match the map.** Measure three tiles in the ring against the same tiles on the map at
  detail zoom; within a few levels per channel. Watch the colour space of a render target
- **Cache it.** Key on the settlement, the turn, the ring's pixel size, the settlement's composition
  (the pieces `piecesFor` would choose and the population) and the units standing in the nine tiles.
  Assigning a worker does not redraw the picture; it moves a DOM figure
- If the context is lost or the draw fails, the ring falls back to today's swatches without an error
- Over the picture, in the DOM: a hairline grid, a veil on unavailable tiles, nine transparent tap
  targets with today's behaviour (`settlementTapTile`), and the swipe for previous and next as now
- If the snapshot proves unworkable after a real attempt (colours cannot be matched, or it costs more
  than 150 ms at a device pixel ratio of 1 on the rig), stop, record why in `DECISIONS.md`, keep the
  swatches, and carry on with phases 2 and 3

## Phase 2: figures and yields

- One DOM helper that draws any atlas piece at a given height from its manifest (units sheet,
  settlement sheet) as a cropped background image. The ring and the town both use it
- A figure on each worked tile, feet in the lower part of the cell, the standing as zero to three
  chevrons beside the feet, and a yield pill beside it. A faint best yield pill on each unworked tile
  that could be worked. The centre's own yield as a pill
- The seams, each one function with a comment naming the art it waits for: `figureFor(colonist)`
  (today always `colonist`; later the trades sheet), `goodMark(good)` (today the word; later the goods
  icons), and the building table in phase 3
- An assignment shows its figure settling in under 200 ms. No continuous animation. Idle draws nothing

## Phase 3: the town and the layout

- Remove the flanks and the overflow row. Portrait: header, ring, town, goods. Landscape: ring on the
  left, town over goods on the right. Narrow screens and large type reflow and scroll; nothing clips.
  On 390 by 664 the town and the goods must be visible without scrolling
- The town as section 2 of the design brief describes: the settlement's own ground (the centre tile's
  `tileLook` colour) as the street; buildings as pictures at one scale with a stagger deterministic
  from the settlement and the line; names under; workers as figures at the door and empty places as
  faint outlines; an output pill; the warning mark. The building in progress as the `frame` picture
  with its progress, tapping it opens the build order. Buildable options as faint plots at the end with
  their cost and their gate on tap, behaving as the unbuilt slots do today. Idle colonists as figures
  at the head of the street; tapping one picks them and marks every tile and building that can take
  them, as `destinationsFor` does today; Assign all stays beside them
- `BUILDING_PICTURE`, one table from every building line to one of the seven early pieces, with a
  comment naming the three building sheets it waits for. The palisade and the works will borrow
- The goods strip: each good as its mark and stock, the change this turn small, and a fullness bar
  that warms near capacity and takes the warning colour when it spoils. Tap opens the good's sheet as
  today. Market at the head of the strip
- The header gains a more control for Build order, Equip, School, Hulls and Everything here. Every
  action that was on the screen stays reachable in at most two taps. Notes take one line under the
  header
- Last, only if it goes in cleanly: units on the settlement's tile stand at the far end of the street,
  and tapping one closes the screen and selects it on the map. If it does not go in cleanly, record it
  and leave it

## Phase 4: verify and record

- Rerun the rig into `shots/settlement-view/` and look at every picture yourself. Then answer, with
  measurements, in the final report:
  1. Does the ring read as a picture of a real place, with colours matching the map? Give the three
     tile differences
  2. Can you tell who works where, and what each tile and building makes, without reading a sentence?
  3. Do header, ring, town and goods fit 390 by 664 and 393 by 742 without scrolling? What fraction of
     the screen does each take?
  4. Do 320 wide, landscape and the large font reflow without clipping?
  5. How long does the ring take to draw on the rig, at what pixel size, and is anything drawn while
     the screen sits open? It must be nothing
  6. Does assigning, reassigning and picking an idle colonist still work by tap alone?
- `npm run typecheck`, `npm test` and `CHROMIUM=/opt/pw-browsers/chromium npm run smoke` all green. No
  pin moves, because nothing in `/src/sim` changes. Update the smoke test and any rig that reached into
  the old screen's classes, keeping what each check means
- `DECISIONS.md`: new entries numbered on from the last, decision 40 marked superseded. `TUNING.md`:
  rows for the new numbers. `RISKS.md` if anything new is fragile. Correct the design brief only where
  the build proved it wrong, with a dated line saying so

## How to work

- **Commit at the end of each phase, on `main`. Do not push**: the session that commissioned this
  reviews and pushes. No branches, no pull requests
- **No adversarial or multi-agent review workflows.** They exhausted the account's session limit
  before. Review your own riskiest code instead
- Every render number in `src/render/look.ts`, every interface token in `src/ui/theme.ts`; no literals
  in `style.css`
- No new dependencies. No change to the save format. Nothing under `/src/sim`
- Australian spelling, sentence case, no em or en dashes anywhere, and none of the forbidden words in
  `CLAUDE.md`, commit messages included
- The final report is under 300 words: the commits, the six answers, and what did not work the way
  this brief assumed
