// The war and the rivals in fog. Military brief sections 9 to 11 as changed on 1 October 2026:
// waves land anywhere near a settlement after three visible turns at sea with the plausible coast
// narrowing, units on the landing tile are captured, a settlement is blockaded by an adjacent hostile
// armed ship, coastal batteries fire on adjacent hostile ships, and the other charters are seen only
// in sight.

import { describe, it, expect } from 'vitest'
import { applyAction, createGame } from '../src/sim/actions'
import { C } from '../src/sim/constants'
import { makeContext } from '../src/sim/turn'
import { makeUnit } from '../src/sim/units'
import { neighbours8, dist } from '../src/sim/worldgen'
import { fleetSystem, waveCoast, landingCoast, isBlockaded } from '../src/sim/fleet'
import { batteryFire } from '../src/sim/naval'
import { sightMask, unitVisible, settlementKnown, reveal } from '../src/sim/fog'
import type { GameState } from '../src/sim/state'
import { arrived } from './helpers'

/** A game ashore and at war, with the fleet due. */
function atWar(seed: string): GameState {
  const s = arrived(seed, { size: 'small', difficulty: 'standard' }, 1)
  for (const st of s.settlements.filter(x => x.owner === 0)) st.resolve = 1
  s.charters[0].signatories = [0, 1, 2]
  applyAction(s, { t: 'declare' })
  return s
}

describe('the recall fleet in fog', () => {
  it('a wave picks a coastal land tile within two tiles of a settlement, is at sea for three turns and narrows the coast each turn without ever ruling out where it lands', () => {
    const s = atWar('war-wave')
    const w = s.world.width
    for (let i = 0; i < C.military.declarationWindow + 1 && !s.declaration!.waves.length; i++) applyAction(s, { t: 'endTurn' })
    const wave = s.declaration!.waves[0]
    expect(wave).toBeDefined()
    expect(landingCoast(s)).toContain(wave.target)
    expect(s.settlements.some(st => st.owner === 0 && dist(w, st.tile, wave.target) <= C.military.landingRadius)).toBe(true)
    expect(s.world.tiles[wave.at].terrain).toBe('water')
    // the recall fleet keeps its own pace, not the player's lander's: it comes down a few tiles out
    expect(dist(w, wave.at, wave.target)).toBeLessThanOrEqual(C.military.approachTurns * C.military.approachMoves + 1)
    // the approach: at sea, closer each turn, the coast narrowing and the target always still in it
    let coastBefore = waveCoast(s, wave).length
    let distBefore = dist(w, wave.at, wave.target)
    let turns = 0
    while (!wave.landed && turns < 6) {
      fleetSystem.resolve(s, makeContext(s))
      turns++
      if (wave.landed) break
      expect(s.world.tiles[wave.at].terrain).toBe('water')
      expect(dist(w, wave.at, wave.target)).toBeLessThan(distBefore)
      distBefore = dist(w, wave.at, wave.target)
      const coast = waveCoast(s, wave)
      expect(coast).toContain(wave.target)
      expect(coast.length).toBeLessThanOrEqual(coastBefore)
      coastBefore = coast.length
    }
    expect(wave.landed).toBe(true)
    expect(turns).toBe(C.military.approachTurns)
    expect(wave.at).toBe(wave.target)
    expect(s.units.some(u => u.owner === -1 && u.tile === wave.target)).toBe(true)
  })

  it('units standing on the landing tile are captured, and a hostile armed ship beside a settlement blockades it', () => {
    const s = atWar('war-capture')
    for (let i = 0; i < C.military.declarationWindow + 1 && !s.declaration!.waves.length; i++) applyAction(s, { t: 'endTurn' })
    const wave = s.declaration!.waves[0]
    expect(wave).toBeDefined()
    // the blockade, while the wave is at sea: its escort lies off the settlement it makes for, and
    // that settlement is blockaded by adjacency alone
    const w = s.world.width, h = s.world.height
    const ship = s.units.find(u => u.owner === -1 && u.kind === 'companyShip')
    expect(ship).toBeDefined()
    expect(s.world.tiles[ship!.tile].terrain).toBe('water')
    const blockadedSettlement = s.settlements.find(st => st.owner === 0 && neighbours8(w, h, st.tile).includes(ship!.tile))
    expect(blockadedSettlement).toBeDefined()
    expect(isBlockaded(s, blockadedSettlement!)).toBe(true)
    const far = s.settlements.find(st => st.owner === 0 && !neighbours8(w, h, st.tile).includes(ship!.tile))
    if (far) expect(isBlockaded(s, far)).toBe(false)
    // and a ship moved away lifts it
    const was = ship!.tile
    ship!.tile = s.world.tiles.findIndex((t, i) => t.terrain === 'water' && dist(w, i, blockadedSettlement!.tile) > 3)
    expect(isBlockaded(s, blockadedSettlement!)).toBe(false)
    ship!.tile = was
    // the capture: a militia standing on the landing tile when the wave comes ashore is taken
    const home = s.settlements.find(x => x.owner === 0)!
    home.stock.arms = 100
    applyAction(s, { t: 'equip', settlement: home.id, colonist: 0, as: 'militia' })
    const militia = s.units.find(u => u.owner === 0 && u.kind === 'militia')!
    militia.tile = wave.target
    while (!wave.landed) fleetSystem.resolve(s, makeContext(s))
    expect(s.units.includes(militia)).toBe(false)
    expect(s.dispatch.some(d => d.text.includes('captured'))).toBe(true)
  })

  it('coastal batteries fire on an adjacent hostile ship every turn and drive it off', () => {
    const s = arrived('war-battery', { size: 'small', difficulty: 'standard' }, 1)
    const w = s.world.width, h = s.world.height
    const home = s.settlements.find(x => x.owner === 0)!
    const water = neighbours8(w, h, home.tile).find(n => s.world.tiles[n].terrain === 'water')!
    expect(water).toBeDefined()
    home.stock.arms = 200
    applyAction(s, { t: 'equip', settlement: home.id, colonist: 0, as: 'battery' })
    applyAction(s, { t: 'equip', settlement: home.id, colonist: 0, as: 'battery' })
    const ship = makeUnit(s, -1, 'companyShip', water, null)
    s.units.push(ship)
    expect(isBlockaded(s, home)).toBe(true)
    // a fixed stream, so the rounds are known: the shore fires once per battery per turn
    s.rng.play = [5, 6, 7, 8]
    let turns = 0
    while (s.units.includes(ship) && turns < 12) { batteryFire(s, makeContext(s)); turns++ }
    expect(s.units.includes(ship)).toBe(false)
    expect(turns).toBeGreaterThanOrEqual(Math.ceil(C.naval.batteryFire.companyShipEndurance / 2))
    expect(isBlockaded(s, home)).toBe(false)
    expect(s.dispatch.some(d => d.text.includes('driven off'))).toBe(true)
    // a battery on a settlement with no hostile ship beside it fires at nothing
    expect(batteryFire(s, makeContext(s))).toBe(0)
  })
})

describe('the other charters in fog', () => {
  it("a rival's lander is visible only in sight, and a rival settlement is drawn once seen and remembered as it was", () => {
    const s = createGame('fog-rivals', { size: 'small' }, 1)
    const mask = sightMask(s)
    const rivalLander = s.units.find(u => u.owner > 0 && u.kind === 'lander')!
    expect(rivalLander).toBeDefined()
    // splashdowns are out of sight of one another, so the rival's lander is not visible at the start
    expect(unitVisible(s, rivalLander, mask)).toBe(false)
    // walk it into the player's sight and it is
    const mine = s.units.find(u => u.owner === 0 && u.kind === 'lander')!
    rivalLander.tile = neighbours8(s.world.width, s.world.height, mine.tile)[0]
    expect(unitVisible(s, rivalLander, sightMask(s))).toBe(true)
    // a rival settlement founded out of sight is unknown until seen, then remembered as seen
    const s2 = arrived('fog-rivals-2', { size: 'small' }, 1)
    // the player is ashore within a turn or two now, and the rivals a few turns after
    for (let i = 0; i < 12 && !s2.settlements.some(x => x.owner > 0); i++) applyAction(s2, { t: 'endTurn' })
    const rival = s2.settlements.find(x => x.owner > 0 && sightMask(s2)[x.tile] !== 1)
    expect(rival).toBeDefined()
    if (rival) {
      // as though it had never been seen, whatever the voyage happened to pass
      rival.seen = null
      expect(settlementKnown(rival)).toBe(false)
      // a scout beside it sees it
      const scout = makeUnit(s2, 0, 'colonist', rival.tile, null)
      s2.units.push(scout)
      reveal(s2)
      expect(settlementKnown(rival)).toBe(true)
      expect(rival.seen!.pop).toBe(rival.abstractPop)
      // it grows out of sight; the memory does not
      s2.units = s2.units.filter(u => u !== scout)
      const remembered = rival.seen!.pop
      rival.abstractPop += 5
      reveal(s2)
      expect(rival.seen!.pop).toBe(remembered)
    }
    // the player's own things and the Company's are always visible
    expect(unitVisible(s, mine, mask)).toBe(true)
  })
})
