// The opening at sea, at speed. Setting brief section 7, onboarding brief sections 2 and 6, session
// brief section 8, as changed on 2 October 2026: the lander sails six tiles a turn and sees three,
// the fog lifts along the whole of a move and not only where it stops, a path planned through
// water nobody has seen stops where it meets land, a move longer than a turn's sailing carries on
// the next turn, the rivals sail at the same speed, and the boat left behind keeps its own.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { C } from '../src/sim/constants'
import { maxMoves, findPath, makeUnit } from '../src/sim/units'
import { neighbours8, landHeadings, HEADINGS } from '../src/sim/worldgen'
import { sightOf } from '../src/sim/fog'
import { playOpening } from './helpers'
import type { GameState, Unit } from '../src/sim/state'

const lander = (s: GameState): Unit => s.units.find(u => u.owner === 0 && u.kind === 'lander')!

/** The furthest tile a lander at `from` can sail straight along a heading through real water,
 *  up to `n` tiles, and the tiles on the way. */
function straight(s: GameState, from: number, dir: [number, number], n: number): number[] {
  const w = s.world.width, h = s.world.height
  const out: number[] = []
  let x = from % w, z = Math.floor(from / w)
  for (let k = 0; k < n; k++) {
    x += dir[0]; z += dir[1]
    if (x < 0 || z < 0 || x >= w || z >= h) break
    const t = z * w + x
    if (s.world.tiles[t].terrain !== 'water') break
    out.push(t)
  }
  return out
}

describe('the fast lander', () => {
  it('sails six tiles a turn and sees three, the rivals sail as fast, and the boat it leaves keeps a lighter\'s pace', () => {
    const s = createGame('fast-speeds', { size: 'small' }, 1)
    for (const u of s.units.filter(x => x.kind === 'lander')) expect(maxMoves(u)).toBe(C.lander.moves)
    expect(C.lander.moves).toBe(6)
    expect(sightOf('lander')).toBe(3)
    playOpening(s)
    const boat = s.units.find(u => u.owner === 0 && u.kind === 'lighter')!
    expect(maxMoves(boat)).toBe(C.naval.hulls.lighter.speed)
    expect(maxMoves(boat)).toBeLessThan(C.lander.moves)
  })

  it('lifts the fog from every tile it passes, not only where it stops', () => {
    const s = createGame('fast-reveal', { size: 'standard' }, 1)
    const u = lander(s)
    // the longest straight run of water from the splashdown, as far as a move goes
    const runs = HEADINGS.map(d => straight(s, u.tile, d, C.lander.moves))
    const run = runs.sort((a, b) => b.length - a.length)[0]
    expect(run.length).toBeGreaterThanOrEqual(4)
    applyAction(s, { t: 'moveUnit', unit: u.id, path: run })
    expect(u.tile).toBe(run[run.length - 1])
    const w = s.world.width, h = s.world.height, r = C.lander.sight
    // every tile within sight of every tile on the way is explored
    for (const at of run) {
      const x0 = at % w, z0 = Math.floor(at / w)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx, z = z0 + dz
        if (x < 0 || z < 0 || x >= w || z >= h) continue
        expect(s.world.tiles[z * w + x].explored).toBe(true)
      }
    }
  })

  it('plans through water nobody has seen as though it were open, and stops at the coast it meets', () => {
    const s = createGame('fast-blind', { size: 'small' }, 1)
    const u = lander(s)
    const w = s.world.width, h = s.world.height
    // a destination beyond land: the first land tile on any heading, and the tile two past it
    let target = -1, coastWater = -1
    for (const [dx, dz] of HEADINGS) {
      let x = u.tile % w, z = Math.floor(u.tile / w), lastWater = u.tile
      for (let k = 1; k < 20; k++) {
        x += dx; z += dz
        if (x < 0 || z < 0 || x >= w || z >= h) break
        const t = z * w + x
        if (s.world.tiles[t].terrain !== 'water') {
          const bx = x + dx * 2, bz = z + dz * 2
          if (k <= C.lander.moves && bx >= 0 && bz >= 0 && bx < w && bz < h && !s.world.tiles[t].explored) { target = bz * w + bx; coastWater = lastWater }
          break
        }
        lastWater = t
      }
      if (target >= 0) break
    }
    expect(target).toBeGreaterThanOrEqual(0)
    // known ground: the plan goes straight over the unseen land, because nobody knows it is there
    const plan = findPath(s, u, u.tile, target)!
    expect(plan).not.toBeNull()
    expect(plan.some(t => s.world.tiles[t].terrain !== 'water')).toBe(true)
    applyAction(s, { t: 'moveUnit', unit: u.id, path: plan })
    // it stopped on the water, beside land, short of the target, with the order gone
    expect(s.world.tiles[u.tile].terrain).toBe('water')
    expect(neighbours8(w, h, u.tile).some(n => s.world.tiles[n].terrain !== 'water')).toBe(true)
    expect(u.tile).not.toBe(target)
    expect(u.order).toBeNull()
    expect(u.path).toEqual([])
    void coastWater
  })

  it('goes as far as it can this turn and carries on the next when sent further', () => {
    const s = createGame('fast-carry', { size: 'standard' }, 1)
    const u = lander(s)
    const runs = HEADINGS.map(d => straight(s, u.tile, d, C.lander.moves * 2))
    const run = runs.sort((a, b) => b.length - a.length)[0]
    if (run.length <= C.lander.moves) return expect(run.length).toBeGreaterThan(C.lander.moves)
    const target = run[run.length - 1]
    const plan = findPath(s, u, u.tile, target)!
    applyAction(s, { t: 'moveUnit', unit: u.id, path: plan })
    // six tiles along the way it planned, with the rest kept as an order
    expect(u.tile).toBe(plan[C.lander.moves - 1])
    expect(u.order).toEqual({ kind: 'goto', tile: target })
    expect(u.moves).toBe(0)
    // and at the end of the turn it carries straight on, on the next turn's movement, not a turn later
    applyAction(s, { t: 'endTurn' })
    expect(u.tile).toBe(plan[Math.min(plan.length, C.lander.moves * 2) - 1])
    if (plan.length <= C.lander.moves * 2) expect(u.order).toBeNull()
    // having spent that movement, it has none left for the player this turn: one turn, six tiles
    expect(u.moves).toBe(C.lander.moves - (Math.min(plan.length, C.lander.moves * 2) - C.lander.moves))
  })

  it('a rival lander a player sees sails at the player\'s speed', () => {
    const s = createGame('fast-rival', { size: 'small' }, 1)
    const rival = s.units.find(u => u.owner > 0 && u.kind === 'lander')!
    const before = rival.tile
    applyAction(s, { t: 'endTurn' })
    const after = s.units.find(u => u.id === rival.id)
    // it either founded on its first turn or sailed up to six tiles
    if (after) {
      const w = s.world.width
      const d = Math.max(Math.abs((after.tile % w) - (before % w)), Math.abs(Math.floor(after.tile / w) - Math.floor(before / w)))
      expect(d).toBeLessThanOrEqual(C.lander.moves)
      expect(d).toBeGreaterThan(1)
    } else expect(s.settlements.some(st => st.owner === rival.owner)).toBe(true)
  })

  it('every charter comes down where the heading straight at the coast sights land on the first move and at least two headings do within two', () => {
    for (const size of ['small', 'standard'] as const) for (const shape of ['continent', 'coast', 'archipelago'] as const) for (let i = 0; i < 3; i++) {
      const s = createGame(`seed${i}`, { size, shape }, 1)
      const { width: w, height: h, tiles } = s.world
      const counts = s.world.splashdowns.map(at => landHeadings(w, h, tiles, at))
      for (const c of counts) { expect(c.one, `${size} ${shape} ${i}`).toBeGreaterThanOrEqual(1); expect(c.two, `${size} ${shape} ${i}`).toBeGreaterThanOrEqual(2) }
      // comparably fair: no charter has more than three headings more than another
      const two = counts.map(c => c.two)
      expect(Math.max(...two) - Math.min(...two), `${size} ${shape} ${i}`).toBeLessThanOrEqual(3)
    }
  })
})
