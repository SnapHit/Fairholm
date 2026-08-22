# Browser game architecture brief

Version 2, written 21 August 2026. **Supersedes the version of 18 August 2026.** Self-contained. A
new conversation working from this needs no prior context.

Companions: the Colonization mechanics brief, the legal distinguishability constraint, the setting and
fiction brief, and the interaction, session and persistence brief.

**Purpose: so the game is designed to the constraints from the first sketch, rather than discovering
them by hitting them.** Every measured number here was read off a live source on the date stated, not
recalled. Where something is uncertain it says so.

---

## 0. Target, and what changed in version 2

**Target: a turn-based colony and trade game, as visually stunning as it can be made, playable on any
browser on any device, in any orientation, on screen and interactive in about a second.**

Version 1 was written for a real-time 3D game, with Slow Roads and PolyTrack as its reference points,
where the renderer is the game. The design has since settled somewhere different: turn-based, long and
resumable, with a map the player navigates spatially and decisions committed in sheets and lists.

Three consequences, all of which are improvements.

1. **The performance budget is far larger than version 1 assumed.** A turn-based game does not render
   continuously. Section 3 is new and it is the most important addition in this version
2. **Visual ambition is raised deliberately.** Version 1 treated cheapness as the goal. It is not. It
   is the constraint. The goal is the best-looking thing that fits inside it
3. **The interface is mostly not WebGL.** Section 11 is new

Everything measured in version 1 still stands and is reproduced here unchanged.

---

## 1. The one principle that governs everything

**Pick the renderer and the art direction together, and let each argue for the other.**

Every browser game that looks good has its look downstream of what its technology makes cheap. The
Chrome dino is monochrome sprites because that is what a 6KB atlas buys. Underrun is 3D with moody
lighting because its author found lighting cheaper in bytes than art. Slither.io is soft glowing
circles because a fixed top-down camera can cache almost everything. Slow Roads is procedural because
a seed costs nothing to ship.

The failure mode is choosing an aesthetic on market or taste grounds first, then spending the whole
project clawing quality back against a renderer that resists it. That happened on the previous game
and it is the single most expensive lesson available here.

**Practical rule: no art direction is settled until somebody has said out loud what makes it cheap.**

This rule is not weakened by the raised ambition in section 2. It is the mechanism by which the
ambition gets met.

---

## 2. What "as stunning as possible on any device" actually means

The two halves of that sentence pull against each other, and the resolution is specific.

**Stunning does not mean fidelity. It means coherence.** Neither Slow Roads nor PolyTrack has a
post-processing stack, and neither has detailed assets. They look good because every element obeys the
same handful of forms and colours, because the lighting does the work textures would otherwise do, and
because the palette is disciplined. **A small consistent vocabulary of shapes and a tight palette is
what reads as "finished."** That is achievable solo. Fidelity is not, per section 12.

So the ambition is met by:

- A distinctive art direction that could not be mistaken for anything else, rather than a realistic one
- Lighting, atmosphere, fog and colour grading, which are per-pixel maths and nearly free
- Geometry generated rather than modelled, so the art style becomes the compression scheme
- High contrast on a small number of hues, with whatever carries the highest stakes being the most
  saturated thing on screen
- **Time, weather and season as shader parameters**, which cost almost nothing and transform how a
  static scene reads. In a game measured in turns and years, this is the single largest visual return
  available
- The refinement budget in section 3, which version 1 did not know it had

**"Any device" sets the floor, not the ceiling.** The correct approach is a cheap baseline that always
works, plus progressive enhancement that a capable device opts into automatically. Never the reverse.

---

## 3. The turn-based dividend, which is the most important thing in this document

A real-time game must produce a frame every 16 milliseconds forever. **This game does not.** The
camera is stationary most of the time, and the world only changes on turn boundaries and on player
actions.

That difference is worth more than any optimisation in this document.

### Render on demand

Draw a frame only when something changes: the camera moves, the state changes, an animation is
running. When the player is reading a sheet, deciding, or has put the phone down, the GPU does
nothing.

Consequences:

- **Thermal throttling largely stops being a problem.** Section 10's warning about minute four applies
  to sustained load. There is no sustained load
- **Battery drain stops being a problem**, which matters enormously for a game people return to over
  weeks
- **The per-frame budget rises by an order of magnitude**, because frames are rare

### Progressive refinement

This is the technique that buys the visual ambition on weak hardware.

- **While the player is panning or zooming, render cheap.** Lower resolution, simpler shading, no
  shadows. Motion hides everything
- **When the camera settles, render expensive.** Higher device pixel ratio, better shading, soft
  shadows, ambient occlusion, and a post-process pass if it earns its place
- The expensive frame can be composed over several frames and accumulated, because nothing is moving

The player never sees the cheap frame standing still, and never notices the expensive one is missing
while moving. This is how a mid-range Android phone renders something it could not sustain at 60fps.

### Cache the settled frame

When the camera is still and the player opens a sheet, the last rendered frame can be held as a
texture and the interface composited over it. **Zero GPU cost while the player reads.** Given the
interaction model is sheets over a map, this is most of the session.

### Bake per turn, not per frame

The world changes on turn boundaries. So shadow maps, ambient occlusion, and any lighting that can be
baked into vertex colours are computed **once per turn**, not sixty times a second. A cost that is
prohibitive at 60fps is trivial once every thirty seconds.

**This is the section to argue back to if a visual idea gets rejected as too expensive. Check first
whether it is expensive per frame or expensive per turn.**

---

## 4. The budget, in measured numbers

All measured 18 August 2026 by fetching the live builds.

| Game | Renderer | Over the wire | Notes |
|---|---|---|---|
| Q1K3 | custom WebGL | 13KB | Quake homage, two levels, five enemy types, dynamic lighting |
| Dr1v3n Wild | custom WebGL | 13KB | Arcade driving, ten stages, procedural scenery, 8th in JS13K 2024 |
| Chrome dino | canvas 2D | ~25KB gzipped | 90,241 bytes of code, 5,889 bytes of art |
| PolyTrack | three.js + Bullet | 500,327 gzipped | Complete 3D racer with editor, ghosts, leaderboards |
| Slow Roads | three.js | 778,546 gzipped | Procedural terrain, weather, time of day |

**The headline: a complete, good-looking 3D browser game costs under 1MB over the wire.** Both of the
best-looking examples land under 800KB compressed. That is the budget. It is not tight.

### Engine sizes, measured

| Engine | Minified | Gzipped |
|---|---|---|
| three.js r180, ES module build | 338,908 | **78,872** |
| Babylon.js, full UMD bundle | 8,258,950 | 1,775,314 |
| PlayCanvas | tree-shakeable ES modules, not measured | |

**three.js is 79KB gzipped.** About a tenth of PolyTrack's total budget, and far smaller than most
people assume. The engine is not the expensive part.

Babylon's number is the everything-included bundle. The tree-shaken `@babylonjs/core` ES6 import path
is dramatically smaller in practice, so do not read 1.78MB as Babylon's real cost.

---

## 5. The stack, and what each option costs

**three.js. The default and the right assumption for this project.** 79KB gzipped, enormous ecosystem,
every problem already solved publicly, glTF and Draco and KTX2 loaders included. Not opinionated about
game structure, which suits a game whose structure is a state object rather than a scene graph.

**Custom WebGL.** Smallest possible, most work. Q1K3 and Dr1v3n Wild prove a full 3D game fits in 13KB
this way. Only worth it if extreme size is itself the point.

**Babylon.js.** More batteries included: physics, audio, GUI, animation, inspector. Use ES6 module
imports, never the UMD bundle. The extra batteries are mostly things this game does not need.

**PlayCanvas.** Built for instant-loading web games, tree-shakeable, strong asset pipeline. Strongest
if the game turns out asset-heavy rather than procedural. It should not.

**Unity WebGL. Rejected.** Megabytes of WebAssembly runtime download and instantiate before any game
code exists. That is the load screen and it cannot be optimised away.

**WebGPU.** Better API, better ceiling, and it is the future. Support across the long tail of Android
phones is still thin, and "any browser on any device" is the hard requirement. Treat as progressive
enhancement at most, never the baseline. **WebGL2 is the baseline.** Verify current support figures
before committing.

---

## 6. How WebGL works, and why the mental model changes design

Canvas 2D issues drawing commands one at a time from JavaScript. Cost scales with the number of calls.
WebGL inverts this:

1. Upload geometry to GPU memory **once**. It stays there between frames
2. Upload two small programs called shaders, which also live on the GPU. The vertex shader runs once
   per vertex and decides where a point lands. The fragment shader runs once per pixel and decides its
   colour
3. Issue **one** draw call saying "run these shaders over that geometry"

The GPU runs those shaders across thousands of pixels simultaneously.

**The design consequence: per-pixel maths is nearly free, and draw calls are the scarce resource.**

In canvas 2D, richness costs draw calls, so every gradient and shadow is charged sixty times a second.
In WebGL, richness costs arithmetic inside a shader that was going to run anyway. Lighting, fog, depth
fade, colour grading and glow become close to free, while "a thousand different objects each with its
own material" becomes the expensive thing.

**Design toward many instances of few things, richly shaded. Design away from many unique things,
simply shaded.** A tile map is the ideal case for this: one tile mesh, one instanced draw, per-instance
colour and height.

---

## 7. What is cheap and what is expensive

### Cheap

- Per-pixel maths of any kind. Fog, lighting, tone mapping, gradients, vertex displacement
- **Instanced geometry.** One mesh drawn ten thousand times in one call. Slow Roads uses
  `InstancedMesh` 13 times, PolyTrack 16 times. This is how both fill their worlds
- Procedural geometry generated at startup from a seed
- Particles, provided they are instanced quads sharing one material
- A handful of materials shared across the whole scene
- Vertex colours instead of textures
- **Anything that can be computed once per turn instead of once per frame.** Section 3

### Expensive

- **Draw calls.** The single thing to count
- Unique materials. Every new material is a new shader and a new state change
- Real-time shadow maps **at 60fps**. Recomputed per turn they are affordable
- **Transparency and overdraw.** Alpha-blended layers stacked over each other is what actually kills
  phones. Large soft particles are the classic offender. This one is not rescued by turn-based
  rendering, because it is a per-pixel fill cost on the frame you do draw
- Large textures, both to download and in GPU memory
- Anything forcing a CPU to GPU sync, such as reading pixels back

### The two hidden ones on phones

- **Shader compilation stalls.** Every material compiles the first time it is drawn, causing a visible
  hitch. Pre-warm every shader behind the title screen by rendering each once off-screen. This matters
  more in an on-demand renderer, not less, because a stall in a rare frame is more visible
- **Thermal throttling.** Largely defused by section 3, but still measure a long session rather than
  ten seconds, because animation, generation and UI work still accumulate

---

## 8. Load time, which is five separate problems

Aim for something on screen and interactive inside a second, for a new player **and for a returning
one**.

1. **Engine size.** 79KB gzipped for three.js. Solved by not using Unity
2. **Geometry.** Procedural costs zero bytes. Otherwise glTF with Draco compression
3. **Textures.** Usually the biggest win available. PNG and JPEG must be decoded on the CPU then
   uploaded. **KTX2 and Basis Universal upload to the GPU still compressed**, removing the decode
   stall and using a fraction of the GPU memory
4. **Shader compilation.** See above. Pre-warm
5. **Streaming order.** Show something playable in the first second and fill in detail behind it

**The strongest single lever is generating rather than downloading.** Slow Roads ships a 970-byte
seeded random number generator and builds its entire world from it. Nothing about its terrain, road or
vegetation placement is in the download.

**For a returning player, the same lever applies to the save.** A save is a seed plus deltas, so
loading is regeneration rather than deserialisation. See the persistence brief.

---

## 9. The art direction the technology makes cheap

Both reference games arrive at the same recipe independently:

**three.js, plus instanced meshes, plus a handful of custom shader materials, plus generated or very
low-poly geometry, plus fog, plus a disciplined palette.**

**Neither has a post-processing stack.** No `EffectComposer` in either build. The look does not come
from bloom and screen-space effects. It comes from geometry, custom shaders, fog and palette.

**Version 2 amendment:** post-processing on a *settled* frame is affordable here in a way it is not in
a real-time game, per section 3. It is still not what makes things look good, and it should be the
last thing added, not the first. Earn the look without it, then consider whether it adds anything.

What this means concretely:

- Flat-shaded, low-poly, stylised, because it is what the constraints produce naturally
- Geometry generated rather than modelled wherever possible
- Lighting doing the work textures would otherwise do
- A small consistent vocabulary of shapes and a tight palette. **This is what reads as finished**, far
  more than fidelity does
- High contrast on a small number of hues, with the highest-stakes element the most saturated thing on
  screen and nothing competing with it
- **Time of day, weather and season driven by shader uniforms.** In a game of turns and years this is
  the cheapest large visual return available, and it makes a static map feel alive

**Worth investigating separately: Gaussian splatting.** PlayCanvas supports it and it puts photoreal
captured scenes in a browser on a phone. Unproven for gameplay rather than viewing, and it would need
its own investigation.

---

## 10. The map is an interaction surface, and that has its own constraints

New in version 2. The map is navigated spatially: the player pans, zooms, and taps things on it. That
makes it an input device, not a picture, and phones are hostile to this.

- **Tap and pan must be disambiguated.** A tap is a touch that moves less than a few pixels and lasts
  under a couple of hundred milliseconds. Everything else is a pan. Get this wrong and every attempted
  tap scrolls the map. Write it once, centrally
- **Tap targets have a floor of about 44 CSS pixels.** That sets the minimum on-screen tile size,
  which sets how many tiles fit a phone screen, which constrains map size and zoom design. Decide the
  zoom levels early
- **Tap selects and inspects. It never commits.** Commitment happens in the sheet that selection
  opens. See the interaction brief
- **Selection must be visible under a thumb.** The finger covers the tile it just touched, so the
  feedback belongs above the touch point, not on it
- **Momentum and rubber-banding are expected.** Panning that stops dead feels broken. This is cheap to
  implement and expensive to omit
- **Everything the player must reach lives in the bottom third of the screen.** Thumbs do not reach
  the top of a modern phone

---

## 11. The interface is DOM, not WebGL

New in version 2, and it is a decision that is painful to reverse.

**WebGL renders the map. HTML and CSS render everything else.** Sheets, lists, panels, numbers,
buttons, the queue.

Reasons, in order of weight:

1. **Text.** Browsers do typography, hinting, subpixel rendering, line breaking, internationalisation
   and font fallback correctly. Reimplementing any of that in WebGL is a project in itself and it will
   look worse
2. **Input.** Scroll physics, momentum, focus, selection and long-press behaviour come free and match
   what the platform does everywhere else. Hand-rolled versions feel wrong in ways players cannot
   articulate but do notice
3. **Accessibility.** Screen readers, dynamic type and contrast settings work on DOM and do not exist
   on a canvas
4. **Development speed**, which is the binding constraint on a solo project
5. **It composites for free.** Per section 3, a still map plus a DOM sheet costs no GPU work at all

The cost is that DOM and WebGL are two rendering systems that must agree about layout and state. Keep
the contract narrow: the state object is the single source of truth, the map reads from it, the
interface reads from it, and neither reads from the other.

---

## 12. What is expensive in human terms, not compute

**This is the real constraint for a solo developer and it is not a performance question.**

Achievable solo:

- Procedural geometry and worlds
- Instanced everything
- Palette-driven art direction
- Shader work, because a good fragment shader is code rather than asset production
- Low-poly props modelled in Blender, in small numbers

Not achievable solo, at any level of technical skill:

- Authored character animation
- PBR material libraries
- Large hand-built environments
- Anything needing a consistent set of many related assets

That last one deserves emphasis. **Generated images cannot supply a consistent asset set.** Asking for
sixteen rotations of the same object returns sixteen different objects. This was tested on the previous
project and it is not a prompting problem, it is what image generation is. Generated images are useful
as mood reference and nothing else.

**So the design should need few unique assets by construction, not by discipline.**

---

## 13. Mobile, where the real constraints live

- **Device pixel ratio.** Modern iPhones report 3. Rendering at 3x on a large screen is nine times the
  pixels of 1x. **Cap it while moving, raise it when settled**, per section 3. This is the single
  biggest fill-rate lever and it is one line of code
- **Memory.** Mobile Safari and Chrome will drop a WebGL context under memory pressure. Handle
  `webglcontextlost` and restore, or the game dies silently in a background tab. For a long resumable
  game this is not an edge case, it is a weekly occurrence
- **Audio needs a user gesture** before it can start, on every platform. Design the first tap to double
  as the audio unlock
- **Touch.** No virtual sticks, no hover, no right click, no keyboard shortcuts as the only path to
  anything
- **No fullscreen prompts, no interstitials, no cookie banners.** They break the instant feel. The one
  permitted exception is the home screen install prompt described in the persistence brief, which
  appears only after the player has something worth protecting
- **Device orientation sensors, if ever used**, need permission requested synchronously inside a tap
  handler, never after an `await`. Denial is sticky on iOS and grants do not persist across page loads,
  so persist the preference rather than the grant

---

## 14. Any orientation

Almost no 3D game does portrait and landscape well, and TikTok's playable ad specification has an
explicit orientation field precisely because nearly everyone picks one.

**Version 2 finds this much less frightening than version 1 did**, for two reasons:

1. A navigable camera reframes by changing field of view and distance, which is exactly what version 1
   prescribed. Nothing has to move
2. A queue of sheets reflows between portrait and landscape the way any web page does

What still needs deciding early:

- Whether the map has a dominant axis that reads sensibly both ways
- Where the queue and the primary action sit in each orientation, both within thumb reach
- **Test both from the first playable build, not at the end**

---

## 15. State architecture

Summarised from the persistence brief, repeated here because it belongs on the list of things that are
expensive to reverse.

1. **All state lives in one plain-data object and everything else is a function of it.** No game state
   in the scene graph, in closures, in the DOM, or in a Map keyed by object identity. If it cannot be
   serialised at any instant, it is a bug
2. **Save the seed and the deltas, not the world.** The generator must be deterministic and versioned
3. **One seeded random number generator, never `Math.random`.** No reliance on object key or Set
   iteration order
4. **A schema version in the save from the first commit**
5. **The game must be completely playable with the network unplugged.** Cloud sync is a layer on top,
   never a dependency

---

## 16. A proven constraint set worth borrowing

The playable ads industry meets this specification commercially, every day, at high visual quality:

- **Meta:** a single HTML file under 2MB, every asset embedded as a data URI, **no HTTP request of any
  kind**, responsive across device resolutions
- **Google:** a 5MB zip, up to 512 files, genuinely responsive
- **TikTok:** under 5MB, with an orientation flag
- **Load target: under two seconds on 4G**

Worth looking at their output when calibrating what is achievable, because it is the only place where
this constraint set is met at scale by people being paid to meet it.

---

## 17. Decisions that are expensive to reverse

Make all of these before writing game code.

1. **Engine.** three.js unless there is a specific reason otherwise
2. **DOM interface versus WebGL interface.** Section 11
3. **The state object and the save format.** Section 15. This is the most expensive one on the list
4. **Procedural or authored geometry.** Determines the entire asset pipeline and the download budget
5. **Orientation model.** Section 14
6. **Map size, zoom levels and minimum on-screen tile size.** Section 10. These are mutually
   constraining and cannot be chosen independently later
7. **Art direction, chosen jointly with the renderer.** Section 1
8. **The input abstraction.** Every input path writes into one representation. Building around
   discrete states and bolting a continuous one on later means retuning the entire feel model. Learned
   expensively on the previous project
9. **Single player, with optional cloud sync.** Settled. No multiplayer, which keeps the cost model
   flat under a traffic spike

---

## 18. Build order

The lesson the previous project paid for, and it transfers unchanged:

1. **The core interaction on a screen, crude, and play it.** If it is not pleasant with nothing else
   present, nothing built on top will save it. For this game that is one settlement, a few goods, a
   handful of workers to assign, a price that falls when you dump into it, and an import price that
   climbs. No map, no military, no revolution
2. Failure and restart
3. Escalation. Play it. This is where it becomes a game or does not
4. Score, or in this case the win condition
5. Only now, art direction
6. Persistence as a feature, though the architecture in section 15 must be right from step one

**Set the feel constants early, in one named block, verify them by playing, then do not touch them
while changing anything else.**

**Do not design anything before playing the change.**

### Note on a single large build run

If the first version is generated in one pass rather than grown, that pass can produce the systems,
the structure and a playable loop. **It cannot produce feel**, because feel is found by playing and
retuning. So expect every constant it chooses to be wrong, keep them in one named block so they are
cheap to replace, and treat the output as a skeleton to tune rather than a game to polish.

This also raises the bar on these documents: anything left undecided here will be decided arbitrarily
by whoever or whatever writes the code.

---

## 19. What not to do

- Do not use Unity, or any runtime that must download and instantiate before the game exists
- Do not treat WebGPU as the baseline
- Do not import a monolithic engine bundle when tree-shakeable modules exist
- Do not ship PNG or JPEG textures where KTX2 or Basis will do
- Do not render at device pixel ratio 3 while the camera is moving
- Do not render continuously when nothing is changing
- Do not build a scene from many unique objects with unique materials
- Do not stack large alpha-blended layers, which is the one cost turn-based rendering does not rescue
- Do not let the first frame compile shaders
- Do not use generated images as an asset source
- Do not build the interface in WebGL
- Do not put game state anywhere other than the state object
- Do not add a post-processing stack before the look works without one
- Do not benchmark only on a development machine
- Do not settle an art direction before somebody has said what makes it cheap

---

## 20. The thing that is not an architecture problem

The technical ceiling will not decide whether this game works.

**This section was rewritten on 21 August 2026 after the keyword research.** The previous version
proposed either Discord communities around the niche or a content cluster built on search volume. The
data killed both as primary channels. See the keyword research findings brief for the working.

**What the research found:**

- **Search fails two of its own four tests.** Volume exists, but page one for every relevant term is
  held by forums, storefronts and portals, and twelve of thirteen results pages carry an AI Overview.
  Keyword difficulty scores of zero on those terms are measuring backlinks, which is the wrong thing
- **The high-intent cluster is worth about forty searches a month worldwide.** "Games like the
  original" and its variants are two orders of magnitude below the same construction for games people
  currently play. Ranking first would earn roughly a dozen visits a month
- **A realistically ownable cluster is 6,000 to 8,000 worldwide monthly searches**, which at achievable
  positions and post-AI-Overview click rates is 280 to 420 visits a month, or roughly 400 players a
  year. The target is a thousand
- **Organic search follows fame, it does not create it.** Of the two reference games in section 4, one
  earns 135,000 US visits a month almost entirely from people typing its name, and the other is
  invisible in organic search while being one of the most played browser games in existence

**What to do instead, in order:**

1. **Publish on itch.io from the first playable build.** It ranks already for the categories this game
   sits in, it maintains indexed tag pages, the audience is right, it costs nothing, and it conflicts
   with no part of the legal constraint. This is the highest-return action available
2. **Choose the name for findability, not for keywords.** Every comparable earns most of its traffic
   from people typing its name, which makes the name the only search decision that matters. Test:
   distinctive, spellable after hearing it once, and its results page currently returns nothing. Check
   before committing. Section 8.5 of the legal constraint already forbids "col" in it
3. **Be in the rooms rather than trying to outrank them.** Ordinary participation in the relevant
   communities is permitted under the last paragraph of section 8.6 of the legal constraint. Turning up
   to promote a successor is not, and would fail socially before it failed legally
4. **One page on the product's own domain**, targeting the format terms. Worth an afternoon, not a year
5. **The shared seed link is promoted from fallback to primary.** It is the only mechanism in this
   project that strengthens with play and that never requires the game to be described in terms of
   something it cannot name

**The consequence for this document:** distribution is still the first problem, but it is no longer a
content problem. It is a naming problem and a launch-surface problem, and both are now decidable.

**One thing that has not changed:** the keywords still need to be settled before the name and the art,
because the name is the only search lever and a thumbnail has to read on a listing page.

---

## 21. If something here is wrong

Say so rather than working around it. This version corrects three positions taken in version 1: that
the game was real-time, that cheapness was the goal rather than the constraint, and that thermal
throttling and the frame budget were as tight as a real-time game's. Version 1 also corrected an
overstated concern about WebGL availability and an assumption that engine size was the main load-time
cost.

The document is not infallible and it should be argued with.
