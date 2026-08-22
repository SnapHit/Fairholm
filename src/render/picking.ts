// Picking. Interaction brief section 2: a tap on a tile below working zoom does nothing to the tile
// because the tile is not tappable there, but markers (settlements, units) keep a larger hit area
// at every zoom so the map remains an index of things at overview.

import type { GameState } from '../sim/state'
import { C } from '../sim/constants'
import type { MapCamera } from './camera'

export interface Pick {
  tile: number | null
  settlement: number | null
  unit: number | null
  predecessor: number | null
}

export function pick(s: GameState, cam: MapCamera, px: number, py: number, unitPositions: Map<number, [number, number]>): Pick {
  const w = s.world.width, h = s.world.height
  const [wx, wz] = cam.screenToWorld(px, py)
  const tx = Math.floor(wx), tz = Math.floor(wz)
  const inMap = tx >= 0 && tz >= 0 && tx < w && tz < h
  const tile = inMap ? tz * w + tx : null
  const zoom = cam.view.zoom
  const hit = Math.max(18, Math.min(34, zoom * 0.55))   // marker hit radius in pixels
  let settlement: number | null = null, unit: number | null = null, predecessor: number | null = null
  let best = hit
  for (const st of s.settlements) {
    const [sx, sy] = cam.worldToScreen((st.tile % w) + 0.5, Math.floor(st.tile / w) + 0.5)
    const d = Math.hypot(sx - px, sy - py)
    if (d < best) { best = d; settlement = st.id; unit = null; predecessor = null }
  }
  for (const p of s.predecessors) {
    const [sx, sy] = cam.worldToScreen((p.tile % w) + 0.5, Math.floor(p.tile / w) + 0.5)
    const d = Math.hypot(sx - px, sy - py)
    if (d < best) { best = d; predecessor = p.id; settlement = null; unit = null }
  }
  // units beat settlements when the tap is clearly on the unit
  let ubest = hit * 0.8
  for (const u of s.units) {
    const pos = unitPositions.get(u.id)
    if (!pos) continue
    const [sx, sy] = cam.worldToScreen(pos[0], pos[1])
    const d = Math.hypot(sx - px, sy - py)
    if (d < ubest) { ubest = d; unit = u.id }
  }
  if (unit !== null) { settlement = null; predecessor = null }
  const tileTappable = zoom >= C.feel.tileTapFloor
  return { tile: tileTappable ? tile : null, settlement, unit, predecessor }
}

export function tileUnderPoint(s: GameState, cam: MapCamera, px: number, py: number): number | null {
  const w = s.world.width, h = s.world.height
  const [wx, wz] = cam.screenToWorld(px, py)
  const tx = Math.floor(wx), tz = Math.floor(wz)
  return tx >= 0 && tz >= 0 && tx < w && tz < h ? tz * w + tx : null
}
