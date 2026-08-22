// Pinned behaviour. Each test here protects something believed correct today so that a future
// refactor cannot change it quietly. Where a number is hard-coded it was read off this build, not
// derived from a brief; if a deliberate tuning change moves it, update the pin in the same commit
// and say so. Nothing here touches /src.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { deriveQueue, noteUnresolved } from '../src/sim/queue'
import { SYSTEMS } from '../src/sim/systems'
import { C } from '../src/sim/constants'
import { consign, sellPrice, buyPrice, recompute } from '../src/sim/market'
import { makeContext } from '../src/sim/turn'
import { foundSettlement } from '../src/sim/settlement'
import { makeColonist } from '../src/sim/labour'
import { makeUnit, unitAttack } from '../src/sim/units'
import { fight, defenceOf } from '../src/sim/military'
import { nationalResolve } from '../src/sim/grievance'
import { toSave, fromSave } from '../src/io/save'
import { GOODS, type GameState, type Tile, type UnitKind } from '../src/sim/state'
import { isLand, dist } from '../src/sim/worldgen'

function landed(seed: string, size: 'small' | 'standard' | 'large' = 'small', difficulty: 'generous' | 'standard' | 'hard' | 'punitive' = 'standard'): GameState {
  const s = createGame(seed, { size, difficulty }, 5)
  applyAction(s, { t: 'land', site: s.world.landingSites[0] })
  s.rng.play = [11, 22, 33, 44]
  return s
}

// The same aggregate the probe used to take the snapshot. Anything that changes turn order, a
// production formula, the Word rule or the demand schedule shows up here as a diff.
function aggregates(s: GameState) {
  const mine = s.settlements.filter(x => x.owner === 0)
  const stock: Record<string, number> = {}
  for (const g of GOODS) stock[g] = mine.reduce((a, st) => a + st.stock[g], 0)
  return {
    turn: s.turn, pop: mine.reduce((a, st) => a + st.colonists.length, 0), settlements: mine.length, rivalSettlements: s.settlements.filter(x => x.owner > 0).length,
    gold: Math.round(s.charters[0].gold), word: Math.round(s.charters[0].word * 10) / 10, passages: s.charters[0].passages,
    foodStore: Math.round(mine.reduce((a, st) => a + st.foodStore, 0)), frame: mine.reduce((a, st) => a + st.frame, 0),
    stock: Object.fromEntries(Object.entries(stock).filter(([, v]) => v > 0)),
    prices: { timber: s.market.tables[0].timber.price, tooling: s.market.tables[0].tooling.price, arms: s.market.tables[0].arms.price, instruments: s.market.tables[0].instruments.price, linen: s.market.tables[0].linen.price },
    charge: s.company.charge, units: s.units.length, dispatch: s.dispatch.length, grievance: Math.round(s.charters[0].grievanceTotal), fleet: s.company.fleetStrength,
    nextId: s.nextId, demand: s.company.demand ? s.company.demand.good : null, embargoed: s.company.embargoed.length,
  }
}

describe('market pins', () => {
  // Protects: price = baseline - pressure / volumeToShift, rounded and clamped. A sign error or a
  // changed rounding rule moves the exact number.
  it('150 linen lands the price on the exact number the formula gives', () => {
    const s = landed('pin-market')
    const st = s.settlements[0]
    expect(sellPrice(s, 'linen')).toBe(C.market.goods.linen.open)
    st.stock.linen = 150
    const r = consign(s, st, 'linen', 150, makeContext(s))
    const expected = Math.max(C.market.goods.linen.floor, Math.min(C.market.goods.linen.ceiling, Math.round(C.market.goods.linen.open - 150 / C.market.goods.linen.volumeToShift)))
    expect(sellPrice(s, 'linen')).toBe(expected)
    expect(r.units).toBe(150)
    // recovery: quiet turns take pressure off at the recovery rate; 60 turns clears 150 at 3 a turn
    for (let i = 0; i < 60; i++) applyAction(s, { t: 'endTurn' })
    expect(s.market.tables[0].linen.pressure).toBe(0)
    expect(sellPrice(s, 'linen')).toBeGreaterThanOrEqual(C.market.goods.linen.open - 1)
  })

  // Protects: lots of 25, the price recalculated between lots, the revenue being the sum of lot
  // prices rather than the opening price times the volume, and the charge and freight rate.
  it('a 400 unit consignment is paid lot by lot at falling prices', () => {
    const s = landed('pin-lots')
    const st = s.settlements[0]
    st.stock.linen = 400
    const rate = 1 - s.company.charge   // the landing has no freight loss
    // independent re-derivation of what the lots should pay
    let pressure = 0, gold = 0, last = 0
    const p = C.market.goods.linen
    for (let left = 400; left > 0; left -= C.market.lotSize) {
      const lot = Math.min(C.market.lotSize, left)
      const price = Math.max(p.floor, Math.min(p.ceiling, Math.round(p.open - pressure / p.volumeToShift)))
      gold += price * lot * rate
      last = price
      pressure += lot
    }
    const r = consign(s, st, 'linen', 400, makeContext(s))
    expect(r.first).toBe(p.open)
    expect(r.last).toBe(last)
    expect(r.gold).toBe(Math.round(gold))
    expect(r.last).toBeLessThan(r.first)
    // payment is deferred by the crossing, not credited now
    expect(s.charters[0].gold).toBe(C.onboarding.startingGold)
    expect(s.company.payments.length).toBe(1)
    expect(s.company.payments[0].due).toBe(s.turn + C.market.crossingTurns[s.settings.crossing])
  })

  // Protects: the three ratchet goods climb by drift per turn while nothing else does, and the
  // clamp to the ceiling holds. Jitter is play randomness, so the pin is a band, not a number.
  it('drift raises tooling, arms and instruments and leaves timber alone', () => {
    const s = landed('pin-drift')
    for (let i = 0; i < 200; i++) applyAction(s, { t: 'endTurn' })
    const t = s.market.tables[0]
    expect(t.tooling.baseline).toBeGreaterThanOrEqual(C.market.goods.tooling.open + 200 * C.market.goods.tooling.drift - 2.5)
    expect(t.arms.baseline).toBeGreaterThanOrEqual(C.market.goods.arms.open + 200 * C.market.goods.arms.drift - 2.5)
    expect(t.instruments.baseline).toBeGreaterThanOrEqual(C.market.goods.instruments.open + 200 * C.market.goods.instruments.drift - 2.5)
    expect(t.timber.baseline).toBeLessThanOrEqual(C.market.goods.timber.open + 2)
    expect(t.timber.baseline).toBeGreaterThanOrEqual(C.market.goods.timber.floor)
    for (const g of GOODS) { expect(t[g].baseline).toBeLessThanOrEqual(C.market.goods[g].ceiling); expect(t[g].price).toBeGreaterThanOrEqual(C.market.goods[g].floor) }
  })

  // Protects: the buy side is the sell side plus the spread, and signatory two halves the spread.
  it('the spread sits on top of the sell price', () => {
    const s = landed('pin-spread')
    expect(buyPrice(s, 'tooling')).toBe(sellPrice(s, 'tooling') + C.market.goods.tooling.spread)
    s.charters[0].signatories.push(1)
    expect(buyPrice(s, 'tooling')).toBe(sellPrice(s, 'tooling') + Math.max(1, Math.round(C.market.goods.tooling.spread * 0.5)))
  })
})

describe('turn loop pin', () => {
  // Protects: the fifteen-step order in src/sim/systems.ts and every formula those steps run.
  // Taken from this build with seed pin-seed, standard terms, play stream [11, 22, 33, 44]. If a
  // deliberate change moves it, update the object and name the change in the commit.
  it('fifty turns from a fixed seed reproduce the recorded aggregates', () => {
    const s = landed('pin-seed')
    for (let i = 0; i < 50; i++) applyAction(s, { t: 'endTurn' })
    expect(aggregates(s)).toEqual({
      turn: 51, pop: 4, settlements: 1, rivalSettlements: 3,
      gold: 40, word: 0, passages: 0,
      foodStore: 4, frame: 0,
      stock: { timber: 40, tooling: 8, flax: 40 },
      prices: { timber: 2, tooling: 5, arms: 6, instruments: 14, linen: 11 },
      charge: 0.08, units: 1, dispatch: 40, grievance: 0, fleet: 4,
      nextId: 7, demand: null, embargoed: 0,
    })
  })

  // Protects: the play stream alone decides the dice; the same seed and stream give the same
  // game, and a different stream gives a different one. Both halves matter.
  it('is deterministic only with respect to the play stream', () => {
    const a = landed('pin-det'), b = landed('pin-det'), c = landed('pin-det')
    c.rng.play = [1, 1, 1, 1]
    for (let i = 0; i < 60; i++) { applyAction(a, { t: 'endTurn' }); applyAction(b, { t: 'endTurn' }); applyAction(c, { t: 'endTurn' }) }
    expect(JSON.stringify(aggregates(a))).toBe(JSON.stringify(aggregates(b)))
    expect(JSON.stringify({ ...aggregates(a), dispatch: 0 })).not.toBe(JSON.stringify({ ...aggregates(c), dispatch: 0 }))
  })
})

describe('grievance gate pin', () => {
  // Protects: two meeting-house workers gather six a turn, resolve is grievance over 250 per head,
  // the gate is sixty per cent, the first signatory costs 300 and is taken from the national pool
  // without touching the settlement's own grievance, and the fleet scales at 0.004 per point
  // times the generous multiplier. The turn number is exact: 750 needed at 6 a turn.
  it('a settlement of five reaches the gate on turn 126 and can then declare', () => {
    const g = createGame('gate-seed', { size: 'small', difficulty: 'generous' }, 5)
    applyAction(g, { t: 'land', site: g.world.landingSites[0] })
    g.rng.play = [11, 22, 33, 44]
    const st = g.settlements[0]
    expect(st.colonists.length).toBe(5)
    st.buildings.meeting = 1
    applyAction(g, { t: 'assignWorker', settlement: 0, colonist: 0, job: { kind: 'building', line: 'meeting' } })
    applyAction(g, { t: 'assignWorker', settlement: 0, colonist: 1, job: { kind: 'building', line: 'meeting' } })
    applyAction(g, { t: 'autoAssign', settlement: 0 })
    let gate = -1
    for (let i = 0; i < 300; i++) {
      st.foodStore = 50   // fed, but below the granary threshold so the roster stays five
      for (const k of [0, 1]) expect(st.colonists[k].job).toEqual({ kind: 'building', line: 'meeting' })
      applyAction(g, { t: 'endTurn' })
      if (nationalResolve(g) >= C.grievance.declarationGate) { gate = g.turn; break }
    }
    expect(gate).toBe(126)
    expect(Math.round(st.grievance)).toBe(750)
    expect(g.charters[0].signatories).toEqual([0])
    expect(g.company.fleetStrength).toBeCloseTo(C.military.fleetBase + 750 * C.military.fleetPerGrievance * C.difficulty.generous.fleetMultiplier, 5)
    expect(g.charters[0].unlocked.fleet).toBe(true)
    const q = deriveQueue(g, SYSTEMS)
    expect(q.shown.some(x => x.group === 'declaration' && x.type === 5)).toBe(true)
    applyAction(g, { t: 'declare' })
    expect(g.declaration?.declared).toBe(true)
    expect(g.company.fleetPool?.length).toBe(Math.max(3, Math.round(g.company.fleetStrength)))
    // the muster window is exactly six turns with no wave at sea
    for (let i = 0; i < C.military.declarationWindow - 1; i++) { applyAction(g, { t: 'endTurn' }); expect(g.declaration!.waves.length).toBe(0) }
    applyAction(g, { t: 'endTurn' })
    expect(g.declaration!.waves.length).toBe(1)
  })

  // Protects: declaring before the gate is refused, not silently allowed.
  it('refuses a declaration below the gate', () => {
    const s = landed('pin-nogate')
    expect(() => applyAction(s, { t: 'declare' })).toThrow()
    expect(s.declaration).toBeNull()
  })
})

describe('combat odds pins', () => {
  // Protects: best of three exchanges at P = A / (A + D), the unit tables in the military brief
  // (militia 3/3, outrider 5/5, battery 2 in the open, regulars 8), the works multiplier of 1.5,
  // and the ambush flip. Each matchup is sampled; the expectation is the closed form of best of
  // three. A changed table, a fourth exchange or a broken flip all move the sampled rate.
  const bestOf3 = (p: number) => p * p * p + 3 * p * p * (1 - p)

  function sample(s: GameState, attackerKind: UnitKind, defenderKind: UnitKind, from: number, to: number, n: number, defenderOwner = 1): number {
    let wins = 0
    for (let i = 0; i < n; i++) {
      const a = makeUnit(s, 0, attackerKind, from, null)
      const d = makeUnit(s, defenderOwner, defenderKind, to, null)
      s.units = [a, d]
      if (fight(s, a, to, makeContext(s))) wins++
    }
    return wins / n
  }

  function openTile(t: Tile): boolean { return (t.terrain === 'grassland' || t.terrain === 'plains') && !t.forest && t.river === 0 }

  function pair(s: GameState, second: (t: Tile) => boolean): [number, number] {
    const w = s.world.width
    for (let i = 0; i < s.world.tiles.length; i++) {
      if ((i % w) + 1 >= w) continue
      const a = s.world.tiles[i], b = s.world.tiles[i + 1]
      if (!openTile(a) || !second(b) || !isLand(b)) continue
      if (s.settlements.some(st => dist(w, st.tile, i) < 3)) continue
      if (s.predecessors.some(p => p.territory.includes(i) || p.territory.includes(i + 1))) continue
      return [i, i + 1]
    }
    throw new Error('no suitable pair of tiles')
  }

  it('militia against militia in the open is an even fight', () => {
    const s = landed('pin-combat-a', 'standard')
    const [from, to] = pair(s, openTile)
    const d = makeUnit(s, 1, 'militia', to, null)
    const p = unitAttack(makeUnit(s, 0, 'militia', from, null), 'open') / (unitAttack(makeUnit(s, 0, 'militia', from, null), 'open') + defenceOf(s, d, to))
    expect(p).toBeCloseTo(0.5, 5)
    const rate = sample(s, 'militia', 'militia', from, to, 3000)
    expect(Math.abs(rate - bestOf3(p))).toBeLessThan(0.03)
  })

  it('outriders beat militia about two times in three', () => {
    const s = landed('pin-combat-b', 'standard')
    const [from, to] = pair(s, openTile)
    const p = C.military.units.outrider.attack / (C.military.units.outrider.attack + C.military.units.militia.defence)
    expect(bestOf3(p)).toBeCloseTo(0.683, 2)
    const rate = sample(s, 'outrider', 'militia', from, to, 3000)
    expect(Math.abs(rate - bestOf3(p))).toBeLessThan(0.03)
  })

  it('a battery in the open is weak', () => {
    const s = landed('pin-combat-c', 'standard')
    const [from, to] = pair(s, openTile)
    const p = C.military.units.battery.attackOpen / (C.military.units.battery.attackOpen + C.military.units.militia.defence)
    const rate = sample(s, 'battery', 'militia', from, to, 3000)
    expect(Math.abs(rate - bestOf3(p))).toBeLessThan(0.03)
  })

  it('militia against regulars in the open lose most of the time', () => {
    const s = landed('pin-combat-d', 'standard')
    const [from, to] = pair(s, openTile)
    const p = C.military.units.militia.attack / (C.military.units.militia.attack + C.military.company.regulars)
    expect(bestOf3(p)).toBeLessThan(0.2)
    const rate = sample(s, 'militia', 'regulars', from, to, 3000, -1)
    expect(Math.abs(rate - bestOf3(p))).toBeLessThan(0.03)
  })

  it('the ambush flips the forest bonus from regulars to militia', () => {
    const s = landed('pin-combat-e', 'standard')
    const forest = (t: Tile) => !!t.forest && (t.terrain === 'grassland' || t.terrain === 'plains') && t.river === 0
    const [from, to] = pair(s, forest)
    const bonus = C.military.forestDefence
    const A = C.military.units.militia.attack * bonus
    const D = C.military.company.regulars   // the forest multiplier is applied and then flipped away
    const p = A / (A + D)
    const rate = sample(s, 'militia', 'regulars', from, to, 3000, -1)
    expect(Math.abs(rate - bestOf3(p))).toBeLessThan(0.03)
    // and without the flip the same fight would be worse for the militia
    expect(bestOf3(p)).toBeGreaterThan(bestOf3(C.military.units.militia.attack / (C.military.units.militia.attack + C.military.company.regulars * bonus)))
  })

  it('a palisade multiplies the garrison by one and a half', () => {
    const s = landed('pin-combat-f', 'standard')
    const [from, to] = pair(s, openTile)
    const fort = foundSettlement(s, to, 1, [], 'Fort')
    fort.buildings.works = 1
    fort.abstractPop = 0
    const D = C.military.units.militia.defence * C.military.fortMultipliers[1]
    const p = C.military.units.militia.attack / (C.military.units.militia.attack + D)
    const rate = sample(s, 'militia', 'militia', from, to, 3000)
    expect(Math.abs(rate - bestOf3(p))).toBeLessThan(0.03)
  })

  // Protects: losers degrade rather than die, in the order the brief gives.
  it('a beaten outrider is militia, a beaten militia is a colonist, a beaten battery is damaged', () => {
    const s = landed('pin-degrade', 'standard')
    const [from, to] = pair(s, openTile)
    const check = (kind: UnitKind, expected: UnitKind) => {
      for (let i = 0; i < 200; i++) {
        const a = makeUnit(s, 0, kind, from, null)
        const d = makeUnit(s, -1, 'regulars', to, null)
        d.quality = 'sworn'
        s.units = [a, d]
        const won = fight(s, a, to, makeContext(s))
        if (!won) { expect(s.units.includes(a)).toBe(true); expect(a.kind).toBe(expected); return }
      }
      throw new Error('never lost in 200 fights, which is itself wrong')
    }
    check('outrider', 'militia')
    check('militia', 'colonist')
    check('battery', 'damagedBattery')
  })
})

describe('long game save round-trip', () => {
  // Protects: every field a long game touches survives the seed-plus-deltas save, including roads
  // and improvements laid by play, transits on the road, a declaration in progress, rival
  // settlements and the dispatch. A new state field that is not added to toSave/fromSave shows up
  // here as a diff after a long run even when the short smoke test passes.
  it('two hundred turns of play survive save, serialise, load', () => {
    const s = createGame('long-save', { size: 'small', difficulty: 'standard' }, 99)
    applyAction(s, { t: 'land', site: s.world.landingSites[0] })
    s.rng.play = [3, 1, 4, 1]
    const home = s.settlements[0]
    for (let turn = 1; turn <= 200; turn++) {
      for (const st of s.settlements.filter(x => x.owner === 0)) {
        if (st.colonists.some(c => c.job.kind === 'idle')) applyAction(s, { t: 'autoAssign', settlement: st.id })
        if (!st.buildQueue.length && !st.building) {
          const want = (['carpenter', 'meeting', 'storage', 'works', 'smelter', 'school'] as const).find(l => st.buildings[l] === 0)
          if (want) try { applyAction(s, { t: 'setBuildOrder', settlement: st.id, queue: [{ line: want, tier: 1 }] }) } catch { /* gated */ }
        }
      }
      if (s.company.demand) applyAction(s, { t: 'answerDemand', accept: turn % 3 !== 0 })
      if (turn === 30) { home.stock.tooling = 40; try { applyAction(s, { t: 'equip', settlement: 0, colonist: 0, as: 'improver' }) } catch { /* fine */ } }
      const imp = s.units.find(u => u.owner === 0 && u.kind === 'improver')
      if (imp && !imp.order) { const t = s.world.tiles[imp.tile]; if (!t.road) try { applyAction(s, { t: 'improve', unit: imp.id, task: 'road' }) } catch { /* fine */ } }
      if (turn === 120) { for (const st of s.settlements.filter(x => x.owner === 0)) st.resolve = 1; try { applyAction(s, { t: 'declare' }) } catch { /* fine */ } }
      applyAction(s, { t: 'endTurn' })
    }
    expect(s.turn).toBe(201)
    expect(s.world.tiles.some(t => t.road)).toBe(true)
    const save = toSave(s)
    const json = JSON.stringify(save)
    expect(json.length).toBeLessThan(120000)
    const back = fromSave(JSON.parse(json), 7)
    const strip = (x: GameState) => JSON.stringify({ turn: x.turn, tiles: x.world.tiles, settlements: x.settlements, units: x.units, market: x.market, company: x.company, charters: x.charters, predecessors: x.predecessors, declaration: x.declaration, dispatch: x.dispatch, intent: x.intent, nextId: x.nextId, telemetry: x.telemetry, shown: x.opportunitiesShown, transits: x.transits, flags: x.flags, rngWorld: x.rng.world })
    expect(strip(back)).toBe(strip(s))
    // and the loaded game keeps running identically from here with the same play stream
    s.rng.play = [9, 9, 9, 9]; back.rng.play = [9, 9, 9, 9]
    for (let i = 0; i < 10; i++) { applyAction(s, { t: 'endTurn' }); applyAction(back, { t: 'endTurn' }) }
    expect(strip(back)).toBe(strip(s))
  })

  // Documents a known bug rather than protecting a behaviour, so it is marked as expected to fail.
  // Worldgen places some forests on ground that clearing changes (forestClearsTo differs from the
  // tile's terrain on about twenty tiles of a standard map), and `terrain` is not in the save's
  // DELTA_FIELDS. Clearing such a tile changes its yields until the next load, when the terrain
  // reverts to the generated one with the forest gone. Fix in src/io/save.ts (add terrain to the
  // delta list) or in worldgen (place forests only on the terrain they clear to); then this test
  // starts passing, vitest reports it as an unexpected pass, and it should become a plain `it`.
  it.fails('a cleared forest keeps its new terrain through a save (known bug, see RISKS.md)', () => {
    let s: GameState | null = null, tile = -1
    for (const seed of ['a', 'b', 'c', 'd']) {
      const g = createGame(seed + 'standard', { size: 'standard' }, 1)
      const i = g.world.tiles.findIndex(t => t.forest && C.terrain.forestClearsTo[t.forest] !== t.terrain)
      if (i >= 0) { s = g; tile = i; break }
    }
    expect(s).not.toBeNull()
    applyAction(s!, { t: 'land', site: s!.world.landingSites[0] })
    const t = s!.world.tiles[tile]
    t.terrain = C.terrain.forestClearsTo[t.forest!]
    t.forest = null
    const back = fromSave(JSON.parse(JSON.stringify(toSave(s!))), 2)
    expect(back.world.tiles[tile].forest).toBeNull()
    expect(back.world.tiles[tile].terrain).toBe(t.terrain)
  })
})

describe('queue ceiling, adversarial', () => {
  // Protects: the fold and the pace cap under a state with every condition the queue knows about
  // firing at once, across many settlements and units, plus a demand, a declaration in progress,
  // alarmed predecessors, tense rivals and a raider. Types one and two must all be shown, the cap
  // must hold for types three and up, keys must be unique, every card must be actionable, and the
  // whole derivation must stay cheap. A new queue item that forgets its group or its key fails here.
  it('a war-time, famine, spoilage, all-stuck state folds correctly and derives fast', () => {
    const s = createGame('adversarial', { size: 'large', difficulty: 'standard' }, 7)
    applyAction(s, { t: 'land', site: s.world.landingSites[0] })
    s.rng.play = [5, 5, 5, 5]
    const w = s.world.width
    const ch = s.charters[0]
    for (const k of ['market', 'orders', 'grievance', 'signatories', 'predecessors', 'rivals', 'military', 'naval', 'fleet', 'demands']) ch.unlocked[k] = true
    // twenty-five settlements, each starving, spoiling, with an empty or blocked build order and an impossible surplus rule
    let planted = 1
    for (let i = 0; i < s.world.tiles.length && planted < 25; i += 5) {
      const t = s.world.tiles[i]
      if (!isLand(t) || t.terrain === 'mountain') continue
      if (s.settlements.some(st => dist(w, st.tile, i) < 3)) continue
      if (s.predecessors.some(p => p.territory.includes(i))) continue
      const colonists = [] as ReturnType<typeof makeColonist>[]
      for (let k = 0; k < 3; k++) colonists.push(makeColonist(s, 'free'))
      const st = foundSettlement(s, i, 0, colonists)
      st.colonists.forEach(c => { c.job = { kind: 'idle' } })
      st.foodStore = 0
      st.stock.timber = 500
      st.stock.ore = 300
      if (planted % 2 === 0) st.buildQueue = [{ line: 'smelter', tier: 3 }]   // pop gate blocks it
      if (planted % 3 === 0) st.orders.surplus = { threshold: 20, destination: { kind: 'ship', settlement: 999 } }
      st.orders.purpose = 'ask'
      planted++
    }
    const mine = s.settlements.filter(x => x.owner === 0)
    expect(mine.length).toBe(25)
    // hostile units beside every third settlement, a blockade ship and a raider off the landing
    for (let k = 0; k < mine.length; k += 3) {
      const near = [mine[k].tile + 1, mine[k].tile - 1, mine[k].tile + w].find(n => n >= 0 && n < s.world.tiles.length && isLand(s.world.tiles[n]) && !s.settlements.some(st => st.tile === n))
      if (near !== undefined) s.units.push(makeUnit(s, -1, k % 2 ? 'regulars' : 'siegeTrain', near, null))
    }
    const nearLanding = [...s.world.anchorages].sort((a, b) => dist(w, a, ch.landing) - dist(w, b, ch.landing))
    for (const a of nearLanding.slice(0, 3)) { const r = makeUnit(s, 1, 'raider', a, null); r.flagged = false; s.units.push(r) }
    s.units.push(makeUnit(s, -1, 'companyShip', nearLanding[0], null))
    // thirty idle colonists and five stuck haulers
    for (let k = 0; k < 30; k++) s.units.push(makeUnit(s, 0, 'colonist', mine[k % mine.length].tile, makeColonist(s, 'free')))
    for (let k = 0; k < 5; k++) { const u = makeUnit(s, 0, 'hauler', mine[k].tile, null); u.order = { kind: 'haul', stops: [{ settlement: 0, load: {}, unload: {} }], next: 0, risk: 'avoid' }; u.since['contact'] = s.turn - 3; s.units.push(u) }
    // a demand, a declaration with a wave at sea, alarmed predecessors, tense rivals
    s.company.demand = { turnOffered: s.turn, rise: 0.03, good: 'timber' }
    s.declaration = { declared: true, turnDeclared: s.turn - 2, waves: [{ id: 1, units: [{ kind: 'regulars', quality: 'raw' }], anchorage: nearLanding[0], turnsToLand: 4, landed: false, excluded: [] }], interventionProgress: 0, nextWaveId: 2, won: false, lost: false, intervened: null }
    s.company.fleetPool = [{ kind: 'horse', quality: 'raw' }]
    for (const p of s.predecessors) p.alarm = 0.7
    for (const c of s.charters.slice(1)) { c.relation = 'tense'; c.suspicion = 0.8 }
    // let two turns settle the conditions (hunger, spoilage, blocked builds) and leave the mess in place
    for (let i = 0; i < 2; i++) applyAction(s, { t: 'endTurn' })
    const t0 = performance.now()
    const q = deriveQueue(s, SYSTEMS)
    const ms = performance.now() - t0
    const all = [...q.shown, ...q.folded]
    const items = all.flatMap(g => g.items)
    const groups = all.map(g => g.group)
    expect(ms).toBeLessThan(100)
    expect(items.length).toBeGreaterThan(60)
    expect(new Set(groups).size).toBe(groups.length)
    // keys are unique within a group except for the known duplicate noted in RISKS.md: the threat
    // item is keyed by the threatened settlement, so two hostile units beside one settlement share
    // a key. The strict check lives in the expected-failure test below.
    const dupes = items.map(it => it.key).filter((k, i, a) => a.indexOf(k) !== i)
    expect(dupes.every(k => k.startsWith('threat:'))).toBe(true)
    // types one and two never fold, types three and up respect the cap
    for (const g of q.folded) expect(g.type).toBeGreaterThanOrEqual(3)
    expect(q.shown.filter(g => g.type >= 3).length).toBeLessThanOrEqual(C.queue.paces[s.settings.pace])
    for (const g of all) { expect(g.title.length).toBeGreaterThan(0); expect(g.body.length).toBeGreaterThan(0) }
    // every card can be acted on or at least dismissed; only types three and up may rely on dismiss alone
    for (const it of items) { const actionable = !!(it.opens || it.choices.length || it.settlement !== undefined || it.unit !== undefined || it.tile !== undefined); if (!actionable) expect(it.type, it.key).toBeGreaterThanOrEqual(3) }
    // the conditions this state was built to trigger are all present somewhere
    for (const g of ['hunger', 'spoilage', 'buildEmpty', 'buildBlocked', 'demand', 'wave', 'muster', 'unitIdle', 'threat', 'alarm', 'tense', 'sail', 'orderUnsat', 'haulStopped']) expect(groups, g).toContain(g)
    // ranking: every loss and Company item outranks every opportunity that is shown
    const worstShownTop = Math.min(...q.shown.filter(g => g.type <= 2).map(g => g.rank))
    const bestChance = Math.max(...all.filter(g => g.type === 5).map(g => g.rank), -Infinity)
    expect(worstShownTop).toBeGreaterThan(bestChance)
    // end of turn bookkeeping and another three turns do not throw or crash a system
    noteUnresolved(s, q, () => { /* ignore */ })
    for (let i = 0; i < 3; i++) applyAction(s, { t: 'endTurn' })
    expect(s.dispatch.filter(d => /system failed this turn/.test(d.text)).map(d => d.text)).toEqual([])
    // pace light shows fewer, pace all shows everything
    applyAction(s, { t: 'setPace', pace: 'light' })
    expect(deriveQueue(s, SYSTEMS).shown.filter(g => g.type >= 3).length).toBeLessThanOrEqual(C.queue.paces.light)
    applyAction(s, { t: 'setPace', pace: 'all' })
    expect(deriveQueue(s, SYSTEMS).folded.length).toBe(0)
  })

  // Documents a known bug: src/sim/military.ts keys the threat item by settlement, not by hostile
  // unit, so two hostiles beside one settlement produce two items with the same key. The group
  // still collapses correctly, but the item count in the card overstates the number of distinct
  // threats and a dismiss by key would hit both. Fix by keying on the unit id; then this passes
  // unexpectedly and should become a plain `it`.
  it.fails('every queue item key is unique (known bug: threat keys collide)', () => {
    const s = createGame('dupe-key', { size: 'small', difficulty: 'standard' }, 7)
    applyAction(s, { t: 'land', site: s.world.landingSites[0] })
    s.charters[0].unlocked.military = true
    const w = s.world.width
    const home = s.settlements[0].tile
    const spots = [home + 1, home - 1, home + w, home - w].filter(n => n >= 0 && n < s.world.tiles.length && isLand(s.world.tiles[n]))
    for (const n of spots.slice(0, 2)) s.units.push(makeUnit(s, -1, 'regulars', n, null))
    const items = [...deriveQueue(s, SYSTEMS).shown, ...deriveQueue(s, SYSTEMS).folded].flatMap(g => g.items)
    expect(new Set(items.map(it => it.key)).size).toBe(items.length)
  })
})

// recompute is re-exported by the market; this keeps it referenced so a rename there is noticed here
void recompute
