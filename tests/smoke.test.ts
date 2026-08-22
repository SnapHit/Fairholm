import { describe, it, expect } from 'vitest'
import { createGame, applyAction, siteDescriptions } from '../src/sim/actions'
import { deriveQueue } from '../src/sim/queue'
import { SYSTEMS } from '../src/sim/systems'
import { toSave, fromSave } from '../src/io/save'

describe('smoke', () => {
  it('generates a small world with landing sites and lands', () => {
    const t0 = Date.now()
    const s = createGame('testseed', { size: 'small' }, 1)
    const ms = Date.now() - t0
    expect(s.world.tiles.length).toBe(40 * 26)
    expect(s.world.landingSites.length).toBeGreaterThan(0)
    expect(s.world.anchorages.length).toBeGreaterThanOrEqual(4)
    const sites = siteDescriptions(s)
    expect(sites[0].text.length).toBeGreaterThan(3)
    applyAction(s, { t: 'land', site: s.world.landingSites[0] })
    expect(s.turn).toBe(1)
    expect(s.settlements.length).toBeGreaterThanOrEqual(1)
    expect(s.settlements[0].colonists.length).toBe(5)
    console.log('worldgen ms', ms, 'land', s.world.tiles.filter(t => t.terrain !== 'water').length, 'preds', s.predecessors.length, 'sites', sites.map(x => x.text))
    for (let i = 0; i < 30; i++) applyAction(s, { t: 'endTurn' })
    expect(s.turn).toBe(31)
    const q = deriveQueue(s, SYSTEMS)
    console.log('queue', q.shown.map(g => g.title), 'food store', s.settlements[0].foodStore, 'stock', s.settlements[0].stock, 'frame', s.settlements[0].frame)
    const save = toSave(s)
    const json = JSON.stringify(save)
    console.log('save bytes', json.length, 'deltas', Object.keys(save.tileDeltas).length)
    const s2 = fromSave(JSON.parse(json), 2)
    expect(s2.turn).toBe(s.turn)
    expect(s2.world.tiles.map(t => t.terrain).join('')).toBe(s.world.tiles.map(t => t.terrain).join(''))
    expect(JSON.stringify(s2.settlements)).toBe(JSON.stringify(s.settlements))
  })
})
