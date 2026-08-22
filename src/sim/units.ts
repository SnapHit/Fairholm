// Unit helpers shared by actions, orders and the military: movement allowance, pathfinding with
// terrain costs, and the equipment that defines a unit (military brief section 1).

import { C } from './constants'
import type { GameState, Unit, UnitKind, Colonist, HullKind, LandKind } from './state'
import { neighbours8 } from './worldgen'

export const HULLS: HullKind[] = ['lighter', 'trader', 'raider', 'cutter']
export function isHull(kind: UnitKind): boolean { return (HULLS as string[]).includes(kind) }
export function isCompany(kind: UnitKind): boolean { return kind === 'regulars' || kind === 'horse' || kind === 'siegeTrain' || kind === 'damagedSiegeTrain' || kind === 'companyShip' }
export function isArmed(kind: UnitKind): boolean { return kind === 'militia' || kind === 'outrider' || kind === 'battery' || kind === 'damagedBattery' || isCompany(kind) }

export function maxMoves(u: Unit): number {
  switch (u.kind) {
    case 'colonist': return C.military.units.colonist.moves
    case 'militia': return C.military.units.militia.moves
    case 'outrider': return C.military.units.outrider.moves
    case 'battery': case 'damagedBattery': return C.military.units.battery.moves
    case 'improver': return C.military.units.improver.moves
    case 'hauler': return C.military.units.hauler.moves
    case 'regulars': return 1
    case 'horse': return 3
    case 'siegeTrain': case 'damagedSiegeTrain': return 1
    case 'companyShip': return 4
    default: {
      const h = C.naval.hulls[u.kind as HullKind]
      return Math.max(1, h.speed - Math.floor(u.damage))
    }
  }
}

export function cargoCapacity(u: Unit): number {
  if (u.kind === 'hauler') return C.military.units.hauler.capacity
  if (isHull(u.kind)) return Math.max(20, Math.round(C.naval.hulls[u.kind as HullKind].capacity * (1 - u.damage * 0.15)))
  return 0
}

/** Cost to enter a tile for a unit, or Infinity if impassable. */
export function enterCost(s: GameState, u: Unit, tile: number): number {
  const t = s.world.tiles[tile]
  const water = t.terrain === 'water'
  if (isHull(u.kind) || u.kind === 'companyShip') {
    if (water) return 1
    // a hull may enter a coastal settlement tile (a port) or a major river tile
    if (s.settlements.some(st => st.tile === tile) || t.river === 2) return 1
    return Infinity
  }
  if (water) return Infinity
  if (t.road) return C.terrain.roadMoveCost
  let c = C.terrain.moveCost[t.terrain]
  if (t.forest) c += C.terrain.forestMoveCost
  if (t.river === 1) c = Math.min(c, 1)
  if (u.kind === 'hauler' && !t.road && t.terrain !== 'grassland' && t.terrain !== 'plains' && t.terrain !== 'downs' && t.terrain !== 'dry' && t.river === 0) return Infinity
  return c
}

/** Dijkstra over the grid. Returns the path excluding the start tile, or null. */
export function findPath(s: GameState, u: Unit, from: number, to: number, maxLen = 400): number[] | null {
  if (from === to) return []
  const w = s.world.width, h = s.world.height
  const N = w * h
  const distv = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  distv[from] = 0
  // simple binary heap
  const heap: [number, number][] = [[0, from]]
  const push = (d: number, i: number) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p } }
  const pop = () => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m } } return top }
  let expanded = 0
  while (heap.length) {
    const [d, i] = pop()
    if (d > distv[i]) continue
    if (i === to) break
    if (++expanded > maxLen * 40) break
    for (const n of neighbours8(w, h, i)) {
      const c = enterCost(s, u, n)
      if (!isFinite(c)) continue
      // blocked by a hostile unit or foreign settlement
      if (n !== to && s.settlements.some(st => st.tile === n && st.owner !== u.owner)) continue
      const nd = d + c
      if (nd < distv[n]) { distv[n] = nd; prev[n] = i; push(nd, n) }
    }
  }
  if (!isFinite(distv[to])) return null
  const path: number[] = []
  for (let c = to; c !== from && c >= 0; c = prev[c]) path.push(c)
  path.reverse()
  return path
}

/** Walk a unit along its stored path as far as its moves allow. Returns true if it arrived. */
export function advance(s: GameState, u: Unit): boolean {
  while (u.path.length && u.moves > 0) {
    const nextTile = u.path[0]
    const c = enterCost(s, u, nextTile)
    if (!isFinite(c)) { u.path = []; return false }
    if (s.units.some(o => o.tile === nextTile && o.owner !== u.owner && isArmed(o.kind))) { u.path = []; return false }
    u.moves -= c
    u.tile = nextTile
    u.path.shift()
    s.world.tiles[nextTile].explored = true
  }
  if (u.moves < 0) u.moves = 0
  return u.path.length === 0
}

export interface EquipCost { arms?: number; horses?: number; tooling?: number }

/** What it costs to turn a colonist into each land unit, from the settlement stock. */
export function equipCost(kind: LandKind): EquipCost {
  switch (kind) {
    case 'militia': return { arms: C.military.units.militia.arms }
    case 'outrider': return { arms: C.military.units.militia.arms, horses: C.military.units.outrider.horses }
    case 'battery': return { arms: C.military.units.battery.arms }
    case 'improver': return { tooling: C.military.units.improver.tooling }
    case 'hauler': return { horses: C.military.units.hauler.horses }
    default: return {}
  }
}

export function makeUnit(s: GameState, owner: number, kind: UnitKind, tile: number, colonist: Colonist | null): Unit {
  const u: Unit = { id: s.nextId++, owner, kind, tile, quality: 'raw', moves: 0, cargo: {}, colonist, order: null, path: [], damage: 0, progress: 0, since: {}, flagged: true }
  u.moves = maxMoves(u)
  return u
}

export function unitAttack(u: Unit, target: 'settlement' | 'open'): number {
  const q = u.quality === 'raw' ? 0 : u.quality === 'hardened' ? C.military.qualityStep : C.military.qualityStep * 2
  switch (u.kind) {
    case 'militia': return C.military.units.militia.attack + q
    case 'outrider': return C.military.units.outrider.attack + q
    case 'battery': return target === 'settlement' ? C.military.units.battery.attackSettlement : C.military.units.battery.attackOpen
    case 'damagedBattery': return target === 'settlement' ? C.military.units.battery.attackSettlement / 2 : 1
    case 'regulars': return C.military.company.regulars
    case 'horse': return C.military.company.horse
    case 'siegeTrain': return target === 'settlement' ? C.military.company.siegeAttack : C.military.company.siegeOpen
    case 'damagedSiegeTrain': return target === 'settlement' ? C.military.company.siegeAttack / 2 : 1
    default: return 0
  }
}

export function unitDefence(u: Unit, inSettlement: boolean): number {
  const q = u.quality === 'raw' ? 0 : u.quality === 'hardened' ? C.military.qualityStep : C.military.qualityStep * 2
  switch (u.kind) {
    case 'militia': return C.military.units.militia.defence + q
    case 'outrider': return C.military.units.outrider.defence + q
    case 'battery': return inSettlement ? C.military.units.battery.defenceSettlement : C.military.units.battery.defenceOpen
    case 'damagedBattery': return inSettlement ? C.military.units.battery.defenceSettlement / 2 : 1
    case 'regulars': return C.military.company.regulars
    case 'horse': return C.military.company.horse
    case 'siegeTrain': return inSettlement ? C.military.company.siegeDefenceSettlement : C.military.company.siegeOpen
    case 'damagedSiegeTrain': return inSettlement ? C.military.company.siegeDefenceSettlement / 2 : 1
    default: return 1
  }
}
