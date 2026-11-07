# Settlement screen and screen layout

**Corrected 7 November 2026, after the build.** Two claims in section 2 were wrong and are corrected
where they stand: the ring's size and its cells, because the soft edge takes a quarter tile on each
side, and a hull at the far end of the street, because a hull never stands on a settlement's own
tile. `DECISIONS.md` 164 to 175 record the build.

**Changed 7 November 2026, version 3.** The screen now carries its information in pictures, which is
what made the source game's settlement screen loved. The ring is a live aerial picture of the nine
tiles drawn by the map's own renderer. Colonists stand as figures on the tiles they work and at the
doors of the buildings they staff. The buildings are drawn, as a street. Anything being built shows
its frame. Portrait stacks the ring over the town; landscape puts them side by side. The flanking
columns and the overflow row are gone, because an illustrated building cannot live in a 56 point
column. Section 2 is rewritten; sections 3, 4, 6, 7, 8 and 9 are updated to match.

**Changed 3 October 2026.** The map is the hero: section 1 now says every panel opens at the smallest
size that answers the question and grows only when the player asks.

**Changed 1 October 2026.** Water tiles no longer need a wharf to be worked, so the ring's list of
reasons a tile is unavailable drops that one. The opening is being replaced by the one the original
game is loved for: you begin at sea in fog with no knowledge of the world, sail until you find land
and choose your own ground, and anchorages are gone entirely, so settlements may be founded almost
anywhere.

Version 2, written 23 August 2026. Self-contained. Companion to the feel brief, the interaction brief,
the art direction brief and section 8.2 of the legal distinguishability constraint.

**Purpose: specify the two things version one of the build got wrong because nothing specified them.**
The settlement screen was never designed at all, and "everything reachable lives in the bottom third"
was read as a permanent panel occupying a third of the display.

---

## 1. The map is the whole screen, always

**Correction to a misreading of the architecture brief.** "Everything reachable lives in the bottom
third" meant controls must fall within thumb reach. It did not mean a third of the display is
permanently spent on furniture.

**The map is the hero. Every panel opens at the smallest size that answers the question and grows
only when the player asks.**

- **The map fills the viewport, edge to edge, at all times**
- **Nothing is permanently parked over it.** Every panel either collapses to a bar or slides away
- The queue is a **single compact bar** at the bottom carrying the top item and a count. Tapping it
  expands the list; resolving or dismissing collapses it
- Sheets slide up over the map and dismiss by tapping away or swiping down
- The status line and the audio control are one line tall, in the top strip

**Test: with nothing selected on a quiet turn, the map occupies essentially the whole screen with two
thin strips over it.**

---

## 2. The settlement screen shows the whole settlement at once, in pictures

**The governing principle.** Tiles, buildings, workers and goods on one screen, without tabs for
anything you look at every visit. **Pictures carry the information and words confirm it.** A glance
tells you what the place is, who works where and what it makes before a number is read. Only the
standing orders, which are set rarely, sit behind a control.

**What we take from the source game, and what we do not.** We take the principle: the place drawn
as a place, people standing where they work, buildings you can see, the goods at a glance. We do not
take the panel: its composition, its parchment and wood, its icon set, its arrangement of the goods.

### The layout, portrait, roughly 390 points wide

```
┌──────────────────────────────────────────┐
│ ‹   The Landing               ⚙   ⋯   ✕ ›│   header
│     3 colonists · food +1 · resolve 0%   │
├──────────────────────────────────────────┤
│                                          │
│                                          │
│   THE RING                               │   the map's own picture of the
│   drawn by the renderer,                 │   nine tiles, full width less the
│   a figure on each worked tile,          │   margins, about 330 to 380 points
│   its yield beside it                    │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│   THE TOWN                               │   a street of building pictures,
│   idle figures, buildings with their     │   scrolls sideways
│   workers at the door, the frame, plots  │
├──────────────────────────────────────────┤
│   Market   goods and their fullness   →  │   scrolls sideways
└──────────────────────────────────────────┘
    the queue bar, as on every screen
```

- **The ring takes the full width less the margins**, unless that would push the town or the goods
  below the fold. On a 390 by 664 viewport, a phone with its browser's bars showing, the header, ring,
  town and goods all fit without scrolling. In practice the ring is about 330 to 380 points on a
  phone 390 points wide, and a cell is the ring over three and a half, because the soft edge takes a
  quarter tile on each side: 95 to 108 points, larger than version 2's 82 at that width. *Corrected
  7 November 2026: this said 300 to 360 and 100 to 120, which the soft edge makes impossible
  together. Measured, the ring is 332 points on 390 by 664 with a note showing and 377 on 393 by 742;
  on a 320 point screen it is 304 and a cell 87*
- **The town takes the height that is left above the goods**, and scrolls sideways when the street is
  longer than the screen
- **The goods strip sits at the bottom**, above the queue bar, and scrolls sideways
- On a screen narrower than 340 points, or with a large system font, everything reflows and the body
  scrolls; nothing clips

### The layout, landscape

```
┌───────────────────────────────────────────────────────────────┐
│ ‹  The Landing · 3 colonists · food +1 · resolve 0%   ⚙  ⋯  ✕ ›│
├──────────────────────┬────────────────────────────────────────┤
│                      │   THE TOWN, a street, scrolls sideways │
│      THE RING        │                                        │
│      square, as      │                                        │
│      tall as the     ├────────────────────────────────────────┤
│      space allows    │   Market   goods                       │
└──────────────────────┴────────────────────────────────────────┘
```

The ring sits on the left, square, as tall as the space under the header. The town and the goods
share the right. The ring comes first because the eye goes to it first; it also puts our map on the
side the source game's is not.

### What the ring shows

- **The place itself, drawn by the map's renderer**: ground, water, rivers, roads, trees, the
  settlement's buildings in the middle, any unit standing there, the season's light and the baked
  shadows. One picture of the nine tiles, drawn when the screen opens and again only when something
  it shows changes. When the renderer improves, the ring improves with it, and there is still no
  second art pipeline
- **A soft edge.** The picture runs a little past the nine tiles and fades into the background, so
  the place does not look cut out with scissors
- **A hairline grid** in the map's own grid colour, so nine tiles read as nine without frames
- **Who works each tile, as a figure standing on it**: the same figure the map draws for a colonist,
  with their standing as chevrons beside their feet, none for a debtor, one contracted, two free,
  three a master
- **What the tile yields**, as a small pill beside the figure: the number and the good. A tile that
  could be worked but is not shows its best yield, faintly
- **Unavailable tiles** sit under a veil and give their reason on tap: another settlement's ground,
  another charter's, the predecessors'
- **The centre is the settlement as the map draws it**, with its own yield as a pill

### What the town shows

The buildings stand in a row on the settlement's own ground, seen from the front and a little above,
like a street. Each shows:

- **Its picture**, at one scale for all, with a little stagger so the street does not read as a shelf
- **Its name**, small, under it
- **Its workers as figures standing at its door**, and each empty place as the faint outline of a
  figure, so a gap reads as a gap
- **What it makes this turn**, as a pill: the number and the good
- **A warning mark** if it is starved of input, or an imported machine is near failure

**Anything being built is its frame**: the frame picture the map already draws, with its progress
under it. Tapping it opens the build order.

**Buildings that could be built** stand at the end of the street as faint plots with their cost. A
gated plot gives its gate on tap.

**Idle colonists stand at the head of the street**, as figures, where they cannot be missed. **Units
in the settlement**, a garrison or a hauler, stand at the far end; tapping one closes the screen and
selects it on the map. *Corrected 7 November 2026: this named a hull at the wharf, but a hull never
stands on a settlement's own tile (`DECISIONS.md` 101); it waits on the water beside it, where the
ring's picture shows it.*

### What the goods strip shows

Each good as its mark and its stock, with what it is making this turn, and a thin bar under it for
how full the store is: plain when there is room, warm as it nears capacity, the warning colour when
it spoils. Price and the surplus rule move to the good's own sheet, one tap away. Market sits at the
head of the strip.

### The header

Previous and next, the name (tap to rename), one line of numbers, the orders control, and a more
control for Build order, Equip, School, Hulls and Everything here. A note, such as hunger, why
nothing can be consigned or the clerks needed, takes one line under the header when there is one.

### The art this screen is waiting for

Until these exist the screen uses what there is, through one seam each, so the art drops in without
the layout changing:

- **Buildings**: three sheets of six, one picture per building. Until then each building line draws
  the nearest of the seven early era pictures, from one table, and the name carries the difference
- **Goods**: one sheet of icons. Until then each good is its word
- **Trades**: one sheet of the colonist holding the tool of each trade. Until then every worker is
  the same figure

---

## 3. Assignment, without drag and drop

Two paths, both one tap to start. **No dragging**, per section 5 of the feel brief.

- **Tap a tile or a building.** A sheet lists who could work it and what each would produce there,
  best first. Tap a person to assign
- **Tap an idle figure, then tap a destination.** Every tile and building where they would be useful
  is marked while they are held

Reassignment is the same gesture: tapping an occupied tile or building offers to move that person or
swap them.

**The figure appears where it was sent**, on the tile or at the door, with a short settle of under 200
milliseconds. Nothing on this screen moves on its own.

---

## 4. Goods and orders

**The goods strip** is always visible, as section 2 describes. Tapping a good opens consign, hold, or
send to a named settlement, with its price and its surplus rule.

**Orders** sit behind a single control in the header, because they are set once and revisited rarely.
They are the four rules from section 3 of the queue brief: purpose, surplus, growth, build order, each
settable to *ask me*.

---

## 5. Moving between settlements

**Previous and next in the header**, and a horizontal swipe on the ring does the same. In a
thirty-settlement empire, returning to the map to reach the next one is the difference between a round
and a chore.

---

## 6. Beauty without painting into a corner

1. **The ring is drawn by the renderer itself.** Version 2 painted the renderer's colours as CSS, which
   kept the colour and lost everything else: the trees, the light, the buildings. Version 3 draws the
   real picture. If the renderer cannot draw, after a lost context, the ring falls back to the version
   2 swatches
2. **Every picture comes from a manifest through one seam**, so a new sheet replaces a placeholder
   without the layout changing
3. **No chrome, no borders, no frames.** Pictures and small pills on the background. Every frame
   added now is something to remove later

What beautiful will mean next: the settlement growing at the centre across the three eras, with the
middle and late era sheets; the building sheets, goods icons and trades in place of the placeholders;
and yields appearing on touch rather than sitting on every tile, if the pills prove to be clutter.

---

## 7. What this screen must not become

The legal constraint is a guideline in its own words, and where it conflicts with a design idea the
design idea wins. Where it costs nothing, the composition stays ours:

- The ring on the left in landscape; the source game's map is on the right
- Buildings as a street, rather than a field of buildings scattered over a backdrop
- Goods with how full their store is, rather than a bar of counts
- No wooden panel dress, no parchment, no typeface pastiche, no reproduction of its icon set

---

## 8. What must be tuned by playing

- Whether the ring should take more height, or give some to the town
- Whether a yield pill on every tile is information or clutter, and should appear on touch instead
- Whether one row of buildings carries a mature settlement, or the street wants two rows in landscape
- Whether units in the settlement belong on this screen at all
- Whether tap-destination-then-person or tap-person-then-destination is the one people reach for

---

## 9. If something here is wrong

Say so rather than working around it.

The riskiest claim is that the ring can be drawn fast enough on a cheap phone that opening the screen
does not stutter. It is one render of nine tiles and one read back. If it is felt, draw it smaller
first and sharpen it after, and record what was measured.

The second is height. Header, ring, town and goods must fit a 390 by 664 viewport, and with a large
system font they will not. The layout must reflow rather than clip.

The third is the placeholders. Seven pictures for eighteen buildings means the street repeats itself
until the building sheets exist, and the names carry it until then.

Still open from version 2: whether a compact queue bar carrying one item is enough at rest. If a busy
turn expands it constantly, the bar becomes a panel by another route and the map is back to half a
screen.
