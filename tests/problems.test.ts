// What is not working, and what is going to waste (src/sim/problems.ts, DECISIONS.md 192). Each
// problem is made to happen in a real game, its card is found in the queue, its fix is taken, and the
// card is gone at once. Then every fix offered on a messy state is checked to be a legal action.

import { describe, it, expect } from 'vitest'
import { applyAction } from '../src/sim/actions'
import { deriveQueue } from '../src/sim/queue'
import { SYSTEMS } from '../src/sim/systems'
import { C } from '../src/sim/constants'
import { syncWorkedTiles, foundSettlement } from '../src/sim/settlement'
import { workableTiles, tileYield, defaultJob, foodBalance, makeColonist, clerksRequired } from '../src/sim/labour'
import { recompute } from '../src/sim/market'
import { allProblems } from '../src/sim/problems'
import { makeUnit } from '../src/sim/units'
import type { GameState, Settlement, TileGood, QueueItem, Job } from '../src/sim/state'
import { arrived } from './helpers'

function landing(seed: string): { s: GameState; st: Settlement } {
  const s = arrived(seed, { size: 'small', difficulty: 'standard' }, 3)
  return { s, st: s.settlements.find(x => x.owner === 0)! }
}

/** Every item in the queue, shown or folded. */
function items(s: GameState): QueueItem[] {
  const q = deriveQueue(s, SYSTEMS)
  return [...q.shown, ...q.folded].flatMap(g => g.items)
}
function card(s: GameState, group: string, settlement?: number): QueueItem | undefined {
  return items(s).find(it => it.group === group && (settlement === undefined || it.settlement === settlement))
}

/** The best free tile here for a good, or null. */
function freeTile(s: GameState, st: Settlement, good: TileGood): number | null {
  let best: number | null = null, bestV = 0
  for (const t of workableTiles(s, st)) {
    if (st.colonists.some(c => c.job.kind === 'tile' && c.job.tile === t)) continue
    const v = tileYield(s, t, good, null)
    if (v > bestV) { bestV = v; best = t }
  }
  return best
}

/** Every workable tile worked: a colonist on each free one, on whatever it yields most of. */
function fillTheGround(s: GameState, st: Settlement) {
  for (const t of workableTiles(s, st)) {
    if (st.colonists.some(c => c.job.kind === 'tile' && c.job.tile === t)) continue
    const tile = s.world.tiles[t]
    if (tile.worked !== null && tile.worked !== st.id) continue
    let good: TileGood | null = null, best = 0
    for (const g of ['food', 'timber', 'ore', 'flax', 'hemp', 'madder', 'bloom', 'horses'] as TileGood[]) { const v = tileYield(s, t, g, null); if (v > best) { best = v; good = g } }
    if (!good) continue
    st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'tile', tile: t, good } })
    syncWorkedTiles(s)
  }
  expect(defaultJob(s, { ...st, buildings: { ...st.buildings, carpenter: 0, linenWorks: 0, smelter: 0, toolworks: 0, armoury: 0, ropeWorks: 0, dyeWorks: 0, still: 0, finishing: 0 } }).kind).toBe('idle')
}

/** Everyone on the land: enough on food to eat, the rest on timber where there is forest. */
function everyoneOnTheLand(s: GameState, st: Settlement) {
  for (const c of st.colonists) c.job = { kind: 'idle' }
  syncWorkedTiles(s)
  for (const c of st.colonists) {
    const fed = foodBalance(s, st) >= C.labour.eats
    const good: TileGood = fed ? 'timber' : 'food'
    const t = freeTile(s, st, good) ?? freeTile(s, st, 'food')
    if (t === null) continue
    c.job = { kind: 'tile', tile: t, good: freeTile(s, st, good) === t ? good : 'food' }
    syncWorkedTiles(s)
  }
}

describe('a building that gets nothing to rise with is never silent', () => {
  it('the owner\'s palisade: timber sold, nobody making frame, and the fix puts someone in the shop', () => {
    const { s, st } = landing('problems-palisade')
    everyoneOnTheLand(s, st)
    st.building = null
    st.buildQueue = [{ line: 'works', tier: 1 }]
    st.frame = 0
    st.stock.timber = 60
    expect(st.colonists.some(c => c.job.kind === 'building' && c.job.line === 'carpenter')).toBe(false)
    applyAction(s, { t: 'endTurn' })
    applyAction(s, { t: 'endTurn' })
    const it = card(s, 'buildStalled', st.id)
    expect(it, 'a stalled palisade has its card').toBeDefined()
    expect(it!.title).toMatch(/palisade at .* is getting no frame/)
    expect(it!.body).toMatch(/Nobody works the carpenter's shop/)
    expect(it!.choices[0].label).toMatch(/Staff the carpenter's shop/)
    // the fix is one tap, and the card goes the moment it is taken
    applyAction(s, it!.choices[0].action as never)
    expect(st.colonists.some(c => c.job.kind === 'building' && c.job.line === 'carpenter')).toBe(true)
    expect(card(s, 'buildStalled', st.id)).toBeUndefined()
    // what has gone into the building and what is held, read fresh after each turn
    const frameIn = (x: Settlement) => (x.building?.frame ?? 0) + x.frame
    const before = frameIn(st)
    applyAction(s, { t: 'endTurn' })
    expect(frameIn(st)).toBeGreaterThan(before)
  })

  it('when the orders dump the timber a waiting build needs, the dumping card offers the shop first', () => {
    const { s, st } = landing('problems-dumping')
    everyoneOnTheLand(s, st)
    st.building = null
    st.buildQueue = [{ line: 'works', tier: 1 }]
    st.frame = 0
    // a granary, so the store has room to hold the timber the orders sell (a full store's selling is
    // its overflow, and is not dumping: below)
    st.buildings.storage = 1
    st.stock.timber = 40
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 5, destination: { kind: 'consign' } } })
    // the Company's table as a long run of automatic timber sales leaves it
    const e = s.market.tables[0].timber
    e.baseline = 4; e.pressure = 400; e.autoPressure = 400
    recompute(e, 'timber')
    const it = card(s, 'dumping')
    expect(it).toBeDefined()
    expect(it!.body).toMatch(/Nobody at .* works the carpenter's shop/)
    expect(it!.choices[0].label).toMatch(/Staff the carpenter's shop/)
    expect(it!.choices[1].label).toMatch(/Hold timber everywhere/)
    // holding it everywhere ends the selling, and the card goes at once, before the price mends
    applyAction(s, it!.choices[1].action as never)
    expect(e.price).toBeLessThan(e.baseline)
    expect(card(s, 'dumping')).toBeUndefined()
  })

  it('a store full of a good sells its overflow, which is not dumping: nothing says hold what would spoil', () => {
    const { s, st } = landing('problems-full-store')
    st.stock.timber = C.buildings.storage[st.buildings.storage] + 30
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 5, destination: { kind: 'consign' } } })
    const e = s.market.tables[0].timber
    e.baseline = 4; e.pressure = 400; e.autoPressure = 400
    recompute(e, 'timber')
    expect(card(s, 'dumping')).toBeUndefined()
  })

  it('a build that needs tooling nobody makes offers to buy it', () => {
    const { s, st } = landing('problems-tooling')
    st.building = { id: { line: 'storage', tier: 2 }, frame: C.buildings.costs[2]!.frame, tooling: 0 }
    st.stock.tooling = 0
    s.charters[0].gold = 1000
    const it = card(s, 'buildStalled', st.id)
    expect(it).toBeDefined()
    expect(it!.title).toMatch(/getting no tooling/)
    expect(it!.choices[0].label).toMatch(/Buy \d+ tooling/)
    applyAction(s, it!.choices[0].action as never)
    expect(card(s, 'buildStalled', st.id)).toBeUndefined()
  })

  it('a head of the build order that cannot start offers the next one that can', () => {
    const { s, st } = landing('problems-blocked')
    st.building = null
    st.buildQueue = [{ line: 'storage', tier: 3 }, { line: 'works', tier: 1 }]
    const it = card(s, 'buildBlocked', st.id)
    expect(it).toBeDefined()
    expect(it!.choices[0].label).toMatch(/Build the palisade first/)
    applyAction(s, it!.choices[0].action as never)
    expect(st.buildQueue[0].line).toBe('works')
    expect(card(s, 'buildBlocked', st.id)).toBeUndefined()
  })
})

describe('who a new arrival is sent to', () => {
  it('goes to an empty carpenter\'s shop while a build waits, however much timber is held', () => {
    const { s, st } = landing('problems-arrival')
    everyoneOnTheLand(s, st)
    st.building = null
    st.buildQueue = [{ line: 'works', tier: 1 }]
    st.frame = 0
    st.stock.timber = 200
    expect(foodBalance(s, st)).toBeGreaterThanOrEqual(C.labour.eats)
    expect(defaultJob(s, st)).toEqual({ kind: 'building', line: 'carpenter' })
  })
})

describe('people doing less than they could', () => {
  it('someone idle is put to work by the card', () => {
    const { s, st } = landing('problems-idle')
    st.colonists[0].job = { kind: 'idle' }
    syncWorkedTiles(s)
    const it = card(s, 'idle', st.id)
    expect(it).toBeDefined()
    applyAction(s, it!.choices[0].action as never)
    expect(card(s, 'idle', st.id)).toBeUndefined()
  })

  it('with no ground free, Put them to work names the workshop that has work and puts them there', () => {
    // the follower's first world (DECISIONS.md 194): every tile worked, an empty linen shop, flax
    // held, and a Put them to work that put nobody to work, 474 times
    const { s, st } = landing('problems-no-ground')
    fillTheGround(s, st)
    st.buildings.linenWorks = 1
    st.stock.flax = 60
    st.foodStore = 300
    st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'idle' } })
    while (st.colonists.filter(c => c.job.kind === 'idle').length <= clerksRequired(st.colonists.length)) st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'idle' } })
    const it = card(s, 'idle', st.id)
    expect(it).toBeDefined()
    expect(it!.body).toMatch(/work in the linen shop/)
    expect(it!.choices[0].label).toMatch(/in the linen shop|Put them to work/)
    applyAction(s, it!.choices[0].action as never)
    expect(st.colonists.some(c => c.job.kind === 'building' && c.job.line === 'linenWorks')).toBe(true)
    expect(card(s, 'idle', st.id)?.body ?? '').not.toBe(it!.body)
  })

  it('with nowhere to put them, the idle card offers no button that does nothing', () => {
    const { s, st } = landing('problems-nowhere')
    fillTheGround(s, st)
    st.foodStore = 300
    for (const g of ['flax', 'hemp', 'ore', 'metal', 'madder', 'bloom', 'attar', 'timber'] as const) st.stock[g] = 0
    while (st.colonists.filter(c => c.job.kind === 'idle').length <= clerksRequired(st.colonists.length)) st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'idle' } })
    const it = card(s, 'idle', st.id)
    expect(it).toBeDefined()
    expect(it!.body).toMatch(/No ground is free/)
    for (const ch of it!.choices) {
      const copy = structuredClone(s)
      applyAction(copy, ch.action as never)
      expect(card(copy, 'idle', st.id)?.body, ch.label).not.toBe(it!.body)
    }
  })

  it('someone in a building with nothing to work is found other work', () => {
    const { s, st } = landing('problems-wasted')
    st.buildings.smelter = 1
    st.stock.ore = 0
    st.colonists[0].job = { kind: 'building', line: 'smelter' }
    syncWorkedTiles(s)
    const it = card(s, 'workerWasted', st.id)
    expect(it).toBeDefined()
    expect(it!.body).toMatch(/smelter has no ore/)
    applyAction(s, it!.choices[0].action as never)
    expect(st.colonists[0].job).not.toEqual({ kind: 'building', line: 'smelter' })
    expect(card(s, 'workerWasted', st.id)).toBeUndefined()
  })

  it('a master away from their trade is sent back to it', () => {
    const { s, st } = landing('problems-master')
    everyoneOnTheLand(s, st)
    // a master of a good there is free ground for, gathering grievance in the meeting house instead
    const trade = (['ore', 'flax', 'hemp', 'horses', 'timber', 'food'] as TileGood[]).find(g => freeTile(s, st, g) !== null)
    expect(trade).toBeDefined()
    const c = st.colonists.find(x => !(x.job.kind === 'tile' && x.job.good === 'food')) ?? st.colonists[st.colonists.length - 1]
    c.standing = 'master'; c.speciality = trade!
    c.job = { kind: 'building', line: 'meeting' }
    syncWorkedTiles(s)
    st.foodStore = 200
    const it = card(s, 'masterMisplaced', st.id)
    expect(it).toBeDefined()
    applyAction(s, it!.choices[0].action as never)
    const job = c.job as Job
    expect(job.kind === 'tile' && job.good === trade).toBe(true)
    expect(card(s, 'masterMisplaced', st.id)).toBeUndefined()
  })
})

describe('losses this turn', () => {
  it('goods that will spoil are named before they do, and consigning them clears the card', () => {
    const { s, st } = landing('problems-spoil')
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 20, destination: { kind: 'hold' } } })
    const cap = C.buildings.storage[st.buildings.storage]
    st.stock.linen = cap + 40
    const it = card(s, 'spoilage', st.id)
    expect(it).toBeDefined()
    expect(it!.body).toMatch(/loses \d+ linen/)
    const consign = it!.choices.find(c => /Consign/.test(c.label))
    expect(consign).toBeDefined()
    applyAction(s, consign!.action as never)
    expect(card(s, 'spoilage', st.id)).toBeUndefined()
  })

  it('goods a workshop here could use: the card offers the workshop before consigning them', () => {
    const { s, st } = landing('problems-spoil-workshop')
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 20, destination: { kind: 'hold' } } })
    st.buildings.linenWorks = 1
    st.stock.flax = C.buildings.storage[st.buildings.storage] + 30
    st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'idle' } })
    while (st.colonists.filter(c => c.job.kind === 'idle').length <= clerksRequired(st.colonists.length)) st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'idle' } })
    st.foodStore = 300
    const it = card(s, 'spoilage', st.id)
    expect(it).toBeDefined()
    expect(it!.choices[0].label).toBe('Staff the linen shop')
    expect(it!.body).toMatch(/Nobody works the linen shop/)
    applyAction(s, it!.choices[0].action as never)
    expect(st.colonists.some(c => c.job.kind === 'building' && c.job.line === 'linenWorks')).toBe(true)
  })

  it('goods spoiling turn after turn: storage comes before consigning by hand again', () => {
    const { s, st } = landing('problems-spoil-lasting')
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 20, destination: { kind: 'hold' } } })
    st.stock.linen = C.buildings.storage[st.buildings.storage] + 40
    const first = card(s, 'spoilage', st.id)
    expect(first!.choices[0].label).toMatch(/^Consign/)
    st.conditions['spoilage'] = s.turn - C.problems.storageFirstAfter
    const later = card(s, 'spoilage', st.id)
    expect(later!.choices[0].label).toMatch(/^Build a granary first/)
    applyAction(s, later!.choices[0].action as never)
    // queued: the card no longer offers it, and says it is coming
    const after = card(s, 'spoilage', st.id)
    expect(after!.choices.some(c => /granary/.test(c.label))).toBe(false)
    expect(after!.body).toMatch(/granary is on its way/)
  })

  it('hunger offers to put someone on food', () => {
    const { s, st } = landing('problems-hunger')
    for (const c of st.colonists) c.job = { kind: 'idle' }
    while (foodBalance(s, st) >= 0) st.colonists.push({ ...makeColonist(s, 'debtor'), job: { kind: 'idle' } })
    syncWorkedTiles(s)
    st.foodStore = 0
    const it = card(s, 'hunger', st.id)
    expect(it).toBeDefined()
    expect(it!.choices[0].label).toBe('Put someone on food')
    const before = foodBalance(s, st)
    applyAction(s, it!.choices[0].action as never)
    expect(foodBalance(s, st)).toBeGreaterThan(before)
  })
})

describe('things set going that do not go', () => {
  it('schooling without a teacher, and a teacher without a pupil', () => {
    const { s, st } = landing('problems-school')
    st.buildings.school = 1
    // someone with nothing to do, who can teach
    st.colonists.push({ ...makeColonist(s, 'contracted'), job: { kind: 'idle' } })
    const pupil = st.colonists.findIndex(c => c.standing === 'debtor')
    expect(pupil).toBeGreaterThanOrEqual(0)
    applyAction(s, { t: 'educate', settlement: st.id, colonist: pupil })
    const stalled = card(s, 'schoolStalled', st.id)
    expect(stalled).toBeDefined()
    applyAction(s, stalled!.choices[0].action as never)
    expect(st.colonists.some(c => c.job.kind === 'building' && c.job.line === 'school')).toBe(true)
    expect(card(s, 'schoolStalled', st.id)).toBeUndefined()
    // the schooling ends; the teacher stays and the card asks who next
    st.education = null
    const idleSchool = card(s, 'schoolIdle', st.id)
    expect(idleSchool).toBeDefined()
    applyAction(s, idleSchool!.choices[0].action as never)
    expect(st.education).not.toBeNull()
  })

  it('an order to ship to a settlement that is gone, and goods the Company will not take', () => {
    const { s, st } = landing('problems-orders')
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 20, destination: { kind: 'ship', settlement: 999 } } })
    const gone = card(s, 'orderUnsat', st.id)
    expect(gone).toBeDefined()
    expect(gone!.body).toMatch(/no longer yours/)
    applyAction(s, gone!.choices[0].action as never)
    expect(card(s, 'orderUnsat', st.id)).toBeUndefined()
    applyAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: 20, destination: { kind: 'consign' } } })
    s.company.embargoed = ['linen']
    st.stock.linen = 200
    const embargo = card(s, 'orderUnsat', st.id)
    expect(embargo).toBeDefined()
    expect(embargo!.body).toMatch(/will not take linen/)
    applyAction(s, embargo!.choices[0].action as never)
    expect(card(s, 'orderUnsat', st.id)).toBeUndefined()
  })

  it('an imported machine short of instruments offers to buy them', () => {
    const { s, st } = landing('problems-machine')
    st.buildings.smelter = 3
    st.imported.smelter = { boughtTurn: s.turn, starved: 0 }
    st.stock.instruments = 0
    s.charters[0].gold = 2000
    const it = card(s, 'machineStarved', st.id)
    expect(it).toBeDefined()
    applyAction(s, it!.choices[0].action as never)
    expect(card(s, 'machineStarved', st.id)).toBeUndefined()
  })

  it('an explorer with nothing left to find, and a circuit that carries nothing', () => {
    const { s, st } = landing('problems-units')
    const scout = makeUnit(s, 0, 'colonist', st.tile, makeColonist(s, 'free'))
    scout.order = { kind: 'explore' }
    s.units.push(scout)
    for (const t of s.world.tiles) t.explored = true
    const done = card(s, 'exploreDone')
    expect(done).toBeDefined()
    applyAction(s, done!.choices[0].action as never)
    expect(card(s, 'exploreDone')).toBeUndefined()
    const hauler = makeUnit(s, 0, 'hauler', st.tile, null)
    hauler.order = { kind: 'haul', stops: [{ settlement: st.id, load: { flax: 10 }, unload: {} }], next: 0, risk: 'run', empty: 0 }
    s.units.push(hauler)
    st.stock.flax = 0
    for (let i = 0; i < 3; i++) applyAction(s, { t: 'endTurn' })
    expect(card(s, 'haulEmpty')).toBeDefined()
  })
})

describe('every fix offered is an action that can be taken', () => {
  it('on a messy state, each card names its place and each fix applies cleanly', () => {
    const { s, st } = landing('problems-mess')
    // a second settlement, everyone idle there, a stalled build, spoiling goods, a school, a ship
    // order to nowhere, an embargo, a starved machine
    const spot = s.world.tiles.findIndex((t, i) => t.terrain !== 'water' && t.terrain !== 'mountain' && Math.abs((i % s.world.width) - (st.tile % s.world.width)) === 4 && Math.floor(i / s.world.width) === Math.floor(st.tile / s.world.width))
    if (spot >= 0) {
      const two = foundSettlement(s, spot, 0, [makeColonist(s, 'debtor'), makeColonist(s, 'debtor')])
      two.colonists.forEach(c => { c.job = { kind: 'idle' } })
      two.stock.ore = 500
      two.buildQueue = [{ line: 'works', tier: 1 }]
    }
    everyoneOnTheLand(s, st)
    st.buildQueue = [{ line: 'works', tier: 1 }]
    st.building = null
    st.frame = 0
    st.stock.timber = 300
    st.buildings.school = 1
    st.buildings.smelter = 3
    st.imported.smelter = { boughtTurn: s.turn, starved: 0 }
    s.company.embargoed = ['ore']
    s.charters[0].gold = 3000
    applyAction(s, { t: 'endTurn' })
    const problems = allProblems(s)
    expect(problems.length).toBeGreaterThan(3)
    for (const p of problems) {
      expect(p.title.length, p.key).toBeGreaterThan(0)
      expect(p.body.length, p.key).toBeGreaterThan(0)
      expect([1, 3, 4]).toContain(p.type)
      expect(p.settlement !== undefined || p.unit !== undefined || p.group === 'dumping', p.key).toBe(true)
      for (const ch of p.choices) {
        const copy = structuredClone(s)
        expect(() => applyAction(copy, ch.action as never), `${p.key}: ${ch.label}`).not.toThrow()
        // and it changes something: the card goes, or says something else, or offers something else
        const again = allProblems(copy).find(x => x.key === p.key)
        const same = again && again.body === p.body && again.choices[0]?.label === p.choices[0]?.label
        expect(same, `${p.key}: ${ch.label} left its card as it was`).toBeFalsy()
      }
    }
  })
})
