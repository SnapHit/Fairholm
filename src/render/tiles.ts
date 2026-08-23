// A read-only look at one tile, for anything outside the map that wants to draw the same ground the
// map draws. The settlement screen's ring uses it, so the ring is real terrain rather than icons and
// inherits every improvement to the palette or the season grade without a second art pipeline.
// Settlement screen brief section 6, point 1.
//
// Nothing here builds geometry, touches the renderer or mutates anything.

import { C } from '../sim/constants'
import type { GameState, TerrainId, ForestId, PrimeId } from '../sim/state'
import { season } from '../sim/turn'
import { neighbours8 } from '../sim/worldgen'
import { tileColour, forestCanopy, DEEP_WATER, RIVER, ROAD, type RGB } from './palette'
import { seasonUniforms } from './terrain'

export interface TileLook {
  /** The ground colour the map paints for this tile this season, as a css colour. */
  colour: string
  /** The canopy colour over it, or null when nothing grows there. */
  canopy: string | null
  terrain: TerrainId
  forest: ForestId | null
  prime: PrimeId | null
  water: boolean
  /** Open water rather than the shallows: no land touches it. */
  deep: boolean
  river: 0 | 1 | 2
  riverColour: string
  road: boolean
  roadColour: string
  /** Ploughed or drained. */
  improved: boolean
  /** Old workings: a little more ore and a visible history. */
  workings: boolean
}

function css(c: RGB): string {
  const b = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  return `rgb(${b(c[0])}, ${b(c[1])}, ${b(c[2])})`
}

/** The grade the terrain shader applies: a flat-lit surface, then the season's saturation and tint. */
function graded(base: RGB, s: GameState): RGB {
  const su = seasonUniforms(season(s.turn))
  // the shader's lighting for a surface facing straight up, so a swatch reads at the same weight
  // as level ground on the map does
  const light = 0.48 + 0.62 * su.sun.y + 0.08 * 0.3
  const c: RGB = [base[0] * light, base[1] * light, base[2] * light]
  const l = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114
  return [
    l + (c[0] - l) * su.saturation + su.grade.x,
    l + (c[1] - l) * su.saturation + su.grade.y,
    l + (c[2] - l) * su.saturation + su.grade.z,
  ]
}

/** How one tile looks, for a swatch outside the map. */
export function tileLook(s: GameState, index: number): TileLook {
  const t = s.world.tiles[index]
  const water = t.terrain === 'water'
  let base = tileColour(t)
  let deep = false
  if (water) {
    deep = !neighbours8(s.world.width, s.world.height, index).some(n => s.world.tiles[n].terrain !== 'water')
    if (deep) base = DEEP_WATER
  }
  return {
    colour: css(graded(base, s)),
    canopy: t.forest ? css(graded(forestCanopy(t.forest), s)) : null,
    terrain: t.terrain,
    forest: t.forest,
    prime: t.prime,
    water,
    deep,
    river: t.river,
    riverColour: css(graded(RIVER, s)),
    road: t.road,
    roadColour: css(graded(ROAD, s)),
    improved: t.improved,
    workings: t.workings,
  }
}

/** The words the interface uses for terrain, forest and prime. One place, so a new terrain that has
 *  no name is obvious rather than rendering as undefined. */
export const TERRAIN_WORDS: Record<TerrainId, string> = {
  grassland: 'Grassland', plains: 'Plains', downs: 'Downs', marsh: 'Marsh',
  highland: 'Highland', mountain: 'Mountain', dry: 'Dry ground', water: 'Water',
}
export const FOREST_WORDS: Record<ForestId, string> = {
  lightWoodland: 'light woodland', deepTimber: 'deep timber',
  highlandForest: 'highland forest', coastalScrub: 'coastal scrub',
}
export const PRIME_WORDS: Record<PrimeId, string> = {
  richSoil: 'rich soil', pasture: 'pasture', stand: 'a fine stand', lode: 'a lode',
  seam: 'a gold seam', flaxField: 'a flax field', hempField: 'a hemp field',
  madderBed: 'a madder bed', bloomMeadow: 'bloom meadow', shoal: 'a shoal',
}

/** A short description of the ground, for a tile's reason line. */
export function tileWords(look: TileLook): string {
  const parts = [TERRAIN_WORDS[look.terrain]]
  if (look.forest) parts.push(FOREST_WORDS[look.forest])
  if (look.river) parts.push(look.river === 2 ? 'a major river' : 'a river')
  if (look.road) parts.push('a road')
  if (look.improved) parts.push('worked ground')
  if (look.prime) parts.push(PRIME_WORDS[look.prime])
  if (look.workings) parts.push('old workings')
  return parts.join(', ')
}

/** Whether a tile could hold a prime at all, so the ring's prime mark is never a surprise. */
export const PRIME_GOOD: Record<PrimeId, string> = Object.fromEntries(
  (Object.keys(C.terrain.primes) as PrimeId[]).map(p => [p, C.terrain.primes[p].good]),
) as Record<PrimeId, string>
