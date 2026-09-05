// The map's look. Every colour and every magnitude the renderer uses is declared here and nowhere
// else, the way src/ui/theme.ts holds the interface's. Two files rather than one because these are
// three-dimensional quantities and light colours that a CSS custom property cannot carry; between
// them they are the whole visual dress of the game. A component that holds a colour or a number is
// a bug, not a style.
//
// Art direction brief sections 8 and 9 for the direction, and section 2 for the constraint the whole
// thing works under: the camera looks straight down, so form has to arrive as light and shadow.
//
// The ground ramps below start from C.art.palette, which stays the summer reading. Winter is not a
// tint of it; each season is a palette of its own.

import { C } from '../sim/constants'
import type { TerrainId, ForestId, UnitKind } from '../sim/state'

export type RGB = [number, number, number]

export function hexRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// ---- the four seasons, each a complete palette ---------------------------------------------------

export interface SeasonLook {
  name: string
  /** The sun: a warm key at a low elevation, which is what makes a surface seen from above read as
   *  landscape rather than as a plan. Elevation in degrees above the horizon; low, because the length
   *  of a shadow is the height of the thing over the tangent of this, and on a phone a short shadow
   *  is no shadow.
   *
   *  Azimuth is measured in the ground plane from world +x, and the camera puts +x to the right of
   *  the screen and +z down it, so a negative azimuth near a hundred and sixty degrees is a sun over
   *  the player's left shoulder and shadows falling to the lower right. That is where it has to be:
   *  the early era settlement sprites carry their light baked in from the upper left, and the whole
   *  map has to agree with them rather than the other way round. The season still swings it, but
   *  across thirty degrees rather than fifty. */
  keyColour: string
  keyStrength: number
  elevationDeg: number
  azimuthDeg: number
  /** The sky: a cool fill, so shadows read cold against warm light. */
  ambientColour: string
  ambientStrength: number
  /** How much a cast shadow takes away, and what colour is left in it. */
  shadowStrength: number
  shadowColour: string
  /** A rim of sunlight along the sun-facing edge of a canopy or a roof ridge. */
  rimStrength: number
  rimColour: string
  /** Contrast applied after lighting, to use the whole range rather than the middle of it. */
  contrast: number
  lift: number
  /** The ground, terrain by terrain. */
  ground: Record<TerrainId, string>
  canopy: Record<ForestId, string>
  shore: string
  water: string
  deepWater: string
  river: string
  road: string
  /** Bare rock and snow on the highest ground. */
  snow: string
  snowFrom: number
  /** Dead flat colour the frame is cleared to, beyond the edge of the map. */
  clear: string
  /** Sky colour the water reflects. */
  sky: string
  /** How strongly the detail textures show. */
  grainStrength: number
  rockStrength: number
}

const P = C.art.palette

export const SEASONS: SeasonLook[] = [
  {
    // new green: everything just come up, wet ground, a pale early sun
    name: 'new green',
    keyColour: '#ffe9bd', keyStrength: 1.62, elevationDeg: 15, azimuthDeg: -140,
    ambientColour: '#8fb2dc', ambientStrength: 0.36,
    shadowStrength: 0.74, shadowColour: '#5b78a2',
    rimStrength: 0.42, rimColour: '#fff3d2',
    contrast: 1.16, lift: -0.015,
    ground: {
      water: '#22646b', grassland: '#88b04c', plains: '#b4b455', downs: '#a4b262',
      marsh: '#5f8557', highland: '#9a9260', mountain: '#8b8175', dry: '#c9b273',
    },
    canopy: { lightWoodland: '#6d9c3e', deepTimber: '#3d7433', highlandForest: '#527a3c', coastalScrub: '#87984d' },
    shore: '#b0a883', water: '#22646b', deepWater: '#163f49', river: '#2f8189', road: '#cdbb8a',
    snow: '#e8e6da', snowFrom: 0.86,
    clear: '#0f2c33', sky: '#cfe2ea',
    grainStrength: 0.16, rockStrength: 0.22,
  },
  {
    // deep summer: the fullest colour of the year, the sun at its highest, shadows short
    name: 'deep summer',
    keyColour: '#fff2cf', keyStrength: 1.70, elevationDeg: 19, azimuthDeg: -150,
    ambientColour: '#8db1d6', ambientStrength: 0.33,
    shadowStrength: 0.72, shadowColour: '#5d7396',
    rimStrength: 0.38, rimColour: '#fff6dd',
    contrast: 1.18, lift: -0.01,
    ground: {
      water: P.water, grassland: P.grassland, plains: P.plains, downs: P.downs,
      marsh: P.marsh, highland: P.highland, mountain: P.mountain, dry: P.dry,
    },
    canopy: { lightWoodland: P.lightWoodland, deepTimber: P.deepTimber, highlandForest: P.highlandForest, coastalScrub: P.coastalScrub },
    shore: P.shore, water: P.water, deepWater: P.deepWater, river: P.river, road: P.road,
    snow: P.snow, snowFrom: 0.92,
    clear: '#123c44', sky: '#d6e6ea',
    grainStrength: 0.17, rockStrength: 0.24,
  },
  {
    // the turn of the leaf: ochre and rust, a low amber sun and long shadows
    name: 'the turn of the leaf',
    keyColour: '#ffdca4', keyStrength: 1.66, elevationDeg: 13, azimuthDeg: -162,
    ambientColour: '#93a6cc', ambientStrength: 0.34,
    shadowStrength: 0.75, shadowColour: '#63668c',
    rimStrength: 0.46, rimColour: '#ffe6b4',
    contrast: 1.20, lift: -0.015,
    ground: {
      water: '#1d5c64', grassland: '#9d9c46', plains: '#c2a44c', downs: '#b29558',
      marsh: '#6c7c4d', highland: '#a7854f', mountain: '#8b7c6c', dry: '#d0a561',
    },
    canopy: { lightWoodland: '#a5823b', deepTimber: '#7e6d34', highlandForest: '#8c713b', coastalScrub: '#9d8c45' },
    shore: '#b6a47c', water: '#1d5c64', deepWater: '#123943', river: '#2a747c', road: '#c9b382',
    snow: '#e4e0d2', snowFrom: 0.84,
    clear: '#0e3239', sky: '#e0dcd0',
    grainStrength: 0.19, rockStrength: 0.26,
  },
  {
    // bare ground: frost on the low country, snow on the high, a cold blue fill and a very low sun.
    // This is the season that has to look like winter rather than like summer with the colour turned
    // down, so the whole ramp moves, not the saturation.
    name: 'bare ground',
    keyColour: '#ffd7a2', keyStrength: 1.58, elevationDeg: 10, azimuthDeg: -172,
    ambientColour: '#8aa8d6', ambientStrength: 0.46,
    shadowStrength: 0.76, shadowColour: '#6880b0',
    rimStrength: 0.52, rimColour: '#ffe8c4',
    contrast: 1.14, lift: 0.02,
    ground: {
      water: '#1c414c', grassland: '#b3b3a0', plains: '#bdb9a6', downs: '#b6b4a4',
      marsh: '#8b968c', highland: '#cfd0cb', mountain: '#dee0dd', dry: '#c4b9a4',
    },
    canopy: { lightWoodland: '#7d7a68', deepTimber: '#4c5c4c', highlandForest: '#5b6b58', coastalScrub: '#8b8874' },
    shore: '#c3c0b2', water: '#1c414c', deepWater: '#122b34', river: '#8fb0bd', road: '#d3cdbd',
    snow: '#f2f3f0', snowFrom: 0.52,
    clear: '#0c232b', sky: '#e6ecf2',
    grainStrength: 0.13, rockStrength: 0.20,
  },
]

export function seasonLook(season: number): SeasonLook {
  return SEASONS[((season % SEASONS.length) + SEASONS.length) % SEASONS.length]
}

// ---- the surface --------------------------------------------------------------------------------

export const SURFACE = {
  /** Quads per tile edge. More than the four the brief started with, because relief needs somewhere
   *  to live and the mesh is generated rather than downloaded. */
  subdivisions: 6,
  /** Fraction of a subdivision cell each interior vertex is nudged by. */
  jitter: 0.2,
  /** Tiles, for blending vertex colour across a terrain boundary. */
  blendRadius: 0.9,
  shoreBand: 0.42,
  /** How far a vertex near the waterline wanders sideways. Art brief section 3 asks the coast to be
   *  irregular rather than a staircase of tile edges; this is that pull. */
  coastWobble: 0.55,

  /** Real elevation, in tiles, so slopes catch the light and valleys sit in shade. The camera looks
   *  straight down, so none of this moves anything on screen; all of it arrives as shading. */
  height: {
    water: -0.4, marsh: 0.05, grassland: 0.16, plains: 0.2, dry: 0.2,
    downs: 0.62, highland: 1.35, mountain: 2.6,
  } as Record<TerrainId, number>,
  /** Broken ground: how much per-vertex noise each terrain carries. Small, because a subdivision is
   *  a sixth of a tile and anything larger reads as crumpled foil rather than as country. The relief
   *  comes from the tile heights and the landform below, not from this. */
  roughness: {
    water: 0.004, marsh: 0.006, grassland: 0.007, plains: 0.007, dry: 0.012,
    downs: 0.022, highland: 0.07, mountain: 0.2,
  } as Record<TerrainId, number>,
  /** Rolling landform under everything, so flat country is not a plane. Amplitude in tiles, scale in
   *  cycles per tile, so a smaller scale is broader country. */
  landform: { amplitude: 0.78, scale: 0.014, detail: 0.2, detailScale: 0.05 },
  /** Ploughed ground and roads flatten what they cross. */
  improvedFlatten: 0.4,
  /** How much deeper open water sits than the shallows. Applied through the blended water weight
   *  rather than per tile, so the coast is a beach and not a cliff. */
  waterDeepen: 0.45,

  /** How far the detail textures tile, in repeats per tile. */
  grainRepeat: 4.5,
  rockRepeat: 1.4,
  rippleRepeat: 0.26,
  /** How much the tooth bends the surface normal, so it catches the raking light rather than only
   *  darkening the colour. This is most of what the textures are for. */
  grainBump: 0.65,
  rockBump: 1.35,
  /** Fine noise in the fragment shader, under the textures. In cycles per pixel, so that it is the
   *  same grain at every zoom rather than a pattern the camera can outrun. */
  filmStrength: 0.055,
  filmScale: 0.5,

  /** Country is not one colour. Two fields of noise wander the ground's value and its warmth: a
   *  broad one about ten tiles across, which is a change of soil or a drier reach, and a finer one
   *  about two tiles across, which is where the grass is thinner. Baked into the vertex colour with
   *  the season, so it costs nothing to draw and it changes when the year does. */
  patchScale: 0.085,
  patchValue: 0.26,
  patchWarmth: 0.12,
  moteScale: 0.52,
  moteValue: 0.14,
}

// ---- the baked shadow map -------------------------------------------------------------------------

export const SHADOW = {
  /** Texels per tile on the map that is sampled. Sixteen, because a tree's shadow is about a fifth
   *  of a tile wide and twelve left it three texels across, which the blur then took most of. */
  texelsPerTile: 16,
  /** The ray march runs on a grid this many times coarser, because a ridge's shadow is broad and the
   *  march is the expensive half. The result is lifted back onto the fine grid before the props are
   *  stamped onto it. */
  marchDivisor: 4,
  /** Samples along one ray, and how fast the step between them grows. */
  marchSteps: 26,
  marchGrowth: 1.14,
  /** How far a ray looks toward the sun, in tiles, and how far the longest cast shadow runs. Beyond
   *  this a shadow simply stops. A low sun wants a long reach: at ten degrees a tree a fifth of a
   *  tile high lays a shadow more than a tile long, and cutting it short is what made the shadows
   *  read as smudges under things rather than as shadows lying beside them. */
  reachTiles: 14,
  /** The ground's relief is exaggerated so that a top-down view has something to shade. Taking the
   *  shadow march at full height then throws shadows two tiles long off an ordinary hillside, which
   *  reads as a slab of black rather than as shade. The march uses this fraction of the height. */
  terrainScale: 0.32,
  /** Height difference, in tiles, over which a shadow edge softens. */
  softness: 0.7,
  /** Passes of a three by three blur over the marched ground shadow. Props are stamped after the
   *  blur, not before: a tree's shadow is a few texels across and blurring it away was most of the
   *  reason nothing could be seen on a phone. */
  blurPasses: 2,
  /** Ambient occlusion baked into the vertex colour: how far it looks and how hard it bites. */
  aoRadius: 3,
  aoStrength: 1.8,
  aoFloor: 0.58,
  aoCeiling: 1.08,
  /** A prop's own cast shadow: how wide, relative to the prop, how dark at its foot, and how much
   *  of that is left at the far end of it. Half rather than all, because these accumulate: at full
   *  depth the first tree takes all the light and a wood of forty of them bakes to a solid black
   *  blob with no shadow shapes in it at all. */
  contactWidth: 1.45,
  contactDepth: 0.5,
  contactFade: 0.4,
  /** How much a shadow narrows along its length. Zero would be a stripe, one a wedge. */
  contactTaper: 0.3,
}

// ---- props ----------------------------------------------------------------------------------------

export const PROPS = {
  /** Trees per forested tile, before edge thinning. An order of magnitude more than the handful the
   *  first build placed; instancing makes the difference nearly free. */
  trees: { lightWoodland: 26, deepTimber: 44, highlandForest: 30, coastalScrub: 22 } as Record<ForestId, number>,
  /** Canopy radius, low and high, in tiles. */
  canopy: {
    lightWoodland: [0.07, 0.21], deepTimber: [0.08, 0.27],
    highlandForest: [0.06, 0.19], coastalScrub: [0.05, 0.15],
  } as Record<ForestId, [number, number]>,
  /** One tree in this many stands well clear of the rest, which is what stops a wood reading as a
   *  single carpet of one size. */
  emergentEvery: 9,
  emergentScale: 1.45,
  /** Undergrowth under a canopy, and scrub on open ground. Detail zoom only. */
  undergrowth: 14,
  /** Boulders and scattered rock, per tile of each terrain. Open country carries some now: a downs
   *  with nothing on it is a green rectangle, and stone is what says the ground is thin there. */
  rocks: { mountain: 22, highland: 14, downs: 7, dry: 9, marsh: 0, grassland: 1, plains: 2, water: 0 } as Record<TerrainId, number>,
  /** Scrub on open ground, per tile: gorse, thorn, a low bush. The coarse tier, so it is there at
   *  working zoom, which is the default view and the one that was empty. Weighted so that downs is
   *  scrubbier than plains, dry country is sparser and greyer, and a marsh has clumps rather than
   *  bushes. */
  scrub: { grassland: 4, plains: 3, downs: 7, dry: 5, marsh: 4, highland: 3, mountain: 0, water: 0 } as Record<TerrainId, number>,
  scrubSize: {
    grassland: [0.05, 0.12], plains: [0.045, 0.10], downs: [0.05, 0.13],
    dry: [0.04, 0.095], marsh: [0.05, 0.115], highland: [0.04, 0.09],
  } as Record<string, [number, number]>,
  /** Tufts and pebbles on open ground. Detail zoom only, because at working zoom they are noise. */
  tufts: { grassland: 26, plains: 21, downs: 22, dry: 12, marsh: 16, highland: 9, mountain: 3, water: 0 } as Record<TerrainId, number>,
  /** Loose stone and shingle scattered over open ground, in the fine tier. */
  pebbles: { grassland: 3, plains: 5, downs: 9, dry: 14, marsh: 2, highland: 12, mountain: 16, water: 0 } as Record<TerrainId, number>,
  /** Reeds in a marsh. */
  reeds: 24,
  /** Debris along the waterline. */
  shoreDebris: 14,
  /** The most of a tile's ground its own props can be said to cover, for the sake of the colour the
   *  terrain falls back to when a tier is culled. Never all of it: a wood floor is still visible. */
  coverMax: 0.8,
  /** And how high above the ground the props that are not being drawn would have stood, in tiles.
   *  The ground samples the light up there instead, or a wood at overview zoom reads as the dark
   *  floor under the trees while the same wood at detail zoom reads as the lit tops of them. */
  coverLift: 0.24,
  /** What survives on the ring of tiles around a settlement. Its own tile is cleared outright. */
  settlementThinning: 0.3,
  /** How much a prop's colour wanders from its base, in hue and in value. */
  hueJitter: 0.09,
  valueJitter: 0.20,
  /** Sizes for the small scatter, low and high, in tiles. */
  rockSize: { mountain: [0.05, 0.16], highland: [0.04, 0.11], downs: [0.03, 0.07], dry: [0.03, 0.07] } as Record<string, [number, number]>,
  tuftSize: [0.022, 0.055] as [number, number],
  reedSize: [0.03, 0.075] as [number, number],
  debrisSize: [0.02, 0.055] as [number, number],
  /** Zoom, in pixels a tile, at which each tier appears and disappears, hysteretically. The coarse
   *  tier has to be on at working zoom, which is forty-four and the default view, so it turns off
   *  well below that. C.feel.lodCull and lodRestore straddled forty-four, which meant the default
   *  view of the game had no props in it at all. */
  coarseCull: 26,
  coarseRestore: 34,
  fineCull: 52,
  fineRestore: 60,
}

// ---- settlements ------------------------------------------------------------------------------------

export const BUILD = {
  /** A roof is two planes meeting at a ridge, so from directly overhead it is two rectangles at
   *  different angles catching different light. A flat box never reads as a roof. */
  pitch: 0.6,
  wallHeight: 0.05,
  ridgeRise: 0.1,
  /** How far the settlement's lattice spreads inside its tile, and how much of its own cell a
   *  building fills. Fewer and larger reads better from above than many and small: at working zoom a
   *  settlement is forty-four pixels across in total. */
  spread: 0.88,
  fill: 0.82,
  maxBuildings: 9,
  /** Roof colours by era. Early is cut timber and thatch, middle worked stone and slate, late metal
   *  and brick. Two tones each so a settlement is not one colour. */
  eras: [
    { roofA: '#6b4f2c', roofB: '#8a6a38', wall: '#54401f', trim: '#c0a468' },
    { roofA: '#565c66', roofB: '#727880', wall: '#5e594d', trim: '#9aa0a6' },
    { roofA: '#6a3325', roofB: '#8a442e', wall: '#35353a', trim: '#b0693f' },
  ],
  chimney: '#3a3430',
  works: '#6a5a40',
  wharf: '#7d6238',
  predecessorRoof: '#8a6d3a',
  predecessorRing: '#7d6a48',
}

// ---- the early era, drawn rather than built ---------------------------------------------------------

export const SPRITE = {
  /** How wide on the ground a piece drawn this many pixels wide stands, in tiles. Every piece keeps
   *  its own proportions against this, so the hall really is taller than the barn. */
  referenceWidth: 220,
  tileWidth: 0.72,
  /** How far the pieces stand from the middle of the settlement, in tiles, with two of them and with
   *  seven. A settlement is one tile of gameplay and rather more than one tile of place: by the time
   *  a dozen people live there the buildings are well over the tile's edge, which is the point. */
  spreadFrom: 0.28,
  spreadTo: 0.88,
  /** Two pieces at this population, all of them by this one. */
  fromPop: 2,
  allByPop: 12,
  /** One more building for every this many people past the seventh piece, and no more than this. */
  extraPer: 5,
  maxExtra: 5,
  /** How far a building wanders off its place on the lattice, as a fraction of the spacing. */
  jitter: 0.3,
  /** A hair off the ground, so a sprite is not fighting the terrain for the same depth. */
  lift: 0.03,
  /** Timber weathers. How far a building's colour wanders in hue and in value. */
  hueJitter: 0.035,
  valueJitter: 0.14,
  /** What a building casts, in tiles: how tall the engine should think it is and how wide. */
  occluderHeight: 0.34,
  occluderRadius: 0.23,
  /** The sheet is drawn already lit, so the map's light is applied to it as a colour and a depth
   *  rather than as a second lighting pass. This is what full sun does to it. */
  exposure: 0.92,
}

// ---- the people, drawn ------------------------------------------------------------------------------

export const UNIT_SPRITE = {
  /** Which drawing a kind of unit is, where the sheet does not already have a piece of that name. A
   *  piece named for the kind wins without any entry here, so a new figure arriving on the sheet is
   *  a manifest change and nothing else; this is for the kinds that borrow another's. */
  pieces: { improver: 'colonist' } as Partial<Record<UnitKind, string>>,
  /** How tall a drawing this many pixels tall stands on the ground, in tiles. A little over half a
   *  tile for a figure: forty-odd device pixels at working zoom, which is where a person has to read
   *  as a person and not as a smudge.
   *
   *  Every piece keeps its own proportions against the reference, the way the settlement sheet does,
   *  so a drawing shorter than a person on the same sheet stands shorter on the ground. That is what
   *  makes a new piece a manifest change and nothing more: a cannon drawn two thirds of a figure's
   *  height is two thirds of a figure's height on the map, without a table of exceptions here. */
  referenceHeight: 200,
  tileHeight: 0.52,
  /** A hair off the ground, so a figure is not fighting the terrain for the same depth. */
  lift: 0.03,
  /** What full sun does to the drawing. It is drawn flat and pale, so it can take the light a
   *  little harder than the buildings, which arrived already lit. */
  exposure: 0.94,
  /** How much brighter the figure's sunward side is than its far side. A standing form catches
   *  the low sun on one flank; this is that, on a drawing that has no flanks of its own. */
  sunSide: 0.3,
  /** What a figure casts, in tiles: how tall the engine should think it is and how wide. As tall as
   *  it stands, so its shadow lies as far as a small tree's does, and wider than a person really is.
   *  A shadow's length is its height over the tangent of the sun, so a figure's is spread over
   *  nearly two tiles, and at a true shoulder's width that is two texels of the shadow map and
   *  invisible beside a boulder that puts the same darkness into a quarter of the distance. */
  occluderHeight: 0.5,
  occluderRadius: 0.14,
  /** The owner's mark: a ring on the ground under the feet, in charter colour. The drawing is cream
   *  and tan and a tint would ruin it, and at this size a ring reads better than a coloured coat. */
  /** The owner's mark under the feet. Dark rather than pale, and only mostly opaque: in bone at full
   *  strength it was brighter than the figure it belongs to and read as a selection highlight rather
   *  than as a mark on the ground. Enough segments that it is a circle and not a polygon. */
  ring: { inner: 0.088, outer: 0.125, lift: 0.12, opacity: 0.85, strength: 0.66, segments: 40 },
  /** Below overview zoom a figure is a mark, the same disc the unit was before it was drawn,
   *  a little larger so it still reads at sixteen pixels a tile. */
  markerScale: 1.35,
}

// ---- units ------------------------------------------------------------------------------------------

export const UNITS = {
  lift: 0.05,
  /** How far apart units on one tile stand, in tiles. Wider than it was, because a drawn figure is
   *  a fifth of a tile across and has a ring under it a third across, and at the old spacing three
   *  people on a tile stood in each other's rings. */
  stackSpacing: 0.32,
  /** How far units on a settlement's own tile shift, so they are not standing among its buildings. */
  settlementNudge: [0.14, 0.2] as [number, number],
  /** And how far from the middle of its tile a unit may end up, whatever the fan and the nudge come
   *  to. A unit's drawn position is also the position a tap is measured against, so a unit that
   *  wanders out of its own tile is a unit you cannot tap where it lives and can tap where it does
   *  not. Under a half, so it stays inside. */
  stackReach: 0.4,
  shadowColour: '#161208',
  shadowOpacity: 0.5,
  shadowOffset: 0.07,
}

// ---- cloud shadow ------------------------------------------------------------------------------------

export const CLOUD = {
  scale: 0.055,
  speed: 0.012,
  strength: 0.11,
  /** How much cooler the ground goes under a cloud, on top of simply going darker. */
  coolness: 0.35,
}

// ---- how the light is applied ---------------------------------------------------------------------

export const LIGHT = {
  /** The sky fill is stronger on an upward face than on a vertical one. */
  skyUpBias: 0.45,
  /** Bounce from the ground back up onto whatever stands on it, very slightly warm. */
  bounceColour: '#6b5a3c',
  bounceStrength: 0.12,
  /** The exponent on the diffuse term. Below one it opens the shadow side. */
  diffuseGamma: 0.85,
  /** How much key still reaches a face turned away from the sun. Without a little of this, every
   *  facet not pointing at the sun falls to the fill alone and the map goes to mud. */
  wrap: 0.26,
  /** Rim falls off with this power across the sun-facing edge. */
  rimPower: 2.6,
  /** Specular streak on water, toward the sun. */
  waterSpecStrength: 0.2,
  waterSpecPower: 40,
  /** How hard the ripple bends the water's normal. */
  waterRipple: 1.0,
  /** How much of the sky the water carries. */
  waterSkyMix: 0.26,
  /** Water holds a cast shadow much less than ground does: at full strength a headland lays a slab
   *  of black across the sea beside it. */
  waterShadow: 0.45,
  /** A prop samples the shadow map toward the sun, so it does not stand in the shadow it is itself
   *  casting. The offset a point at height y needs is y over the tangent of the sun's elevation,
   *  which at ten degrees is nearly six tiles, so it is capped: past this the prop starts reading
   *  the light of somewhere else entirely. */
  propShadowLift: 0.9,
  propShadowLiftMax: 3.2,
  /** And the offset is taken from how tall the prop is, not from how high the ground it stands on
   *  is. The shader only has the world height, so it is capped at about the tallest prop: without
   *  this a boulder on a mountain reads the light of somewhere three tiles away and a tuft on a
   *  marsh reads its own. */
  propShadowHeightMax: 0.55,
}

/** The sun as a unit vector, for a season. */
export function sunVector(look: SeasonLook): RGB {
  const e = (look.elevationDeg * Math.PI) / 180
  const a = (look.azimuthDeg * Math.PI) / 180
  return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]
}
