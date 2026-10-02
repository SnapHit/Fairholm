// The plotted route. Feel brief sections 1 and 4, as changed on 2 October 2026: a hold plots, and
// only a tap on the route's end or the Go control commits. These test the plan the interface draws
// and words: where each turn ends, which stretches are guesses through the fog, the odds an attack
// shows, and why a tile cannot be reached; and that committing it does what was drawn.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { C } from '../src/sim/constants'
import { planRoute, type Route } from '../src/sim/route'
import { makeUnit, findPath } from '../src/sim/units'
import { makeColonist } from '../src/sim/labour'
import { attackOdds } from '../src/sim/military'
import { neighbours8, isLand, dist } from '../src/sim/worldgen'
import { arrived } from './helpers'
import type { GameState, Unit } from '../src/sim/state'

const lander = (s: GameState): Unit => s.units.find(u => u.owner === 0 && u.kind === 'lander')!

/** A straight run of real water from a tile along the heading with the most of it. */
function longestWater(s: GameState, from: number): number[] {
  const w = s.world.width, h = s.world.height
  let best: number[] = []
  for (const [dx, dz] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    const run: number[] = []
    let x = from % w, z = Math.floor(from / w)
    for (;;) {
      x += dx; z += dz
      if (x < 0 || z < 0 || x >= w || z >= h || s.world.tiles[z * w + x].terrain !== 'water') break
      run.push(z * w + x)
    }
    if (run.length > best.length) best = run
  }
  return best
}

describe('the plotted route', () => {
  it('a hold plots and moves nothing', () => {
    const s = createGame('route-plot', { size: 'standard' }, 1)
    const u = lander(s)
    const run = longestWater(s, u.tile)
    const before = JSON.stringify(s)
    const r = planRoute(s, u, run[Math.min(run.length, C.lander.moves) - 1])
    expect(r.ok).toBe(true)
    // planning is a read: the state is exactly as it was
    expect(JSON.stringify(s)).toBe(before)
  })

  it('marks where each turn runs out, and committing it goes exactly as far as the first mark', () => {
    const s = createGame('route-turns', { size: 'standard' }, 1)
    const u = lander(s)
    // light the whole run so the plan is not a guess anywhere
    const run = longestWater(s, u.tile)
    expect(run.length).toBeGreaterThan(C.lander.moves)
    for (const t of run) s.world.tiles[t].explored = true
    const n = Math.min(run.length, C.lander.moves * 2 + 1)
    const r = planRoute(s, u, run[n - 1]) as Route
    expect(r.ok).toBe(true)
    expect(r.kind).toBe('move')
    expect(r.path.length).toBe(n)
    expect(r.unseen.every(x => !x)).toBe(true)
    // six a turn: the first turn ends on the sixth tile, the next on the twelfth, the last on the end
    const expected = [] as number[]
    for (let i = C.lander.moves - 1; i < n - 1; i += C.lander.moves) expected.push(i)
    expected.push(n - 1)
    expect(r.turnEnds).toEqual(expected)
    expect(r.arrives).toBe(expected.length)
    // committing the plotted route: the unit stops where the first mark is
    applyAction(s, { t: 'moveUnit', unit: u.id, path: r.path })
    expect(u.tile).toBe(r.path[r.turnEnds[0]])
  })

  it('draws a stretch nobody has seen as a guess', () => {
    const s = createGame('route-fog', { size: 'standard' }, 1)
    const u = lander(s)
    const run = longestWater(s, u.tile).slice(0, C.lander.moves)
    const r = planRoute(s, u, run[run.length - 1]) as Route
    expect(r.ok).toBe(true)
    r.path.forEach((t, i) => expect(r.unseen[i]).toBe(!s.world.tiles[t].explored))
    expect(r.unseen.some(Boolean)).toBe(true)
  })

  it('says why a tile cannot be reached, and points the lander at the founding control beside the shore', () => {
    const s = createGame('route-why', { size: 'small' }, 1)
    const u = lander(s)
    expect(planRoute(s, u, u.tile)).toMatchObject({ ok: false, problem: 'here' })
    // known land far off: the lander goes ashore by founding
    const w = s.world.width, h = s.world.height
    const far = s.world.tiles.findIndex((t, i) => isLand(t) && t.river !== 2 && dist(w, i, u.tile) > 2)
    s.world.tiles[far].explored = true
    expect(planRoute(s, u, far)).toMatchObject({ ok: false, problem: 'landerAshore', shore: null })
    // the same beside it: the shore is handed to the founding control
    const beside = neighbours8(w, h, u.tile)[0]
    const was = s.world.tiles[beside].terrain
    s.world.tiles[beside].terrain = 'grassland'
    s.world.tiles[beside].explored = true
    expect(planRoute(s, u, beside)).toMatchObject({ ok: false, problem: 'landerAshore', shore: beside })
    s.world.tiles[beside].terrain = was
    // land that nobody has seen is not known to be land: the plan goes into the fog
    const unseenLand = s.world.tiles.findIndex((t, i) => isLand(t) && !t.explored && t.river !== 2 && dist(w, i, u.tile) < 12)
    if (unseenLand >= 0) expect(planRoute(s, u, unseenLand).ok).toBe(true)
    // no moves left
    u.moves = 0
    const run = longestWater(s, u.tile)
    expect(planRoute(s, u, run[0])).toMatchObject({ ok: false, problem: 'noMoves' })
  })

  it('a ship holding land, a colonist holding water: each says why', () => {
    const s = arrived('route-kinds', { size: 'small' })
    const w = s.world.width, h = s.world.height
    const boat = s.units.find(u => u.owner === 0 && u.kind === 'lighter')!
    const ground = s.world.tiles.findIndex((t, i) => isLand(t) && t.explored && t.river !== 2 && !s.settlements.some(st => st.tile === i))
    expect(planRoute(s, boat, ground)).toMatchObject({ ok: false, problem: 'shipOnLand' })
    const home = s.settlements.find(x => x.owner === 0)!
    const spot = neighbours8(w, h, home.tile).find(n => isLand(s.world.tiles[n]))!
    const walker = makeUnit(s, 0, 'colonist', spot, makeColonist(s, 'free'))
    s.units.push(walker)
    const sea = s.world.tiles.findIndex(t => t.terrain === 'water' && t.explored)
    const r = planRoute(s, walker, sea)
    expect(r).toMatchObject({ ok: false, problem: 'landOnWater' })
    expect((r as { words: string }).words).toBe('A colonist cannot go on the water.')
  })

  it('an attack shows the odds the fight is resolved at, and a colonist cannot make one', () => {
    const s = arrived('route-attack', { size: 'small' })
    const w = s.world.width, h = s.world.height
    const home = s.settlements.find(x => x.owner === 0)!
    const ring = neighbours8(w, h, home.tile).filter(n => isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain')
    expect(ring.length).toBeGreaterThanOrEqual(2)
    const militia = makeUnit(s, 0, 'militia', ring[0], makeColonist(s, 'free'))
    const foeTile = ring.find(n => n !== ring[0] && neighbours8(w, h, ring[0]).includes(n)) ?? ring[1]
    const foe = makeUnit(s, -1, 'regulars', foeTile, null)
    s.units.push(militia, foe)
    s.world.tiles[foeTile].explored = true
    const r = planRoute(s, militia, foeTile) as Route
    expect(r.ok).toBe(true)
    expect(r.kind).toBe('attack')
    expect(r.target).toBe('Company regulars')
    expect(r.declares).toBeNull()
    expect(r.odds).toBeCloseTo(attackOdds(s, militia, foeTile), 10)
    expect(r.odds!).toBeGreaterThan(0)
    expect(r.odds!).toBeLessThan(1)
    // nothing happened: the foe is still there and nobody is at war over it
    expect(s.units.includes(foe)).toBe(true)
    // a colonist cannot attack
    const colonist = makeUnit(s, 0, 'colonist', ring[0], makeColonist(s, 'free'))
    s.units.push(colonist)
    expect(planRoute(s, colonist, foeTile)).toMatchObject({ ok: false, problem: 'cannotAttack' })
  })

  it('best of three at even odds is even', () => {
    // the odds are the fight's own resolution: at A equal to D, three exchanges are a coin
    const s = arrived('route-even', { size: 'small' })
    const w = s.world.width, h = s.world.height
    const home = s.settlements.find(x => x.owner === 0)!
    // open grassland beside the settlement, made so: no forest, no river, nothing to defend from
    const ring = neighbours8(w, h, home.tile).filter(n => isLand(s.world.tiles[n]))
    const t = s.world.tiles[ring[0]]
    t.terrain = 'grassland'; t.forest = null; t.river = 0
    const a = makeUnit(s, 0, 'militia', home.tile, makeColonist(s, 'free'))
    const d = makeUnit(s, -1, 'militia', ring[0], makeColonist(s, 'free'))
    s.units.push(a, d)
    const p = 3 / (3 + 3 * (C.military.terrainDefence.grassland ?? 1))
    const win = p * p * p + 3 * p * p * (1 - p)
    expect(attackOdds(s, a, ring[0])).toBeCloseTo(win, 10)
  })

  it('an attack on a charter not at war says it is a declaration', () => {
    const s = arrived('route-declare', { size: 'small' })
    const w = s.world.width, h = s.world.height
    const home = s.settlements.find(x => x.owner === 0)!
    const ring = neighbours8(w, h, home.tile).filter(n => isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain')
    const militia = makeUnit(s, 0, 'militia', home.tile, makeColonist(s, 'free'))
    const rival = makeUnit(s, 1, 'militia', ring[0], makeColonist(s, 'free'))
    s.units.push(militia, rival)
    s.charters[1].relation = 'peace'
    const r = planRoute(s, militia, ring[0]) as Route
    expect(r.ok).toBe(true)
    expect(r.declares).toBe(1)
    expect(r.target).toBe(`${s.charters[1].name}'s militia`)
    expect(s.charters[1].relation).toBe('peace')
  })

  it('goes round others\' armed units the player can see, and says so when they close the way', () => {
    const s = arrived('route-round', { size: 'small' })
    const home = s.settlements.find(x => x.owner === 0)!
    const w = s.world.width, h = s.world.height
    const walker = makeUnit(s, 0, 'colonist', home.tile, makeColonist(s, 'free'))
    s.units.push(walker)
    // a tile two out over land, and a regular on the straight way between
    const two = s.world.tiles.findIndex((t, i) => isLand(t) && t.terrain !== 'mountain' && dist(w, i, home.tile) === 2 && !s.settlements.some(st => st.tile === i))
    const plain = findPath(s, walker, walker.tile, two)!
    expect(plain).not.toBeNull()
    const blocker = makeUnit(s, -1, 'regulars', plain[0], null)
    s.units.push(blocker)
    const r = planRoute(s, walker, two)
    if (r.ok) expect((r as Route).path.includes(plain[0])).toBe(false)
    else expect(r.problem).toBe('unitsInWay')
    void h
  })

  it('a colonist beside the lander plots going back aboard, and committing it boards', () => {
    const s = createGame('route-board', { size: 'small' }, 1)
    const u = lander(s)
    const w = s.world.width, h = s.world.height
    // a shore beside the lander, for a colonist to stand on
    const beside = neighbours8(w, h, u.tile)[0]
    s.world.tiles[beside].terrain = 'grassland'
    s.world.tiles[beside].explored = true
    const col = makeUnit(s, 0, 'colonist', beside, makeColonist(s, 'free'))
    s.units.push(col)
    const aboard = u.aboard.length
    const r = planRoute(s, col, u.tile) as Route
    expect(r.ok).toBe(true)
    expect(r.kind).toBe('board')
    expect(r.path).toEqual([])
    expect(r.arrives).toBe(1)
    applyAction(s, { t: 'embark', unit: col.id, lander: u.id })
    expect(u.aboard.length).toBe(aboard + 1)
  })
})
