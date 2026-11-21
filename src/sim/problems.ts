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
import { tileYield, workableTiles, workerOutput, buildingWorkers, foodBalance, clerksRequired, defaultJob } from './labour'
import {
  previewFlows, storageCapacity, surplusRuleFor, canStart, buildingName, effectiveTier, outputModifier,
  isCoastalSettlement, buildable, type Flows,
} from './settlement'
import { canConsign, isEmbargoed, dumpedGoods, buyPrice, standingSale, isInputHere, ordersSell } from './market'
import { shipRuleState, shipsUnder } from './orders'
import { offerRuleState, MANUFACTURED } from './predecessors'
import { isLand, dist } from './worldgen'
import { isHull } from './units'
import { bestSites, compass, unseenLandNear } from './autopilot'

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
    if (dumping.has(g) && sellsMoreThanOverflow(s, st, g, capacity)) dumped.add(g)
  }
  const free = workableTiles(s, st).filter(t => {
    const tile = s.world.tiles[t]
    if (tile.worked !== null && tile.worked !== st.id) return false
    return !st.colonists.some(c => c.job.kind === 'tile' && c.job.tile === t)
  })
  return { st, flows, cap: capacity, fb: foodBalance(s, st), mod: outputModifier(s, st), after, sale, spoils, dumped, free }
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
  const frameWaits = frameWanted(st) > 0
  st.colonists.forEach((c, i) => {
    if (exclude.includes(i)) return
    if (c.job.kind === job.kind && (job.kind === 'building' ? c.job.kind === 'building' && c.job.line === job.line : c.job.kind === 'tile' && job.kind === 'tile' && c.job.tile === job.tile)) return
    const there = gives(s, lk, c, job)
    if (there <= 0) return
    const now = makesNow(s, lk, c)
    const forFood = job.kind === 'tile' && job.good === 'food'
    // the hands in the carpenter's shop while a build waits for frame are not spare, even making
    // nothing for want of timber, but for food: moved, the build stalls and its card moves someone
    // back, and the two cards went round in circles within one turn (decision 198)
    if (frameWaits && !forFood && c.job.kind === 'building' && c.job.line === 'carpenter') return
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

/** A workshop here that works a good the settlement is letting go, with a place free and something
 *  to work it with, and who would go there: the cause before the symptom (turn queue brief section
 *  5). The carpenter's shop only while something wants frame. Null when there is none, or nobody
 *  is spare to send. */
function usesHere(s: GameState, lk: Look, g: GoodId): { line: BuildingLine; sp: Spare } | null {
  const st = lk.st
  for (const line of BUILDING_LINES) {
    const def = C.buildings.lines[line]
    if (def.input !== g || !def.output || st.buildings[line] === 0 || buildingWorkers(st, line) >= C.labour.workersPerBuilding) continue
    if (line === 'carpenter' && frameWanted(st) <= 0) continue
    if (def.secondInput && st.stock[def.secondInput] <= 0) continue
    const sp = spareFor(s, lk, { kind: 'building', line })
    if (sp) return { line, sp }
  }
  return null
}

/** What `autoAssign` would give these colonists, in the order it gives it, worked on a copy so the
 *  state is not touched. A card offers that fix only where it would change something: a fix that
 *  puts nobody to work is never offered (DECISIONS.md 194). */
function wouldAssign(s: GameState, st: Settlement, who: number[]): Job[] {
  const colonists = st.colonists.map((c, i) => who.includes(i) ? { ...c, job: { kind: 'idle' } as Job } : c)
  const copy: Settlement = { ...st, colonists }
  return who.map(i => {
    const job = defaultJob(s, copy)
    colonists[i] = { ...colonists[i], job }
    return job
  })
}

function sameJob(a: Job, b: Job): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'tile' && b.kind === 'tile') return a.tile === b.tile && a.good === b.good
  if (a.kind === 'building' && b.kind === 'building') return a.line === b.line
  return true
}

/** Where a job puts someone, for the end of a sentence or a button: "on timber", "in the linen shop". */
function jobPlace(st: Settlement, job: Job): string {
  return job.kind === 'tile' ? `on ${job.good}` : job.kind === 'building' ? `in the ${nameOf(st, job.line)}` : 'nowhere'
}

/** Why the hands in a workshop with something to work make nothing of it: their standing, and the
 *  settlement's resolve, in the glossary's words. */
function madeNothingWhy(lk: Look, line: BuildingLine): string {
  const hands = lk.st.colonists.filter(c => c.job.kind === 'building' && c.job.line === line)
  const parts: string[] = []
  const low = hands.slice().sort((a, b) => workerOutput(a, line) - workerOutput(b, line))[0]
  if (low && workerOutput(low, line) < C.labour.baseBuildingOutput) parts.push(`${person(low)} makes ${workerOutput(low, line)} a turn in a workshop`)
  if (lk.mod < 0) parts.push(`with resolve this low everyone here makes ${-lk.mod} less`)
  return parts.length ? list(parts) : 'what they make is used up before it is made'
}

/** What a settlement's orders keep back of a good before they sell, as `standingSale` reckons it:
 *  the threshold, the office's where it is lower, twice it for horses and a workshop's input. */
function ordersKeep(st: Settlement, g: GoodId): number {
  const rule = surplusRuleFor(st, g)
  const threshold = st.buildings.consignment > 0 ? Math.min(rule.threshold, C.market.consignmentOfficeThreshold) : rule.threshold
  return isInputHere(st, g) || g === 'horses' ? threshold * 2 : threshold
}

/** The threshold at which orders sell only what the store cannot keep: a lot under the store,
 *  halved where they keep twice it. */
function overflowThreshold(st: Settlement, g: GoodId, capacity: number): number {
  return Math.max(0, Math.ceil((capacity - C.market.lotSize) / (isInputHere(st, g) || g === 'horses' ? 2 : 1)))
}

/** Whether orders that sell a good sell more than what would otherwise spoil: selling only the
 *  overflow is not dumping, because holding it would lose it outright. */
function sellsMoreThanOverflow(s: GameState, st: Settlement, g: GoodId, capacity: number): boolean {
  return ordersSell(s, st, g) && ordersKeep(st, g) < capacity - C.market.lotSize
}

/** Places free in the meeting house, or 0 where there is none. */
function meetingRoom(st: Settlement): number {
  return st.buildings.meeting > 0 ? Math.max(0, C.labour.workersPerBuilding - buildingWorkers(st, 'meeting')) : 0
}

/** Where low resolve is part of why hands make nothing: someone in the meeting house, which gathers
 *  the grievance resolve is made of, or the meeting house itself. Null where resolve is not low or
 *  neither can be had. */
function resolveFix(s: GameState, lk: Look): { label: string; action: unknown; words: string } | null {
  const st = lk.st
  if (lk.mod >= 0) return null
  if (st.buildings.meeting > 0) {
    if (buildingWorkers(st, 'meeting') >= C.labour.workersPerBuilding) return null
    const sp = spareFor(s, lk, { kind: 'building', line: 'meeting' })
    if (!sp) return null
    const room = meetingRoom(st)
    return { label: 'Put someone in the meeting house', action: assign(st, sp.index, { kind: 'building', line: 'meeting' }), words: ` ${cap(sp.words)} could gather grievance in the meeting house, which has ${plural(room, 'place')} free, and resolve rises with it.` }
  }
  const coming = (st.building && st.building.id.line === 'meeting') || st.buildQueue.some(b => b.line === 'meeting')
  if (coming || !buildable(s, st).some(b => b.line === 'meeting')) return null
  return { label: 'Build a meeting house first', action: { t: 'setBuildOrder', settlement: st.id, queue: [{ line: 'meeting', tier: 1 }, ...st.buildQueue] }, words: ' A meeting house would gather the grievance resolve is made of.' }
}

/** Where nobody is spare for a job, the one whose move would cost least, and what it would cost in
 *  words: someone on a good the settlement has enough of, or on food where it stays fed. Never a
 *  master at their trade, a teacher, or anyone in the meeting house. The value of what they make
 *  now is weighed by the good's price, food at the best of them. Null when nobody could go without
 *  the settlement going hungry. */
function leastBad(s: GameState, lk: Look, job: Job): { index: number; words: string; from: string; gives: number; cost: string } | null {
  const st = lk.st
  let best: { i: number; v: number; there: number; now: number; good: GoodId | 'frame' | null } | null = null
  st.colonists.forEach((c, i) => {
    if (c.job.kind === 'idle') return
    if (job.kind === 'building' && c.job.kind === 'building' && c.job.line === job.line) return
    if (c.standing === 'master' && c.speciality && ((c.job.kind === 'tile' && c.job.good === c.speciality) || (c.job.kind === 'building' && c.job.line === c.speciality))) return
    if (c.job.kind === 'building' && (c.job.line === 'school' || c.job.line === 'carpenter')) return
    const there = gives(s, lk, c, job)
    if (there <= 0) return
    // nor the hands making what the building works, unless enough of it is held for a few turns:
    // the one cutting timber moved into an empty carpenter's shop left it nothing to work
    const input = job.kind === 'building' ? C.buildings.lines[job.line].input : null
    if (input && c.job.kind === 'tile' && c.job.good === input && st.stock[input] < C.problems.inputTurns * there) return
    const now = makesNow(s, lk, c)
    // a workshop hand's work is weighed by what it makes; the meeting house's by a good's middling worth
    const good: GoodId | 'frame' | null = c.job.kind === 'tile' ? c.job.good : C.buildings.lines[c.job.line].output
    if (good === 'food' && lk.fb - now < 0) return
    const price = good === 'food' ? C.market.goods.timber.ceiling : good && good !== 'frame' ? C.market.goods[good].open : C.market.goods.timber.ceiling
    const v = now * price
    if (!best || v < best.v) best = { i, v, there, now, good }
  })
  if (!best) return null
  const b = best as { i: number; v: number; there: number; now: number; good: GoodId | 'frame' | null }
  const c = st.colonists[b.i]
  const signed = (n: number) => n > 0 ? `+${n}` : String(n)
  const from = c.job.kind === 'tile' ? c.job.good : `the ${nameOf(st, (c.job as { line: BuildingLine }).line)}`
  const cost = b.good === 'food' ? `food falls from ${signed(lk.fb)} to ${signed(lk.fb - b.now)} a turn`
    : b.good ? `${b.good} falls by ${b.now} a turn` : 'the grievance it gathers stops'
  return { index: b.i, words: `${person(c)} ${doing(st, c)}`, from, gives: b.there, cost }
}

/** Someone on ground that would also give a good, working it for another, who could switch to the
 *  good on the same ground: where nobody can go to fresh ground for it. Never off food where that
 *  would leave the settlement hungry, never a master at their trade. The one who would give most. */
function switchTo(s: GameState, lk: Look, good: TileGood): { index: number; tile: number; from: TileGood; gives: number; words: string; cost: string } | null {
  const st = lk.st
  let best: { i: number; tile: number; from: TileGood; gives: number; now: number } | null = null
  st.colonists.forEach((c, i) => {
    if (c.job.kind !== 'tile' || c.job.good === good) return
    if (c.standing === 'master' && c.speciality === c.job.good) return
    const v = Math.max(0, tileYield(s, c.job.tile, good, c) + lk.mod)
    if (v <= 0) return
    const now = makesNow(s, lk, c)
    if (c.job.good === 'food' && lk.fb - now < 0) return
    if (!best || v > best.gives) best = { i, tile: c.job.tile, from: c.job.good, gives: v, now }
  })
  if (!best) return null
  const b = best as { i: number; tile: number; from: TileGood; gives: number; now: number }
  const c = st.colonists[b.i]
  const signed = (n: number) => n > 0 ? `+${n}` : String(n)
  return { index: b.i, tile: b.tile, from: b.from, gives: b.gives, words: `${person(c)} ${doing(st, c)}`, cost: b.from === 'food' ? `food falls from ${signed(lk.fb)} to ${signed(lk.fb - b.now)} a turn` : `${b.from} falls by ${b.now} a turn` }
}

/** The ways to get timber to a settlement with none to work: someone to the best free forest, or
 *  switched to timber on forest ground they work for something else, timber shipped from another
 *  settlement, timber bought, or a good consigned to pay for it. The words say what is there to do,
 *  or that nothing is. */
function timberFixes(s: GameState, lk: Look, need: number): { words: string; choices: QueueChoice[]; coming: boolean } {
  const st = lk.st
  const choices: QueueChoice[] = []
  let words = ''
  const tile = bestTile(s, lk, 'timber')
  // never the hands in the carpenter's shop: they are who the timber is for, and taking them to the
  // forest only empties the shop (decision 197)
  const hands = st.colonists.map((c, i) => c.job.kind === 'building' && c.job.line === 'carpenter' ? i : -1).filter(i => i >= 0)
  const sp = tile !== null ? spareFor(s, lk, { kind: 'tile', tile, good: 'timber' }, hands) : null
  if (sp && tile !== null) {
    words += ` ${cap(sp.words)} could go to the best free forest and cut ${sp.gives} a turn.`
    choices.push({ label: 'Put someone on timber', action: assign(st, sp.index, { kind: 'tile', tile, good: 'timber' }) })
  } else if (tile === null) words += ' There is no free forest to cut.'
  if (!sp) {
    const sw = switchTo(s, lk, 'timber')
    if (sw) { words += ` ${cap(sw.words)} could cut ${sw.gives} timber a turn on the same ground; ${sw.cost}.`; choices.push({ label: `Switch one from ${sw.from} to timber`, action: assign(st, sw.index, { kind: 'tile', tile: sw.tile, good: 'timber' }) }) }
  }
  // timber already ordered here counts only while the settlement sending it has some to spare, or
  // gains some each turn toward it
  const sender = timberSender(s, st)
  const dry = sender ? undefined : s.settlements.find(x => x.owner === 0 && x.id !== st.id && shipsHere(x, 'timber', st.id))
  const from = sender ? null : shipFrom(s, st, 'timber')
  if (sender) words += sender.gains > 0 ? ` ${sender.from.name}'s orders ship its spare timber here once it has some, and it gains ${sender.gains} a turn.` : ` ${sender.from.name}'s orders ship its spare timber here.`
  else {
    if (dry) {
      words += ` ${dry.name}'s orders would ship its spare timber here, but it has none to spare now.`
      // where it has forest free and someone to spare, someone there can cut it (decision 198)
      const dlk = look(s, dry, new Set())
      const at = bestTile(s, dlk, 'timber')
      const theirs = dry.colonists.map((c, i) => c.job.kind === 'building' && c.job.line === 'carpenter' ? i : -1).filter(i => i >= 0)
      const dsp = at !== null ? spareFor(s, dlk, { kind: 'tile', tile: at, good: 'timber' }, theirs) : null
      if (dsp && at !== null) {
        words += ` ${cap(dsp.words)} there could cut ${dsp.gives} timber a turn for it.`
        choices.push({ label: `Put someone on timber at ${dry.name}`, action: assign(dry, dsp.index, { kind: 'tile', tile: at, good: 'timber' }) })
      }
    }
    if (from) { words += ` ${from.name} has timber to spare.`; choices.push({ label: `Ship timber here from ${from.name}`, action: { t: 'setGoodRule', settlement: from.id, good: 'timber', rule: { destination: { kind: 'ship', settlement: st.id } } } }) }
  }
  if (canConsign(s, st).ok && need > 0) {
    const price = buyPrice(s, 'timber')
    const n = Math.min(need, Math.floor(s.charters[0].gold / price))
    if (n > 0) choices.push({ label: `Buy ${n} timber`, action: { t: 'buy', settlement: st.id, good: 'timber', amount: n } })
    else {
      const pay = payFor(s, st, 'timber')
      if (pay) { words += pay.words; choices.push(pay.choice) }
    }
  }
  if (!choices.length && !sender) words += ' Nothing here can get timber now: it needs a forest, gold, or another settlement with timber to spare.'
  return { words, choices, coming: !!sender }
}

/** A settlement of the player's whose orders ship timber here and which has some to spare now, or
 *  gains some each turn toward it (what it cuts, less what its own shop works): timber on its way.
 *  Null when none has or does. */
function timberSender(s: GameState, st: Settlement): { from: Settlement; gains: number } | null {
  let best: { from: Settlement; gains: number } | null = null
  for (const x of s.settlements) {
    if (x.owner !== 0 || x.id === st.id || !shipsHere(x, 'timber', st.id)) continue
    if (x.stock.timber - surplusRuleFor(x, 'timber').threshold >= C.orders.surplusMinimum) return { from: x, gains: 0 }
    const f = previewFlows(s, x)
    const gains = Math.floor((f.made.timber ?? 0) - (f.used.timber ?? 0))
    if (gains > 0 && (!best || gains > best.gains)) best = { from: x, gains }
  }
  return best
}

/** A good held here to consign, a lot or two of it, to pay for something the treasury cannot buy:
 *  the one worth most as held. Null when nothing is held to sell. */
function payFor(s: GameState, st: Settlement, want: GoodId): { words: string; choice: QueueChoice } | null {
  const sell = (GOODS.filter(g => g !== want && C.market.goods[g].traded && !isEmbargoed(s, g) && g !== 'tooling' && g !== 'arms' && g !== 'instruments' && st.stock[g] >= C.market.lotSize) as GoodId[])
    .sort((a, b) => st.stock[b] * C.market.goods[b].open - st.stock[a] * C.market.goods[a].open)[0]
  if (!sell) return null
  const amount = Math.min(st.stock[sell], C.market.lotSize * 2)
  return { words: ` There is not gold enough for it; consigning ${amount} ${sell} would pay toward it.`, choice: { label: `Consign ${amount} ${sell} to pay for ${want}`, action: { t: 'consign', settlement: st.id, good: sell, amount } } }
}

/** Whether a settlement's orders ship a good to another already. */
function shipsHere(from: Settlement, g: GoodId, to: number): boolean {
  const d = surplusRuleFor(from, g).destination
  return d.kind === 'ship' && d.settlement === to
}

/** Another settlement of the player's with a good to spare, the nearest, whose orders could ship it
 *  here: a lot or more of it held above what its own orders keep, and not shipped to another
 *  settlement already, since a good's orders ship to one place and two cards each taking the same
 *  timber for their own went round in circles (decision 198). Null when none has. */
function shipFrom(s: GameState, st: Settlement, g: GoodId): Settlement | null {
  return s.settlements.filter(x => x.owner === 0 && x.id !== st.id && x.stock[g] - surplusRuleFor(x, g).threshold >= C.orders.surplusMinimum && shipRuleState(s, x, st.id) === 'ok'
    && surplusRuleFor(x, g).destination.kind !== 'ship')
    .sort((a, b) => dist(s.world.width, a.tile, st.tile) - dist(s.world.width, b.tile, st.tile))[0] ?? null
}

/** Someone on the land or idle who would make something in a failing workshop, and the hand in it
 *  who makes least, to trade places: the one who would make most there, then the one whose own
 *  work is worth least. Never a master from their trade, and never someone from another workshop.
 *  Null when nobody would make anything. */
function betterHand(s: GameState, lk: Look, line: BuildingLine): { into: number; from: number; words: string; who: string; gives: number; out: string; place: string } | null {
  const st = lk.st
  const job: Job = { kind: 'building', line }
  const hands = st.colonists.map((c, i) => ({ c, i })).filter(x => x.c.job.kind === 'building' && x.c.job.line === line)
  if (!hands.length) return null
  const worst = hands.slice().sort((a, b) => gives(s, lk, a.c, job) - gives(s, lk, b.c, job))[0]
  const floor = gives(s, lk, worst.c, job)
  let best: { i: number; there: number; now: number } | null = null
  st.colonists.forEach((c, i) => {
    if (c.job.kind === 'building' && c.job.line === line) return
    if (c.standing === 'master' && c.speciality && ((c.job.kind === 'tile' && c.job.good === c.speciality) || (c.job.kind === 'building' && c.job.line === c.speciality))) return
    // never someone already making something in a workshop: two failing shops would trade the one
    // good hand back and forth, a fix undoing a fix (DECISIONS.md 194)
    if (c.job.kind === 'building') return
    const there = gives(s, lk, c, job)
    if (there <= floor) return
    const now = makesNow(s, lk, c)
    if (!best || there > best.there || (there === best.there && now < best.now)) best = { i, there, now }
  })
  if (!best) return null
  const b = best as { i: number; there: number; now: number }
  const c = st.colonists[b.i]
  return { into: b.i, from: worst.i, words: `${person(c)} ${doing(st, c)}`, who: person(c), gives: b.there, out: person(worst.c), place: jobPlace(st, c.job) }
}

/** One of those on the land making a good the settlement keeps losing, and where they would do some
 *  good instead: a workshop with a place and something to work, or the best free ground for a good
 *  that is not being let go. The one making least of it goes; never a master of it. Null when
 *  nobody makes it on the land or there is nowhere better. */
function lessOf(s: GameState, lk: Look, g: TileGood): { index: number; job: Job; words: string; to: string; short: string; gives: number } | null {
  const st = lk.st
  // horses breed from the herd: fewer on the pasture does not end their spoiling
  if (g === 'horses') return null
  const makers = st.colonists.map((c, i) => ({ c, i })).filter(x => x.c.job.kind === 'tile' && x.c.job.good === g && !(x.c.standing === 'master' && x.c.speciality === g))
  if (!makers.length) return null
  const one = makers.sort((a, b) => makesNow(s, lk, a.c) - makesNow(s, lk, b.c))[0]
  const letGo = (h: GoodId) => (lk.sale[h] ?? 0) > 0 || (lk.spoils[h] ?? 0) > 0 || lk.dumped.has(h)
  let best: { job: Job; gives: number; value: number } | null = null
  for (const line of BUILDING_LINES) {
    const def = C.buildings.lines[line]
    if (!def.input || !def.output || st.buildings[line] === 0 || buildingWorkers(st, line) >= C.labour.workersPerBuilding) continue
    if (line === 'carpenter' && frameWanted(st) <= 0) continue
    if (st.stock[def.input] < C.labour.baseBuildingOutput || (def.secondInput && st.stock[def.secondInput] <= 0)) continue
    const job: Job = { kind: 'building', line }
    const v = gives(s, lk, one.c, job)
    // a refined good is worth more than a raw one
    if (v > 0 && (!best || v * 2 > best.value)) best = { job, gives: v, value: v * 2 }
  }
  for (const h of ['food', 'timber', 'ore', 'flax', 'hemp', 'madder', 'bloom', 'horses'] as TileGood[]) {
    if (h === g || (h !== 'food' && letGo(h))) continue
    const tile = bestTile(s, lk, h, one.c)
    if (tile === null) continue
    const job: Job = { kind: 'tile', tile, good: h }
    const v = gives(s, lk, one.c, job)
    if (v > 0 && (!best || v > best.value)) best = { job, gives: v, value: v }
  }
  if (!best) return null
  const b = best as { job: Job; gives: number; value: number }
  const short = b.job.kind === 'tile' ? b.job.good : `the ${nameOf(st, (b.job as { line: BuildingLine }).line)}`
  return { index: one.i, job: b.job, words: `${person(one.c)} ${doing(st, one.c)}`, to: b.job.kind === 'tile' ? `to the best free ground for ${b.job.good}` : `to ${short}`, short, gives: b.gives }
}

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
  // with no free ground for food, someone on other ground that would grow food switches to it there
  // (decision 197)
  let swap: { index: number; tile: number; from: TileGood; gives: number } | null = null
  if (!sp) st.colonists.forEach((c, i) => {
    if (c.job.kind !== 'tile' || c.job.good === 'food') return
    if (c.standing === 'master' && c.speciality === c.job.good) return
    const v = Math.max(0, tileYield(s, c.job.tile, 'food', c) + lk.mod)
    if (v > 0 && (!swap || v > swap.gives)) swap = { index: i, tile: c.job.tile, from: c.job.good, gives: v }
  })
  const sw = swap as { index: number; tile: number; from: TileGood; gives: number } | null
  out.push({
    key: `hunger:${st.id}`, group: 'hunger', type: 1, title: `${st.name} is running short of food`,
    body: `It eats ${eaten} a turn and grows ${lk.flows.food}${st.foodStore > 0 ? `, and its store lasts ${plural(turns, 'turn')}` : ', and its store is empty'}.${sp ? ` ${cap(sp.words)} could go to the best free ground and grow ${sp.gives} a turn.` : sw ? ` No free ground grows food, but the one on ${sw.from} could grow ${sw.gives} food a turn on the same ground.` : tile === null ? ' No free ground here grows food.' : ''}`,
    explain: `Each person eats ${C.labour.eats === 1 ? 'one' : C.labour.eats} food a turn. Put more people on food tiles, or fewer on everything else.`,
    settlement: st.id, magnitude: st.colonists.length, opens: 'settlement', short: 'Running short of food', good: 'food',
    choices: sp && tile !== null ? [{ label: 'Put someone on food', action: assign(st, sp.index, { kind: 'tile', tile, good: 'food' }) }]
      : sw ? [{ label: `Switch one from ${sw.from} to food`, action: assign(st, sw.index, { kind: 'tile', tile: sw.tile, good: 'food' }) }] : [],
  })
}

function spoilage(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const lost = (Object.entries(lk.spoils) as [GoodId, number][]).sort((a, b) => b[1] - a[1])
  if (!lost.length) return
  const choices: QueueChoice[] = []
  let root = ''
  let line: BuildingLine | undefined
  // the cause before the symptom: a workshop here that would work the good, with someone to put in it
  for (const [g] of lost) {
    const use = usesHere(s, lk, g)
    if (!use) continue
    const bname = nameOf(st, use.line)
    const def = C.buildings.lines[use.line]
    root = ` ${buildingWorkers(st, use.line) === 0 ? `Nobody works the ${bname}` : `The ${bname} has room for one more`}, which turns ${g} into ${def.output === 'frame' ? 'frame' : def.output}: ${use.sp.words} could go there and make ${use.sp.gives} a turn.`
    choices.push({ label: `Staff the ${bname}`, action: assign(st, use.sp.index, { kind: 'building', line: use.line }) })
    line = use.line
    break
  }
  // storage, unless it is already coming; first, once the goods have spoiled turn after turn, so a
  // fix made by hand every turn gives way to the one that ends it
  const store = buildable(s, st).find(b => b.line === 'storage')
  const coming = (st.building && st.building.id.line === 'storage') || st.buildQueue.some(b => b.line === 'storage')
  const storeChoice: QueueChoice | null = store && !coming ? { label: `Build a ${buildingName(store).toLowerCase()} first`, action: { t: 'setBuildOrder', settlement: st.id, queue: [store, ...st.buildQueue] } } : null
  const since = st.conditions['spoilage']
  // lasting once the goods have spoiled for a few turns, or at once where more of the good is made
  // here each turn than is used: the store gains every turn, so the loss comes back every turn, and
  // a consignment by hand only put off the one that ends it (decision 198)
  const gains = (g: GoodId) => ((lk.flows.made as Record<string, number>)[g] ?? 0) - (lk.flows.used[g] ?? 0) > 0
  const lasting = (since !== undefined && s.turn - since >= C.problems.storageFirstAfter) || gains(lost[0][0])
  if (storeChoice && lasting) choices.push(storeChoice)
  // spoiling turn after turn with the store as big as it is going to be soon: more is made than is
  // used, kept or sold, so one of those making it goes where they do some good. Consigning the
  // overflow by hand every turn was the fix the card offered before (DECISIONS.md 194)
  let moveWords = ''
  if (lasting && !storeChoice) {
    for (const [g] of lost) {
      const move = lessOf(s, lk, g as TileGood)
      if (!move) continue
      moveWords = ` ${cap(g)} has spoiled for ${plural(s.turn - since!, 'turn')}: more is made than is used or kept. ${cap(move.words)} could go ${move.to} and make ${move.gives} a turn.`
      choices.push({ label: `Move one from ${g} to ${move.short}`, action: assign(st, move.index, move.job) })
      break
    }
  }
  // goods the orders hold, losing what the store cannot keep: let the orders sell just that, every
  // turn, rather than consign it by hand every turn
  const held = lost.find(([g]) => C.market.goods[g].traded && !isEmbargoed(s, g) && g !== 'tooling' && g !== 'arms' && g !== 'instruments' && surplusRuleFor(st, g).destination.kind === 'hold')
  if (held && lasting && canConsign(s, st).ok) {
    const g = held[0]
    moveWords = moveWords || ` Its orders hold the ${g}, so what the store cannot keep is lost each turn.`
    // the orders keep twice the threshold of horses and of a good a workshop here works, so the
    // threshold is halved there: what they keep is a lot under the store either way
    choices.push({ label: `Sell the ${g} that would spoil, each turn`, action: { t: 'setGoodRule', settlement: st.id, good: g, rule: { destination: { kind: 'consign' }, threshold: overflowThreshold(st, g, lk.cap) } } })
  }
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
  if (storeChoice && !lasting) choices.push(storeChoice)
  // a dribble the orders leave to spoil, short of a consignment's worth (C.market.fullStoreMinSale),
  // while storage that ends it is on its way and nothing else would: the fix is under way, and a
  // card that asked for one timber consigned by hand, turn after turn, went round in circles. It is
  // said again should storage stop coming (decision 198)
  const dribble = lost.every(([g, n]) => n < C.market.fullStoreMinSale && ordersSell(s, st, g))
  if (coming && dribble && !root && !moveWords) return
  out.push({
    key: `spoilage:${st.id}`, group: 'spoilage', type: 1, title: `${st.name} is losing goods`,
    body: `At the end of the turn it loses ${list(lost.map(([g, n]) => `${n} ${g}`))} to spoilage: its store holds ${lk.cap} of each good.${root}${moveWords}${coming ? ` A ${buildingName({ line: 'storage', tier: Math.min(3, st.buildings.storage + 1) as 1 | 2 | 3 }).toLowerCase()} is on its way.` : ''}`,
    explain: 'Goods above storage capacity are lost. Put them to work, consign them, ship them, or build storage.',
    settlement: st.id, magnitude: 2, opens: 'settlement', short: `Losing ${lost[0][0]}`, good: lost[0][0], line, choices,
  })
}

/** Whether what is going up here gets no frame, or no tooling, this turn. */
function stallOf(st: Settlement, flows: Look['flows']): { noFrame: boolean; noTooling: boolean } | null {
  const b = going(st)
  if (!b) return null
  const cost = C.buildings.costs[b.id.tier]!
  const noFrame = cost.frame - b.frame > st.frame && (flows.made.frame ?? 0) <= 0
  const noTooling = cost.tooling - b.tooling > st.stock.tooling && (flows.made.tooling ?? 0) <= 0
  return noFrame || noTooling ? { noFrame, noTooling } : null
}
function stalled(s: GameState, st: Settlement): boolean { return stallOf(st, previewFlows(s, st)) !== null }

/** A building getting no frame, or no tooling: the owner's palisade. */
function buildStalled(s: GameState, lk: Look, out: Problem[]): boolean {
  const st = lk.st
  const b = going(st)
  if (!b) return false
  const cost = C.buildings.costs[b.id.tier]!
  const name = buildingName(b.id).toLowerCase()
  const needF = cost.frame - b.frame, needT = cost.tooling - b.tooling
  const stall = stallOf(st, lk.flows)
  if (!stall) return false
  const { noFrame, noTooling } = stall
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
      } else {
        // nobody spare: the move that costs least, and what it costs (decision 197)
        const lb = leastBad(s, lk, { kind: 'building', line: 'carpenter' })
        if (lb) {
          why += ` Nobody is spare. Moving ${lb.words} there would make ${lb.gives} frame a turn; ${lb.cost}.`
          choices.push({ label: `Move one from ${lb.from} to the ${nameOf(st, 'carpenter')}`, action: assign(st, lb.index, { kind: 'building', line: 'carpenter' }) })
        } else why += ' Everyone here has other work, and none of it could be spared.'
      }
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
    } else if (st.stock.timber + (lk.flows.made.timber ?? 0) > 0) {
      // timber to work, and no frame made of it: the hands in the shop make nothing, by their
      // standing or the settlement's resolve. Until 21 November 2026 this said there was no timber
      // while seventy lay in the store (DECISIONS.md 194)
      why = `The ${nameOf(st, 'carpenter')} has timber, but ${carpenters === 1 ? 'the one who works it makes' : `the ${carpenters} who work it make`} nothing: ${madeNothingWhy(lk, 'carpenter')}.`
      const swap = betterHand(s, lk, 'carpenter')
      if (swap) {
        why += ` ${cap(swap.words)} would make ${swap.gives} frame a turn there, and ${swap.out} could take their place ${swap.place}.`
        choices.push({ label: `Swap in ${swap.who}`, action: { t: 'swapWorkers', settlement: st.id, a: swap.into, b: swap.from } })
      }
      const civic = resolveFix(s, lk)
      if (civic) { why += civic.words; choices.push({ label: civic.label, action: civic.action }) }
    } else {
      why = `The ${nameOf(st, 'carpenter')} has no timber to work.`
      const fix = timberFixes(s, lk, needF - st.frame)
      // timber on its way and nothing else that would help: the stall is being mended, and a card
      // that offered nothing would stand at the top turn after turn (decision 198)
      if (fix.coming && !fix.choices.length) return noFrame
      why += fix.words
      choices.push(...fix.choices)
    }
  } else {
    const n = needT - st.stock.tooling
    const price = buyPrice(s, 'tooling')
    const afford = Math.floor(gold / price)
    why = `It needs ${n} more tooling, and none is held or made here.${trade ? ` The Company sells it at ${price}.` : ''}`
    if (trade && afford > 0) choices.push({ label: `Buy ${Math.min(n, afford)} tooling`, action: { t: 'buy', settlement: st.id, good: 'tooling', amount: Math.min(n, afford) } })
    // short of gold for it: consign what is held to pay for it (decision 197)
    if (trade && afford < n) {
      const pay = payFor(s, st, 'tooling')
      if (pay) { why += pay.words; choices.push(pay.choice) }
    }
    if (st.buildings.toolworks > 0 && buildingWorkers(st, 'toolworks') < C.labour.workersPerBuilding && st.stock.metal > 0) {
      const sp = spareFor(s, lk, { kind: 'building', line: 'toolworks' })
      if (sp) { line = 'toolworks'; choices.push({ label: `Staff the ${nameOf(st, 'toolworks')}`, action: assign(st, sp.index, { kind: 'building', line: 'toolworks' }) }) }
    }
  }
  // nothing can be done now: it can be left, and its card is quiet until something can be (decision
  // 198). Left, it waits as it is, and rises once frame or tooling comes
  if (!choices.length) {
    if (st.conditions['stallLeft'] !== undefined) return noFrame
    why += ' Left for now, it rises when frame comes, and this comes back when something can be done.'
    choices.push({ label: 'Leave it for now', action: { t: 'leaveStall', settlement: st.id } })
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

/** The carpenter's shop standing empty, or with room, while the settlement's orders sell the timber
 *  a build waiting for frame needs. A good that spoils is the spoilage card's, and a good dumped is
 *  the dumping card's, and each offers the workshop first. Only where someone is spare to put there. */
function inputWasted(s: GameState, lk: Look, out: Problem[], frameStalled: boolean) {
  const st = lk.st
  const b = going(st)
  if (!b || frameWanted(st) <= 0 || frameStalled || st.buildings.carpenter === 0) return
  const workers = buildingWorkers(st, 'carpenter')
  if (workers >= C.labour.workersPerBuilding) return
  const sold = lk.sale.timber ?? 0
  if (sold <= 0 || lk.dumped.has('timber') || (lk.spoils.timber ?? 0) > 0) return
  const sp = spareFor(s, lk, { kind: 'building', line: 'carpenter' })
  if (!sp) return
  const bname = nameOf(st, 'carpenter')
  out.push({
    key: `inputWasted:${st.id}`, group: 'inputWasted', type: 4,
    title: `${st.name} sells timber while its ${buildingName(b.id).toLowerCase()} waits for frame`,
    body: `Its orders send ${sold} timber away this turn. ${workers === 0 ? `Nobody works the ${bname}.` : `The ${bname} has room for one more.`} ${cap(sp.words)} could go there and make ${sp.gives} frame a turn from timber.`,
    explain: 'A good a building here works is worth more worked than sold raw, and nothing at all spoiled.',
    settlement: st.id, magnitude: 2, opens: 'settlement', short: workers === 0 ? 'Standing empty' : 'Room for one more', line: 'carpenter', good: 'timber',
    choices: [{ label: `Staff the ${bname}`, action: assign(st, sp.index, { kind: 'building', line: 'carpenter' }) }],
  })
}

/** People in a building with nothing to work, or on ground that gives them nothing. */
function workerWasted(s: GameState, lk: Look, out: Problem[], frameStalled: boolean) {
  const st = lk.st
  const who: number[] = []
  const why: string[] = []
  let line: BuildingLine | undefined
  let swap: (ReturnType<typeof betterHand> & { line: BuildingLine }) | null = null
  for (const l of BUILDING_LINES) {
    const def = C.buildings.lines[l]
    if (!def.output || st.buildings[l] === 0 || buildingWorkers(st, l) === 0) continue
    if ((lk.flows.byLine[l] ?? 0) > 0) continue
    if (l === 'carpenter' && frameStalled) continue
    st.colonists.forEach((c, i) => { if (c.job.kind === 'building' && c.job.line === l) who.push(i) })
    const made = lk.flows.made as Record<string, number>
    const held = st.stock[def.input!] + (made[def.input!] ?? 0) > 0 && (!def.secondInput || st.stock[def.secondInput] + (made[def.secondInput] ?? 0) > 0)
    if (held) {
      // something to work, and nothing made of it: the hands make nothing, and a better hand is the fix
      why.push(`those in the ${nameOf(st, l)} make nothing: ${madeNothingWhy(lk, l)}`)
      swap = swap ?? (() => { const b = betterHand(s, lk, l); return b ? { ...b, line: l } : null })()
    } else {
      const short = def.secondInput && st.stock[def.input!] > 0 ? def.secondInput : def.input!
      why.push(`the ${nameOf(st, l)} has no ${short} to work`)
    }
    line = line ?? l
  }
  st.colonists.forEach((c, i) => {
    if (c.job.kind !== 'tile') return
    if (gives(s, lk, c, c.job) > 0) return
    who.push(i)
    why.push(`the ground one works gives no ${c.job.good}`)
  })
  if (!who.length) return
  // other work only where there is some: the chooser gives back the job they have, or none, and a
  // button that changes nothing is not offered
  const jobs = wouldAssign(s, st, who)
  const moved = who.filter((i, k) => jobs[k].kind !== 'idle' && !sameJob(jobs[k], st.colonists[i].job))
  const first = moved.length ? jobs[who.indexOf(moved[0])] : null
  const civic = why.some(w => w.includes('resolve this low')) ? resolveFix(s, lk)
    : !swap && !first && meetingRoom(st) ? { label: who.length === 1 ? 'Put them in the meeting house' : 'Put one in the meeting house', action: assign(st, who[0], { kind: 'building', line: 'meeting' }), words: ' The meeting house has room, where they would gather grievance against the Company.' }
    : null
  out.push({
    key: `workerWasted:${st.id}`, group: 'workerWasted', type: 4,
    title: who.length === 1 ? `Someone at ${st.name} is working for nothing` : `${who.length} people at ${st.name} are working for nothing`,
    body: `${cap(list(why))}, so ${who.length === 1 ? 'they make' : 'they make'} nothing this turn.${swap ? ` ${cap(swap.words)} would make ${swap.gives} a turn in the ${nameOf(st, swap.line)}, and ${swap.out} could take their place ${swap.place}.` : first ? ` There is work ${jobPlace(st, first)}.` : civic ? '' : ' There is no other work here for them.'}${civic ? civic.words : ''}`,
    explain: 'One body, one job. A job that makes nothing is a body lost.',
    settlement: st.id, magnitude: who.length, opens: 'settlement', short: 'Working for nothing', line: swap?.line ?? line,
    choices: [
      ...(swap ? [{ label: `Swap in ${swap.who}`, action: { t: 'swapWorkers', settlement: st.id, a: swap.into, b: swap.from } }] : []),
      ...(civic ? [{ label: civic.label, action: civic.action }] : []),
      ...(first ? [{ label: who.length === 1 ? `Put them ${jobPlace(st, first)}` : 'Find them all other work', action: { t: 'autoAssign', settlement: st.id, only: who } }] : []),
    ],
  })
}

function idle(s: GameState, lk: Look, out: Problem[]) {
  const st = lk.st
  const idleAt = st.colonists.map((c, i) => c.job.kind === 'idle' ? i : -1).filter(i => i >= 0)
  const clerks = clerksRequired(st.colonists.length)
  const over = idleAt.slice(clerks)
  if (!over.length) return
  // where the chooser behind Put them to work would put them, worked out first: with no free ground
  // and no workshop with work held, it puts nobody to work, and that button is not offered
  const jobs = wouldAssign(s, st, over)
  const placed = over.filter((_, k) => jobs[k].kind !== 'idle')
  const first = placed.length ? jobs[over.indexOf(placed[0])] : null
  const lead = `${clerks ? `Past the ${plural(clerks, 'clerk')} the ledger needs, ` : ''}${over.length === 1 ? 'one stands idle' : `${over.length} stand idle`}.`
  const where = !first ? ' No ground is free and no workshop here has work held for them.'
    : over.length === 1 ? ` There is work ${jobPlace(st, first)}.`
    : placed.length < over.length ? ` There is work for ${placed.length}, ${jobPlace(st, first)} first.` : ` There is work for them all, ${jobPlace(st, first)} first.`
  // with no work the chooser would give, the meeting house where it has room: gathering grievance is
  // work the player chooses to start, so it is offered and never given by default
  const civic = !first ? meetingRoom(st) : 0
  // and new ground: one of them could go out on foot and found a settlement (DECISIONS.md 195)
  const site = !first && st.colonists.length >= C.founding.fromPeople ? bestSites(s, st, 1, { walk: true, seen: true })[0] : undefined
  const choices: QueueChoice[] = []
  if (first) choices.push({ label: placed.length === 1 ? `Put them ${jobPlace(st, first)}` : 'Put them to work', action: { t: 'autoAssign', settlement: st.id, only: placed } })
  // with no good ground seen within a walk, one goes out to look, and stops when they see some
  const look = !first && site === undefined && st.colonists.length >= C.founding.fromPeople && unseenLandNear(s, st.tile, C.autopilot.settleRange.max)
  if (site !== undefined) choices.push({ label: over.length === 1 ? 'Send them out to found' : 'Send one out to found', action: { t: 'equip', settlement: st.id, colonist: over[0], as: 'colonist' } })
  else if (look) choices.push({ label: over.length === 1 ? 'Send them out to look for ground' : 'Send one out to look for ground', action: { t: 'equip', settlement: st.id, colonist: over[0], as: 'colonist', order: { kind: 'explore', until: 'site' } } })
  if (civic) choices.push({ label: over.length === 1 ? 'Put them in the meeting house' : 'Put one in the meeting house', action: assign(st, over[0], { kind: 'building', line: 'meeting' }) })
  out.push({
    key: `idle:${st.id}`, group: 'idle', type: 4,
    title: over.length === 1 ? `Someone at ${st.name} has nothing to do` : `${over.length} people at ${st.name} have nothing to do`,
    body: `${lead}${where}${site !== undefined ? ` Good ground lies ${dist(s.world.width, st.tile, site)} tiles ${compass(s.world.width, st.tile, site)}, where one could found a settlement.` : look ? ' One could go out and look for ground to found a settlement on.' : ''}${civic ? ' The meeting house has room, where they would gather grievance against the Company.' : ''}`,
    explain: 'Tap a person, then pick a tile or a building. One body, one job.',
    settlement: st.id, magnitude: over.length, opens: 'settlement', short: 'Someone idle', choices,
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
  // a suggestion with its reason, from what the settlement is doing now (decision 197): one tap
  // queues it, and the card's Open is the whole catalogue. A small outpost with nothing it could
  // usefully build is not asked: an empty build order there is not something going to waste
  const next = suggestBuild(s, lk)
  if (!next && st.colonists.length < C.problems.buildEmptyFrom) return
  // nor where there is nothing at all it could build now
  if (!next && !buildable(s, st).some(b => !b.imported && canStart(st, b).ok)) return
  const cost = next ? C.buildings.costs[next.id.tier]! : null
  const name = next ? buildingName(next.id).toLowerCase() : ''
  // nothing to suggest because nothing here could be framed: the card says so, and how to get timber.
  // Where timber can be had and nothing here has a reason to be built, nothing is lost: frame made
  // with nothing to build is kept for when something does, and the card would lead nowhere
  const noTimber = !next && !timberToBeHad(s, lk)
  const fix = noTimber ? timberFixes(s, lk, C.buildings.costs[1]!.frame) : null
  if (!next && (!fix || !fix.choices.length)) return
  out.push({
    key: `buildEmpty:${st.id}`, group: 'buildEmpty', type: 4, title: `${st.name} has nothing in its build order`,
    body: next ? `Suggested: ${article(name)} ${name}, because ${next.why}.` : fix ? `It has no timber to make frame from, and every building is made of frame.${fix.words}` : 'Choose what it builds next.',
    explain: 'Buildings cost frame, which a carpenter makes from timber. Higher tiers also need tooling.',
    settlement: st.id, magnitude: 1, opens: 'build', short: 'Nothing in the build order',
    choices: next && cost ? [{ label: `Build ${article(name)} ${name} · ${cost.frame} frame${cost.tooling ? `, ${cost.tooling} tooling` : ''}`, action: { t: 'setBuildOrder', settlement: st.id, queue: [next.id] } }] : fix ? fix.choices : [],
  })
}

function article(word: string): string { return /^[aeiou]/.test(word) ? 'an' : 'a' }

/** The raw goods each workshop turns into something worth more, by the good it takes. */
const REFINES: Partial<Record<GoodId, BuildingLine>> = { ore: 'smelter', flax: 'linenWorks', hemp: 'ropeWorks', madder: 'dyeWorks', bloom: 'still', metal: 'toolworks' }

/** What a settlement with an empty build order would do well to build next, and why, from what it
 *  does now: frame first, then storage for goods that spoil, a workshop for a good it makes or holds
 *  raw, storage for a store nearly full, a school for a settlement big enough to teach, a wharf on a
 *  coast, the next tier of the carpenter's shop. Only what can be built here now. Null when none of
 *  these applies. */
/** Whether a building here could be framed: timber cut here, free to cut, on its way or to be had
 *  from another settlement, or enough held for the cheapest building. Timber held alone, short of
 *  that, ran out at outposts with no forest and left what was suggested stalled for good. */
function timberToBeHad(s: GameState, lk: Look): boolean {
  const st = lk.st
  return ((lk.flows.made as Record<string, number>).timber ?? 0) > 0 || bestTile(s, lk, 'timber') !== null || timberSender(s, st) !== null
    || shipFrom(s, st, 'timber') !== null || st.stock.timber + st.frame >= C.buildings.costs[1]!.frame
}

function suggestBuild(s: GameState, lk: Look): { id: BuildId; why: string } | null {
  const st = lk.st
  const can = buildable(s, st).filter(b => !b.imported && canStart(st, b).ok)
  const want = (line: BuildingLine) => can.find(b => b.line === line) ?? null
  const made = lk.flows.made as Record<string, number>
  if (!timberToBeHad(s, lk)) return null
  // and frame takes two pairs of hands, one cutting and one in the shop, unless the timber for it is
  // already held: a settlement of one with none held is not asked to build
  if (st.colonists.length < 2 && st.stock.timber < C.buildings.costs[1]!.frame) return null
  const carpenter = want('carpenter')
  if (carpenter && st.buildings.carpenter === 0) return { id: carpenter, why: 'nothing here makes frame, and every building is made of it' }
  const store = want('storage')
  const lost = (Object.entries(lk.spoils) as [GoodId, number][]).sort((a, b) => b[1] - a[1])[0]
  if (store && lost) return { id: store, why: `${lost[1]} ${lost[0]} spoil each turn, and it holds ${C.buildings.storage[store.tier]} of each good where the store holds ${lk.cap}` }
  for (const [g, line] of Object.entries(REFINES) as [GoodId, BuildingLine][]) {
    const w = want(line)
    if (!w || st.buildings[line] > 0) continue
    if ((made[g] ?? 0) > 0 || st.stock[g] >= C.onboarding.refiningUnlockCrop) {
      const out = C.buildings.lines[line].output
      return { id: w, why: `it turns the ${g} ${(made[g] ?? 0) > 0 ? 'made' : 'held'} here into ${out === 'frame' ? 'frame' : out}, worth more than the ${g}` }
    }
  }
  const full = (Object.entries(lk.after) as [GoodId, number][]).find(([g, n]) => g !== 'food' && n >= lk.cap * 0.8)
  if (store && full) return { id: store, why: `the store is nearly full of ${full[0]}, and it holds ${C.buildings.storage[store.tier]} of each good` }
  const school = want('school')
  if (school && st.colonists.some(c => c.standing === 'debtor' || c.standing === 'contracted')) return { id: school, why: 'a school teaches debtors and those under contract, who make less in a workshop' }
  const wharf = want('wharf')
  if (wharf && st.buildings.wharf === 0) return { id: wharf, why: 'ships are built and mended at a wharf' }
  const sawmill = carpenter && carpenter.tier === 2 ? carpenter : null
  if (sawmill) return { id: sawmill, why: 'it makes frame faster than the carpenter\'s shop' }
  const works = want('works')
  if (works && works.tier === 1) return { id: works, why: 'works are what hold a settlement when the Company comes for it' }
  const stable = want('stable')
  if (stable && st.stock.horses >= 2) return { id: stable, why: `it breeds ${C.buildings.stableHorseBonus} more horses a turn from the ${st.stock.horses} held here` }
  const press = want('press')
  if (press && st.buildings.press === 0 && buildingWorkers(st, 'meeting') > 0) return { id: press, why: `the meeting house here gathers ${Math.round((C.grievance.pressMultiplier - 1) * 100)} per cent more grievance with a press beside it` }
  return null
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
  // other work for the teachers only where the chooser has some to give
  const elsewhere = next < 0 && wouldAssign(s, st, at).some((j, k) => !sameJob(j, st.colonists[at[k]].job))
  out.push({
    key: `schoolIdle:${st.id}`, group: 'schoolIdle', type: 4, title: `The ${bname} at ${st.name} has nobody to teach`,
    body: next >= 0 ? `${cap(plural(teachers.length, 'teacher'))} and no one being taught. ${cap(person(st.colonists[next]))} ${doing(st, st.colonists[next])} could be.` : `Nobody here can be taught by ${teachers.length === 1 ? 'its teacher' : 'its teachers'}.`,
    settlement: st.id, magnitude: 1, opens: 'school', short: 'Nobody to teach', line: 'school',
    choices: next >= 0 ? [{ label: 'Teach someone', action: { t: 'educate', settlement: st.id, colonist: next } }] : elsewhere ? [{ label: at.length === 1 ? 'Find the teacher other work' : 'Find the teachers other work', action: { t: 'autoAssign', settlement: st.id, only: at } }] : [],
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
    // the card is about the orders, not the price: once nothing sells the good any more it goes,
    // and the price mends on its own (DECISIONS.md 194)
    // and orders that sell only what the store cannot keep are not dumping: holding that would spoil
    // it, which is worse than a low price
    const sellers = looks.filter(lk => sellsMoreThanOverflow(s, lk.st, g, lk.cap))
    if (!sellers.length) continue
    let fix: QueueChoice | null = null, root = ''
    let at: Settlement | undefined
    for (const lk of sellers) {
      const use = usesHere(s, lk, g)
      if (!use) continue
      const st = lk.st
      const def = C.buildings.lines[use.line]
      const bname = nameOf(st, use.line)
      root = ` ${buildingWorkers(st, use.line) === 0 ? `Nobody at ${st.name} works the ${bname}` : `The ${bname} at ${st.name} has room for one more`}, which would turn it into ${def.output === 'frame' ? 'frame' : def.output}.`
      fix = { label: `Staff the ${bname}`, action: assign(st, use.sp.index, { kind: 'building', line: use.line }) }
      at = st
      break
    }
    const worst = at ?? sellers.map(lk => lk.st).sort((a, b) => b.stock[g] - a.stock[g])[0]
    // where the store is full of it, holding would spoil it: sell only what would spoil there instead
    const full = sellers.find(lk => lk.after[g] >= lk.cap)
    const overflow: QueueChoice | null = full ? { label: `Sell only the ${g} that would spoil at ${full.st.name}`, action: { t: 'setGoodRule', settlement: full.st.id, good: g, rule: { destination: { kind: 'consign' }, threshold: overflowThreshold(full.st, g, full.cap) } } } : null
    out.push({
      key: `dumping:${g}`, group: 'dumping', type: 1, title: `Your standing orders are dumping ${g}`,
      body: `${g} stands at ${d.price}, ${d.below} below where it would be with nothing sold, and ${d.autoShare} of that fall is your own automatic selling. Each lot fetches less than the last.${root}`,
      explain: 'A standing order sells everything above its threshold every turn, and the Company pays less the more it is sent. Hold the good until the price mends, raise its threshold, or sell it in smaller lots.',
      settlement: worst?.id, magnitude: d.below, opens: 'orders', short: `Dumping ${g}`, good: g,
      choices: [...(fix ? [fix] : []), ...(overflow ? [overflow] : []), { label: `Hold ${g} everywhere`, action: { t: 'setGoodRule', settlement: -1, good: g, rule: { destination: { kind: 'hold' } } } }],
    })
  }
}

/** A unit's problems: an explorer with nothing left to find, a circuit that carries nothing. */
function unitProblems(s: GameState, out: Problem[]) {
  let unexplored: boolean | null = null
  for (const u of s.units) {
    if (u.owner !== 0 || !u.order) continue
    if (u.order.kind === 'explore' && !isHull(u.kind)) {
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
      // a stall left for now is forgotten once it is over, so the next one is asked about
      if (st.conditions['stallLeft'] !== undefined && !stalled(s, st)) delete st.conditions['stallLeft']
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
    unit: p.unit, tile: p.tile, magnitude: p.magnitude, since, choices: p.choices, opens: p.opens, short: p.short,
  }
}
