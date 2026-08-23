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
import type { TerrainId, ForestId } from '../sim/state'

export type RGB = [number, number, number]

export function hexRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// ---- the four seasons, each a complete palette ---------------------------------------------------

export interface SeasonLook {
  name: string
  /** The sun: a warm key at a low elevation, which is what makes a surface seen from above read as
   *  landscape rather than as a plan. Elevation in degrees above the horizon. */
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
    keyColour: '#ffe9bd', keyStrength: 1.48, elevationDeg: 21, azimuthDeg: -52,
    ambientColour: '#8fb2dc', ambientStrength: 0.36,
    shadowStrength: 0.54, shadowColour: '#5f7ea8',
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
    keyColour: '#fff2cf', keyStrength: 1.56, elevationDeg: 27, azimuthDeg: -38,
    ambientColour: '#8db1d6', ambientStrength: 0.33,
    shadowStrength: 0.54, shadowColour: '#63799e',
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
    keyColour: '#ffdca4', keyStrength: 1.5, elevationDeg: 17, azimuthDeg: -22,
    ambientColour: '#93a6cc', ambientStrength: 0.34,
    shadowStrength: 0.62, shadowColour: '#6b6f96',
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
    keyColour: '#ffd7a2', keyStrength: 1.42, elevationDeg: 13, azimuthDeg: -6,
    ambientColour: '#8aa8d6', ambientStrength: 0.46,
    shadowStrength: 0.64, shadowColour: '#6f88bb',
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
  /** Fine noise in the fragment shader, under the textures. */
  filmStrength: 0.035,
  filmScale: 190,
}

// ---- the baked shadow map -------------------------------------------------------------------------

export const SHADOW = {
  /** Texels per tile on the map that is sampled. Twelve is what a tree's shadow needs to be more
   *  than a smudge at detail zoom. */
  texelsPerTile: 12,
  /** The ray march runs on a grid this many times coarser, because a ridge's shadow is broad and the
   *  march is the expensive half. The result is lifted back onto the fine grid before the props are
   *  stamped onto it. */
  marchDivisor: 3,
  /** Samples along one ray, and how fast the step between them grows. */
  marchSteps: 26,
  marchGrowth: 1.14,
  /** How far a ray looks toward the sun, in tiles. Beyond this a shadow simply stops. */
  reachTiles: 8,
  /** The ground's relief is exaggerated so that a top-down view has something to shade. Taking the
   *  shadow march at full height then throws shadows two tiles long off an ordinary hillside, which
   *  reads as a slab of black rather than as shade. The march uses this fraction of the height. */
  terrainScale: 0.42,
  /** Height difference, in tiles, over which a shadow edge softens. */
  softness: 0.7,
  /** Passes of a three by three blur over the baked map. */
  blurPasses: 2,
  /** Ambient occlusion baked into the vertex colour: how far it looks and how hard it bites. */
  aoRadius: 3,
  aoStrength: 1.0,
  aoFloor: 0.62,
  aoCeiling: 1.08,
  /** A prop's own contact shadow: how wide, relative to the prop, and how dark. */
  contactWidth: 1.35,
  contactDepth: 0.9,
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
  /** Boulders and scattered rock, per tile of each terrain. */
  rocks: { mountain: 22, highland: 13, downs: 3, dry: 3, marsh: 0, grassland: 0, plains: 0, water: 0 } as Record<TerrainId, number>,
  /** Tufts and pebbles on open ground. Detail zoom only, because at working zoom they are noise. */
  tufts: { grassland: 16, plains: 13, downs: 12, dry: 7, marsh: 0, highland: 5, mountain: 2, water: 0 } as Record<TerrainId, number>,
  /** Reeds in a marsh. */
  reeds: 24,
  /** Debris along the waterline. */
  shoreDebris: 9,
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

// ---- units ------------------------------------------------------------------------------------------

export const UNITS = {
  lift: 0.05,
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
  /** A prop samples the shadow map a little toward the sun, so it does not stand in the shadow it
   *  is itself casting. Multiplied by how high above the ground the fragment is. */
  propShadowLift: 1.1,
}

/** The sun as a unit vector, for a season. */
export function sunVector(look: SeasonLook): RGB {
  const e = (look.elevationDeg * Math.PI) / 180
  const a = (look.azimuthDeg * Math.PI) / 180
  return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]
}
