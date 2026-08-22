# Art direction and rendering brief

Written 21 August 2026. Self-contained. Companion to the browser game architecture brief, whose section
1 requires that no art direction is settled until somebody has said out loud what makes it cheap.

**Purpose: settle the look and the renderer together, so the build can start.** This document is the
answer to that requirement.

---

## 1. What makes it cheap

Stated first, because the direction is derived from this rather than the other way round.

- **The terrain is one merged mesh with per-vertex colour.** Generated at load from the seed, jittered
  deterministically. One draw call for the whole map at any size
- **No textures anywhere.** Vertex colours only. This removes the largest download cost and the largest
  GPU memory cost simultaneously
- **All geometry is generated, never downloaded.** Zero bytes of assets over the wire
- **Props are opaque low-poly forms, never alpha cards.** Alpha foliage is the one cost that turn-based
  rendering does not rescue, per section 7 of the architecture brief
- **Settlements are composed from a kit**, not modelled. Eight to ten meshes, instanced
- **Rivers and roads are generated ribbon meshes**, one draw call each, drawn as continuous curves
  rather than assembled per tile
- **Cloud shadows are one scrolling noise** sampled in the fragment shader. Nearly free, and the single
  most effective way to make a still scene feel alive
- **Season and hour are shader uniforms.** In a forty-year game with the season turning every three
  turns, this is the largest visual return available anywhere in the project for effectively nothing
- **Shadows and ambient occlusion are baked once per turn**, not per frame, per section 3 of the
  architecture brief

Everything below follows from that list.

---

## 2. The camera: true top-down

**Settled: the view looks straight down.** Orthographic, no perspective, no tilt. Zoom is continuous by
pinch; rotation, if offered at all, is in ninety degree steps.

### What this buys

- **Every tile is exactly the same size everywhere on screen**, so the 44 pixel tap floor from section
  10 of the architecture brief holds without exception and without special cases at the screen edge
- **Nothing ever occludes anything.** No building hides the tile behind it, which on a phone is a real
  problem removed rather than mitigated
- **The scene is simpler to render than any alternative**: a heightfield seen from above
- It is legible instantly, which matters more than cinematic in a game read in short sittings

### What it costs, and how that cost is paid

Top-down removes silhouette, and silhouette is what low-poly art normally uses in place of detail. So
the beauty has to come from somewhere else.

**It comes from the tiles themselves and from how they meet.** That is the whole art direction and it
is section 3.

**Elevation is rendered as light rather than as perspective.** With a low raking sun, the jittered
surface catches and loses the light across a slope, and cast shadows baked per turn stretch across the
ground. Height arrives as shading and shadow shape, not as occlusion.

---

## 3. The core technique: a rigid grid, softly rendered

**The gameplay grid is square and exact. The rendered surface is not.**

This is the single most important technique in the document, because it is what turns a tile map into a
landscape.

- **Each tile subdivides into a small grid of quads**, four by four as a starting point, so a standard
  map is around 65,000 triangles and a massive one around 175,000. Trivial for any GPU, and generated
  rather than downloaded
- **Every interior vertex is jittered deterministically from the seed**, so tile edges are not straight
  lines and the grid does not read as a grid
- **Vertex colours blend across boundaries.** Each vertex samples the terrain types of the tiles it sits
  between, weighted by distance, so grassland does not stop dead where downs begin. The map reads as
  country rather than as a spreadsheet
- **No grid lines are drawn by default.** They appear only when a tile is selected, or under a mode the
  player turns on
- **Coastlines get extra treatment**: a shoreline band where the land colour desaturates into wet
  ground, and a slight pull on the vertices so the boundary is irregular

Underneath, the square grid is intact and exact. Every rule, every adjacency, every yield is unchanged.
Only the drawing is soft.

**A settlement works its own tile plus the eight around it, nine in total.** That is the geometric
consequence of a square grid rather than a borrowed constant, and it sits comfortably with the
twelve-tile figure in the economy brief, which concerns separation rather than what gets worked.

---

## 4. Rivers and roads are drawn, not tiled

The blocky per-tile river is one of the things that dates the original most visibly.

**Both are generated as continuous ribbon meshes** following a spline through the tiles they occupy.
One draw call each, generated once at world creation and when a road is laid.

- Minor rivers are narrow and take the shorter path between tile edges
- Major rivers are wider, carry boats, and cut visibly into the surface
- Roads are a paler ribbon that follows terrain, widening slightly where they meet a settlement

Because they are splines rather than tile segments, they curve, they meet at angles, and they look
drawn by a hand rather than assembled from parts.

---

## 5. Props, seen from above

A tree from directly overhead is a rough disc of canopy. No trunk is needed, which makes this cheaper
than any other camera angle.

- **Two or three canopy forms per forest type**, instanced, opaque, twelve to twenty triangles each
- **Variation comes from per-instance scale, rotation and colour jitter**, not from more meshes
- Density varies by terrain, thinning at forest edges so the boundary is soft
- **Culled entirely below working zoom**, since at 16 pixels a tile they are noise

The same approach handles rocks on highland, reeds in marsh, and the old workings from section 10 of
the setting brief.

---

## 6. Settlements are a kit of roofs

**The idea the whole direction is built around, and the reason the industrial arc costs nothing.**

From above, a settlement is roofs. So the kit is roof forms, and the three eras from section 6 of the
setting brief are three material treatments of the same kit.

**Modern in design, pre-industrial in material.** Corrected 21 August 2026, after the register error
recorded in section 12 of the setting brief. These are not eighteenth century colonists and they should
not build a colonial village. They arrive with surveying, geometry and modern design sense and without
an industrial base, so they build **clean rectangular forms in a considered layout**, out of whatever
they can cut and forge.

That is more distinctive than a heritage-village pastiche, it puts more visual distance between this
game and the original, and **clean geometry is cheaper to render than picturesque irregularity**, so
the correction pays for itself.

| Era | Reads as |
|---|---|
| Early | Timber and thatch, but cut square and set on a surveyed grid. Small, regular, deliberate |
| Middle | Worked stone and slate. Larger rectangles, a mill wheel where a river runs, a wharf on water |
| Late | Metal and brick. Long spans, chimneys as small circles throwing long shadows, a dense packed plan |

**The composition is derived from the settlement's actual state**, not authored. What buildings it
holds, how many people, what fortification stands. So a settlement changes visibly as it grows, and
**its appearance is genuinely informational**: chimneys mean industry, wharves mean shipping, a star of
earthworks means a bastion. You can read what a place does from across the map.

Eight to ten meshes produce every settlement in the game.

---

## 7. Units

Small, static, instanced, with a clear plan-view shape and a soft ground shadow to lift them off the
surface.

- A hauler reads as a rectangle with two dots
- An outrider is elongated, a militia block is square, a battery is a squat wedge
- **No rigs and no animation data.** Any motion is a bob or a sway in the vertex shader
- **Owner colour is carried on the unit and on a settlement's banner**, never on terrain

---

## 8. Light, season and weather

The cheapest and highest-return part of the whole project.

- **A low raking sun**, which is what makes a top-down surface read as landscape rather than as a plan
- **The sun's angle changes across the year**, so the same map looks different in different seasons
- **The season turns every three turns**, recolouring the entire map four times a year: new green,
  deep summer, the turn of the leaf, bare ground
- **Cloud shadows drift across the land** continuously, which is where most of the sense of life comes
  from in a game where nothing else moves
- Weather is a colour grade and a fog density, not a particle system

---

## 9. Colour

**Warm and generous.** Settled. The fiction's whole emotional argument is that this world is better
than the one left behind, and a cool palette reads as hostile.

- Land runs green-gold through olive to ochre. Water is a deep teal. The sky is pale gold near the
  horizon
- **The highest-saturation colour on the map is reserved for the headline export**, so wealth is
  legible at overview zoom and the thing you came for glows
- **Owner colours are deep rather than bright**, since they appear on small markers with dark outlines
  and do not need saturation to read: the player in bone, and rivals in deep crimson, indigo and
  charcoal
- **No owner colour ever tints terrain.** Territory is read from settlements and from what is worked,
  not from a coloured overlay, which would destroy the thing section 3 is for

---

## 10. Levels of detail

| Zoom | Tile size | What renders |
|---|---|---|
| Detail | 72px | Full kit, props at full density, unit forms, road and river detail |
| Working | 44px | Simplified kit, props thinned, units as forms. **The default** |
| Overview | 16px | Terrain colour and shading, settlement marks in owner colour, props culled |
| Fit | varies | Schematic. Terrain bands, settlements, anchorages. Above large maps this is not a rendered view |

Per section 4 of the economy brief, **below 44 pixels a tile only settlement and unit markers are
tappable**, with hit areas larger than their tile.

---

## 11. The map is never decorated with data

**A rule, because it is what protects everything above.**

No yield numbers on tiles, no resource icons scattered across the surface, no permanent overlays. Data
lives in sheets, which are DOM, per section 11 of the architecture brief.

**Overlays are modes the player turns on** and which turn off again: show yields, show territory, show
threat, show freight routes. Each one is a temporary recolouring of the terrain shader, which is
effectively free, and none of them is the default view.

The default view is the country.

---

## 12. Budget

| | |
|---|---|
| Terrain | 1 draw call |
| Water | 1 |
| Rivers, roads | 2 |
| Props | 2 to 3, by form |
| Settlement kit | 1 to 2 |
| Units | 1 |
| **Total** | **under 10** |

Downloaded assets: **none**. three.js at 79KB gzipped plus game code, with all geometry generated from
the seed and no textures at all. Comfortably inside the sub-1MB budget in section 4 of the architecture
brief, with room for the interface and the audio.

---

## 13. What was rejected, and why

- **Perspective or a tilted camera.** Distant tiles shrink, which breaks the 44 pixel tap floor, and
  buildings occlude the tiles behind them. Rejected on interaction grounds, not aesthetic ones
- **A fifteen degree tilt as a compromise.** Considered as a way to restore some silhouette. Rejected:
  it costs occlusion and complicates the tap geometry to buy something section 3 delivers by other
  means
- **Visible grid lines by default.** They are the single thing that makes a tile map look like a
  spreadsheet
- **Textures.** Vertex colours do everything needed here and cost nothing
- **Alpha-card foliage.** Overdraw is the one cost turn-based rendering does not rescue
- **Owner-coloured territory tinting.** It would destroy the blended surface that section 3 exists to
  create
- **A cool or high-contrast palette.** Cool reads as hostile and fights the fiction. High contrast reads
  well at 16 pixels and badly at 72

---

## 14. What must be tuned by eye

- **The jitter amount in section 3.** Too little and the grid shows; too much and tiles stop reading as
  discrete, which matters because they are tappable
- **The blend radius at terrain boundaries**, for the same reason
- **The sun angle.** It is doing all the work that perspective normally does
- Cloud shadow scale and speed, which is the difference between alive and busy
- Prop density per terrain, and the zoom at which they cull
- Whether the settlement kit reads clearly enough from above that a player can tell an industrial town
  from an agricultural one without opening the sheet

---

## 15. If something here is wrong

Say so rather than working around it.

The riskiest claim is section 2 plus section 3 together: that a true top-down view can be beautiful if
the surface is soft enough and the light is low enough. It is a real technique and it works in
published games, but it is being asserted rather than demonstrated, and it is the thing to prototype
first. **The warning sign is a map that reads as flat and toy-like rather than as country.** If that
happens the causes to check, in order, are the sun angle, the jitter amount and the blend radius, all
before reconsidering the camera.

The second riskiest is section 6. Whether a settlement's function is genuinely readable from roof
shapes alone at 44 pixels is unknown, and if it is not, the fallback is a small owner-coloured mark
carrying one glyph, not a return to silhouette.
