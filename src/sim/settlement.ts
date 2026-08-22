// Settlements: production, consumption, growth, construction, storage and spoilage.
// Turn loop steps 2 to 5 and 14, build specification section 6. Production before consumption, so a
// settlement does not starve before this turn's harvest. Spoilage after everything that adds goods.

import { C, difficultyOf } from './constants'
import type { GameState, Settlement, Colonist, BuildingLine, BuildId, GoodId, TileGood, TurnContext, StandingOrders, Purpose, QueueItem } from './state'
import { GOODS, emptyStock, emptyBuildings } from './state'
import type { System } from './turn'
import { tileYield, tileOffers, workerOutput, workableTiles, clerksRequired, buildingWorkers, defaultJob, makeColonist, foodBalance } from './labour'
import { chance, next } from './rng'
import { SETTLEMENT_NAMES, neighbours8 } from './worldgen'

export function storageCapacity(st: Settlement): number {
  return C.buildings.storage[st.buildings.storage] ?? C.buildings.storage[0]
}

/** Flat per-worker output modifier from resolve and the unresolved penalty. */
export function outputModifier(s: GameState, st: Settlement): number {
  if (st.owner !== 0 || !C.flags.grievance) return 0
  let m = 0
  if (st.resolve >= 0.5) m += C.grievance.bonusAt50
  if (st.resolve >= 1) m += C.grievance.bonusAt100
  const unresolved = st.colonists.length * (1 - Math.min(1, st.resolve))
  if (unresolved > difficultyOf(s.settings.difficulty).unresolvedThreshold) m -= C.grievance.unresolvedPenalty
  return m
}

/** Bodies that are neither on a tile nor in a building because the ledger needs them. */
export function clerkShortfall(st: Settlement): number {
  const needed = clerksRequired(st.colonists.length)
  const idle = st.colonists.filter(c => c.job.kind === 'idle').length
  return Math.max(0, needed - idle)
}

export function effectiveTier(st: Settlement, line: BuildingLine): number {
  const tier = st.buildings[line]
  if (tier === 3 && st.imported[line] && st.imported[line]!.starved > 0) return 2
  return tier
}

/** What this settlement would produce this turn, for the sheet. Does not mutate. */
export function previewProduction(s: GameState, st: Settlement): Partial<Record<GoodId | 'frame' | 'grievance', number>> {
  const out: Partial<Record<GoodId | 'frame' | 'grievance', number>> = {}
  const mod = outputModifier(s, st)
  const add = (g: GoodId | 'frame' | 'grievance', v: number) => { out[g] = (out[g] ?? 0) + v }
  add('food', tileYield(s, st.tile, 'food', null))
  for (const c of st.colonists) {
    if (c.job.kind === 'tile') add(c.job.good, Math.max(0, tileYield(s, c.job.tile, c.job.good, c) + mod))
  }
  for (const line of Object.keys(C.buildings.lines) as BuildingLine[]) {
    const def = C.buildings.lines[line]
    if (!def.output || st.buildings[line] === 0) continue
    const tier = effectiveTier(st, line)
    let cap = 0
    for (const c of st.colonists) if (c.job.kind === 'building' && c.job.line === line) cap += Math.max(0, workerOutput(c, line) + mod) * C.labour.tierMultiplier[tier]
    let possible = Math.min(cap, st.stock[def.input!] + (out[def.input!] ?? 0))
    if (def.secondInput) possible = Math.min(possible, st.stock[def.secondInput] + (out[def.secondInput] ?? 0))
    if (possible > 0) add(def.output, possible)
  }
  return out
}

/** Which lines this settlement could add to its build order right now. */
export function buildable(s: GameState, st: Settlement): BuildId[] {
  const out: BuildId[] = []
  const pop = st.colonists.length
  const ch = s.charters[0]
  for (const line of Object.keys(C.buildings.lines) as BuildingLine[]) {
    const def = C.buildings.lines[line]
    const cur = st.buildings[line]
    if (cur >= def.tiers) continue
    const tier = (cur + 1) as 1 | 2 | 3
    if (st.buildQueue.some(b => b.line === line) || (st.building && st.building.id.line === line)) continue
    if (pop < C.buildings.popGate[tier]) continue
    if (line === 'consignment' && !ch.signatories.includes(0)) continue
    if (line === 'press' && tier === 2 && !ch.signatories.includes(9)) continue
    if (line === 'wharf' && !isCoastalSettlement(s, st)) continue
    if (line === 'stable' && st.stock.horses < 2 && !st.colonists.some(c => c.job.kind === 'tile' && c.job.good === 'horses')) continue
    // onboarding: a refinery appears only when its crop is held, with a turn backstop
    if (def.input && def.output && def.output !== 'frame' && cur === 0) {
      const held = st.stock[def.input] >= C.onboarding.refiningUnlockCrop || s.settlements.some(o => o.owner === 0 && o.stock[def.input!] >= C.onboarding.refiningUnlockCrop)
      const producing = st.colonists.some(c => c.job.kind === 'tile' && c.job.good === def.input)
      if (!held && !producing && s.turn < C.onboarding.unlockBackstop.refining) continue
    }
    out.push({ line, tier })
    if (tier === 3 && def.output) out.push({ line, tier, imported: true })
  }
  return out
}

export function buildingName(id: BuildId): string {
  const def = C.buildings.lines[id.line]
  const n = def.names[id.tier - 1] || def.names[0]
  return id.imported ? `${n} (imported machine)` : n
}

export function isCoastalSettlement(s: GameState, st: Settlement): boolean {
  for (const n of neighbours8(s.world.width, s.world.height, st.tile)) if (s.world.tiles[n].terrain === 'water') return true
  return false
}

/** Infer the four standing orders from the surrounding terrain, queue brief section 3. */
export function inferOrders(s: GameState, tile: number): StandingOrders {
  const tiles = [tile, ...neighbours8(s.world.width, s.world.height, tile)]
  const totals: Partial<Record<TileGood, number>> = {}
  for (const t of tiles) {
    for (const g of tileOffers(s.world.tiles[t])) totals[g] = (totals[g] ?? 0) + tileYield(s, t, g, null)
  }
  let purpose: Purpose = 'food'
  let best = 0
  for (const g of ['timber', 'ore', 'flax', 'hemp', 'madder', 'bloom', 'horses', 'gold'] as TileGood[]) {
    const v = (totals[g] ?? 0) * (g === 'bloom' ? 1.4 : g === 'gold' ? 0.6 : 1)
    if (v > best) { best = v; purpose = g }
  }
  if (best < 6) purpose = 'food'
  return { purpose, surplus: { threshold: 40, destination: { kind: 'consign' } }, growth: { kind: 'keep' }, reviewed: false }
}

function firstBuilding(purpose: Purpose): BuildingLine | null {
  switch (purpose) {
    case 'timber': return 'carpenter'
    case 'ore': return 'smelter'
    case 'flax': return 'linenWorks'
    case 'hemp': return 'ropeWorks'
    case 'madder': return 'dyeWorks'
    case 'bloom': return 'still'
    case 'horses': return 'stable'
    default: return 'carpenter'
  }
}

export function nextSettlementName(s: GameState): string {
  const used = new Set(s.settlements.map(x => x.name))
  for (const n of SETTLEMENT_NAMES) if (!used.has(n)) return n
  return 'Settlement ' + (s.settlements.length + 1)
}

/** Found a settlement. Claims the nine tiles where unowned. Every settlement begins with a meeting
 * house and the tier-one building its terrain suggests, remaining systems proposal section 4. */
export function foundSettlement(s: GameState, tile: number, owner: number, colonists: Colonist[], name?: string): Settlement {
  const orders = inferOrders(s, tile)
  const st: Settlement = {
    id: s.settlements.length,
    name: name ?? nextSettlementName(s),
    tile,
    owner,
    founded: s.turn,
    colonists,
    stock: emptyStock(),
    frame: 0,
    foodStore: 0,
    hunger: 0,
    buildings: emptyBuildings(),
    imported: {},
    buildQueue: [],
    building: null,
    orders,
    grievance: 0,
    resolve: 0,
    education: null,
    conditions: {},
    lastProduced: {},
    abstractPop: 0,
    nameChosen: false,
  }
  st.buildings.meeting = 1
  const fb = orders.purpose === 'ask' ? null : firstBuilding(orders.purpose)
  if (fb) st.buildings[fb] = 1
  if (s.charters[owner]?.signatories.includes(4)) st.buildings.works = 1
  for (const t of [tile, ...neighbours8(s.world.width, s.world.height, tile)]) {
    const tl = s.world.tiles[t]
    if (tl.owner === null) tl.owner = owner
  }
  s.world.tiles[tile].worked = st.id
  s.settlements.push(st)
  for (const c of colonists) if (c.job.kind === 'idle') c.job = defaultJob(s, st)
  return st
}

/** Release a tile claim when a worker leaves it. */
export function syncWorkedTiles(s: GameState) {
  for (const t of s.world.tiles) if (t.worked !== null && !s.settlements[t.worked]) t.worked = null
  for (const st of s.settlements) {
    if (st.owner !== 0) continue
    for (const t of workableTiles(s, st)) {
      const tl = s.world.tiles[t]
      const workedHere = st.colonists.some(c => c.job.kind === 'tile' && c.job.tile === t) || t === st.tile
      if (workedHere) tl.worked = st.id
      else if (tl.worked === st.id && t !== st.tile) tl.worked = null
    }
  }
}

function produce(s: GameState, st: Settlement, ctx: TurnContext) {
  const mod = outputModifier(s, st)
  const produced: Partial<Record<GoodId, number>> = {}
  let food = tileYield(s, st.tile, 'food', null)
  // the settlement tile also gives half of its best non-food yield for free
  const own = s.world.tiles[st.tile]
  let bestG: TileGood | null = null, bestV = 0
  for (const g of tileOffers(own)) { if (g === 'food' || g === 'gold') continue; const v = tileYield(s, st.tile, g, null); if (v > bestV) { bestV = v; bestG = g } }
  if (bestG) { const v = Math.floor(bestV / 2); if (v > 0) { st.stock[bestG] += v; produced[bestG] = (produced[bestG] ?? 0) + v } }
  // tiles
  for (const c of st.colonists) {
    if (c.job.kind !== 'tile') continue
    let v = Math.max(0, tileYield(s, c.job.tile, c.job.good, c) + mod)
    const good = c.job.good, tileIdx = c.job.tile
    if (good === 'gold') {
      const tile = s.world.tiles[tileIdx]
      v = Math.min(v, tile.goldReserve)
      tile.goldReserve -= v
      if (tile.goldReserve <= 0) {
        tile.goldReserve = 0
        tile.prime = null
        tile.workings = true
        c.job = { kind: 'idle' }
        ctx.log({ kind: 'loss', text: `${st.name}: the seam is worked out. The diggings stay on the map.`, why: 'Gold reserves are finite and deplete as they are worked.', settlement: st.id, tile: tileIdx })
      }
    }
    if (good === 'food') food += v
    else { st.stock[good] += v; produced[good] = (produced[good] ?? 0) + v }
  }
  // buildings, consuming their inputs
  for (const line of Object.keys(C.buildings.lines) as BuildingLine[]) {
    const def = C.buildings.lines[line]
    if (!def.output || st.buildings[line] === 0) continue
    const tier = effectiveTier(st, line)
    let cap = 0
    for (const c of st.colonists) if (c.job.kind === 'building' && c.job.line === line) cap += Math.max(0, workerOutput(c, line) + mod) * C.labour.tierMultiplier[tier]
    if (cap <= 0) continue
    let amount = Math.min(cap, st.stock[def.input!])
    if (def.secondInput) amount = Math.min(amount, st.stock[def.secondInput])
    if (amount <= 0) continue
    st.stock[def.input!] -= amount
    if (def.secondInput) st.stock[def.secondInput] -= amount
    if (def.output === 'frame') st.frame += amount
    else { st.stock[def.output] += amount; produced[def.output] = (produced[def.output] ?? 0) + amount }
  }
  // horses breed
  if (st.stock.horses >= 2) {
    let bred = st.stock.horses * C.buildings.horseBreedBase
    if (st.buildings.stable > 0) bred += C.buildings.stableHorseBonus
    const whole = Math.floor(bred + (chance(ctx.rngPlay, bred % 1) ? 1 : 0))
    if (whole > 0) { st.stock.horses += whole; produced.horses = (produced.horses ?? 0) + whole }
  }
  produced.food = food
  st.lastProduced = produced
  return food
}

function consume(s: GameState, st: Settlement, food: number, ctx: TurnContext) {
  const eaten = st.colonists.length * C.labour.eats
  const balance = food - eaten
  if (balance >= 0) {
    st.foodStore += balance
    st.hunger = 0
  } else {
    st.foodStore += balance
    if (st.foodStore < 0) {
      st.foodStore = 0
      st.hunger++
      if (st.hunger >= C.labour.starvationTurns && st.colonists.length > 1) {
        const lost = st.colonists.sort((a, b) => b.arrived - a.arrived)[0]
        st.colonists = st.colonists.filter(c => c !== lost)
        st.hunger = 0
        ctx.log({ kind: 'loss', text: `${st.name} lost a colonist to hunger.`, why: 'Food eaten exceeded food grown for three turns and nothing was banked.', settlement: st.id })
      }
    }
  }
  // imported machines consume Instruments
  for (const line of Object.keys(st.imported) as BuildingLine[]) {
    const m = st.imported[line]!
    if (st.stock.instruments >= C.buildings.importedInstrumentsPerTurn) {
      st.stock.instruments -= C.buildings.importedInstrumentsPerTurn
      m.starved = 0
    } else {
      m.starved++
    }
    const years = (s.turn - m.boughtTurn) / C.session.turnsPerYear
    if (chance(ctx.rngPlay, C.buildings.importedFailBase + C.buildings.importedFailPerYear * years)) {
      delete st.imported[line]
      st.buildings[line] = 2
      ctx.log({ kind: 'loss', text: `${st.name}: the imported ${C.buildings.lines[line].names[2]} failed and nothing local can mend it. It runs as a ${C.buildings.lines[line].names[1]} until replaced.`, why: 'Imported machines fail with rising chance each year.', settlement: st.id })
    }
  }
}

function grow(s: GameState, st: Settlement, ctx: TurnContext) {
  if (st.foodStore < C.labour.granaryThreshold) return
  st.foodStore -= C.labour.granaryThreshold
  const born = makeColonist(s, 'free')
  const rule = st.orders.growth
  if (rule.kind === 'send' && s.settlements[rule.settlement] && s.settlements[rule.settlement].owner === 0) {
    born.job = { kind: 'idle' }
    s.units.push({ id: s.nextId++, owner: 0, kind: 'colonist', tile: st.tile, quality: 'raw', moves: 0, cargo: {}, colonist: born, order: { kind: 'goto', tile: s.settlements[rule.settlement].tile }, path: [], damage: 0, progress: 0, since: {}, flagged: true })
    ctx.log({ kind: 'growth', text: `${st.name}: a child came of age and set out for ${s.settlements[rule.settlement].name}.`, settlement: st.id })
  } else {
    born.job = defaultJob(s, st)
    st.colonists.push(born)
    ctx.log({ kind: 'growth', text: `${st.name}: a child came of age and joined the roster, owing nothing.`, why: 'Banked food reached the granary threshold.', settlement: st.id })
    if (rule.kind === 'ask') st.conditions['growthAsk'] = st.conditions['growthAsk'] ?? s.turn
  }
}

export function canStart(st: Settlement, id: BuildId): { ok: boolean; reason?: string } {
  if (st.colonists.length < C.buildings.popGate[id.tier]) return { ok: false, reason: `needs population ${C.buildings.popGate[id.tier]}` }
  return { ok: true }
}

function construct(s: GameState, st: Settlement, ctx: TurnContext) {
  if (!st.building && st.buildQueue.length) {
    const id = st.buildQueue[0]
    if (canStart(st, id).ok) {
      st.buildQueue.shift()
      st.building = { id, frame: 0, tooling: 0 }
      delete st.conditions['buildBlocked']
    } else {
      st.conditions['buildBlocked'] = st.conditions['buildBlocked'] ?? s.turn
      return
    }
  }
  if (!st.building) return
  const b = st.building
  const cost = C.buildings.costs[b.id.tier]!
  if (b.id.imported) {
    // imported machines arrive immediately once bought; the action handles payment
    return
  }
  const needFrame = cost.frame - b.frame
  const useFrame = Math.min(needFrame, st.frame)
  st.frame -= useFrame; b.frame += useFrame
  const needTool = cost.tooling - b.tooling
  const useTool = Math.min(needTool, st.stock.tooling)
  st.stock.tooling -= useTool; b.tooling += useTool
  if (b.frame >= cost.frame && b.tooling >= cost.tooling) {
    completeBuilding(s, st, b.id, ctx)
  }
}

export function completeBuilding(s: GameState, st: Settlement, id: BuildId, ctx: TurnContext) {
  st.buildings[id.line] = id.tier
  st.building = null
  if (id.imported) st.imported[id.line] = { boughtTurn: s.turn, starved: 0 }
  ctx.log({ kind: 'build', text: `${st.name} finished its ${buildingName(id)}.`, settlement: st.id })
  if (st.buildQueue.length === 0) st.conditions['buildEmpty'] = st.conditions['buildEmpty'] ?? s.turn
}

function spoil(s: GameState, st: Settlement, ctx: TurnContext) {
  const cap = storageCapacity(st)
  const spoiled: string[] = []
  for (const g of GOODS) {
    if (g === 'food') continue
    if (st.stock[g] > cap) {
      const lost = st.stock[g] - cap
      st.stock[g] = cap
      spoiled.push(`${lost} ${g}`)
    }
  }
  if (spoiled.length) {
    st.conditions['spoilage'] = st.conditions['spoilage'] ?? s.turn
    ctx.log({ kind: 'loss', text: `${st.name} lost ${spoiled.join(', ')} to spoilage.`, why: `Storage holds ${cap} of each good. Build storage or ship the surplus.`, settlement: st.id })
  } else {
    delete st.conditions['spoilage']
  }
}

/** Turn loop steps 2 to 5 for every player settlement. Rival settlements are abstract, rivals.ts. */
export const settlementSystem: System = {
  id: 'settlement',
  enabled: c => c.flags.settlement,
  resolve(s: GameState, ctx: TurnContext) {
    syncWorkedTiles(s)
    for (const st of s.settlements) {
      if (st.owner !== 0) continue
      const food = produce(s, st, ctx)
      consume(s, st, food, ctx)
      grow(s, st, ctx)
      construct(s, st, ctx)
      if (st.buildQueue.length === 0 && !st.building) st.conditions['buildEmpty'] = st.conditions['buildEmpty'] ?? s.turn
      else delete st.conditions['buildEmpty']
      const idle = st.colonists.filter(c => c.job.kind === 'idle').length - clerksRequired(st.colonists.length)
      if (idle > 0) st.conditions['idle'] = st.conditions['idle'] ?? s.turn
      else delete st.conditions['idle']
      const fb = foodBalance(s, st)
      if (fb < 0 && st.foodStore + fb * 2 < 0) st.conditions['hunger'] = st.conditions['hunger'] ?? s.turn
      else delete st.conditions['hunger']
      if (!st.orders.reviewed && s.turn - st.founded >= C.queue.reviewOrdersAfter && s.settlements.filter(x => x.owner === 0).length > 1) st.conditions['reviewOrders'] = st.conditions['reviewOrders'] ?? s.turn
      else delete st.conditions['reviewOrders']
      // purpose unsatisfiable: no free tile yields the purpose good
      const p = st.orders.purpose
      if (p !== 'ask' && p !== 'industry' && p !== 'civic') {
        const any = workableTiles(s, st).some(t => tileYield(s, t, p, null) > 0)
        if (!any) st.conditions['purposeLost'] = st.conditions['purposeLost'] ?? s.turn
        else delete st.conditions['purposeLost']
      }
    }
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    for (const st of s.settlements) {
      if (st.owner !== 0) continue
      const c = st.conditions
      if (c.hunger !== undefined) out.push({
        key: `hunger:${st.id}`, group: 'hunger', type: 1, title: `${st.name} is running short of food`,
        body: `Food eaten outpaces food grown and the store is nearly empty.`, settlement: st.id, magnitude: st.colonists.length, since: c.hunger, choices: [], opens: 'settlement',
        explain: 'Each person eats two food a turn. Put more people on food tiles, or fewer on everything else.',
      })
      if (c.spoilage !== undefined) out.push({
        key: `spoilage:${st.id}`, group: 'spoilage', type: 1, title: `${st.name} is losing goods`,
        body: `Storage is full and the surplus spoils each turn.`, settlement: st.id, magnitude: 2, since: c.spoilage, choices: [], opens: 'settlement',
        explain: 'Goods above storage capacity are lost. Consign them, ship them, or build storage.',
      })
      if (c.purposeLost !== undefined) out.push({
        key: `purposeLost:${st.id}`, group: 'purposeLost', type: 3, title: `${st.name} cannot pursue its purpose`,
        body: `Nothing around it yields ${st.orders.purpose} any more.`, settlement: st.id, magnitude: 1, since: c.purposeLost, choices: [], opens: 'orders',
      })
      if (c.buildBlocked !== undefined && st.buildQueue.length) out.push({
        key: `buildBlocked:${st.id}`, group: 'buildBlocked', type: 3, title: `${st.name} cannot start ${buildingName(st.buildQueue[0])}`,
        body: canStart(st, st.buildQueue[0]).reason ?? '', settlement: st.id, magnitude: 1, since: c.buildBlocked, choices: [], opens: 'settlement',
      })
      if (c.buildEmpty !== undefined && s.turn > st.founded) out.push({
        key: `buildEmpty:${st.id}`, group: 'buildEmpty', type: 4, title: `${st.name} has nothing in its build order`,
        body: `Choose what it builds next.`, settlement: st.id, magnitude: 1, since: c.buildEmpty, choices: [], opens: 'settlement',
        explain: 'Buildings cost Frame, which a carpenter makes from timber. Higher tiers also need Tooling.',
      })
      if (c.idle !== undefined) out.push({
        key: `idle:${st.id}`, group: 'idle', type: 4, title: `Someone at ${st.name} has nothing to do`,
        body: `Put them to work on a tile or in a building.`, settlement: st.id, magnitude: 1, since: c.idle, choices: [], opens: 'settlement',
        explain: 'Tap a person, then pick a tile or a building. One body, one job.',
      })
      if (c.reviewOrders !== undefined) out.push({
        key: `reviewOrders:${st.id}`, group: 'reviewOrders', type: 5, title: `Review ${st.name}'s standing orders`,
        body: `Its orders were inferred from the ground. Confirm or change them.`, settlement: st.id, magnitude: 1, since: c.reviewOrders, choices: [], opens: 'orders',
        explain: 'A settlement inside its standing orders never asks you anything. It surfaces only when an order cannot be met.',
      })
      if (c.growthAsk !== undefined) out.push({
        key: `growthAsk:${st.id}`, group: 'growthAsk', type: 5, title: `${st.name} has a new colonist`,
        body: `Decide where they go.`, settlement: st.id, magnitude: 1, since: c.growthAsk, choices: [], opens: 'settlement',
      })
    }
    return out
  },
}

/** Spoilage, turn loop step 14, after everything that could add goods. */
export const spoilageSystem: System = {
  id: 'spoilage',
  enabled: c => c.flags.settlement,
  resolve(s: GameState, ctx: TurnContext) {
    for (const st of s.settlements) if (st.owner === 0) spoil(s, st, ctx)
  },
  queueItems: () => [],
}

export { next }
