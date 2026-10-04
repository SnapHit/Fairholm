# Feel: input, gesture and audio

**Changed 4 October 2026, for movement again.** Tested on a phone, hold to plot and then tap to go did
not work as an interaction. Movement is now one continuous gesture: press and hold the destination to
see the route, slide to re-aim, let go to move. Tap selects; hold aims; release moves; nothing else
commits a move. The Go control, the tap on a route's end and Clear are gone. Sections 1, 4 and 5 say so.

**Changed 3 October 2026, for choosing a unit.** A tap anywhere on a unit's drawn picture chooses it,
never on a target under 44 points, and the chosen unit wears a ring and an outline that do not move.
Section 3 says so.

**Changed 2 October 2026, for movement.** All movement is one gesture: tap and hold the tile to go to.
The hold plots the route and moves nothing; a tap on the route's end, or the Go control in the bottom
third, commits it. A tap on the map never commits anything, except on the end of a route the player
has just plotted. Sections 1, 4 and 5 say so.

Written 22 August 2026. Self-contained. Companion to the browser game architecture brief, the
interaction, session and persistence brief and the art direction and rendering brief.

**Purpose: constrain the moment-to-moment feel for the whole build, not as a late polish pass.**
Everything here is a requirement present from the first line of code, because all of it is expensive to
retrofit and none of it can be bolted on afterwards.

---

## 1. The gesture set, complete

Three gestures. There are no others, and nothing in the game may require anything else.

| Gesture | Meaning | Always safe? |
|---|---|---|
| **Pinch** | Zoom, continuous | Yes |
| **Drag** | Pan | Yes |
| **Tap** | Select and inspect | **Yes. Never commits anything** |
| **Hold, aim, release** | Press and hold a tile to see the route there for the chosen unit; slide to re-aim; let go to move along it. Nothing moves until the finger lifts | Yes. The route is on the screen before anything happens, and a release on the unit, on the interface or on a tile that cannot be reached moves nothing |

**The rule underneath: tap selects; hold aims; release moves; nothing else commits a move.** A tap on
the map never commits anything, so nothing on the map happens without the player having first seen
what it will do: the route is under the finger before the release that commits it. That is the "first
tap is never destructive" rule from section 2 of the interaction brief, implemented as a gesture
instead of as a two-step interface. It is one consistent idea across the whole game, and it applies to
every unit and every kind of movement: colonists, soldiers, haulers, ships and the lander; boarding and
going ashore; routes of several turns and routes that start next turn. There is no other way to move a
unit.

---

## 2. Pinch zoom, which must be fluid

**A requirement, not an aspiration.** Jerky zoom is the single most common way a browser game on a phone
reads as cheap.

### What is required

- **Continuous scale throughout the gesture.** No snapping to zoom levels while fingers are down. Snap
  points exist only for double-tap
- **Anchored on the pinch centroid.** The point of the map between the fingers stays under the fingers,
  exactly, for the whole gesture. Getting this wrong is what makes zoom feel like it is fighting you
- **Momentum on release**, for both pan and zoom, with rubber-banding at the limits
- **Sixty frames per second for the duration of the gesture**

### The consequence for the renderer

**While a gesture is active the on-demand renderer switches to continuous.** Section 3 of the
architecture brief says draw only when something changes; a gesture is something changing every frame.
Progressive refinement covers the cost: render cheap while the fingers are down, refine once they lift.

### Level of detail must be hysteretic

**The most common cause of stutter, and it is not framerate.** If props cull at exactly 44 pixels a
tile, crossing that threshold makes them flicker on and off.

- **Cull at one value, restore at a wider one.** Cull below 40, restore above 48
- **Cross-fade rather than switch** wherever a fade is affordable
- **Never rebuild geometry during a gesture.** Any level-of-detail change that requires a rebuild waits
  until the gesture ends

### Also required

- `touch-action: none` on the canvas, and `-webkit-touch-callout: none`, or iOS Safari will hijack the
  gesture
- Pointer Events, not touch events, so the same code path serves mouse and pen

---

## 3. Tap: select and activate

**One tap is the primary interaction for everything.**

- **Tapping a unit activates it.** It becomes the active unit and its actions appear in the bottom third
- **Tapping a settlement opens its sheet.** One tap, not two
- **Tapping empty ground deselects**

### Hit areas

- **A tap anywhere on a unit's drawn picture selects it**, for every unit and every hull, including
  the parts that overhang neighbouring tiles: masts, the lander's length, a rider's head
- Taps are tested against each visible picture's screen rectangle, **front-most first** in the order
  the pictures are drawn, before falling back to the tile. Where a picture is clear the tap goes
  through it to what is drawn behind, and a unit beats a building wherever the unit itself is drawn.
  A tap on a tile with one of the player's units on it is a tap on that unit
- **Every unit's target is at least 44 points** in each direction, even when its picture is smaller
- Tapping a stacked tile opens the chooser below
- **Tapping the selected unit again, or empty map, deselects**

### The highlight

- The selected unit has **a bright ring in its owner's colour under it and a clean outline around its
  picture**, readable on every terrain, on water and in fog
- **Static once shown.** At most a brief flash on selection. The frame loop goes idle while a unit
  sits selected; there is no continuous pulse

### Stacked units

When a tile holds more than one unit, **one tap opens a chooser**, and it must be beautiful because it
is one of the most frequently seen surfaces in the game.

- It is a **bottom sheet**, not a popup at the tile. The tile is under a finger and a popup there is
  occluded by the hand
- It animates in, is dismissible by tapping away or swiping down, and lists units with what each one
  is, its condition and its orders
- Tapping an entry activates that unit and dismisses the sheet
- **It never appears for a single unit.** One unit on a tile activates directly

---

## 4. Hold, aim and release: moving a unit

**With a unit chosen, press and hold a tile: the route there appears. Let go: the unit moves along it.**
One continuous gesture, from the finger landing to the finger lifting:

- **Tap** chooses the unit. A tap never commits a move
- **Press and hold a tile.** After the hold threshold the route appears on the map from the unit to
  that tile, with its turn markers, its stretches through fog and, for an attack, the odds, and the
  card shows it in one line. A short vibration marks the hold engaging, where the device has one
- **While holding, slide to re-aim.** The route follows the finger live. Holding near an edge of the
  visible map scrolls it, so a tile six away is reachable in one gesture; the card and the top strip
  are not scroll edges. A quick drag before the hold engages is still a pan; once the hold has
  engaged, moving re-aims and never pans
- **Let go to move**, along the route shown at the moment of release. The unit goes as far as it gets
  this turn, and a route of several turns keeps going at the start of each turn after

### Changing your mind

Each of these moves nothing, and the unit stays chosen, ready for another hold:

- **Release on the chosen unit's own tile**
- **Release over any part of the interface**, the card or the top strip
- **Release on a tile that cannot be reached.** The card says why
- **A second finger** cancels the hold and becomes a pinch
- **Undo** stays, for a move that was meant and then regretted

### What the route shows

- **The path itself**, drawn clearly over the terrain and the fog in the theme's colours
- **Where each turn ends**, as numbered markers, so a trip of several turns shows how long it takes
- **Stretches through ground nobody has seen drawn differently**, because the planner is guessing
  there: a course through unseen water stops at any coast it meets
- **An attack.** If the last step is an attack, the route says so and shows the odds, computed from
  the same best of three resolution the fight uses, and says when it would be a declaration of war.
  **An attack commits on release only if its odds have been on the screen for at least half a
  second.** Released sooner, nothing happens and the card says to hold a moment longer. Sliding
  across an enemy on the way to somewhere else never attacks
- **Why not.** If the tile cannot be reached, the route says why instead of drawing a way: a ship
  holding land, a land unit holding water, terrain or others' units in the way. A unit with no moves
  left shows its route all the same, marked as starting next turn, and the release sets it off then
- **Founding is never a release.** With the lander chosen, holding a shore beside it shows the
  founding preview; letting go moves nothing, and the card offers Found here. Going ashore without
  founding is a passenger's step: tap the aboard count on the lander's card to choose one, then hold
  the shore and let go

### Reach

A move of several tiles can be further than a tappable zoom shows. Three things answer that:

- **Holding near an edge of the free map scrolls it** under the still finger, and the route follows
- **The unit stays chosen while the map is panned**, so the player can pan to a far tile and hold it
- **A destination hold works at zoomed-out levels where ordinary taps do not**, down to the zoom where
  the route can still be read. The 44 point floor in section 5 exists to stop a mis-tap committing the
  wrong thing; a hold commits nothing, so a slightly wrong tile shows in the route and is put right by
  sliding, and only the release commits

### What makes it feel right rather than sluggish

- **450 milliseconds to engage**, not the platform default of 500 (decision 49)
- **Immediate visual feedback from the first frame of contact.** A ring fills under the finger, and the
  route appears the moment it is full, with a short vibration. The player never waits without knowing
  they are waiting
- **Moving beyond a small threshold before the hold engages cancels it and becomes a pan.** This must
  be tuned carefully, because thumbs are imprecise
- **Releasing before the hold engages is a tap**, with no effect beyond a tap's and no penalty

### The discoverable path, which is required

The gesture is invisible to anyone who has not been told. So the card of an idle unit says it in its
one line, "hold where to go, and let go to set off", and per section 4.6 of the onboarding brief the
first queue items teach it in their wording: hold where you want to go, and let go to set off. There
is no Go control and no tap on the route's end: one gesture, taught in words where the player is
already looking.

---

## 5. What is forbidden

- **Drag and drop, anywhere.** Imprecise, the finger covers the target, no hover state to guide it.
  Sliding to re-aim a held route is not dragging the unit: the unit stays where it is, the route under
  the finger is what moves, and nothing happens until the release. Dragging a unit itself is still
  forbidden
- **Double-tap for anything except zoom**
- **Multi-finger gestures beyond pinch**
- **Any action that is only reachable by hold**, per section 4, except movement itself, which is one
  gesture and is taught in words
- **A tap on the map that commits anything**
- **Any way to move a unit other than hold, aim and release.** No Go control, no tap on a route's end,
  no confirming step
- **Confirmation dialogs.** Undo instead, backed by the action log. The route under the finger is not
  one: it is the plan, shown on the map, and letting go is where the move is committed
- **Anything requiring precision below 44 pixels**, except the destination hold of section 4, which
  commits nothing until the release and is put right by sliding

---

## 6. Audio: four tracks

Supplied at **112 kbps CBR, joint stereo, 44.1 kHz**, artwork and metadata stripped.

| Order | File | Length | Size |
|---|---|---|---|
| 1 | `01-echoes-of-the-unmapped.mp3` | 5:00 | 4.20 MB |
| 2 | `02-echoes-of-the-unmapped-ii.mp3` | 7:14 | 6.07 MB |
| 3 | `03-pendulum-of-glass.mp3` | 3:24 | 2.85 MB |
| 4 | `04-marginalia.mp3` | 3:28 | 2.91 MB |
| | | **19:05** | **15.3 MB** |

They live in `/public/audio/` and are served as static files.

### The budget problem, and its answer

**The architecture brief's target is under 1 MB over the wire and playable in about a second. Track one
alone is four times that.**

So the rule is absolute: **no audio is part of the initial payload.** The HTML, the renderer and the
world load and become interactive with **zero bytes of audio requested**.

### Stream, never fetch

**A correction worth stating plainly, because getting it wrong misses the target on every connection.**

**Do not `fetch()` a track and then play it.** MP3 is progressively streamable: set `src` on an audio
element and call `play()`, and the browser begins playback once a few seconds are buffered rather than
waiting for 4.2 MB.

**Target: music audible within five seconds of the player tapping to begin.** Streaming meets that on
most connections; fetching meets it on none.

### The sequence

1. **The page loads and shows the coastline.** No audio requested
2. **The player taps to choose a landing site.** That gesture unlocks audio on every mobile platform,
   and it is the moment track one's `src` is set and `play()` is called
3. **The track fades in over about two seconds** from silence, so it arrives rather than starts
4. **The next track preloads during the current one**, using a second element with `preload="auto"`,
   begun at roughly the two-thirds mark. Never more than one track in flight
5. **The four tracks play in the numbered order, then the set loops, forever.** Cross-fade of about two
   seconds at every boundary, including the wrap from four back to one, so there is never silence
6. If a fetch fails the game continues silently and retries at the next boundary. **Audio never blocks
   anything and never throws**

### Controls

**Default state at first play: music on.** Unambiguously on, at a sensible volume.

A **single small speaker icon**, which expands on tap into a compact strip and dismisses when tapped
away. The strip carries exactly four things:

| Control | Behaviour |
|---|---|
| **Pause and resume** | Holds position in the current track |
| **Next track** | Advances immediately with a short cross-fade. Wraps at the end |
| **Mute** | Silences without stopping playback or the loop |
| **Volume** | A slider, continuous |

**Placement: a top corner, deliberately outside the thumb zone.** This is the one control in the game
that is better hard to reach, because it is touched perhaps twice a session and an accidental tap is
worse than a slightly awkward deliberate one. The bottom third stays reserved for the actions used
every turn.

All four settings persist with the save. A muted or paused player still streams, because muting is not
the same as switching audio off; the only state that prevents any download is a player who has never
tapped to begin.

### What is not being built

**No sound effects in version one.** Section 12 of the build specification lists audio as a silent hook,
and that stands for effects. Music is the exception because it exists and is ready.

---

## 7. What must be tuned by playing

- **The hold duration.** 250 ms is a starting value. Too short and pans trigger actions; too long and
  the game feels slow
- **The pan cancellation threshold for the hold**, which is the same trade from the other side
- **Zoom momentum and rubber-band strength**
- **The level-of-detail hysteresis band.** 40 and 48 are starting values
- **Cross-fade length**, and whether two seconds is right for these particular tracks

---

## 8. If something here is wrong

Say so rather than working around it.

The riskiest requirement is section 4. Tap and hold as the primary verb is elegant and consistent, and
it is also a gesture with a built-in delay used for the most common action in the game. If it proves
sluggish in play, the fallback is not to abandon it but to shorten the hold and strengthen the feedback,
and only then to promote the bottom-third control to the primary path.

The second riskiest is that fifteen megabytes of music on a self-hosted site behaves well on a phone
connection. The lazy loading in section 6 is the mitigation, and if it still causes trouble the answer
is to ship fewer tracks rather than to compress them further.
