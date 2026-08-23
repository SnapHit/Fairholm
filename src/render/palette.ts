// Colour and elevation, per season. Art direction brief section 9: warm and generous, land running
// green-gold through olive to ochre, water a deep teal. Every value comes from src/render/look.ts;
// nothing here is a literal.
//
// The season is a whole palette, not a tint, so these take the season and the caller passes it. The
// vertex colours are re-baked when the season turns, which is a per-turn cost, not a per-frame one.

import type { Tile, TerrainId, ForestId } from '../sim/state'
import { seasonLook, hexRgb, SURFACE, type RGB } from './look'

export type { RGB }

export function hex(h: string): RGB { return hexRgb(h) }

const tileCache = new Map<string, RGB>()

/** Base ground colour of a tile before lighting, for one season. Forest tints toward its canopy a
 *  little so the ground under the props reads darker; the props carry the rest.
 *
 *  Memoised on what it actually depends on, because colouring the surface asks nine times per vertex
 *  and a large map has a quarter of a million of those. */
export function tileColour(t: Tile, season = 1): RGB {
  const key = `${t.terrain}|${t.forest ?? ''}|${t.workings ? 1 : 0}|${t.prime ?? ''}|${t.improved ? 1 : 0}|${season}`
  const had = tileCache.get(key)
  if (had) return had
  const out = computeTileColour(t, season)
  tileCache.set(key, out)
  return out
}

function computeTileColour(t: Tile, season: number): RGB {
  const look = seasonLook(season)
  const base = hexRgb(look.ground[t.terrain])
  if (t.forest) {
    const f = hexRgb(look.canopy[t.forest])
    return [base[0] * 0.62 + f[0] * 0.38, base[1] * 0.62 + f[1] * 0.38, base[2] * 0.62 + f[2] * 0.38]
  }
  if (t.workings) return [base[0] * 0.84, base[1] * 0.8, base[2] * 0.76]
  if (t.prime === 'bloomMeadow') { const b = hexRgb(look.ground.dry); return [base[0] * 0.62 + b[0] * 0.38, base[1] * 0.72 + b[1] * 0.28, base[2] * 0.84 + b[2] * 0.16] }
  if (t.prime === 'seam') return [base[0] * 0.9 + 0.11, base[1] * 0.9 + 0.09, base[2] * 0.86]
  if (t.improved) return [base[0] * 0.95, base[1] * 1.03, base[2] * 0.88]
  return base
}

export function forestCanopy(f: ForestId, season = 1): RGB { return hexRgb(seasonLook(season).canopy[f]) }

export function waterColours(season = 1): { shallow: RGB; deep: RGB; sky: RGB } {
  const look = seasonLook(season)
  return { shallow: hexRgb(look.water), deep: hexRgb(look.deepWater), sky: hexRgb(look.sky) }
}

export function shoreColour(season = 1): RGB { return hexRgb(seasonLook(season).shore) }
export function snowColour(season = 1): RGB { return hexRgb(seasonLook(season).snow) }
export function riverColour(season = 1): RGB { return hexRgb(seasonLook(season).river) }
export function roadColour(season = 1): RGB { return hexRgb(seasonLook(season).road) }
export function clearColour(season = 1): RGB { return hexRgb(seasonLook(season).clear) }

/** Height in world units for a terrain type. Real relief: the camera looks straight down, so this
 *  never moves anything on screen and arrives entirely as shading and as the length of a shadow. */
export function terrainHeight(t: Tile): number {
  return SURFACE.height[t.terrain]
}

export function terrainRoughness(t: TerrainId): number {
  return SURFACE.roughness[t]
}

export function ownerColour(s: { charters: { colour: string }[] }, owner: number): RGB {
  return hexRgb(s.charters[owner]?.colour ?? '#ffffff')
}

// kept for callers that want the season's own bright accent
export function bloomColour(season = 1): RGB { return hexRgb(seasonLook(season).road) }
