# Build brief: pictures in the interface

Written 21 November 2026 for one coding session. The design is section 11a of
`docs/art-direction-and-rendering-brief.md` and the goods shelf in section 2 of
`docs/settlement-screen-and-layout-brief.md`. `CLAUDE.md` overrides anything here; where this file
and a design brief disagree, the design brief wins.

## The goal

The game's sheets are sentences. The goods are words, the market is a table, the build order is a
list of costs, people are "debtor (Food 3)", and "2 of twelve" is how the signatories are shown. The
owner asked for the goods to look like goods and for every other boring text display to become
something visually impressive, with a free hand. Make the interface show things: a shelf of goods,
a market board, a catalogue of buildings, people as figures, hulls as hulls, meters for levels and
tallies for counts.

## What exists

- **The icon set is drawn and committed**: `src/ui/icons.svg` (33 symbols) and `src/ui/icons.ts`
  (`installIcons`, `icon(name)`, `SEASON_ICONS`). Read the svg's symbol ids for the names. Do not
  redraw them. If one is unreadable at the size you need, fix that icon minimally and record which
  and why
- `src/ui/pictures.ts`: `atlasPicture`, `standingFigure`, `emptyPlace`, `standingUnit`, `unitPiece`,
  `BUILDING_PICTURE`, `chevrons`, `yieldPill`, and `goodMark`, which returns a word today
- `src/ui/settlement.ts`, `ring.ts`, `town.ts`: the settlement screen. `src/ui/sheets.ts`: every
  other sheet. `src/ui/app.ts`: the HUD (`renderHud`), the queue bar and cards, `withTerms` (which
  turns known words into glossary links)
- `src/sim/market.ts` and `C.market.goods`: each good has `open`, `floor`, `ceiling` and, per
  charter, `price`, `baseline` and `pressure` (selling pushes the price below its baseline)
- A survey of every sheet as it is, at 393 by 742 on a mature game, was taken before this brief was
  written. The worst offenders, in order: the market, the build order, hulls, equip and school, the
  settlement detail, the HUD, the signatories, the declaration, the good sheet

## Phase 0: the rig, and a before set

Write `scripts/interface-pictures.mjs`, modelled on `scripts/settlement-view.mjs` (same way of making
an early and a mature game). It shoots into `shots/interface-pictures/` at 393 by 742: the map with
its HUD, the settlement screen, the queue, the dispatch, the market, a good's sheet, consign, buy, the
build order, hulls, equip, school, who works a building, who works a tile, the settlement detail, a
hauler's sheet and cargo, a tile, the declaration, the signatories, the other charters, a
predecessor, the resume card. Also the settlement screen, the market and the build order at 320 by
640 and 844 by 390. Run it before changing anything and keep those as `before-*`. Write JPEG at
quality 85, not PNG: the last rig's PNGs added 25 MB to the repository. Commit.

## Phase 1: the icons in place, and goods everywhere

- `installIcons()` once at start, before the first sheet renders. `.ic` in `style.css`, sized by new
  tokens in `theme.ts` (inline, pill, shelf, tile, hero, HUD), aligned to the text it sits in
- `goodMark(good)` returns the icon. Everything that goes through it changes at once
- **The goods shelf** on the settlement screen, as the settlement brief describes: each good as its
  icon standing on one shared shelf (a soft band in the raised surface colour under the row, not a
  box round each good), its stock below in large tabular figures, the change this turn beside it in
  small type (gain and loss in the palette's own colours), the fullness bar with a tick where the
  good's surplus rule starts to sell. Market at the head as the coin and the word. It still scrolls
  sideways and a tap still opens the good
- **Pills** in the ring and the town: icon and number, the word gone. The faint pill stays faint
- **The settlement header line**: the colonist icon and the count, the food icon and the balance, the
  resolve flame and its percentage
- **The HUD**: the season's icon (`SEASON_ICONS`) before the turn, the coin before the gold, the Word
  icon before the Word; each still opens its glossary entry. Fix the Word figure while there: the
  glossary showed `114.49999999999999 Word held`. Every Word figure goes through `fmt`
- **Inline in sentences**: where `withTerms` links a good's word, the good's icon sits before it at
  inline size, in the dispatch, the queue cards and the glossary
- A test that every `GoodId` and every `IconName` has a symbol in `icons.svg`, reading the file as
  text. Commit

## Phase 2: the market and a good

- **The market board** in place of the table: a grid of goods, two across on a phone, three from 600
  points. Each tile: the icon at tile size, the name, what is held here, sell and buy beside the coin
  icon, and **a price gauge**: a track from the good's floor to its ceiling, a marker at today's
  price, a small tick at its opening price, and, when selling has pushed the price below its
  baseline, the gap between them shaded, so a dumped good is visibly dumped. Buy and Sell stay on the
  tile. The header carries the Company's banner in the Company colour and the charge as a percentage
- **A good's sheet**: the icon at hero size, the stock against capacity on the fullness bar with the
  rule's tick, the price gauge, and the rule's choices with icons where one fits (hold is the crate,
  consign is the coin)
- **Consign and buy**: the icon at hero size, the slider as it is, the gold beside the coin icon, and
  the price gauge with a ghost marker where the price will stand after this lot. Work that from the
  market's own formula through a pure helper; a pure, read-only function in `src/sim/market.ts` is
  allowed, nothing that changes behaviour. Commit

## Phase 3: buildings, hulls and people as pictures

- **The build order as a catalogue**: a two across grid of cards, each with the building's picture
  (`BUILDING_PICTURE`, through `atlasPicture`), its name, what it turns into what as icons (ore, an
  arrow, metal) or its role in a word and an icon where one fits, and its cost as icons and numbers
  (frame, tooling, or the coin for an imported machine). A gated card is faint and gives its gate on
  tap. What is under way leads the sheet as the frame picture with a progress bar for each cost, its
  icon at the end of the bar. Queued buildings are their pictures, in order
- **Hulls**: each hull's picture (`unitPiece`), its speed as pips beside the sail, its guns beside the
  cannon, its hold beside the crate, its cost as icons, and the wharf it needs
- **People**: in equip, school, who works a building and who works a tile, each person is their
  figure (`standingFigure`) with their standing and what they do now as an icon and a number, then
  the actions. Equip's choices are the units' pictures with their costs as icons
- **The settlement detail**: what is made this turn as icons with signed numbers and short bars to
  scale, and what is in store as icons with fullness bars
- **A unit's sheet**: its picture, its quality, its moves as pips; cargo as icons with amounts and a
  bar for the hold. A **tile's sheet**: yields as icon chips. If it goes in cleanly, the tile's sheet
  also shows the place itself, small, drawn by `Scene.drawRing`. Commit

## Phase 4: meters and tallies

- **The declaration**: resolve as a bar with the flame, a tick at the threshold it needs, and the
  recall fleet's strength as small hull pictures, one each up to a dozen and then a number
- **The signatories**: twelve seals in a row, whole for those who have signed and faint for those who
  have not, each signatory's row led by a seal; what they seek with icons (trade the coin, land the
  sprout, arms the rifle, voice the letter)
- **The other charters**: each led by its banner in its own colour, its relation as a marker on a
  three step track (peace, tense, war), its settlements as a number
- **Queue cards, the dispatch and the resume card**: a leading icon by kind where one fits: the good
  for goods, the cannon for raiders and war, the frame for build orders, the colonist for people and
  idleness, the coin for money owed or due, the letter for Word and passage, the seal for
  signatories, the banner for rivals, the flame for the declaration, the season on the resume card
- **A predecessor's sheet**: what they have and what they want as icons. Commit

## Phase 5: verify and record

- Rerun the rig and look at every after picture beside its before. Then answer, in the final report:
  1. Can every good be told from every other at 20 pixels? Name any two that are confused
  2. Which sheet is still mostly words where a picture would serve, and why it was left?
  3. Does the market show a dumped good at a glance?
  4. Does the build order read as a catalogue, and the shelf as a shelf?
  5. How long do the settlement screen and the market take to open on the rig, before and after?
  6. Does every control that an icon sits in still say what it is in words, to a screen reader?
- 320 wide, landscape and a 20 pixel root font reflow without clipping. Icons are crisp at device
  pixel ratios 2 and 3
- `npm run typecheck`, `npm test` and `CHROMIUM=/opt/pw-browsers/chromium npm run smoke` green. The
  smoke test's first check, boot within about a second, fails in this sandbox's software renderer
  before and after; say if it got worse. Update the smoke test or any rig that reached into changed
  markup, keeping what each check means
- `DECISIONS.md` entries numbered on from the last, `TUNING.md` rows for the new tokens, `RISKS.md` if
  anything new is fragile. Correct the design briefs only where the build proved them wrong, with a
  dated line

## How to work

- **Commit at the end of each phase, on `main`. Do not push**: the commissioning session reviews and
  pushes. No branches, no pull requests
- **No subagents and no review workflows.** Review your own riskiest code by reading it
- Every interface token in `src/ui/theme.ts`, every render number in `src/render/look.ts`, no
  literals in `style.css`
- Nothing under `/src/sim` changes, except the pure helper phase 2 allows. No new dependencies. The
  save format is untouched
- Australian spelling, sentence case, no em or en dashes anywhere, none of the forbidden words in
  `CLAUDE.md`, commit messages included
- The final report is under 300 words: the commits, the six answers, what did not work the way this
  brief assumed, and the paths of the five after pictures that best show the change, each with its
  before
