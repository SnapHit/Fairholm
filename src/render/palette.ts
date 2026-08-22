// Colour. Art direction brief section 9: warm and generous. Land runs green-gold through olive to
// ochre, water is a deep teal. The highest-saturation colour is reserved for the headline export.
// No owner colour ever tints terrain.

import { C } from '../sim/constants'
import type { Tile, TerrainId, ForestId } from '../sim/state'

export type RGB = [number, number, number]

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const P = C.art.palette
const TERRAIN: Record<TerrainId, RGB> = {
  water: hex(P.water), grassland: hex(P.grassland), plains: hex(P.plains), downs: hex(P.downs), marsh: hex(P.marsh),
  highland: hex(P.highland), mountain: hex(P.mountain), dry: hex(P.dry),
}
const FOREST: Record<ForestId, RGB> = {
  lightWoodland: hex(P.lightWoodland), deepTimber: hex(P.deepTimber), highlandForest: hex(P.highlandForest), coastalScrub: hex(P.coastalScrub),
}
export const WATER = hex(P.water)
export const DEEP_WATER = hex(P.deepWater)
export const SHORE = hex(P.shore)
export const RIVER = hex(P.river)
export const ROAD = hex(P.road)
export const BLOOM = hex(P.bloom)
export const SNOW = hex(P.snow)

/** Base ground colour of a tile before blending, lighting and season. Forest tints toward its canopy
 * colour a little so the ground under props reads darker; the props carry the rest. */
export function tileColour(t: Tile): RGB {
  const base = TERRAIN[t.terrain]
  if (t.forest) {
    const f = FOREST[t.forest]
    return [base[0] * 0.6 + f[0] * 0.4, base[1] * 0.6 + f[1] * 0.4, base[2] * 0.6 + f[2] * 0.4]
  }
  if (t.workings) return [base[0] * 0.85, base[1] * 0.82, base[2] * 0.8]
  if (t.prime === 'bloomMeadow') return [base[0] * 0.7 + BLOOM[0] * 0.3, base[1] * 0.75 + BLOOM[1] * 0.25, base[2] * 0.8 + BLOOM[2] * 0.2]
  if (t.prime === 'seam') return [base[0] * 0.9 + 0.1, base[1] * 0.9 + 0.08, base[2] * 0.85]
  if (t.improved) return [base[0] * 0.95, base[1] * 1.02, base[2] * 0.9]
  return base
}

export function forestCanopy(f: ForestId): RGB { return FOREST[f] }

/** Height in world units for a terrain type, used to shape the surface seen under a raking sun. */
export function terrainHeight(t: Tile): number {
  switch (t.terrain) {
    case 'water': return -0.35
    case 'marsh': return 0.02
    case 'grassland': return 0.08
    case 'plains': return 0.1
    case 'dry': return 0.1
    case 'downs': return 0.22
    case 'highland': return 0.5
    case 'mountain': return 0.95
  }
}

export function ownerColour(s: { charters: { colour: string }[] }, owner: number): RGB {
  return hex(s.charters[owner]?.colour ?? '#ffffff')
}
