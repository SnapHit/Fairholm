import { describe, it, expect } from 'vitest'
import { createGame, applyAction, describeTile } from '../src/sim/actions'
import { deriveQueue } from '../src/sim/queue'
import { SYSTEMS } from '../src/sim/systems'
import { toSave, fromSave } from '../src/io/save'
import { playOpening } from './helpers'
import { voyageBand } from '../src/sim/worldgen'
import { openingAction } from '../src/sim/autopilot'
import { C } from '../src/sim/constants'

describe('smoke', () => {
  it('generates a small world, puts the lander down at sea, and the opening founds', () => {
    const t0 = Date.now()
    const s = createGame('testseed', { size: 'small' }, 1)
    const ms = Date.now() - t0
    expect(s.world.tiles.length).toBe(40 * 26)
    expect(s.world.splashdowns.length).toBe(4)
    expect(s.turn).toBe(1)
    expect(s.settlements.length).toBe(0)
    const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')!
    expect(lander).toBeDefined()
    expect(lander.aboard.length).toBe(5)
    expect(s.world.tiles.filter(t => t.explored).length).toBeGreaterThan(0)
    expect(s.world.tiles.filter(t => t.explored).length).toBeLessThan(s.world.tiles.length / 4)
    // the splashdown is out of sight of land and inside the band of open water from a viable coast
    const [lo, hi] = voyageBand()
    expect(lo).toBeGreaterThan(C.lander.sight + 1)
    expect(hi).toBeLessThanOrEqual(C.lander.moves + C.lander.sight)
    expect(s.world.tiles.filter(t => t.explored && t.terrain !== 'water').length).toBe(0)
    // the opening is time spent choosing, not reaching: one move toward the coast sights land, and
    // the autopilot founds within a few turns of splashing down. It was four to nine turns when the
    // lander sailed one tile a turn
    applyAction(s, openingAction(s)!)
    expect(s.world.tiles.some(t => t.explored && t.terrain !== 'water')).toBe(true)
    const founded = playOpening(s)
    expect(founded).toBeGreaterThanOrEqual(1)
    expect(founded).toBeLessThanOrEqual(4)
    const home = s.settlements.find(x => x.owner === 0)!
    expect(home.name).toBe('The Landing')
    expect(home.colonists.length).toBe(5)
    expect(s.units.some(u => u.owner === 0 && u.kind === 'lander')).toBe(false)
    expect(s.units.some(u => u.owner === 0 && u.kind === 'lighter')).toBe(true)
    expect(describeTile(s, home.tile).length).toBeGreaterThan(3)
    console.log('worldgen ms', ms, 'land', s.world.tiles.filter(t => t.terrain !== 'water').length, 'preds', s.predecessors.length, 'founded turn', founded, describeTile(s, home.tile))
    const from = s.turn
    for (let i = 0; i < 30; i++) applyAction(s, { t: 'endTurn' })
    expect(s.turn).toBe(from + 30)
    const q = deriveQueue(s, SYSTEMS)
    console.log('queue', q.shown.map(g => g.title), 'food store', s.settlements.find(x => x.owner === 0)!.foodStore, 'stock', s.settlements.find(x => x.owner === 0)!.stock, 'frame', s.settlements.find(x => x.owner === 0)!.frame)
    const save = toSave(s)
    const json = JSON.stringify(save)
    console.log('save bytes', json.length, 'deltas', Object.keys(save.tileDeltas).length)
    const s2 = fromSave(JSON.parse(json), 2)
    expect(s2.turn).toBe(s.turn)
    expect(s2.world.tiles.map(t => t.terrain).join('')).toBe(s.world.tiles.map(t => t.terrain).join(''))
    expect(JSON.stringify(s2.settlements)).toBe(JSON.stringify(s.settlements))
  })
})
