# Feel: input, gesture and audio

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
| **Tap** | Select and inspect | **Yes. Never commits anything**, except on the end of a route the player has just plotted |
| **Tap and hold** | Plot a route for the selected unit to the tile held. Nothing moves | Yes. A route is a plan |

**The rule underneath: tap selects and inspects, tap and hold plots a route, and the route's end or the
Go control commits.** A tap on the map never commits anything, except on the end of a route the player
has just plotted, so nothing on the map happens without the player having first seen what it will do.
That is the "first tap is never destructive" rule from section 2 of the interaction brief, implemented
as a gesture instead of as a two-step interface. It is one consistent idea across the whole game, and
it applies to every unit: colonists, soldiers, haulers, ships and the lander. There is no other way to
move a unit.

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

## 4. Tap and hold: plotting a route

**With a unit active, tap and hold on a tile plots a route there.** Nothing moves. The player then
agrees and goes, or picks somewhere else:

- **Hold a tile:** the route appears on the map from the unit to that tile
- **Tap the same tile, the route's end, to go.** The Go control in the bottom third does the same
- **Hold a different tile** to plot again. **Tap anywhere else** to put the route away; the unit stays
  selected, ready for another hold

### What the route shows

- **The path itself**, drawn clearly over the terrain and the fog in the theme's colours
- **Where each turn ends**, as numbered markers, so a trip of several turns shows how long it takes
- **Stretches through ground nobody has seen drawn differently**, because the planner is guessing
  there: a course through unseen water stops at any coast it meets
- **An attack.** If the last step is an attack, the route says so and shows the odds, computed from
  the same best of three resolution the fight uses, and says when it would be a declaration of war.
  An attack needs a hold and then a tap on the route's end or the Attack control; a hold alone never
  attacks
- **Why not.** If the tile cannot be reached, the route says why instead of drawing a way: a ship
  holding land, a land unit holding water, a unit with no moves left, terrain or others' units in the
  way. The lander holding land is pointed at the founding control, which is how it goes ashore

### Reach

A move of several tiles can be further than a tappable zoom shows. Two things answer that:

- **The unit stays selected while the map is panned**, so the player can pan to a far tile and hold it
- **A destination hold works at zoomed-out levels where ordinary taps do not**, down to the zoom where
  the route can still be read. The 44 point floor in section 5 exists to stop a mis-tap committing the
  wrong thing; a hold commits nothing, so a slightly wrong tile shows in the plot and is put right by
  holding again. The tap that commits, on the route's end, answers across at least 44 points

### What makes it feel right rather than sluggish

- **250 milliseconds**, not the platform default of 500
- **Immediate visual feedback from the first frame of contact.** A ring fills under the finger, and the
  route appears the moment it is full. The player never waits without knowing they are waiting
- **Moving beyond a small threshold cancels the hold and becomes a pan.** This must be tuned carefully,
  because thumbs are imprecise
- **Releasing early cancels with no effect and no penalty**

### The discoverable path, which is required

The tap on the route's end is the fast path. It is also invisible to anyone who has not been told, so
**every plotted route also has an explicit control in the bottom third**, Go, or Attack for an attack,
which does the same thing.

Both do the same thing. The tap is for the player who has learned it; the control is for everyone else
and for the first hour. Per section 4.6 of the onboarding brief, the first few queue items teach the
hold as plotting a course in their wording.

---

## 5. What is forbidden

- **Drag and drop, anywhere.** Imprecise, the finger covers the target, no hover state to guide it
- **Double-tap for anything except zoom**
- **Multi-finger gestures beyond pinch**
- **Any action that is only reachable by hold**, per section 4
- **A tap on the map that commits anything**, except a tap on the end of a route just plotted
- **Any way to move a unit other than the plotted route**
- **Confirmation dialogs.** Undo instead, backed by the action log. The plotted route is not one: it is
  the plan, shown on the map, and it is where the move is committed
- **Anything requiring precision below 44 pixels**, except the destination hold of section 4, which
  commits nothing and is put right by holding again

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
