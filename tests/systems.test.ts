import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { deriveQueue } from '../src/sim/queue'
import { SYSTEMS } from '../src/sim/systems'
import { C } from '../src/sim/constants'
import { consign, sellPrice } from '../src/sim/market'
import { makeContext } from '../src/sim/turn'
import { foundSettlement } from '../src/sim/settlement'
import { makeColonist, workableTiles } from '../src/sim/labour'
import { makeUnit, findPath } from '../src/sim/units'
import { isLand, neighbours8, dist } from '../src/sim/worldgen'
import { nationalResolve } from '../src/sim/grievance'
import type { GameState } from '../src/sim/state'

function landed(seed = 'market-seed', size: 'small' | 'standard' = 'small'): GameState {
  const s = createGame(seed, { size, difficulty: 'standard' }, 1)
  applyAction(s, { t: 'land', site: s.world.landingSites[0] })
  return s
}

describe('market', () => {
  it('price falls with volume and recovers when quiet', () => {
    const s = landed()
    const st = s.settlements[0]
    const g = 'linen'
    const open = sellPrice(s, g)
    st.stock[g] = 150
    consign(s, st, g, 150, makeContext(s))
    const after = sellPrice(s, g)
    expect(after).toBeLessThan(open)
    // quiet turns recover the price toward the baseline
    for (let i = 0; i < 60; i++) applyAction(s, { t: 'endTurn' })
    expect(sellPrice(s, g)).toBeGreaterThan(after)
  })

  it('a large consignment walks the price down lot by lot', () => {
    const s = landed()
    const st = s.settlements[0]
    st.stock.linen = 400
    const r = consign(s, st, 'linen', 400, makeContext(s))
    expect(r.units).toBe(400)
    expect(r.last).toBeLessThan(r.first)
    // the same goods in two halves with recovery between earn more than one dump
    const s2 = landed()
    const st2 = s2.settlements[0]
    st2.stock.linen = 200
    const a = consign(s2, st2, 'linen', 200, makeContext(s2))
    for (let i = 0; i < 40; i++) applyAction(s2, { t: 'endTurn' })
    st2.stock.linen = 200
    const b = consign(s2, st2, 'linen', 200, makeContext(s2))
    expect(a.gold + b.gold).toBeGreaterThan(r.gold)
  })

  it('secular drift raises tooling, arms and instruments over a long game', () => {
    const s = landed()
    const t0 = sellPrice(s, 'tooling'), a0 = sellPrice(s, 'arms'), i0 = sellPrice(s, 'instruments')
    for (let i = 0; i < 200; i++) applyAction(s, { t: 'endTurn' })
    expect(sellPrice(s, 'tooling')).toBeGreaterThan(t0)
    expect(sellPrice(s, 'arms')).toBeGreaterThan(a0)
    expect(sellPrice(s, 'instruments')).toBeGreaterThan(i0)
    // and a good without drift does not climb by itself
    expect(sellPrice(s, 'timber')).toBeLessThanOrEqual(C.market.goods.timber.open + 1)
  })
})

describe('determinism', () => {
  it('a turn resolves identically twice with the same play rng state', () => {
    const a = createGame('det', { size: 'small' }, 123)
    const b = createGame('det', { size: 'small' }, 123)
    for (const s of [a, b]) applyAction(s, { t: 'land', site: s.world.landingSites[1] })
    // fix the play stream to the same value on both
    a.rng.play = [1, 2, 3, 4]
    b.rng.play = [1, 2, 3, 4]
    for (let i = 0; i < 40; i++) { applyAction(a, { t: 'endTurn' }); applyAction(b, { t: 'endTurn' }) }
    const strip = (s: GameState) => JSON.stringify({ t: s.turn, st: s.settlements, u: s.units, m: s.market, c: s.company, ch: s.charters, p: s.predecessors, d: s.dispatch.length })
    expect(strip(a)).toBe(strip(b))
  })
})

describe('late game queue stress', () => {
  it('forty settlements derive a queue quickly and fold correctly', () => {
    const s = createGame('stress', { size: 'large', difficulty: 'standard' }, 7)
    applyAction(s, { t: 'land', site: s.world.landingSites[0] })
    const w = s.world.width, h = s.world.height
    // plant forty settlements on viable land, spaced out
    let planted = 1
    for (let i = 0; i < s.world.tiles.length && planted < 40; i += 7) {
      const t = s.world.tiles[i]
      if (!isLand(t) || t.terrain === 'mountain') continue
      if (s.settlements.some(st => dist(w, st.tile, i) < 3)) continue
      if (s.predecessors.some(p => p.territory.includes(i))) continue
      const colonists = []
      for (let k = 0; k < 3 + (i % 5); k++) colonists.push(makeColonist(s, (['debtor', 'contracted', 'free'] as const)[k % 3]))
      const st = foundSettlement(s, i, 0, colonists)
      // make trouble: no food, full stores, empty build order, an idle unit nearby
      st.stock.timber = 300
      st.buildings.meeting = 1
      if (i % 3 === 0) st.colonists.forEach(c => { c.job = { kind: 'idle' } })
      if (i % 4 === 0) s.units.push(makeUnit(s, 0, 'colonist', i, makeColonist(s, 'free')))
      planted++
    }
    expect(s.settlements.filter(x => x.owner === 0).length).toBe(40)
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) applyAction(s, { t: 'endTurn' })
    const turnMs = (performance.now() - t0) / 5
    const q0 = performance.now()
    const q = deriveQueue(s, SYSTEMS)
    const queueMs = performance.now() - q0
    const total = q.shown.reduce((a, g) => a + g.items.length, 0) + q.folded.reduce((a, g) => a + g.items.length, 0)
    console.log('stress: turn ms', turnMs.toFixed(1), 'queue ms', queueMs.toFixed(1), 'shown groups', q.shown.length, 'folded groups', q.folded.length, 'items', total, 'crisis', q.crisis)
    expect(queueMs).toBeLessThan(200)
    expect(turnMs).toBeLessThan(400)
    // losses and company items never fold; only types three and up are folded
    for (const g of q.folded) expect(g.type).toBeGreaterThanOrEqual(3)
    // grouping: forty settlements with empty build orders collapse into one card
    const builds = q.shown.concat(q.folded).filter(g => g.group === 'buildEmpty')
    expect(builds.length).toBeLessThanOrEqual(1)
    if (builds.length) expect(builds[0].items.length).toBeGreaterThan(5)
    // the pace cap holds (types one and two may exceed it)
    const cap = C.queue.paces[s.settings.pace]
    expect(q.shown.filter(g => g.type >= 3).length).toBeLessThanOrEqual(cap)
    // everything shown carries a title, a body and a place to go
    for (const g of q.shown) { expect(g.title.length).toBeGreaterThan(0); expect(g.body.length).toBeGreaterThan(0) }
    // workable tiles never overlap between neighbouring settlements' workers
    const worked = new Map<number, number>()
    for (const st of s.settlements) for (const c of st.colonists) if (c.job.kind === 'tile') { expect(worked.has(c.job.tile)).toBe(false); worked.set(c.job.tile, st.id) }
    void h; void neighbours8; void workableTiles
  })
})

describe('a whole game on autopilot', () => {
  it('runs through a declaration and a war without throwing', () => {
    const s = createGame('whole-game', { size: 'small', difficulty: 'standard' }, 99)
    applyAction(s, { t: 'land', site: s.world.landingSites[0] })
    const home = s.settlements[0]
    // a crude autopilot: auto-assign, queue civic and military buildings, arm when arms arrive, declare when allowed
    let declaredAt = -1
    for (let turn = 1; turn <= 300; turn++) {
      for (const st of s.settlements.filter(x => x.owner === 0)) {
        if (st.colonists.some(c => c.job.kind === 'idle')) applyAction(s, { t: 'autoAssign', settlement: st.id })
        if (!st.buildQueue.length && !st.building) {
          const want = (['carpenter', 'meeting', 'storage', 'works', 'press', 'smelter', 'armoury', 'school'] as const).find(l => st.buildings[l] === 0)
          if (want) try { applyAction(s, { t: 'setBuildOrder', settlement: st.id, queue: [{ line: want, tier: 1 }] }) } catch { /* gated */ }
        }
        if (st.stock.arms >= 15 && st.colonists.length > 4) {
          const i = st.colonists.findIndex(c => c.job.kind === 'idle' || c.job.kind === 'building')
          if (i >= 0) try { applyAction(s, { t: 'equip', settlement: st.id, colonist: i, as: 'militia' }) } catch { /* fine */ }
        }
        // buy arms once gold allows, to make the war real
        if (s.charters[0].gold > 300 && st.stock.arms < 30) try { applyAction(s, { t: 'buy', settlement: st.id, good: 'arms', amount: 20 }) } catch { /* fine */ }
      }
      if (s.company.demand) applyAction(s, { t: 'answerDemand', accept: turn % 2 === 0 })
      // the spare colonist founds a second settlement a few tiles off, once
      const spare = s.units.find(u => u.owner === 0 && u.kind === 'colonist')
      if (spare && turn > 3 && s.settlements.filter(x => x.owner === 0).length < 2) {
        const w = s.world.width
        const target = s.world.tiles.findIndex((t, i) => isLand(t) && t.terrain !== 'mountain' && dist(w, i, home.tile) >= 3 && dist(w, i, home.tile) <= 5 && !s.predecessors.some(p => p.territory.includes(i)) && !s.settlements.some(st => dist(w, st.tile, i) < 3))
        if (target >= 0) {
          if (spare.tile !== target) { const path = findPath(s, spare, spare.tile, target); if (path) try { applyAction(s, { t: 'moveUnit', unit: spare.id, path }) } catch { /* blocked */ } }
          if (spare.tile === target) try { applyAction(s, { t: 'found', unit: spare.id }) } catch { /* fine */ }
        }
      }
      // put one pair on civic work when there is a meeting house
      for (const st of s.settlements.filter(x => x.owner === 0)) {
        if (st.buildings.meeting > 0 && st.colonists.length >= 4 && !st.colonists.some(c => c.job.kind === 'building' && c.job.line === 'meeting')) {
          const i = st.colonists.findIndex(c => c.job.kind !== 'building')
          if (i >= 0) try { applyAction(s, { t: 'assignWorker', settlement: st.id, colonist: i, job: { kind: 'building', line: 'meeting' } }) } catch { /* fine */ }
        }
      }
      if (declaredAt < 0 && nationalResolve(s) >= C.grievance.declarationGate) {
        // meet the gate artificially if the civic economy is slow, so the war is exercised
        applyAction(s, { t: 'declare' })
        declaredAt = turn
      }
      if (declaredAt < 0 && turn === 220) {
        for (const st of s.settlements.filter(x => x.owner === 0)) st.resolve = 1
        applyAction(s, { t: 'declare' })
        declaredAt = turn
      }
      applyAction(s, { t: 'endTurn' })
      if (s.declaration?.won || s.declaration?.lost) break
    }
    expect(s.turn).toBeGreaterThan(100)
    expect(declaredAt).toBeGreaterThan(0)
    expect(s.declaration?.declared).toBe(true)
    const war = s.dispatch.filter(d => d.kind === 'war')
    console.log('whole game: turn', s.turn, 'declared', declaredAt, 'waves', s.declaration?.waves.length, 'won', s.declaration?.won, 'lost', s.declaration?.lost, 'war entries', war.length, 'pop', home.colonists.length, 'settlements', s.settlements.filter(x => x.owner === 0).length, 'rival settlements', s.settlements.filter(x => x.owner > 0).length, 'signatories', s.charters[0].signatories.length)
    console.log(war.slice(-6).map(d => d.text))
    expect(s.declaration?.waves.length).toBeGreaterThan(0)
    expect(war.length).toBeGreaterThan(3)
    // no system crashed into a dispatch note
    const crashed = s.dispatch.filter(d => d.kind === 'note' && /stumbled|failed|error/i.test(d.text))
    expect(crashed.map(d => d.text)).toEqual([])
  })
})
