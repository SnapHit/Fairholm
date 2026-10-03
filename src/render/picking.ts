// Picking. Interaction brief section 2: a tap on a tile below working zoom does nothing to the tile
// because the tile is not tappable there, but markers (settlements, units) keep a larger hit area
// at every zoom so the map remains an index of things at overview.

import type { GameState } from '../sim/state'
import { C } from '../sim/constants'
import { settlementKnown } from '../sim/fog'
import type { MapCamera } from './camera'
import type { Billboard } from './billboards'
import { TAP } from './look'

export interface Pick {
  tile: number | null
  settlement: number | null
  unit: number | null
  predecessor: number | null
}

/** The pictures a tap can land on, as the scene last drew them: each unit's box as offsets from where
 *  it stands, each settlement building's box where it stands, and whether pictures are drawn at all
 *  at this zoom (below it a unit is a mark). */
export interface PicturesForPicking {
  units: Map<number, { box: [number, number, number, number]; bill?: Billboard }>
  settlements: { id: number; box: [number, number, number, number]; foot: number; bill?: Billboard }[]
  shown: boolean
  /** How much of a picture is drawn at a point on the ground, its foot at (fx, fz): nought clear, one
   *  solid, null where it cannot be told. Without it every picture is taken as solid to its edges. */
  cover?: (b: Billboard, fx: number, fz: number, wx: number, wz: number) => number | null
}



/** What is under a tap. Feel brief section 3: a tap anywhere on a unit's drawn picture is a tap on
 *  that unit, the parts hanging over the next tiles included, the lander's length, a mast, a
 *  rider's head. The pictures are tried front-most first, in the order they are drawn back to front
 *  (down the screen is in front), settlement buildings among them, and every unit answers across at
 *  least `minPx` in each direction even where its picture is smaller. Only then the settlement and
 *  predecessor marks, and then the tile.
 *
 *  A unit not in `unitPositions` was not drawn and is not here; a settlement or a predecessor people
 *  the player has never seen is not here either while the fog is on. A tile is always here, known or
 *  not: a path can be planned into the unknown. With `margins` off only what is drawn at the point
 *  counts, for a hold, which aims at a tile unless it is plainly on a unit. */
export function pick(s: GameState, cam: MapCamera, px: number, py: number, unitPositions: Map<number, [number, number]>, pictures?: PicturesForPicking, minPx = 44, margins = true): Pick {
  const w = s.world.width, h = s.world.height
  const [wx, wz] = cam.screenToWorld(px, py)
  const tx = Math.floor(wx), tz = Math.floor(wz)
  const inMap = tx >= 0 && tz >= 0 && tx < w && tz < h
  const tile = inMap ? tz * w + tx : null
  const zoom = cam.view.zoom
  const tileTappable = zoom >= C.feel.tileTapFloor
  const fog = C.flags.fogOfWar

  // ---- the pictures, front-most first --------------------------------------------------------
  // A tap on a unit's drawn picture is a tap on that unit, front-most first, and a unit beats a
  // settlement's building wherever the unit itself is drawn, even behind one: a unit is small and a
  // settlement has its whole picture and its mark besides. Each unit also answers on the clear parts
  // of its picture and across a margin around it, out to `minPx` in each direction, wherever no
  // unit is drawn and no building is drawn in front of it.
  const shown = pictures?.shown ?? false
  type Hit = { kind: 'unit' | 'settlement'; id: number; foot: number }
  let unitSolid: Hit | null = null, unitLoose: Hit | null = null, building: Hit | null = null
  const screenRect = (x0: number, z0: number, x1: number, z1: number) => {
    let [ax, ay] = cam.worldToScreen(x0, z0)
    let [bx, by] = cam.worldToScreen(x1, z1)
    if (ax > bx) [ax, bx] = [bx, ax]
    if (ay > by) [ay, by] = [by, ay]
    return [ax, ay, bx, by]
  }
  const front = (a: Hit | null, b: Hit) => (!a || b.foot > a.foot ? b : a)
  for (const u of s.units) {
    const pos = unitPositions.get(u.id)
    if (!pos) continue
    const pic = shown ? pictures?.units.get(u.id) : undefined
    const box = pic?.box ?? TAP.markBox
    let [ax, ay, bx, by] = screenRect(pos[0] + box[0], pos[1] + box[1], pos[0] + box[2], pos[1] + box[3])
    const onPicture = px >= ax && px <= bx && py >= ay && py <= by
    const hit: Hit = { kind: 'unit', id: u.id, foot: pos[1] }
    if (onPicture) {
      const c = pic?.bill && pictures?.cover ? pictures.cover(pic.bill, pos[0], pos[1], wx, wz) : null
      if (c === null || c >= TAP.solid) { unitSolid = front(unitSolid, hit); continue }
    }
    if (!margins) continue
    // never smaller than a thumb, grown about its own middle
    if (bx - ax < minPx) { const c = (ax + bx) / 2; ax = c - minPx / 2; bx = c + minPx / 2 }
    if (by - ay < minPx) { const c = (ay + by) / 2; ay = c - minPx / 2; by = c + minPx / 2 }
    if (onPicture || (px >= ax && px <= bx && py >= ay && py <= by)) unitLoose = front(unitLoose, hit)
  }
  if (shown && pictures) for (const sp of pictures.settlements) {
    const [ax, ay, bx, by] = screenRect(sp.box[0], sp.box[1], sp.box[2], sp.box[3])
    if (px < ax || px > bx || py < ay || py > by) continue
    const c = sp.bill && pictures.cover ? pictures.cover(sp.bill, sp.bill.x, sp.bill.z, wx, wz) : null
    if (c === null || c >= TAP.solid) building = front(building, { kind: 'settlement', id: sp.id, foot: sp.foot })
  }
  const solid = unitSolid as Hit | null, loose = unitLoose as Hit | null, built = building as Hit | null
  const found = solid ?? (loose && (!built || loose.foot > built.foot) ? loose : built)
  if (found?.kind === 'unit') return { tile: tileTappable ? tile : null, settlement: null, unit: found.id, predecessor: null }
  if (found?.kind === 'settlement') return { tile: tileTappable ? tile : null, settlement: found.id, unit: null, predecessor: null }

  // ---- the marks: a settlement or a predecessor people at any zoom ------------------------------
  const markHit = Math.max(18, Math.min(34, zoom * 0.55))   // marker hit radius in pixels
  let settlement: number | null = null, predecessor: number | null = null
  let best = markHit
  for (const st of s.settlements) {
    if (fog && !settlementKnown(st)) continue
    const [sx, sy] = cam.worldToScreen((st.tile % w) + 0.5, Math.floor(st.tile / w) + 0.5)
    const d = Math.hypot(sx - px, sy - py)
    if (d < best) { best = d; settlement = st.id; predecessor = null }
  }
  for (const p of s.predecessors) {
    if (fog && !p.scouted) continue
    const [sx, sy] = cam.worldToScreen((p.tile % w) + 0.5, Math.floor(p.tile / w) + 0.5)
    const d = Math.hypot(sx - px, sy - py)
    if (d < best) { best = d; predecessor = p.id; settlement = null }
  }
  return { tile: tileTappable ? tile : null, settlement, unit: null, predecessor }
}

export function tileUnderPoint(s: GameState, cam: MapCamera, px: number, py: number): number | null {
  const w = s.world.width, h = s.world.height
  const [wx, wz] = cam.screenToWorld(px, py)
  const tx = Math.floor(wx), tz = Math.floor(wz)
  return tx >= 0 && tz >= 0 && tx < w && tz < h ? tz * w + tx : null
}
