// Read-only views of the state for the renderer, where it needs something the simulation already
// knows but does not export. Nothing here writes to the state, and nothing in /src/sim knows this
// file exists.

import type { GameState, Wave } from '../sim/state'
import { landComponents, dist } from '../sim/worldgen'

/** The anchorages a wave at sea might still land at: the ones that serve the player's landmass,
 *  nearest the player's settlements where there are any within reach, less the coast its heading
 *  has ruled out. The same reading of the world as the fleet makes, so the two agree. */
export function waveCandidates(s: GameState, wave: Wave): number[] {
  const w = s.world.width
  const comp = landComponents(w, s.world.height, s.world.tiles).comp
  const mine = s.settlements.filter(x => x.owner === 0)
  const home = comp[s.charters[0].landing]
  const all = s.world.anchorages.filter(a => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = (a % w) + dx, z = Math.floor(a / w) + dz
      if (x < 0 || z < 0 || x >= w || z >= s.world.height) continue
      if (comp[z * w + x] === home) return true
    }
    return false
  })
  const near = all.filter(a => mine.some(m => dist(w, a, m.tile) <= 10))
  return (near.length ? near : all).filter(a => !wave.excluded.includes(a))
}

/** Open water within reach of a point: the water tile with the most water around it, so a thing
 *  put down there is clearly at sea rather than on the beach. */
export function openWaterNear(s: GameState, x: number, z: number, reach: number): [number, number] | null {
  const w = s.world.width, h = s.world.height
  let best = -Infinity, bx = 0, bz = 0
  for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
    const nx = Math.floor(x) + dx, nz = Math.floor(z) + dz
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
    if (s.world.tiles[nz * w + nx].terrain !== 'water') continue
    let water = 0
    for (let ez = -1; ez <= 1; ez++) for (let ex = -1; ex <= 1; ex++) {
      const t = s.world.tiles[(nz + ez) * w + (nx + ex)]
      if (t && t.terrain === 'water') water++
    }
    const score = water * 2 - Math.hypot(dx, dz) * 0.5
    if (score > best) { best = score; bx = nx + 0.5; bz = nz + 0.5 }
  }
  return best > -Infinity ? [bx, bz] : null
}
