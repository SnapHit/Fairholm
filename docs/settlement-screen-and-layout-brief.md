# Settlement screen and screen layout

Version 2, written 23 August 2026. Self-contained. Companion to the feel brief, the interaction brief,
the art direction brief and section 8.2 of the legal distinguishability constraint.

**Purpose: specify the two things version one of the build got wrong because nothing specified them.**
The settlement screen was never designed at all, and "everything reachable lives in the bottom third"
was read as a permanent panel occupying a third of the display.

**What changed in version 2 of this brief.** Buildings moved out of a tab and onto the main screen,
wrapping the ring. **The whole settlement is visible at once, which is the actual pleasure of the
screen this is descended from.**

---

## 1. The map is the whole screen, always

**Correction to a misreading of the architecture brief.** "Everything reachable lives in the bottom
third" meant controls must fall within thumb reach. It did not mean a third of the display is
permanently spent on furniture.

- **The map fills the viewport, edge to edge, at all times**
- **Nothing is permanently parked over it.** Every panel either collapses to a bar or slides away
- The queue is a **single compact bar** at the bottom carrying the top item and a count. Tapping it
  expands the list; resolving or dismissing collapses it
- Sheets slide up over the map and dismiss by tapping away or swiping down
- The status line and the audio control are one line tall, in the top strip

**Test: with nothing selected on a quiet turn, the map occupies essentially the whole screen with two
thin strips over it.**

---

## 2. The settlement screen shows the whole settlement at once

**The governing principle.** Tiles, buildings, workers, goods, all on one screen without tabs for
anything you look at every visit. Only the standing orders, which are set rarely, sit behind a control.

### The layout, portrait, roughly 390 points wide

```
┌──────────────────────────────────────────┐
│  ‹  Ashvale · 8 · resolve 34%         ✕  │   header, one line
├────┬────────────────────────────────┬────┤
│ B1 │                                │ B4 │
├────┤          THE RING              ├────┤   ring 264pt, cells 88pt
│ B2 │        3 × 3, centred          │ B5 │   flanks 56pt each side
├────┤                                ├────┤
│ B3 │                                │ B6 │
├────┴────────────────────────────────┴────┤
│  B7   B8   B9   B10  →                   │   overflow row, scrolls sideways
├──────────────────────────────────────────┤
│  idle:  ◉ ◉                              │   only when someone is idle
├──────────────────────────────────────────┤
│  goods:  ▪ ▪ ▪ ▪ ▪ ▪  →                  │   scrolls sideways
└──────────────────────────────────────────┘
```

264 plus 56 plus 56 is 376, which fits 390 with margins. Ring cells at 88 points are double the 44
point tap floor; building slots at 56 are comfortably above it.

**This composition is deliberately not the original's.** Theirs is landscape, with tiles and buildings
as adjacent blocks. Ours wraps a narrow column around a central ring because that is what portrait
allows. Section 8.2 requires the difference to be real, and the format enforces most of it.

### What a ring cell shows without being opened

- **The terrain itself**, drawn from the same palette and tile data as the map. Not an icon. When the
  renderer improves, the ring improves with it and there is no second art pipeline
- **The good it yields and how much**
- **Who works it**, as a small marker, or nothing
- **Improvements**: road, cleared, drained, and a mark for a prime resource
- **Unavailable tiles are dimmed** and give their reason on tap: another settlement's, another
  charter's ground, or water without a wharf

The centre cell is the settlement, auto-worked, showing the settlement itself.

### What a building slot shows

- What it is and its tier
- **Its two worker slots**, filled or empty
- What it converts, and its output this turn
- A warning mark if it is starved of input, or if an imported machine is near failure

Slots fill left column top to bottom, then right, then the overflow row. **Buildings that could be
built appear at the end of the overflow row**, greyed, with their cost and gate.

---

## 3. Assignment, without drag and drop

Two paths, both one tap to start. **No dragging**, per section 5 of the feel brief.

- **Tap a tile or a building slot.** A sheet lists who could work it and what each would produce there,
  best first. Tap a person to assign
- **Tap an idle colonist, then tap a destination.** Every tile and slot where they would be useful
  highlights while they are held

Reassignment is the same gesture: tapping an occupied slot offers to move that person or swap them.

---

## 4. Goods and orders

**The goods strip** is always visible: what is stored against capacity, anything about to spoil marked,
and the current market price. Tapping a good opens consign, hold, or send to a named settlement.

**Orders** sit behind a single control in the header, because they are set once and revisited rarely.
They are the four rules from section 3 of the queue brief: purpose, surplus, growth, build order, each
settable to *ask me*.

---

## 5. Moving between settlements

**Previous and next in the header**, and a horizontal swipe on the ring does the same. In a
thirty-settlement empire, returning to the map to reach the next one is the difference between a round
and a chore.

---

## 6. Mechanics first, beauty later, without painting into a corner

Three decisions now that make the later beauty pass cheap rather than a rewrite.

1. **Ring cells render real terrain data**, so they inherit every renderer improvement automatically
2. **Cells and slots are evenly spaced on a simple grid**, so a later version can animate, add depth,
   or show the settlement growing without the layout changing
3. **No chrome, no borders, no frames.** Tiles and slots on the background. Every frame added now is
   something to remove later, and framing is precisely what section 8.2 warns about

What beautiful will mean later: the ring reading as an aerial view of a real place rather than a grid
of swatches, the season visible in it, the settlement growing at the centre across the three eras, and
yields appearing on touch rather than sitting permanently on the tiles.

---

## 7. What this screen must never become

Per section 8.2 of the legal constraint, which has now withdrawn two prohibitions and therefore rests
entirely on this:

- **No reproduction of the original's composition, ordering or proportions**
- No wooden panel dress, no typeface pastiche, no reproduction of its icon set
- No goods bar reproducing its arrangement
- **A recolour of their layout is still their layout.** The difference must be structural

---

## 8. What must be tuned by playing

- Whether 88 points a ring cell and 56 a building slot is the right split, or the ring should take more
- Whether six flanking slots plus an overflow row covers a mature settlement, or the overflow becomes
  the main event
- Whether tap-destination-then-person or tap-person-then-destination is the one people reach for
- Whether the goods strip earns permanent space or should collapse

---

## 9. If something here is wrong

Say so rather than working around it.

The riskiest claim is section 1's test: that a compact queue bar carrying one item is enough at rest. If
a busy turn expands it constantly, the bar becomes a panel by another route and the map is back to half
a screen.

The second is section 2's arithmetic. 376 points of content in a 390 point viewport leaves very little,
and a device narrower than 390, or a large system font, will break it. The layout must reflow rather
than clip: on a narrow screen the flanking columns move below the ring.
