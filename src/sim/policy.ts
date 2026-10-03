// A whole game, played by the machine. Three policies, each a rule of thumb for what a player of
// that kind would do with the actions the game offers: lazy does what the cards suggest and no
// more, competent plays a sensible game, strong plays a sharp one. The pace of the game is tuned so
// that competent reaches each era where the design wants it (DECISIONS.md, the reachability
// tables), lazy still reaches the declaration on generous terms, and strong gets there comfortably
// early. The knobs are in C.autopilot.
//
// Everything here goes through applyAction, like a player's taps, so the policies can do nothing a
// player cannot. An action the game refuses is nothing happened, as it is at the table. Nothing is
// stored in the state about the policy; a policy reads the state fresh every turn.

import { C, difficultyOf } from './constants'
import type { GameState, Settlement, Colonist, Job, BuildingLine, TileGood, GoodId, Unit, BuildId, MapSize } from './state'
import type { Action } from './actions'
import { applyAction } from './actions'
import { openingAction, siteScore, playerLander } from './autopilot'
import { tileOffers, tileYield, workableTiles, buildingWorkers, workerOutput, clerksRequired, goldPassageCost } from './labour'
import { foundingProblem, buildable, storageCapacity, isCoastalSettlement } from './settlement'
import { sellPrice, buyPrice } from './market'
import { nationalResolve } from './grievance'
import { neighbours8, isLand, dist, isCoastal } from './worldgen'
import { isArmed, isHull, isCompany, isAfloat } from './units'
import { attackOdds, isHostileTo } from './military'

export type Policy = 'lazy' | 'competent' | 'strong'
export const POLICIES: Policy[] = ['lazy', 'competent', 'strong']

/** A policy's knobs, C.autopilot.policies. */
interface Knobs {
  civicAtPop: number; civicWorkers: number; foodSurplus: number; settleAtPop: number
  settlements: Record<MapSize, number>; sendAtPop: number; acceptChargeTo: number; buyToolingGold: number; buyPassageGold: number
  musterShare: number; declareBy: number; batteries: number; worksTier: number; armsStock: number; musterFrom: number; tierTwoAtPop: number
}

const REFINERY: Partial<Record<TileGood, BuildingLine>> = { ore: 'smelter', flax: 'linenWorks', hemp: 'ropeWorks', madder: 'dyeWorks', bloom: 'still' }
const PRODUCTION: BuildingLine[] = ['carpenter', 'smelter', 'toolworks', 'armoury', 'linenWorks', 'ropeWorks', 'dyeWorks', 'still', 'finishing']

/** One try at an action. The game refusing it is nothing happened. */
function tryAction(s: GameState, a: Action): boolean {
  try { applyAction(s, a); return true } catch { return false }
}

function mine(s: GameState): Settlement[] { return s.settlements.filter(x => x.owner === 0) }
function pop(s: GameState): number { return mine(s).reduce((a, st) => a + st.colonists.length, 0) }
function landingOf(s: GameState): Settlement | undefined { return mine(s).find(st => st.tile === s.charters[0].landing) ?? mine(s)[0] }
function gameTurns(s: GameState): number { return s.settings.turns || C.session.sizes[s.settings.size].turns }

/** Play the opening: sail the lander to the best coast and found. True once ashore. */
function playOpening(s: GameState): boolean {
  if (!playerLander(s)) return mine(s).length > 0
  let guard = 0
  for (;;) {
    const a = openingAction(s)
    if (!a || guard++ > 4) break
    if (!tryAction(s, a)) break
    if (a.t === 'found') break
  }
  return mine(s).length > 0
}

// ---------------------------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------------------------

interface Slot { job: Job; value: number; food: number; input: TileGood | null }

/** What a unit of a good is worth to this player right now: the Company's price for what is
 *  traded, frame a little over timber, and timber itself more while a build is waiting on frame
 *  the shop has no timber to make. */
function worth(s: GameState, st: Settlement, g: GoodId | 'frame'): number {
  if (g === 'frame') return 3
  if (g === 'food') return 2
  if (g === 'timber') {
    const building = st.building && !st.building.id.imported ? st.building : null
    const needFrame = building ? (C.buildings.costs[building.id.tier]?.frame ?? 0) - building.frame - st.frame : st.buildQueue.length ? C.buildings.costs[1]!.frame - st.frame : 0
    if (needFrame > 0 && st.stock.timber < needFrame) return 4
  }
  return C.market.goods[g].traded ? sellPrice(s, g) : 1
}

/** The jobs a settlement could fill this turn, each with its value a turn to the colony. */
function slots(s: GameState, st: Settlement, k: Knobs): Slot[] {
  const out: Slot[] = []
  for (const t of workableTiles(s, st)) {
    if (t === st.tile) continue
    const tile = s.world.tiles[t]
    if (tile.worked !== null && tile.worked !== st.id) continue
    for (const g of tileOffers(tile)) {
      const y = tileYield(s, t, g, null)
      if (y <= 0) continue
      // a crop the settlement refines is worth what the refinery makes of it
      const line = REFINERY[g]
      const refined = line && st.buildings[line] > 0 ? C.buildings.lines[line].output as GoodId : null
      const v = y * (refined ? Math.max(worth(s, st, g), worth(s, st, refined) * 0.8) : worth(s, st, g))
      out.push({ job: { kind: 'tile', tile: t, good: g }, value: v, food: g === 'food' ? y : 0, input: null })
    }
  }
  for (const line of PRODUCTION) {
    if (st.buildings[line] === 0) continue
    const def = C.buildings.lines[line]
    const input = def.input!
    const per = C.labour.baseBuildingOutput * C.labour.tierMultiplier[st.buildings[line]]
    // a shop with any of its input in store runs on that, short or not; otherwise it needs someone
    // on the ground producing it, which the planner pairs with it
    const stocked = st.stock[input] > 0
    let v: number
    // frame while something is being built is worth more than any good, the meeting house
    // included: nothing else gets built without it
    if (def.output === 'frame') v = (st.buildQueue.length || st.building) ? 45 : 0
    else v = per * (worth(s, st, def.output as GoodId) - worth(s, st, input) * 0.5)
    if (def.secondInput && st.stock[def.secondInput] < per) continue
    if (v <= 0) continue
    const seats = def.output === 'frame' && (st.building?.id.tier ?? st.buildQueue[0]?.tier ?? 1) === 1 ? 1 : C.labour.workersPerBuilding
    for (let i = 0; i < seats; i++) out.push({ job: { kind: 'building', line }, value: v - i, food: 0, input: stocked ? null : input as TileGood })
  }
  // civic work: grievance is the spine of the game, and a settlement of size staffs its meeting
  // house before anything that is not food
  if (st.buildings.meeting > 0 && st.colonists.length >= k.civicAtPop) {
    for (let i = 0; i < Math.min(k.civicWorkers, C.labour.workersPerBuilding); i++) out.push({ job: { kind: 'building', line: 'meeting' }, value: 40, food: 0, input: null })
  }
  return out
}

function sameJob(a: Job, b: Job): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'tile' && b.kind === 'tile') return a.tile === b.tile && a.good === b.good
  if (a.kind === 'building' && b.kind === 'building') return a.line === b.line
  return a.kind === 'idle' && b.kind === 'idle'
}

/** How well one colonist fills a slot, against the slot's value with nobody in particular. */
function fit(s: GameState, c: Colonist, slot: Slot): number {
  const j = slot.job
  // the ground takes anyone equally, so the debtors go there and leave the shops to the free
  if (j.kind === 'tile') return tileYield(s, j.tile, j.good, c) / Math.max(1, tileYield(s, j.tile, j.good, null)) + C.labour.standingPenalty[c.standing] * 0.01
  if (j.kind === 'building') return workerOutput(c, j.line) / C.labour.baseBuildingOutput
  return 1
}

/** The plan for a settlement's people: food to the target first, then the meeting house, then the
 *  best of everything else, and the ledger's clerks left idle as the design asks. */
function planJobs(s: GameState, st: Settlement, k: Knobs): Job[] {
  const n = st.colonists.length
  const free = slots(s, st, k)
  const plan: Job[] = new Array(n).fill(null).map(() => ({ kind: 'idle' as const }))
  const used = new Array(n).fill(false)
  const clerks = clerksRequired(n)
  let bodies = Math.max(0, n - clerks)
  const take = (slot: Slot) => {
    // the colonist who fills it best, debtors to the ground and masters to their craft
    let best = -1, bf = -1
    for (let i = 0; i < n; i++) { if (used[i]) continue; const f = fit(s, st.colonists[i], slot); if (f > bf) { bf = f; best = i } }
    if (best < 0) return false
    used[best] = true
    plan[best] = slot.job
    free.splice(free.indexOf(slot), 1)
    // a tile taken is taken for every good it offers
    if (slot.job.kind === 'tile') for (let i = free.length - 1; i >= 0; i--) { const j = free[i].job; if (j.kind === 'tile' && j.tile === slot.job.tile) free.splice(i, 1) }
    bodies--
    return true
  }
  // food first: the settlement's own tile feeds for free, the rest to the target, never more than
  // half the people on it once the balance is met
  let food = tileYield(s, st.tile, 'food', null) - n * C.labour.eats
  const target = k.foodSurplus
  let onFood = 0
  while (bodies > 0 && food < target && (food < 0 || onFood < Math.floor(n / 2))) {
    const best = free.filter(x => x.food > 0).sort((a, b) => b.food - a.food)[0]
    if (!best) break
    food += best.food
    onFood++
    take(best)
  }
  // then the rest by value, civic work included at its own weight. A shop that needs its input
  // grown takes a grower with it, or is passed over
  const grows = (g: TileGood) => plan.some(j => j.kind === 'tile' && j.good === g)
  while (bodies > 0 && free.length) {
    const best = free.slice().sort((a, b) => b.value - a.value)[0]
    if (best.value <= 0) break
    if (best.input && !grows(best.input)) {
      const grower = free.filter(x => x.job.kind === 'tile' && x.job.good === best.input).sort((a, b) => b.value - a.value)[0]
      if (!grower || bodies < 2) { free.splice(free.indexOf(best), 1); continue }
      take(grower)
    }
    take(best)
  }
  return plan
}

function assignWorkers(s: GameState, st: Settlement, k: Knobs, policy: Policy) {
  if (policy === 'lazy') {
    if (st.colonists.some(c => c.job.kind === 'idle') ) tryAction(s, { t: 'autoAssign', settlement: st.id })
    // the one civic act a lazy player makes: someone in the meeting house once the card has said so
    if (st.colonists.length >= k.civicAtPop && st.buildings.meeting > 0 && buildingWorkers(st, 'meeting') < k.civicWorkers) {
      const i = st.colonists.findIndex(c => c.job.kind === 'idle' || (c.job.kind === 'tile' && c.job.good !== 'food'))
      if (i >= 0) tryAction(s, { t: 'assignWorker', settlement: st.id, colonist: i, job: { kind: 'building', line: 'meeting' } })
    }
    return
  }
  const plan = planJobs(s, st, k)
  const changed = plan.map((j, i) => !sameJob(j, st.colonists[i].job) ? i : -1).filter(i => i >= 0)
  if (!changed.length) return
  // clear first, so two colonists swapping tiles do not block each other
  for (const i of changed) if (st.colonists[i].job.kind !== 'idle') tryAction(s, { t: 'assignWorker', settlement: st.id, colonist: i, job: { kind: 'idle' } })
  for (const i of changed) if (plan[i].kind !== 'idle') tryAction(s, { t: 'assignWorker', settlement: st.id, colonist: i, job: plan[i] })
}

// ---------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------

/** The crop this settlement works most, and the refinery that would take it. */
function mainCrop(s: GameState, st: Settlement): TileGood | null {
  const counts: Partial<Record<TileGood, number>> = {}
  for (const c of st.colonists) if (c.job.kind === 'tile' && c.job.good !== 'food' && c.job.good !== 'timber') counts[c.job.good] = (counts[c.job.good] ?? 0) + tileYield(s, c.job.tile, c.job.good, c)
  let best: TileGood | null = null, bv = 0
  for (const [g, v] of Object.entries(counts) as [TileGood, number][]) if (v > bv) { bv = v; best = g }
  return best
}

/** The one line that the whole colony needs only one of, somewhere. */
function anyHas(s: GameState, line: BuildingLine): boolean { return mine(s).some(st => st.buildings[line] > 0 || st.buildQueue.some(b => b.line === line) || st.building?.id.line === line) }

function nextBuild(s: GameState, st: Settlement, k: Knobs, policy: Policy): BuildId | null {
  const can = buildable(s, st).filter(b => !b.imported)
  if (!can.length) return null
  const has = (line: BuildingLine, tier = 1) => st.buildings[line] >= tier
  const want = (line: BuildingLine, tier: 1 | 2 | 3 = 1) => can.find(b => b.line === line && b.tier === tier) ?? null
  if (policy === 'lazy') {
    // the first thing on the list that it can finish without buying anything
    return can.find(b => b.tier === 1) ?? null
  }
  const turns = gameTurns(s)
  const late = s.turn >= turns * 0.4
  const n = st.colonists.length
  const cap = storageCapacity(st)
  const crop = mainCrop(s, st)
  const landing = landingOf(s)
  const toolingFor = (tier: 2 | 3) => (C.buildings.costs[tier]?.tooling ?? 0) - st.stock.tooling
  const canTool = (tier: 1 | 2 | 3) => tier === 1 || toolingFor(tier) <= 0 || mine(s).some(x => x.buildings.toolworks > 0) || s.charters[0].gold > k.buyToolingGold + toolingFor(tier) * buyPrice(s, 'tooling')
  const choices: (BuildId | null)[] = []
  if (!has('carpenter')) choices.push(want('carpenter'))
  // the works at the landing come before everything else once the muster has begun
  const mustering = s.turn >= turns * k.musterFrom
  if (st === landing && mustering && st.buildings.works < k.worksTier && canTool((st.buildings.works + 1) as 1 | 2 | 3)) choices.push(want('works', (st.buildings.works + 1) as 1 | 2 | 3))
  if (!has('meeting')) choices.push(want('meeting'))
  if (Object.values(st.stock).some(v => v > cap * 0.7) && st.buildings.storage < 3 && canTool((st.buildings.storage + 1) as 1 | 2 | 3)) choices.push(want('storage', (st.buildings.storage + 1) as 1 | 2 | 3))
  // the press as soon as the meeting house is near being staffed: grievance is the spine
  if (n >= k.civicAtPop - 1 && !has('press')) choices.push(want('press'))
  if (crop && REFINERY[crop] && !has(REFINERY[crop]!)) choices.push(want(REFINERY[crop]!))
  if (st.colonists.some(c => c.job.kind === 'tile' && c.job.good === 'ore') && !has('smelter')) choices.push(want('smelter'))
  // the second tier of what earns, as soon as there are people enough and the tooling is in hand
  // or can be bought: tiers multiply output, but a build waiting on tooling blocks everything after it
  if (n >= k.tierTwoAtPop && canTool(2)) {
    const earner = crop && REFINERY[crop] && st.buildings[REFINERY[crop]!] === 1 ? REFINERY[crop]! : st.buildings.carpenter === 1 ? 'carpenter' : null
    if (earner) choices.push(want(earner, 2))
  }
  if (!anyHas(s, 'agentOffice') && s.turn - (s.telemetry.founded ?? 0) >= 12) choices.push(want('agentOffice'))
  if (has('smelter') && !has('toolworks')) choices.push(want('toolworks'))
  if (has('smelter') && !anyHas(s, 'armoury')) choices.push(want('armoury'))
  if (st === landing && (s.turn >= turns * k.musterFrom || s.charters[0].unlocked.military) && st.buildings.works < k.worksTier && (st.buildings.works === 0 || canTool((st.buildings.works + 1) as 2 | 3))) choices.push(want('works', (st.buildings.works + 1) as 1 | 2 | 3))
  if (late && st !== landing && !has('works')) choices.push(want('works'))
  // tier two of the lines that earn, once there are people enough and tooling to be had
  if (n >= k.tierTwoAtPop && canTool(2)) {
    for (const line of ['carpenter', ...(crop && REFINERY[crop] ? [REFINERY[crop]!] : []), 'smelter', 'toolworks', 'armoury'] as BuildingLine[]) {
      if (st.buildings[line] === 1 && C.buildings.lines[line].tiers >= 2) choices.push(want(line, 2))
    }
    if (st === landing && n >= C.buildings.popGate[3] && canTool(3)) {
      for (const line of [...(crop && REFINERY[crop] ? [REFINERY[crop]!] : []), 'smelter', 'armoury'] as BuildingLine[]) if (st.buildings[line] === 2 && C.buildings.lines[line].tiers >= 3) choices.push(want(line, 3))
    }
  }
  if (!has('school') && n >= 8) choices.push(want('school'))
  if (has('press') && s.charters[0].signatories.includes(9) && st.buildings.press < 2 && canTool(2)) choices.push(want('press', 2))
  if (!isCoastalSettlement(s, st) && !has('consignment')) choices.push(want('consignment'))
  return choices.find(Boolean) ?? null
}

function keepBuilding(s: GameState, st: Settlement, k: Knobs, policy: Policy) {
  if (st.buildQueue.length || st.building) {
    // a build waiting on tooling it cannot make, or on frame with no timber in reach: buy, if the
    // policy buys
    const b = st.building
    if (b && !b.id.imported && isCoastalSettlement(s, st)) {
      // not while the muster wants the gold for arms, unless the build is the works themselves
      const mustering = s.turn >= gameTurns(s) * k.musterFrom && !s.declaration?.declared && armsHeld(s) < k.armsStock && b.id.line !== 'works'
      const need = (C.buildings.costs[b.id.tier]?.tooling ?? 0) - b.tooling - st.stock.tooling
      if (need > 0 && !mustering && s.charters[0].gold > C.autopilot.toolingFloat + need * buyPrice(s, 'tooling')) tryAction(s, { t: 'buy', settlement: st.id, good: 'tooling', amount: need })
      const frame = (C.buildings.costs[b.id.tier]?.frame ?? 0) - b.frame - st.frame - st.stock.timber
      const forest = workableTiles(s, st).some(t => s.world.tiles[t].forest && (s.world.tiles[t].worked === null || s.world.tiles[t].worked === st.id))
      // no more than the store holds and the shop can use before the surplus rule sells it back
      const room = storageCapacity(st) - st.stock.timber - C.market.fullStoreMinSale
      const lot = Math.min(frame, room, C.labour.baseBuildingOutput * C.labour.tierMultiplier[st.buildings.carpenter] * 4)
      if (frame > 0 && lot > 0 && !forest && s.charters[0].gold > k.buyToolingGold + lot * buyPrice(s, 'timber')) tryAction(s, { t: 'buy', settlement: st.id, good: 'timber', amount: lot })
    }
    return
  }
  const next = nextBuild(s, st, k, policy)
  if (next) tryAction(s, { t: 'setBuildOrder', settlement: st.id, queue: [next] })
}

// ---------------------------------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------------------------------

/** A lot of something traded, held at a fair price, is consigned: a competent player does not wait
 *  for the standing order to notice. Inputs a shop here needs are kept. */
function sellLots(s: GameState, st: Settlement, policy: Policy) {
  if (policy === 'lazy') return
  if (!isCoastalSettlement(s, st) && st.buildings.consignment === 0) return
  const table = s.market.tables[0]
  for (const g of Object.keys(st.stock) as GoodId[]) {
    const p = C.market.goods[g]
    if (!p.traded || g === 'tooling' || g === 'arms' || g === 'horses' || g === 'instruments') continue
    if (s.company.embargoed.includes(g)) continue
    const isInput = PRODUCTION.some(line => st.buildings[line] > 0 && (C.buildings.lines[line].input === g || C.buildings.lines[line].secondInput === g))
    const keep = isInput ? st.orders.surplus.threshold * 2 : 0
    const surplus = st.stock[g] - keep
    if (surplus < C.market.lotSize) continue
    // not into a price the colony itself has walked down
    if (table[g].price < table[g].baseline * 0.7) continue
    tryAction(s, { t: 'consign', settlement: st.id, good: g, amount: Math.min(surplus, C.market.lotSize * 2) })
  }
}

// ---------------------------------------------------------------------------------------------
// Settlers
// ---------------------------------------------------------------------------------------------

/** The best ground for a new settlement within reach of the one sending the settler. */
function bestSite(s: GameState, from: Settlement): number | null {
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  let best = -1, bs = -Infinity
  const r = C.autopilot.settleRange
  for (let dz = -r.max; dz <= r.max; dz++) for (let dx = -r.max; dx <= r.max; dx++) {
    const x = (from.tile % w) + dx, z = Math.floor(from.tile / w) + dz
    if (x < 0 || z < 0 || x >= w || z >= h) continue
    const i = z * w + x
    const d = Math.max(Math.abs(dx), Math.abs(dz))
    if (d < r.min || d > r.max) continue
    const t = tiles[i]
    if (!isLand(t) || t.terrain === 'mountain') continue
    if (foundingProblem(s, i) !== null) continue
    if (s.settlements.some(st => st.owner > 0 && dist(w, st.tile, i) < C.autopilot.rivalClearance)) continue
    if (s.predecessors.some(p => p.territory.includes(i))) continue
    // ground nobody has seen is a guess; a settler walking to it sees it on the way
    const score = siteScore(s, i) + (isCoastal(w, h, tiles, i) ? C.autopilot.coastalSiteBonus : 0) - d - (t.explored ? 0 : C.autopilot.unseenSitePenalty)
    if (score > bs) { bs = score; best = i }
  }
  return best >= 0 ? best : null
}

function settlers(s: GameState): Unit[] { return s.units.filter(u => u.owner === 0 && u.kind === 'colonist') }

function sendSettlers(s: GameState, k: Knobs) {
  const own = mine(s)
  const target = k.settlements[s.settings.size as MapSize]
  // one at a time: a settler already out walks to its ground and founds there
  for (const u of settlers(s)) {
    if (u.order && u.order.kind === 'goto' && u.tile !== u.order.tile) continue
    // one walking to a settlement joins it on arrival; it is not a settler
    if (u.order && u.order.kind === 'goto' && s.settlements.some(st => st.tile === (u.order as { tile: number }).tile)) continue
    if (!s.settlements.some(st => st.tile === u.tile) && foundingProblem(s, u.tile) === null && own.length < target) { tryAction(s, { t: 'found', unit: u.id }); continue }
    // nowhere to found here after all: look again from the nearest settlement
    const near = own.slice().sort((a, b) => dist(s.world.width, a.tile, u.tile) - dist(s.world.width, b.tile, u.tile))[0]
    const site = near ? bestSite(s, near) : null
    if (site !== null && own.length < target) tryAction(s, { t: 'moveUnit', unit: u.id, path: [site] })
    else if (near) tryAction(s, { t: 'moveUnit', unit: u.id, path: [near.tile] })
  }
  if (settlers(s).length || own.length >= target) return
  // the biggest settlement that can spare a body sends one
  const from = own.filter(st => st.colonists.length >= k.settleAtPop).sort((a, b) => b.colonists.length - a.colonists.length)[0]
  if (!from) return
  const site = bestSite(s, from)
  if (site === null) return
  // the one on the least valuable job, never a master
  let pick = -1, pv = Infinity
  for (let i = 0; i < from.colonists.length; i++) {
    const c = from.colonists[i]
    if (c.standing === 'master') continue
    const v = c.job.kind === 'idle' ? 0 : c.job.kind === 'tile' ? tileYield(s, c.job.tile, c.job.good, c) * (c.job.good === 'food' ? 3 : 1) : 6
    if (v < pv) { pv = v; pick = i }
  }
  if (pick < 0) return
  if (!tryAction(s, { t: 'equip', settlement: from.id, colonist: pick, as: 'colonist' })) return
  const u = settlers(s).find(x => x.tile === from.tile)
  if (u) tryAction(s, { t: 'moveUnit', unit: u.id, path: [site] })
}

// ---------------------------------------------------------------------------------------------
// The Company, the muster and the war
// ---------------------------------------------------------------------------------------------

function answerDemands(s: GameState, k: Knobs, policy: Policy) {
  if (!s.company.demand) return
  if (policy === 'lazy') return   // silence is acceptance
  tryAction(s, { t: 'answerDemand', accept: s.company.charge + s.company.demand.rise <= k.acceptChargeTo })
}

function armedUnits(s: GameState): Unit[] { return s.units.filter(u => u.owner === 0 && isArmed(u.kind) && !isHull(u.kind)) }

/** Arms in the landing's store and in the hands of every armed unit: what the muster counts. */
function armsHeld(s: GameState): number {
  const landing = landingOf(s)
  return (landing?.stock.arms ?? 0) + armedUnits(s).reduce((a, u) => a + (u.kind === 'battery' || u.kind === 'damagedBattery' ? C.military.units.battery.arms : C.military.units.militia.arms), 0)
}

/** Arm for the war: batteries and works at the landing first, militia from whoever can be spared,
 *  arms bought when the colony cannot make them fast enough. */
function muster(s: GameState, k: Knobs, policy: Policy) {
  if (policy === 'lazy') return
  const landing = landingOf(s)
  if (!landing) return
  const open = nationalResolve(s) >= C.grievance.declarationGate || s.charters[0].unlocked.fleet
  const atWar = !!s.declaration?.declared && !s.declaration.won && !s.declaration.lost
  const preparing = s.turn >= gameTurns(s) * k.musterFrom
  if (!open && !atWar && !preparing) return
  const fleet = s.company.fleetStrength
  const batteries = s.units.filter(u => u.owner === 0 && u.tile === landing.tile && (u.kind === 'battery' || u.kind === 'damagedBattery')).length
  // the stock of arms the policy wants at the landing before it declares, bought a lot at a time
  // while the colony cannot make them fast enough, before the blockade
  if (!atWar && armsHeld(s) < k.armsStock && s.charters[0].gold > C.autopilot.armsGold + buyPrice(s, 'arms') * C.autopilot.armsLot && isCoastalSettlement(s, landing)) {
    tryAction(s, { t: 'buy', settlement: landing.id, good: 'arms', amount: C.autopilot.armsLot })
  }
  if (!open && !atWar) return
  // batteries at the landing, from colonists who are not feeding anyone
  const spare = (st: Settlement, anyone = false) => {
    let best = -1, bv = Infinity
    for (let i = 0; i < st.colonists.length; i++) {
      const c = st.colonists[i]
      if (c.standing === 'master') continue
      if (!anyone && c.job.kind === 'tile' && c.job.good === 'food') continue
      if (c.job.kind === 'building' && c.job.line === 'meeting') continue
      const v = c.job.kind === 'idle' ? 0 : c.job.kind === 'tile' && c.job.good === 'food' ? 2 : 1
      if (v < bv) { bv = v; best = i }
    }
    return best
  }
  if (batteries < k.batteries && landing.stock.arms >= C.military.units.battery.arms && landing.colonists.length > 3) {
    const i = spare(landing)
    if (i >= 0) tryAction(s, { t: 'equip', settlement: landing.id, colonist: i, as: 'battery' })
  }
  // a beaten militia is a colonist standing in the street: back to the roster to be armed again
  for (const u of s.units.filter(u => u.owner === 0 && u.kind === 'colonist' && !u.order)) {
    const st = mine(s).find(x => x.tile === u.tile)
    if (st && (atWar || open) && !settlerBound(s, u)) tryAction(s, { t: 'disband', unit: u.id })
  }
  // militia everywhere there are arms and people, to the share of the fleet the policy wants. The
  // landing keeps arms back for the batteries it still wants
  const armed = armedUnits(s).length
  const want = Math.ceil(fleet * k.musterShare)
  if (armed < want || atWar) {
    for (const st of mine(s)) {
      if (st.colonists.length <= 3) continue
      const horses = st.stock.horses >= C.military.units.outrider.horses
      const reserve = st === landing && batteries < k.batteries ? C.military.units.battery.arms : 0
      if (st.stock.arms - reserve < C.military.units.militia.arms) continue
      // once the batteries stand, the landing arms its field hands too: the store feeds the siege
      const i = spare(st, st === landing && batteries >= k.batteries && st.foodStore > st.colonists.length * C.labour.eats * 10)
      if (i >= 0) tryAction(s, { t: 'equip', settlement: st.id, colonist: i, as: horses ? 'outrider' : 'militia' })
    }
  }
}

/** A colonist unit that is a settler on its way to open ground, which the muster leaves alone. */
function settlerBound(s: GameState, u: Unit): boolean {
  if (!u.order || u.order.kind !== 'goto') return false
  const to = u.order.tile
  return !s.settlements.some(st => st.tile === to)
}

/** During the war: sally against what can be beaten, keep the rest at home. */
function fightWar(s: GameState, k: Knobs, policy: Policy) {
  void k
  if (!s.declaration?.declared || s.declaration.won || s.declaration.lost) return
  const w = s.world.width, h = s.world.height
  const landing = landingOf(s)
  for (const u of armedUnits(s)) {
    if (u.moves <= 0 || u.kind === 'battery' || u.kind === 'damagedBattery') continue
    // never strip the landing bare
    const home = landing && u.tile === landing.tile
    const garrison = landing ? s.units.filter(x => x.owner === 0 && x.tile === landing.tile && isArmed(x.kind) && !isHull(x.kind)).length : 0
    if (home && garrison <= 2 && policy !== 'strong') continue
    let best: { tile: number; odds: number } | null = null
    for (const n of neighbours8(w, h, u.tile)) {
      const foe = s.units.find(x => x.tile === n && x.owner !== 0 && isArmed(x.kind) && !isAfloat(x.kind) && isHostileTo(s, x.owner, 0))
      if (!foe) continue
      const odds = attackOdds(s, u, n)
      const siege = foe.kind === 'siegeTrain' || foe.kind === 'damagedSiegeTrain'
      const floor = siege ? C.autopilot.sallyOdds.siege : C.autopilot.sallyOdds.other
      if (odds >= floor && (!best || odds > best.odds)) best = { tile: n, odds }
    }
    if (best) tryAction(s, { t: 'attack', unit: u.id, tile: best.tile })
    else if (landing && !home && u.order === null && !isCompany(u.kind)) tryAction(s, { t: 'moveUnit', unit: u.id, path: [landing.tile] })
  }
}

function maybeDeclare(s: GameState, k: Knobs, policy: Policy) {
  if (s.declaration?.declared) return
  if (nationalResolve(s) < C.grievance.declarationGate) return
  if (policy === 'lazy') { tryAction(s, { t: 'declare' }); return }
  const landing = landingOf(s)
  if (!landing) return
  const batteries = s.units.filter(u => u.owner === 0 && u.tile === landing.tile && u.kind === 'battery').length
  // ready: the batteries it wanted, the arms it wanted in hand or in hands, and at least a redoubt;
  // a bastion is wanted but not waited for, since the gate is the war's own clock
  const ready = batteries >= k.batteries && landing.buildings.works >= Math.min(k.worksTier, 2) && armsHeld(s) >= k.armsStock
  const overdue = s.turn >= gameTurns(s) * k.declareBy
  if (ready || overdue) tryAction(s, { t: 'declare' })
}

function spend(s: GameState, k: Knobs, policy: Policy) {
  if (policy === 'lazy') return
  const ch = s.charters[0]
  const cost = goldPassageCost(s)
  // passages come ashore at the landing, so they stop once it is as big as the policy likes, and
  // the gold goes to arms instead once the muster has begun
  const landing = landingOf(s)
  const mustering = s.turn >= gameTurns(s) * k.musterFrom && !(s.declaration?.won)
  if (!mustering && ch.gold > cost * k.buyPassageGold && landing && landing.colonists.length < k.sendAtPop) tryAction(s, { t: 'buyPassage' })
}

/** Keep settlements the size the design is built around: a big one sends its children to the
 *  smallest, and the signatories sought are the voices once civic work has begun. */
function steer(s: GameState, k: Knobs, policy: Policy) {
  if (policy === 'lazy') return
  const own = mine(s)
  const ch = s.charters[0]
  if (ch.signatoryTarget !== 'voice' && own.some(st => buildingWorkers(st, 'meeting') > 0) && !ch.signatories.includes(9)) tryAction(s, { t: 'setSignatoryTarget', category: 'voice' })
  if (ch.signatoryTarget === 'voice' && ch.signatories.includes(9) && ch.signatories.includes(10)) tryAction(s, { t: 'setSignatoryTarget', category: 'arms' })
  const atWar = !!s.declaration?.declared && !s.declaration.won && !s.declaration.lost
  for (const st of own) {
    const smallest = own.filter(x => x !== st && x.colonists.length < k.sendAtPop - 4).sort((a, b) => a.colonists.length - b.colonists.length)[0]
    const want = st.colonists.length >= k.sendAtPop && smallest ? { kind: 'send' as const, settlement: smallest.id } : { kind: 'keep' as const }
    const cur = st.orders.growth
    if (cur.kind !== want.kind || (cur.kind === 'send' && want.kind === 'send' && cur.settlement !== want.settlement)) tryAction(s, { t: 'setStandingOrder', settlement: st.id, rule: 'growth', value: want })
    // people standing idle beyond the ledger's clerks walk to a settlement with room for them,
    // one a turn; in war they stay, to be armed
    if (atWar || !smallest) continue
    const idle = st.colonists.map((c, i) => c.job.kind === 'idle' ? i : -1).filter(i => i >= 0)
    if (idle.length <= clerksRequired(st.colonists.length)) continue
    const i = idle[idle.length - 1]
    if (st.colonists[i].standing === 'master') continue
    if (tryAction(s, { t: 'equip', settlement: st.id, colonist: i, as: 'colonist' })) {
      const u = s.units.find(x => x.owner === 0 && x.kind === 'colonist' && x.tile === st.tile && !x.order)
      if (u) tryAction(s, { t: 'moveUnit', unit: u.id, path: [smallest.tile] })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------------------------

/** Everything the policy does in one turn, before the turn ends. The caller ends the turn. */
export function policyTurn(s: GameState, policy: Policy) {
  const k: Knobs = C.autopilot.policies[policy] as Knobs
  if (!playOpening(s)) return
  answerDemands(s, k, policy)
  for (const st of mine(s)) {
    keepBuilding(s, st, k, policy)
    assignWorkers(s, st, k, policy)
    sellLots(s, st, policy)
  }
  if (policy !== 'lazy' || mine(s).length < k.settlements[s.settings.size as MapSize]) sendSettlers(s, k)
  steer(s, k, policy)
  spend(s, k, policy)
  muster(s, k, policy)
  maybeDeclare(s, k, policy)
  fightWar(s, k, policy)
}

/** The milestones the reachability tables record, read from the state and the dispatch. Turns are
 *  absolute; the tables show them after founding. Null where the thing has not happened. */
export interface Milestones {
  founded: number | null
  firstConsignment: number | null
  firstColonist: number | null
  firstPriceFall: number | null
  secondSettlement: number | null
  tierTwo: number | null
  tierThree: number | null
  popTwentyFive: number | null
  firstDemand: number | null
  rivalLeftPeace: number | null
  declarationOpen: number | null
  declared: number | null
  warOver: number | null
  won: boolean | null
  waves: number
  fleet: number
  pop: number
  settlements: number
  rivalSettlements: number
  signatories: number
  armed: number
  gold: number
}

export function freshMilestones(): Milestones {
  return { founded: null, firstConsignment: null, firstColonist: null, firstPriceFall: null, secondSettlement: null, tierTwo: null, tierThree: null, popTwentyFive: null, firstDemand: null, rivalLeftPeace: null, declarationOpen: null, declared: null, warOver: null, won: null, waves: 0, fleet: 0, pop: 0, settlements: 0, rivalSettlements: 0, signatories: 0, armed: 0, gold: 0 }
}

/** Read what happened this turn into the milestones. Call after every turn. */
export function noteMilestones(s: GameState, m: Milestones, startPop: number) {
  const own = mine(s)
  const t = s.turn
  if (m.founded === null && own.length) m.founded = s.telemetry.founded ?? t
  if (m.firstConsignment === null && s.telemetry.firstConsignment !== null) m.firstConsignment = s.telemetry.firstConsignment
  const people = pop(s) + s.units.filter(u => u.owner === 0 && u.colonist).length
  if (m.firstColonist === null && m.founded !== null && people > startPop) m.firstColonist = t
  if (m.firstPriceFall === null && s.dispatch.some(d => d.kind === 'market' && /falling to/.test(d.text))) m.firstPriceFall = s.dispatch.find(d => d.kind === 'market' && /falling to/.test(d.text))!.turn
  if (m.secondSettlement === null && own.length >= 2) m.secondSettlement = s.telemetry.secondSettlement ?? t
  if (m.tierTwo === null && own.some(st => Object.values(st.buildings).some(v => v >= 2))) m.tierTwo = t
  if (m.tierThree === null && own.some(st => Object.values(st.buildings).some(v => v >= 3))) m.tierThree = t
  if (m.popTwentyFive === null && people >= 25) m.popTwentyFive = t
  if (m.firstDemand === null && (s.company.demand || s.company.demandsAccepted > 0 || s.company.embargoed.length)) m.firstDemand = t
  if (m.rivalLeftPeace === null && s.charters.some(c => !c.player && c.relation !== 'peace')) m.rivalLeftPeace = t
  if (m.declarationOpen === null && nationalResolve(s) >= C.grievance.declarationGate) m.declarationOpen = t
  if (m.declared === null && s.declaration?.declared) { m.declared = s.declaration.turnDeclared ?? t; m.fleet = s.company.fleetPool?.length ?? Math.round(s.company.fleetStrength) }
  if (m.declared !== null) m.fleet = Math.max(m.fleet, (s.company.fleetPool?.length ?? 0) + (s.declaration?.waves.reduce((a, w) => a + w.units.length, 0) ?? 0))
  if (m.warOver === null && s.declaration && (s.declaration.won || s.declaration.lost)) { m.warOver = t; m.won = s.declaration.won }
  m.waves = s.declaration?.waves.length ?? 0
  m.pop = people
  m.settlements = own.length
  m.rivalSettlements = s.settlements.filter(x => x.owner > 0).length
  m.signatories = s.charters[0].signatories.length
  m.armed = armedUnits(s).length
  m.gold = Math.round(s.charters[0].gold)
}

export { difficultyOf }
