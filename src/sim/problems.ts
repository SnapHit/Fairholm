// What is not working, and what is going to waste. Every check of the kind lives here, in one place,
// so every card that says so reads the same way and offers its fix the same way: what is wrong, why,
// and the fix as one tap where one fix is plainly right. Asked for by the owner on 21 November 2026,
// after a settlement sold its timber for turns while its palisade waited for frame that nobody was
// making: the player is always prompted to fix what is not working or is inefficient, the same way
// across the whole game. DECISIONS.md 192.
//
// Three kinds, by the queue's own types (turn queue brief section 8):
// - **lost** (type 1): something is being lost this turn: food running out, goods spoiling, a good
//   dumped by the player's own orders
// - **stuck** (type 3): something the player set going makes no progress: a building getting no
//   frame or no tooling, a build order that cannot start, schooling with no teacher, an order that
//   cannot be followed, a machine starved of instruments, a settlement whose purpose is gone
// - **waste** (type 4): people, buildings and units doing less than they could: idle, working for
//   nothing, a master away from their trade, a building standing empty while its input is sold or
//   spoils, a school with nobody to teach, an explorer with nothing left to find, a circuit that
//   carries nothing
//
// Every check reads the state as it stands, so a card goes the moment its fix is made, and every fix
// on a card is an ordinary action the player could have made by hand. The turn notes only since
// when each has stood (`settlement.conditions`, a unit's `since`), for the queue's persistence
// boost. The settlement screen reads the same list, so the street and the queue never disagree.
//
// A new way for something to stall or go to waste belongs here, with its fix, and in
// tests/problems.test.ts.

import type { GameState, Settlement, Colonist, Job, GoodId, TileGood, BuildingLine, BuildId, QueueItem, QueueChoice, Unit } from './state'
import { GOODS, BUILDING_LINES } from './state'
import type { System } from './turn'
import { C } from './constants'
import { tileYield, workableTiles, workerOutput, buildingWorkers, foodBalance, clerksRequired } from './labour'
import {
  previewFlows, storageCapacity, surplusRuleFor, canStart, buildingName, effectiveTier, outputModifier,
  isCoastalSettlement, buildable, type Flows,
} from './settlement'
import { canConsign, isEmbargoed, dumpedGoods, buyPrice, standingSale, isInputHere } from './market'
import { shipRuleState, shipsUnder } from './orders'
import { offerRuleState, MANUFACTURED } from './predecessors'
import { isLand, dist } from './worldgen'

/** A problem: a queue item before the queue's `since`, and where on the settlement screen it shows. */
export interface Problem extends Omit<QueueItem, 'since'> {
  /** A few words for a flag on the street or a note under the settlement's name. */
  short: string
  /** The building on the street it is about, if one. */
  line?: BuildingLine
  /** It is about the building going up. */
  frame?: boolean
  /** The good on the shelf it is about, if one. */
  good?: GoodId
}

/** The groups a settlement's problems come in, whose since-when the turn notes in its conditions. */
export const SETTLEMENT_PROBLEMS = [
  'hunger', 'spoilage', 'buildStalled', 'buildBlocked', 'buildEmpty', 'inputWasted', 'workerWasted',
  'idle', 'masterMisplaced', 'schoolStalled', 'schoolFutile', 'schoolIdle', 'machineStarved',
  'purposeLost', 'orderUnsat', 'orderBlocked',
] as const

/** The groups a unit's problems come in, noted in the unit's `since`. */
export const UNIT_PROBLEMS = ['exploreDone', 'haulEmpty'] as const

// ---- words -------------------------------------------------------------------------------------

/** A colonist as a sentence names them. Never a standing before the word colonist as a title
 *  (DECISIONS.md 174 and 189): "a debtor", "a colonist under contract", "a colonist of free
 *  standing", "a master of timber". */
function person(c: Colonist): string {
  switch (c.standing) {
    case 'debtor': return 'a debtor'
    case 'contracted': return 'a colonist under contract'
    case 'free': return 'a colonist of free standing'
    default: return `a master of ${c.speciality ? specialityWords(c.speciality) : 'a trade'}`
  }
}

function specialityWords(sp: TileGood | BuildingLine): string {
  return (C.buildings.lines as Record<string, { names: string[] }>)[sp] ? C.buildings.lines[sp as BuildingLine].names[0].toLowerCase() : sp
}

/** What a colonist does now, for the end of a sentence naming them. */
function doing(st: Settlement, c: Colonist): string {
  if (c.job.kind === 'idle') return 'with nothing to do'
  if (c.job.kind === 'tile') return `on ${c.job.good}`
  return `in the ${nameOf(st, c.job.line)}`
}

/** A building's name as it stands here, in a sentence. */
function nameOf(st: Settlement, line: BuildingLine): string {
  return buildingName({ line, tier: Math.max(1, st.buildings[line]) as 1 | 2 | 3 }).toLowerCase()
}

function cap(text: string): string { return text[0].toUpperCase() + text.slice(1) }
function plural(n: number, one: string, many = one + 's'): string { return `${n} ${n === 1 ? one : many}` }
function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// ---- how a settlement stands this turn ----------------------------------------------------------

/** One look at a settlement this turn: what its people make and use, what its orders will move out,
 *  and what that leaves to spoil. Worked once and shared by every check. */
interface Look {
  st: Settlement
  flows: Flows
  cap: number
  fb: number
  mod: number
  /** The stock after production, before the orders and the market move anything. */
  after: Record<GoodId, number>
  /** What the standing orders move out this turn: consigned, or shipped to a settlement. */
  sale: Partial<Record<GoodId, number>>
  /** What will spoil at the end of the turn. */
  spoils: Partial<Record<GoodId, number>>
  /** The goods this settlement's own orders are dumping. */
  dumped: Set<GoodId>
  /** The tiles free for this settlement to work. */
  free: number[]
}

function look(s: GameState, st: Settlement, dumping: Set<GoodId>): Look {
  const flows = previewFlows(s, st)
  const capacity = storageCapacity(st)
  const after = {} as Record<GoodId, number>
  const sale: Look['sale'] = {}, spoils: Look['spoils'] = {}
  const dumped = new Set<GoodId>()
  for (const g of GOODS) {
    if (g === 'food') { after[g] = st.foodStore; continue }
    after[g] = st.stock[g] + ((flows.made as Record<string, number>)[g] ?? 0) - (flows.used[g] ?? 0)
    let out = standingSale(s, st, g, after[g])
    const rule = surplusRuleFor(st, g)
    if (rule.destination.kind === 'ship' && shipsUnder(g, rule.own) && shipRuleState(s, st, rule.destination.settlement) === 'ok' && after[g] - rule.threshold >= C.orders.surplusMinimum) out = after[g] - rule.threshold
    if (out > 0) sale[g] = out
    const left = after[g] - out - capacity
    if (left > 0) spoils[g] = left
    if (dumping.has(g) && sellsHere(st, g)) dumped.add(g)
  }
  const free = workableTiles(s, st).filter(t => {
    const tile = s.world.tiles[t]
    if (tile.worked !== null && tile.worked !== st.id) return false
    return !st.colonists.some(c => c.job.kind === 'tile' && c.job.tile === t)
  })
  return { st, flows, cap: capacity, fb: foodBalance(s, st), mod: outputModifier(s, st), after, sale, spoils, dumped, free }
}

/** Whether this settlement's orders sell a good to the Company. */
function sellsHere(st: Settlement, g: GoodId): boolean {
  return st.buildings.consignment > 0 || surplusRuleFor(st, g).destination.kind === 'consign'
}

/** The best free tile for a good, for a worker or for anyone. */
function bestTile(s: GameState, lk: Look, good: TileGood, worker: Colonist | null = null): number | null {
  let best: number | null = null, bestV = 0
  for (const t of lk.free) {
    const v = tileYield(s, t, good, worker)
    if (v > bestV) { bestV = v; best = t }
  }
  return best
}

/** What a colonist would make in a job, at this settlement this turn. */
function gives(s: GameState, lk: Look, c: Colonist, job: Job): number {
  if (job.kind === 'tile') return Math.max(0, tileYield(s, job.tile, job.good, c) + lk.mod)
  if (job.kind === 'building') {
    const def = C.buildings.lines[job.line]
    if (!def.output) return 1
    return Math.max(0, workerOutput(c, job.line) + lk.mod) * C.labour.tierMultiplier[effectiveTier(lk.st, job.line)]
  }
  return 0
}

/** What a colonist makes now. */
function makesNow(s: GameState, lk: Look, c: Colonist): number {
  if (c.job.kind === 'tile') return gives(s, lk, c, c.job)
  if (c.job.kind === 'building') {
    const def = C.buildings.lines[c.job.line]
    if (!def.output) return 1
    return (lk.flows.byLine[c.job.line] ?? 0) > 0 ? gives(s, lk, c, c.job) : 0
  }
  return 0
}

interface Spare { index: number; colonist: Colonist; words: string; gives: number }

/** Who could be moved to a job at least cost: someone idle past the clerks the ledger needs, then
 *  someone working for nothing, then someone making a good this settlement is letting go (selling
 *  by standing order, dumping or spoiling), or, for a building, the input it works where enough is
 *  held for some turns of it, then someone on food where the settlement stays fed without them. For
 *  food itself, anyone not already on it. The one who would make the most there, then the one who
 *  makes least now. Null when nobody is spare. */
function spareFor(s: GameState, lk: Look, job: Job, exclude: number[] = []): Spare | null {
  const st = lk.st
  const idle = st.colonists.filter(c => c.job.kind === 'idle').length
  const clerks = clerksRequired(st.colonists.length)
  const input = job.kind === 'building' ? C.buildings.lines[job.line].input : null
  let best: Spare | null = null, bestScore = -Infinity
  st.colonists.forEach((c, i) => {
    if (exclude.includes(i)) return
    if (c.job.kind === job.kind && (job.kind === 'building' ? c.job.kind === 'building' && c.job.line === job.line : c.job.kind === 'tile' && job.kind === 'tile' && c.job.tile === job.tile)) return
    const there = gives(s, lk, c, job)
    if (there <= 0) return
    const now = makesNow(s, lk, c)
    const forFood = job.kind === 'tile' && job.good === 'food'
    let score: number
    if (c.job.kind === 'idle') { if (idle <= clerks) return; score = 3000 }
    else if (now <= 0) score = 2000
    else if (c.job.kind === 'tile') {
      const g = c.job.good
      // someone feeding the settlement only while it stays fed without them
      if (g === 'food') {
        if (forFood || lk.fb - now < 0) return
        score = 500
        score += there * 10 - now
        if (score > bestScore) { bestScore = score; best = { index: i, colonist: c, words: `${person(c)} ${doing(st, c)}`, gives: there } }
        return
      }
      const letGo = (lk.sale[g] ?? 0) > 0 || (lk.spoils[g] ?? 0) > 0 || lk.dumped.has(g)
      const enoughHeld = input === g && st.stock[g] >= C.problems.inputTurns * there
      if (letGo || enoughHeld) score = 1000
      else if (forFood) score = 100
      else return
    } else {
      // someone making something in a building moves only for food
      if (!forFood) return
      score = 100
    }
    score += there * 10 - now
    if (score > bestScore) { bestScore = score; best = { index: i, colonist: c, words: `${person(c)} ${doing(st, c)}`, gives: there } }
  })
  return best
}

const assign = (st: Settlement, index: number, job: Job) => ({ t: 'assignWorker', settlement: st.id, colonist: index, job })

// ---- the checks ---------------------------------------------------------------------------------

/** The building the settlement is putting up, or about to: the one under way, or the head of the
 *  build order when it can start this turn. Imported machines arrive whole and are not counted. */
function going(st: Settlement): { id: BuildId; frame: number; tooling: number } | null {
  if (st.building) return st.building.id.imported ? null : st.building
  const head = st.buildQueue[0]
  if (head && !head.imported && canStart(st, head).ok) return { id: head, frame: 0, tooling: 0 }
  return null
}

/** Frame still wanted for what is going up, beyond the frame held. */
function frameWanted(st: Settlement): number {
  const b = going(st)
  if (!b) return 0
  return Math.max(0, C.buildings.costs[b.id.tier]!.frame - b.frame - st.frame)
}

function hunger(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  if (!(lk.fb < 0 && st.foodStore + lk.fb * 2 < 0)) return
  const eaten = st.colonists.length * C.labour.eats
  const tile = bestTile(s, lk, 'food')
  const sp = tile !== null ? spareFor(s, lk, { kind: 'tile', tile, good: 'food' }) : null
  const turns = Math.floor(st.foodStore / -lk.fb)
  out.push({
    key: `hunger:${st.id}`, group: 'hunger', type: 1, title: `${st.name} is running short of food`,
    body: `It eats ${eaten} a turn and grows ${lk.flows.food}${st.foodStore > 0 ? `, and its store lasts ${plural(turns, 'turn')}` : ', and its store is empty'}.${sp ? ` ${cap(sp.words)} could go to the best free ground and grow ${sp.gives} a turn.` : tile === null ? ' No free ground here grows food.' : ''}`,
    explain: `Each person eats ${C.labour.eats === 1 ? 'one' : C.labour.eats} food a turn. Put more people on food tiles, or fewer on everything else.`,
    settlement: st.id, magnitude: st.colonists.length, opens: 'settlement', short: 'Running short of food', good: 'food',
    choices: sp && tile !== null ? [{ label: 'Put someone on food', action: assign(st, sp.index, { kind: 'tile', tile, good: 'food' }) }] : [],
  })
}

function spoilage(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const lost = (Object.entries(lk.spoils) as [GoodId, number][]).sort((a, b) => b[1] - a[1])
  if (!lost.length) return
  const choices: QueueChoice[] = []
  const sellable = lost.find(([g]) => C.market.goods[g].traded && !isEmbargoed(s, g) && st.stock[g] > 0)
  if (sellable && canConsign(s, st).ok) {
    const n = Math.min(sellable[1], st.stock[sellable[0]])
    choices.push({ label: `Consign ${n} ${sellable[0]}`, action: { t: 'consign', settlement: st.id, good: sellable[0], amount: n } })
  }
  else if (!canConsign(s, st).ok) {
    // where the Company cannot be reached, the nearest settlement of the player's can take it
    const g = lost[0][0]
    const to = s.settlements.filter(x => x.owner === 0 && x.id !== st.id).sort((a, b) => dist(s.world.width, a.tile, st.tile) - dist(s.world.width, b.tile, st.tile))[0]
    if (to) choices.push({ label: `Send ${g} to ${to.name}`, action: { t: 'setGoodRule', settlement: st.id, good: g, rule: { destination: { kind: 'ship', settlement: to.id } } } })
  }
  const store = buildable(s, st).find(b => b.line === 'storage')
  if (store) choices.push({ label: `Build a ${buildingName(store).toLowerCase()} first`, action: { t: 'setBuildOrder', settlement: st.id, queue: [store, ...st.buildQueue] } })
  out.push({
    key: `spoilage:${st.id}`, group: 'spoilage', type: 1, title: `${st.name} is losing goods`,
    body: `At the end of the turn it loses ${list(lost.map(([g, n]) => `${n} ${g}`))} to spoilage: its store holds ${lk.cap} of each good.`,
    explain: 'Goods above storage capacity are lost. Consign them, ship them, or build storage.',
    settlement: st.id, magnitude: 2, opens: 'settlement', short: `Losing ${lost[0][0]}`, good: lost[0][0], choices,
  })
}

/** A building getting no frame, or no tooling: the owner's palisade. */
function buildStalled(s: GameState, lk: Look, out: Problem[]): boolean {
  const st = lk.st
  const b = going(st)
  if (!b) return false
  const cost = C.buildings.costs[b.id.tier]!
  const name = buildingName(b.id).toLowerCase()
  const needF = cost.frame - b.frame, needT = cost.tooling - b.tooling
  const noFrame = needF > st.frame && (lk.flows.made.frame ?? 0) <= 0
  const noTooling = needT > st.stock.tooling && (lk.flows.made.tooling ?? 0) <= 0
  if (!noFrame && !noTooling) return false
  const since = st.conditions['buildStalled']
  const stood = since !== undefined && s.turn > since && st.building ? ` It has stood at ${b.frame} of ${cost.frame} frame for ${plural(s.turn - since, 'turn')}.` : ''
  const choices: QueueChoice[] = []
  let why: string
  let line: BuildingLine | undefined
  const gold = s.charters[0].gold
  const trade = canConsign(s, st).ok
  if (noFrame) {
    line = 'carpenter'
    const carpenters = buildingWorkers(st, 'carpenter')
    if (st.buildings.carpenter === 0) why = 'There is no carpenter\'s shop here to make frame.'
    else if (carpenters === 0) {
      const sp = spareFor(s, lk, { kind: 'building', line: 'carpenter' })
      const timber = st.stock.timber + (lk.flows.made.timber ?? 0)
      why = `Nobody works the ${nameOf(st, 'carpenter')}, so no frame is made.${timber <= 0 ? ' There is no timber to make it from either.' : ''}`
      if (sp) {
        why += ` ${cap(sp.words)} could go there and make ${sp.gives} frame a turn.`
        choices.push({ label: `Staff the ${nameOf(st, 'carpenter')}`, action: assign(st, sp.index, { kind: 'building', line: 'carpenter' }) })
      } else why += ` Everyone here has other work; move someone there.`
      // with no timber either, the shop needs some too: from the forest, or from the Company. Only
      // alongside someone to work it: timber alone, with nobody in the shop, is half a fix
      if (timber <= 0 && sp) {
        const tile = bestTile(s, lk, 'timber')
        const cutter = tile !== null ? spareFor(s, lk, { kind: 'tile', tile, good: 'timber' }, sp ? [sp.index] : []) : null
        const price = buyPrice(s, 'timber')
        const n = Math.min(needF - st.frame, Math.floor(gold / price))
        if (cutter && tile !== null) choices.push({ label: 'Put someone on timber', action: assign(st, cutter.index, { kind: 'tile', tile, good: 'timber' }) })
        else if (trade && n > 0) choices.push({ label: `Buy ${n} timber`, action: { t: 'buy', settlement: st.id, good: 'timber', amount: n } })
      }
    } else {
      const tile = bestTile(s, lk, 'timber')
      const sp = tile !== null ? spareFor(s, lk, { kind: 'tile', tile, good: 'timber' }) : null
      why = `The ${nameOf(st, 'carpenter')} has no timber to work.`
      if (sp && tile !== null) {
        why += ` ${cap(sp.words)} could go to the best free forest and cut ${sp.gives} a turn.`
        choices.push({ label: 'Put someone on timber', action: assign(st, sp.index, { kind: 'tile', tile, good: 'timber' }) })
      } else if (tile === null) why += ' There is no free forest to cut.'
      const price = buyPrice(s, 'timber')
      const n = Math.min(needF - st.frame, Math.floor(gold / price))
      if (trade && n > 0) choices.push({ label: `Buy ${n} timber`, action: { t: 'buy', settlement: st.id, good: 'timber', amount: n } })
    }
  } else {
    const n = needT - st.stock.tooling
    const price = buyPrice(s, 'tooling')
    const afford = Math.floor(gold / price)
    why = `It needs ${n} more tooling, and none is held or made here.${trade ? ` The Company sells it at ${price}.` : ''}`
    if (trade && afford > 0) choices.push({ label: `Buy ${Math.min(n, afford)} tooling`, action: { t: 'buy', settlement: st.id, good: 'tooling', amount: Math.min(n, afford) } })
    if (st.buildings.toolworks > 0 && buildingWorkers(st, 'toolworks') < C.labour.workersPerBuilding && st.stock.metal > 0) {
      const sp = spareFor(s, lk, { kind: 'building', line: 'toolworks' })
      if (sp) { line = 'toolworks'; choices.push({ label: `Staff the ${nameOf(st, 'toolworks')}`, action: assign(st, sp.index, { kind: 'building', line: 'toolworks' }) }) }
    }
  }
  // where the fix is someone's work and no one-tap move is offered, the card opens the settlement,
  // where people are moved; otherwise the build order
  const staffing = noFrame && buildingWorkers(st, 'carpenter') === 0
  out.push({
    key: `buildStalled:${st.id}`, group: 'buildStalled', type: 3, title: `The ${name} at ${st.name} is getting no ${noFrame ? 'frame' : 'tooling'}`,
    body: `${why}${stood}`,
    explain: 'Buildings are made of frame, which a carpenter makes from timber; higher tiers need tooling too. A building that gets neither never rises.',
    settlement: st.id, magnitude: 3, opens: staffing ? 'settlement' : 'build', short: noFrame ? 'No frame' : 'No tooling', frame: true, line, choices,
  })
  return noFrame
}

/** A building standing empty, or with room, while the good it works is let go: spoiling, or timber
 *  sold while a build waits for frame. Dumping is the dumping card's, which offers the same fix.
 *  Only where someone is spare to put there. */
function inputWasted(s: GameState, lk: Look, out: Problem[], frameStalled: boolean) {
  const st = lk.st
  const wanted = frameWanted(st)
  const b = going(st)
  let best: Problem | null = null, bestN = 0
  for (const line of BUILDING_LINES) {
    const def = C.buildings.lines[line]
    if (!def.output || !def.input || st.buildings[line] === 0) continue
    if (line === 'carpenter' && (wanted <= 0 || frameStalled)) continue
    const workers = buildingWorkers(st, line)
    if (workers >= C.labour.workersPerBuilding) continue
    const g = def.input
    const spoils = lk.spoils[g] ?? 0, sold = lk.sale[g] ?? 0
    // dumping is the dumping card's to say, with this same fix first (below)
    const how = spoils > 0 ? 'spoils' : line === 'carpenter' && sold > 0 && !lk.dumped.has(g) ? 'sold' : null
    if (!how) continue
    const n = how === 'spoils' ? spoils : sold
    const sp = spareFor(s, lk, { kind: 'building', line })
    if (!sp || (best && n <= bestN)) continue
    const bname = nameOf(st, line)
    const made = def.output === 'frame' ? 'frame' : def.output
    const title = how === 'spoils' ? `${st.name} loses ${g} its ${bname} could use`
      : `${st.name} sells timber while its ${buildingName(b!.id).toLowerCase()} waits for frame`
    const lead = how === 'spoils' ? `${n} ${g} will spoil this turn.` : `Its orders send ${n} timber away this turn.`
    best = {
      key: `inputWasted:${st.id}`, group: 'inputWasted', type: 4, title,
      body: `${lead} ${workers === 0 ? `Nobody works the ${bname}.` : `The ${bname} has room for one more.`} ${cap(sp.words)} could go there and make ${sp.gives} ${made} a turn from ${g}.`,
      explain: 'A good a building here works is worth more worked than sold raw, and nothing at all spoiled.',
      settlement: st.id, magnitude: 2, opens: 'settlement', short: workers === 0 ? 'Standing empty' : 'Room for one more', line, good: g,
      choices: [{ label: `Staff the ${bname}`, action: assign(st, sp.index, { kind: 'building', line }) }],
    }
    bestN = n
  }
  if (best) out.push(best)
}

/** People in a building with nothing to work, or on ground that gives them nothing. */
function workerWasted(s: GameState, lk: Look, out: Problem[], frameStalled: boolean) {
  const st = lk.st
  const who: number[] = []
  const why: string[] = []
  let line: BuildingLine | undefined
  for (const l of BUILDING_LINES) {
    const def = C.buildings.lines[l]
    if (!def.output || st.buildings[l] === 0 || buildingWorkers(st, l) === 0) continue
    if ((lk.flows.byLine[l] ?? 0) > 0) continue
    if (l === 'carpenter' && frameStalled) continue
    st.colonists.forEach((c, i) => { if (c.job.kind === 'building' && c.job.line === l) who.push(i) })
    const short = def.secondInput && st.stock[def.input!] > 0 ? def.secondInput : def.input!
    why.push(`the ${nameOf(st, l)} has no ${short} to work`)
    line = line ?? l
  }
  st.colonists.forEach((c, i) => {
    if (c.job.kind !== 'tile') return
    if (gives(s, lk, c, c.job) > 0) return
    who.push(i)
    why.push(`the ground one works gives no ${c.job.good}`)
  })
  if (!who.length) return
  out.push({
    key: `workerWasted:${st.id}`, group: 'workerWasted', type: 4,
    title: who.length === 1 ? `Someone at ${st.name} is working for nothing` : `${who.length} people at ${st.name} are working for nothing`,
    body: `${cap(list(why))}, so ${who.length === 1 ? 'they make' : 'they make'} nothing this turn.`,
    explain: 'One body, one job. A job that makes nothing is a body lost.',
    settlement: st.id, magnitude: who.length, opens: 'settlement', short: 'Working for nothing', line,
    choices: [{ label: who.length === 1 ? 'Find them other work' : 'Find them all other work', action: { t: 'autoAssign', settlement: st.id, only: who } }],
  })
}

function idle(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const idleAt = st.colonists.map((c, i) => c.job.kind === 'idle' ? i : -1).filter(i => i >= 0)
  const clerks = clerksRequired(st.colonists.length)
  const over = idleAt.slice(clerks)
  if (!over.length) return
  out.push({
    key: `idle:${st.id}`, group: 'idle', type: 4,
    title: over.length === 1 ? `Someone at ${st.name} has nothing to do` : `${over.length} people at ${st.name} have nothing to do`,
    body: `${clerks ? `Past the ${plural(clerks, 'clerk')} the ledger needs, ` : ''}${over.length === 1 ? 'one stands idle' : `${over.length} stand idle`}. Put them to work on a tile or in a building.`,
    explain: 'Tap a person, then pick a tile or a building. One body, one job.',
    settlement: st.id, magnitude: over.length, opens: 'settlement', short: 'Someone idle',
    choices: [{ label: 'Put them to work', action: { t: 'autoAssign', settlement: st.id, only: over } }],
  })
}

/** A master working away from their trade while a place at it is open. */
function masterMisplaced(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  for (let i = 0; i < st.colonists.length; i++) {
    const c = st.colonists[i]
    if (c.standing !== 'master' || !c.speciality) continue
    const sp = c.speciality
    let job: Job | null = null
    if ((C.buildings.lines as Record<string, unknown>)[sp]) {
      const l = sp as BuildingLine
      if (c.job.kind === 'building' && c.job.line === l) continue
      const def = C.buildings.lines[l]
      if (st.buildings[l] === 0 || buildingWorkers(st, l) >= C.labour.workersPerBuilding) continue
      if (def.input && st.stock[def.input] + ((lk.flows.made as Record<string, number>)[def.input] ?? 0) <= 0) continue
      job = { kind: 'building', line: l }
    } else {
      const g = sp as TileGood
      if (c.job.kind === 'tile' && c.job.good === g) continue
      const tile = bestTile(s, lk, g, c)
      if (tile === null) continue
      job = { kind: 'tile', tile, good: g }
    }
    const now = makesNow(s, lk, c)
    const there = gives(s, lk, c, job)
    if (there <= now) continue
    // never at the cost of the settlement's food
    if (c.job.kind === 'tile' && c.job.good === 'food' && lk.fb - now < 0) continue
    out.push({
      key: `masterMisplaced:${st.id}`, group: 'masterMisplaced', type: 4,
      title: `A master of ${specialityWords(sp)} at ${st.name} is away from their trade`,
      body: `They make ${now} ${doing(st, c)}; at their trade they would make ${there}.`,
      explain: 'A master makes twice as much at their own trade as anywhere else.',
      settlement: st.id, magnitude: 1, opens: 'settlement', short: 'A master away from their trade', line: job.kind === 'building' ? job.line : undefined,
      choices: [{ label: 'Put them to their trade', action: assign(st, i, job) }],
    })
    return
  }
}

function buildOrder(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  if (st.building) return
  const head = st.buildQueue[0]
  if (head) {
    const ok = canStart(st, head)
    if (ok.ok) return
    const other = st.buildQueue.find((b, i) => i > 0 && canStart(st, b).ok)
    out.push({
      key: `buildBlocked:${st.id}`, group: 'buildBlocked', type: 3, title: `${st.name} cannot start its ${buildingName(head).toLowerCase()}`,
      body: `It ${ok.reason ?? 'cannot start yet'}, and the build order waits behind it.`,
      settlement: st.id, magnitude: 1, opens: 'build', short: 'The build order is stuck', frame: true,
      choices: [other
        ? { label: `Build the ${buildingName(other).toLowerCase()} first`, action: { t: 'setBuildOrder', settlement: st.id, queue: [other, ...st.buildQueue.filter(b => b !== other)] } }
        : { label: 'Take it out of the order', action: { t: 'setBuildOrder', settlement: st.id, queue: st.buildQueue.slice(1) } }],
    })
    return
  }
  if (s.turn <= st.founded) return
  out.push({
    key: `buildEmpty:${st.id}`, group: 'buildEmpty', type: 4, title: `${st.name} has nothing in its build order`,
    body: 'Choose what it builds next.', explain: 'Buildings cost frame, which a carpenter makes from timber. Higher tiers also need tooling.',
    settlement: st.id, magnitude: 1, opens: 'build', short: 'Nothing in the build order', choices: [],
  })
}

/** The best one to teach next: the lowest standing first; one of free standing only by a master. */
function nextStudent(st: Settlement, teachers: Colonist[], skip: number | null): number {
  const master = teachers.some(canMakeMasters)
  let best = -1
  const rank = { debtor: 0, contracted: 1, free: 2, master: 3 }
  st.colonists.forEach((c, i) => {
    if (c.id === skip || teachers.includes(c) || c.standing === 'master') return
    if (c.standing === 'free' && !master) return
    if (best < 0 || rank[c.standing] < rank[st.colonists[best].standing]) best = i
  })
  return best
}

function canMakeMasters(c: Colonist): boolean {
  return c.standing === 'master' && !!c.speciality && !C.labour.predecessorSkills.includes(c.speciality as TileGood)
}

function school(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  if (st.buildings.school === 0) return
  const teachers = st.colonists.filter(c => c.job.kind === 'building' && c.job.line === 'school')
  const bname = nameOf(st, 'school')
  const ed = st.education
  if (ed) {
    const student = st.colonists.find(c => c.id === ed.colonist)
    const next = nextStudent(st, teachers, ed.colonist)
    const instead: QueueChoice[] = next >= 0 ? [{ label: 'Teach someone else', action: { t: 'educate', settlement: st.id, colonist: next } }] : []
    if (!student) {
      out.push({ key: `schoolFutile:${st.id}`, group: 'schoolFutile', type: 3, title: `The one being taught at ${st.name} has left`, body: `The ${bname} goes on teaching nobody.`, settlement: st.id, magnitude: 1, opens: 'school', short: 'Teaching nobody', line: 'school', choices: instead })
      return
    }
    if (!teachers.length) {
      const master = student.standing === 'free'
      const mi = master ? st.colonists.findIndex(c => canMakeMasters(c) && !(c.job.kind === 'building' && c.job.line === 'school')) : -1
      const sp = master ? null : spareFor(s, lk, { kind: 'building', line: 'school' }, [st.colonists.indexOf(student)])
      const who = master ? mi : sp?.index ?? -1
      out.push({
        key: `schoolStalled:${st.id}`, group: 'schoolStalled', type: 3, title: `Schooling at ${st.name} has stopped`,
        body: `${cap(person(student))} is being taught, ${plural(ed.turnsLeft, 'turn')} to go, but nobody works the ${bname}, so it does not go on.${master && mi < 0 ? ' Only a master of a trade can make a master, and none here can teach.' : who >= 0 ? ` ${cap(person(st.colonists[who]))} ${doing(st, st.colonists[who])} could teach.` : ''}`,
        explain: 'Schooling needs a teacher in the school, and a master to make a master.',
        settlement: st.id, magnitude: 2, opens: 'school', short: 'No teacher', line: 'school',
        choices: who >= 0 ? [{ label: 'Put a teacher in', action: assign(st, who, { kind: 'building', line: 'school' }) }] : [],
      })
      return
    }
    if (student.standing === 'free' && !teachers.some(canMakeMasters)) {
      out.push({
        key: `schoolFutile:${st.id}`, group: 'schoolFutile', type: 3, title: `Schooling at ${st.name} will come to nothing`,
        body: `${cap(person(student))} is being taught, but only a master of a trade can make a master, and nobody teaching is one.`,
        settlement: st.id, magnitude: 1, opens: 'school', short: 'Teaching in vain', line: 'school', choices: instead,
      })
    }
    return
  }
  if (!teachers.length) return
  const next = nextStudent(st, teachers, null)
  const at = teachers.map(t => st.colonists.indexOf(t))
  out.push({
    key: `schoolIdle:${st.id}`, group: 'schoolIdle', type: 4, title: `The ${bname} at ${st.name} has nobody to teach`,
    body: next >= 0 ? `${cap(plural(teachers.length, 'teacher'))} and no one being taught. ${cap(person(st.colonists[next]))} ${doing(st, st.colonists[next])} could be.` : `Nobody here can be taught by ${teachers.length === 1 ? 'its teacher' : 'its teachers'}.`,
    settlement: st.id, magnitude: 1, opens: 'school', short: 'Nobody to teach', line: 'school',
    choices: next >= 0 ? [{ label: 'Teach someone', action: { t: 'educate', settlement: st.id, colonist: next } }] : [{ label: 'Find the teacher other work', action: { t: 'autoAssign', settlement: st.id, only: at } }],
  })
}

function machineStarved(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const machines = Object.keys(st.imported) as BuildingLine[]
  if (!machines.length) return
  const per = C.buildings.importedInstrumentsPerTurn
  if (st.stock.instruments >= per * machines.length) return
  const line = machines[0]
  const n = per * machines.length * C.problems.instrumentsTurns
  const price = buyPrice(s, 'instruments')
  const afford = Math.min(n, Math.floor(s.charters[0].gold / price))
  out.push({
    key: `machineStarved:${st.id}`, group: 'machineStarved', type: 3,
    title: `${st.name}'s imported ${C.buildings.lines[line].names[2].toLowerCase()} is short of instruments`,
    body: `It burns ${per} instruments a turn, and without them it works as a ${C.buildings.lines[line].names[1].toLowerCase()}.`,
    explain: 'An imported machine runs on instruments, which only the Company sells.',
    settlement: st.id, magnitude: 2, opens: 'settlement', short: 'Short of instruments', line,
    choices: afford > 0 && canConsign(s, st).ok ? [{ label: `Buy ${afford} instruments`, action: { t: 'buy', settlement: st.id, good: 'instruments', amount: afford } }] : [],
  })
}

function purposeLost(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const p = st.orders.purpose
  if (p === 'ask' || p === 'industry' || p === 'civic') return
  if (workableTiles(s, st).some(t => tileYield(s, t, p, null) > 0)) return
  out.push({
    key: `purposeLost:${st.id}`, group: 'purposeLost', type: 3, title: `${st.name} cannot pursue its purpose`,
    body: `Nothing around it yields ${p} any more, so new people go elsewhere. Give it another purpose.`,
    settlement: st.id, magnitude: 1, opens: 'orders', short: 'Its purpose is gone', choices: [],
  })
}

/** The standing orders a settlement cannot follow, and the ones held up. */
function orders(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const unsat: { text: string; fix?: QueueChoice }[] = []
  const held: string[] = []
  const waiting = (g: GoodId, threshold: number) => lk.after[g] - threshold >= C.orders.surplusMinimum
  const office = st.buildings.consignment > 0
  const cannot = canConsign(s, st)
  const inland = !office && !isCoastalSettlement(s, st)
  const inlandGoods: GoodId[] = [], embargoed: GoodId[] = []
  for (const g of GOODS) {
    if (g === 'food') continue
    const rule = surplusRuleFor(st, g)
    const d = rule.destination
    if (d.kind === 'ship' && shipsUnder(g, rule.own)) {
      const state = shipRuleState(s, st, d.settlement)
      if (state === 'gone') unsat.push({ text: `${g} is to ship to a settlement that is no longer yours`, fix: rule.own ? { label: `Use the settlement's rule for ${g}`, action: { t: 'setGoodRule', settlement: st.id, good: g, rule: null } } : { label: 'Hold surplus here', action: { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: st.orders.surplus.threshold, destination: { kind: 'hold' } } } } })
      else if (state === 'blocked' && waiting(g, rule.threshold)) held.push(`${g} waits to ship while hostile units are near the road`)
    } else if (d.kind === 'offer' && MANUFACTURED.includes(g)) {
      const state = offerRuleState(s, st, d.predecessor)
      if (state === 'gone') unsat.push({ text: `${g} is to go to a people who are gone or out of reach`, fix: rule.own ? { label: `Use the settlement's rule for ${g}`, action: { t: 'setGoodRule', settlement: st.id, good: g, rule: null } } : { label: 'Hold surplus here', action: { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: st.orders.surplus.threshold, destination: { kind: 'hold' } } } } })
      else if (state === 'blocked' && waiting(g, rule.threshold)) held.push(`${g} waits for ${s.predecessors[d.predecessor]?.name ?? 'a people'}, who will not trade while alarmed`)
    } else if (d.kind === 'consign' && !office && C.market.goods[g].traded && g !== 'tooling' && g !== 'arms' && g !== 'instruments' && lk.after[g] - (isInputHere(st, g) || g === 'horses' ? rule.threshold * 2 : rule.threshold) >= C.market.lotSize) {
      if (inland) inlandGoods.push(g)
      else if (!cannot.ok) held.push(`${g} waits to be consigned while the settlement is blockaded`)
      else if (isEmbargoed(s, g)) embargoed.push(g)
    }
  }
  if (inlandGoods.length) {
    const coast = s.settlements.filter(x => x.owner === 0 && x.id !== st.id && isCoastalSettlement(s, x)).sort((a, b) => dist(s.world.width, a.tile, st.tile) - dist(s.world.width, b.tile, st.tile))[0]
    unsat.push({
      text: `it is inland, so the ${list(inlandGoods)} its orders would consign cannot reach the Company`,
      fix: coast ? { label: `Ship surplus to ${coast.name}`, action: { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: st.orders.surplus.threshold, destination: { kind: 'ship', settlement: coast.id } } } }
        : { label: 'Hold surplus here', action: { t: 'setStandingOrder', settlement: st.id, rule: 'surplus', value: { threshold: st.orders.surplus.threshold, destination: { kind: 'hold' } } } },
    })
  }
  for (const g of embargoed) unsat.push({ text: `the Company will not take ${g}, which its orders would consign`, fix: { label: `Hold ${g} here`, action: { t: 'setGoodRule', settlement: st.id, good: g, rule: { destination: { kind: 'hold' } } } } })
  const gr = st.orders.growth
  if (gr.kind === 'send' && !(s.settlements[gr.settlement] && s.settlements[gr.settlement].owner === 0)) unsat.push({ text: 'new colonists are to go to a settlement that is no longer yours', fix: { label: 'Keep new colonists here', action: { t: 'setStandingOrder', settlement: st.id, rule: 'growth', value: { kind: 'keep' } } } })
  if (unsat.length) {
    const fix = unsat.find(u => u.fix)?.fix
    out.push({
      key: `orderUnsat:${st.id}`, group: 'orderUnsat', type: 3, title: `${st.name} has an order it cannot follow`,
      body: `${cap(list(unsat.map(u => u.text)))}.`, explain: 'A standing order that cannot be followed does nothing until it is changed.',
      settlement: st.id, magnitude: unsat.length, opens: 'orders', short: 'An order it cannot follow', choices: fix ? [fix] : [],
    })
  }
  if (held.length) out.push({
    key: `orderBlocked:${st.id}`, group: 'orderBlocked', type: 3, title: `${st.name}'s orders are held up`,
    body: `${cap(list(held))}. ${held.length === 1 ? 'It waits' : 'They wait'} until it clears.`, explain: 'Automation never fights. A blocked order waits and tells you.',
    settlement: st.id, magnitude: 1, opens: 'orders', short: 'Orders held up', choices: [],
  })
}

/** The goods the player's own standing orders have dumped, and, where a building of the player's
 *  could work the good instead and someone is spare to put there, that fix first. */
function dumping(s: GameState, looks: Look[], out: Problem[]) {
  for (const d of dumpedGoods(s)) {
    const g = d.good
    const sellers = looks.filter(lk => sellsHere(lk.st, g))
    let fix: QueueChoice | null = null, root = ''
    let at: Settlement | undefined
    for (const lk of sellers) {
      const st = lk.st
      for (const line of BUILDING_LINES) {
        const def = C.buildings.lines[line]
        if (def.input !== g || st.buildings[line] === 0 || buildingWorkers(st, line) >= C.labour.workersPerBuilding) continue
        if (line === 'carpenter' && frameWanted(st) <= 0) continue
        const sp = spareFor(s, lk, { kind: 'building', line })
        if (!sp) continue
        const bname = nameOf(st, line)
        root = ` ${buildingWorkers(st, line) === 0 ? `Nobody at ${st.name} works the ${bname}` : `The ${bname} at ${st.name} has room for one more`}, which would turn it into ${def.output === 'frame' ? 'frame' : def.output}.`
        fix = { label: `Staff the ${bname}`, action: assign(st, sp.index, { kind: 'building', line }) }
        at = st
        break
      }
      if (fix) break
    }
    const worst = at ?? sellers.map(lk => lk.st).sort((a, b) => b.stock[g] - a.stock[g])[0]
    out.push({
      key: `dumping:${g}`, group: 'dumping', type: 1, title: `Your standing orders are dumping ${g}`,
      body: `${g} stands at ${d.price}, ${d.below} below where it would be with nothing sold, and ${d.autoShare} of that fall is your own automatic selling. Each lot fetches less than the last.${root}`,
      explain: 'A standing order sells everything above its threshold every turn, and the Company pays less the more it is sent. Hold the good until the price mends, raise its threshold, or sell it in smaller lots.',
      settlement: worst?.id, magnitude: d.below, opens: 'orders', short: `Dumping ${g}`, good: g,
      choices: [...(fix ? [fix] : []), { label: `Hold ${g} everywhere`, action: { t: 'setGoodRule', settlement: -1, good: g, rule: { destination: { kind: 'hold' } } } }],
    })
  }
}

/** A unit's problems: an explorer with nothing left to find, a circuit that carries nothing. */
function unitProblems(s: GameState, out: Problem[]) {
  let unexplored: boolean | null = null
  for (const u of s.units) {
    if (u.owner !== 0 || !u.order) continue
    if (u.order.kind === 'explore') {
      if (unexplored === null) unexplored = s.world.tiles.some(t => !t.explored && isLand(t) && t.terrain !== 'mountain')
      if (unexplored) continue
      out.push({
        key: `exploreDone:${u.id}`, group: 'exploreDone', type: 4, title: `${unitName(u)} has nothing left to explore`,
        body: 'Every piece of land it could explore has been seen, so it wanders. Give it other work.',
        unit: u.id, tile: u.tile, magnitude: 1, opens: 'unit', short: 'Nothing left to explore',
        choices: [{ label: 'Clear the order', action: { t: 'setUnitOrder', unit: u.id, order: null } }],
      })
    } else if (u.order.kind === 'haul') {
      const laps = Math.floor((u.order.empty ?? 0) / Math.max(1, u.order.stops.length))
      if (laps < C.problems.emptyHaulLaps) continue
      out.push({
        key: `haulEmpty:${u.id}`, group: 'haulEmpty', type: 4, title: `${unitName(u)} carries nothing on its circuit`,
        body: `It has gone round ${plural(laps, 'time')} without loading or unloading anything. Its stops have nothing for it, or nothing to take.`,
        unit: u.id, tile: u.tile, magnitude: 1, opens: 'unit', short: 'Carrying nothing',
        choices: [{ label: 'Clear the order', action: { t: 'setUnitOrder', unit: u.id, order: null } }],
      })
    }
  }
}

function unitName(u: Unit): string {
  const names: Record<string, string> = { colonist: 'A colonist', hauler: 'A hauler', lighter: 'A lighter', trader: 'A trader', raider: 'A raider', cutter: 'A cutter', outrider: 'An outrider', militia: 'Militia', improver: 'An improver' }
  return names[u.kind] ?? 'A unit'
}

// ---- everything, for the queue and for the settlement screen ------------------------------------

/** What will spoil at a settlement at the end of this turn, good by good: the spoilage card's list,
 *  for the shelf's bars, so the two never disagree. */
export function spoilsThisTurn(s: GameState, st: Settlement): Partial<Record<GoodId, number>> {
  if (st.owner !== 0) return {}
  return look(s, st, new Set()).spoils
}

/** A settlement's problems, as its screen shows them. */
export function settlementProblems(s: GameState, st: Settlement): Problem[] {
  if (st.owner !== 0) return []
  const dumping = new Set(dumpedGoods(s).map(d => d.good))
  return checks(s, look(s, st, dumping))
}

function checks(s: GameState, lk: Look): Problem[] {
  const out: Problem[] = []
  hunger(s, lk, out)
  spoilage(s, lk, out)
  const frameStalled = buildStalled(s, lk, out)
  buildOrder(s, lk, out)
  inputWasted(s, lk, out, frameStalled)
  workerWasted(s, lk, out, frameStalled)
  idle(s, lk, out)
  masterMisplaced(s, lk, out)
  school(s, lk, out)
  machineStarved(s, lk, out)
  purposeLost(s, lk, out)
  orders(s, lk, out)
  return out
}

/** Every problem in the game: each settlement's, the dumping the orders do, and the units'. */
export function allProblems(s: GameState): Problem[] {
  const dumpingSet = new Set(dumpedGoods(s).map(d => d.good))
  const looks = s.settlements.filter(st => st.owner === 0).map(st => look(s, st, dumpingSet))
  const out: Problem[] = []
  for (const lk of looks) out.push(...checks(s, lk))
  dumping(s, looks, out)
  unitProblems(s, out)
  return out
}

/** The problems a settlement's people, buildings and orders have, and the units', as a system: the
 *  turn notes since when each has stood, and the queue shows them. Last in the turn, after spoilage,
 *  so it sees the state the player will. */
export const problemsSystem: System = {
  id: 'problems',
  enabled: c => c.flags.settlement,
  resolve(s: GameState) {
    const live = new Set(allProblems(s).map(p => p.key))
    for (const st of s.settlements) {
      if (st.owner !== 0) continue
      // the order conditions' old name, from saves made before this
      delete st.conditions['orderUnsatisfiable']
      for (const g of SETTLEMENT_PROBLEMS) {
        if (live.has(`${g}:${st.id}`)) st.conditions[g] = st.conditions[g] ?? s.turn
        else delete st.conditions[g]
      }
    }
    for (const u of s.units) {
      if (u.owner !== 0) continue
      for (const g of UNIT_PROBLEMS) {
        if (live.has(`${g}:${u.id}`)) u.since[g] = u.since[g] ?? s.turn
        else delete u.since[g]
      }
    }
  },
  queueItems(s: GameState): QueueItem[] {
    return allProblems(s).map(p => {
      const since = p.group === 'dumping' ? undefined
        : p.settlement !== undefined ? s.settlements[p.settlement]?.conditions[p.group]
        : p.unit !== undefined ? s.units.find(u => u.id === p.unit)?.since[p.group] : undefined
      return toItem(p, since ?? s.turn)
    })
  },
}

/** A problem as the queue carries it. */
function toItem(p: Problem, since: number): QueueItem {
  return {
    key: p.key, group: p.group, type: p.type, title: p.title, body: p.body, explain: p.explain, settlement: p.settlement,
    unit: p.unit, tile: p.tile, magnitude: p.magnitude, since, choices: p.choices, opens: p.opens,
  }
}
