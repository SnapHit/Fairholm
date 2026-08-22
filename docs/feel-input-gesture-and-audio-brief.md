# Feel: input, gesture and audio

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
| **Tap** | Select and activate | **Yes. Never destructive** |
| **Tap and hold** | Commit. The unit acts | No. This is the verb |

**The rule underneath: tap is safe, hold commits.** That is the "first tap is never destructive" rule
from section 2 of the interaction brief, implemented as a gesture instead of as a two-step interface. It
is one consistent idea across the whole game.

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

## 4. Tap and hold: the verb

**With a unit active, tap and hold on a target tile commits an action**: move there, or attack what is
there. The game decides which from what occupies the target, and shows which before the hold completes.

### What makes it feel right rather than sluggish

- **250 milliseconds**, not the platform default of 500
- **Immediate visual feedback from the first frame of contact.** A ring fills under the finger, and the
  target tile shows what will happen. The player never waits without knowing they are waiting
- **Moving beyond a small threshold cancels the hold and becomes a pan.** This must be tuned carefully,
  because thumbs are imprecise
- **Releasing early cancels with no effect and no penalty**

### The discoverable path, which is required

Hold is the fast path. It is also invisible to anyone who has not been told, so **every action reachable
by hold must also be reachable by an explicit control in the bottom third** while a unit is active.

Both do the same thing. The hold is for the player who has learned it; the control is for everyone else
and for the first hour. Per section 4.6 of the onboarding brief, the first few queue items teach the
hold in their wording.

---

## 5. What is forbidden

- **Drag and drop, anywhere.** Imprecise, the finger covers the target, no hover state to guide it
- **Double-tap for anything except zoom**
- **Multi-finger gestures beyond pinch**
- **Any action that is only reachable by hold**, per section 4
- **Confirmation dialogs.** Undo instead, backed by the action log
- **Anything requiring precision below 44 pixels**

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
