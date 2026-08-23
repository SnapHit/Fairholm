// Read-only views of the state for the settlement screen. The simulation is not changed to suit the
// screen; anything the screen needs that the simulation does not already expose is derived here from
// what it does expose. Nothing in this file mutates anything.

import type {
  GameState, Settlement, Colonist, GoodId, TileGood, BuildingLine, BuildId, PrimeId,
} from '../sim/state'
import { GOODS, BUILDING_LINES } from '../sim/state'
import { C } from '../sim/constants'
import {
  workableTiles, tileOffers, tileYield, workerOutput, buildingWorkers,
} from '../sim/labour'
import {
  previewProduction, buildable, buildingName, storageCapacity, outputModifier, effectiveTier, canStart,
} from '../sim/settlement'
import { sellPrice, canConsign } from '../sim/market'
import { tileLook, tileWords, type TileLook } from '../render/tiles'

/** The one place a good becomes a word. A good with no entry here renders as its id, not undefined. */
export const GOOD_WORDS: Record<GoodId, string> = {
  food: 'Food', timber: 'Timber', gold: 'Gold', horses: 'Horses', ore: 'Ore', metal: 'Metal',
  tooling: 'Tooling', arms: 'Arms', flax: 'Flax', linen: 'Linen', hemp: 'Hemp', cordage: 'Cordage',
  madder: 'Madder', dye: 'Dye', bloom: 'Bloom', attar: 'Attar', cores: 'Cores', instruments: 'Instruments',
}

export function goodWord(g: GoodId | 'frame' | 'grievance'): string {
  if (g === 'frame') return 'Frame'
  if (g === 'grievance') return 'Grievance'
  return GOOD_WORDS[g] ?? g
}

/** What a building line does when it makes nothing. */
export function lineRole(l: BuildingLine): string {
  switch (l) {
    case 'meeting': return 'gathers grievance'
    case 'press': return 'spreads grievance'
    case 'school': return 'teaches'
    case 'storage': return 'holds more'
    case 'stable': return 'breeds horses'
    case 'wharf': return 'builds hulls'
    case 'works': return 'defends'
    case 'agentOffice': return 'more Word'
    case 'consignment': return 'sells surplus'
    default: return ''
  }
}

/** Lines that take workers even though they make no good. */
const STAFFED_WITHOUT_OUTPUT: BuildingLine[] = ['meeting', 'press', 'school', 'agentOffice']

export function takesWorkers(l: BuildingLine): boolean {
  return !!C.buildings.lines[l].output || STAFFED_WITHOUT_OUTPUT.includes(l)
}

// ---- the ring -----------------------------------------------------------------------------------

export interface RingWorker { index: number; colonist: Colonist; good: TileGood; yield: number }

export interface RingCell {
  /** 0 to 8 in reading order; 4 is the settlement itself. */
  slot: number
  tile: number | null           // null when the ring runs off the edge of the map
  centre: boolean
  look: TileLook | null
  words: string
  offers: TileGood[]
  best: { good: TileGood; yield: number } | null
  worker: RingWorker | null
  available: boolean
  reason: string | null
}

/** The nine tiles a settlement works, in reading order, with everything the ring draws. */
export function ringCells(s: GameState, st: Settlement): RingCell[] {
  const w = s.world.width, h = s.world.height
  const cx = st.tile % w, cy = Math.floor(st.tile / w)
  const reach = workableTiles(s, st)
  const out: RingCell[] = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const slot = (dy + 1) * 3 + (dx + 1)
    const x = cx + dx, y = cy + dy
    if (x < 0 || y < 0 || x >= w || y >= h) {
      out.push({ slot, tile: null, centre: false, look: null, words: 'Off the map', offers: [], best: null, worker: null, available: false, reason: 'Beyond the edge of the map.' })
      continue
    }
    const tile = y * w + x
    const t = s.world.tiles[tile]
    const centre = tile === st.tile
    const look = tileLook(s, tile)
    const offers = tileOffers(t)
    let best: { good: TileGood; yield: number } | null = null
    for (const g of offers) {
      const v = tileYield(s, tile, g, null)
      if (v > 0 && (!best || v > best.yield)) best = { good: g, yield: v }
    }
    let worker: RingWorker | null = null
    st.colonists.forEach((c, i) => {
      if (c.job.kind === 'tile' && c.job.tile === tile) worker = { index: i, colonist: c, good: c.job.good, yield: tileYield(s, tile, c.job.good, c) }
    })
    let available = reach.includes(tile)
    let reason: string | null = null
    if (t.worked !== null && t.worked !== st.id) { available = false; reason = `Worked by ${s.settlements[t.worked]?.name ?? 'another settlement'}.` }
    else if (t.owner !== null && t.owner !== st.owner) { available = false; reason = `${s.charters[t.owner]?.name ?? 'Another charter'} holds this ground.` }
    else if (s.predecessors.some(p => p.territory.includes(tile))) { available = false; reason = 'This is predecessor ground.' }
    else if (!best) { available = false; reason = 'Nothing grows or is dug here.' }
    out.push({ slot, tile, centre, look, words: tileWords(look), offers, best, worker, available: centre ? false : available, reason: centre ? 'The settlement works its own ground for nothing.' : reason })
  }
  return out
}

// ---- buildings ----------------------------------------------------------------------------------

export interface BuildingSlot {
  line: BuildingLine
  tier: number
  name: string
  built: boolean
  /** How the line reads in one short phrase: "flax to linen", or what it does instead. */
  conversion: string
  workers: { index: number; colonist: Colonist }[]
  capacity: number
  output: number
  outputWord: string | null
  warning: string | null
  /** Set on a slot that is not built yet: what it would cost and what gates it. */
  option: BuildId | null
  cost: string | null
  gate: string | null
}

/** Per-line output for the coming turn. Mirrors previewProduction in the simulation, which returns
 *  totals per good rather than per line; the numbers are the same, split by the building making them. */
export function buildingOutputs(s: GameState, st: Settlement): Partial<Record<BuildingLine, number>> {
  const mod = outputModifier(s, st)
  const made = previewProduction(s, st)
  const out: Partial<Record<BuildingLine, number>> = {}
  for (const line of BUILDING_LINES) {
    const def = C.buildings.lines[line]
    if (!def.output || st.buildings[line] === 0) continue
    const tier = effectiveTier(st, line)
    let cap = 0
    for (const c of st.colonists) {
      if (c.job.kind === 'building' && c.job.line === line) cap += Math.max(0, workerOutput(c, line) + mod) * C.labour.tierMultiplier[tier]
    }
    let possible = Math.min(cap, st.stock[def.input!] + (made[def.input!] ?? 0))
    if (def.secondInput) possible = Math.min(possible, st.stock[def.secondInput] + (made[def.secondInput] ?? 0))
    out[line] = Math.max(0, possible)
  }
  return out
}

/** An imported machine whose age has overtaken its base risk is near failure. Both terms come from
 *  the constants, so this moves with them rather than carrying a threshold of its own. */
export function machineNearFailure(s: GameState, st: Settlement, line: BuildingLine): boolean {
  const m = st.imported[line]
  if (!m) return false
  if (m.starved > 0) return true
  const years = (s.turn - m.boughtTurn) / C.session.turnsPerYear
  return years * C.buildings.importedFailPerYear >= C.buildings.importedFailBase
}

function conversionWords(line: BuildingLine): string {
  const def = C.buildings.lines[line]
  if (def.output && def.input) {
    const second = def.secondInput ? ` and ${GOOD_WORDS[def.secondInput].toLowerCase()}` : ''
    return `${GOOD_WORDS[def.input].toLowerCase()}${second} to ${def.output === 'frame' ? 'frame' : GOOD_WORDS[def.output].toLowerCase()}`
  }
  return lineRole(line)
}

/** Every building this settlement holds, then everything it could build, in one list. Slots fill the
 *  left flank top to bottom, then the right, then the overflow row. */
export function buildingSlots(s: GameState, st: Settlement): BuildingSlot[] {
  const outputs = buildingOutputs(s, st)
  const slots: BuildingSlot[] = []
  for (const line of BUILDING_LINES) {
    const tier = st.buildings[line]
    if (tier === 0) continue
    const def = C.buildings.lines[line]
    const workers: { index: number; colonist: Colonist }[] = []
    st.colonists.forEach((c, i) => { if (c.job.kind === 'building' && c.job.line === line) workers.push({ index: i, colonist: c }) })
    let warning: string | null = null
    if (def.input && workers.length > 0 && st.stock[def.input] <= 0) warning = `No ${GOOD_WORDS[def.input].toLowerCase()} to work with.`
    if (machineNearFailure(s, st, line)) warning = st.imported[line]!.starved > 0 ? 'The machine is starved of instruments.' : 'The machine is wearing out.'
    slots.push({
      line, tier, name: buildingName({ line, tier: tier as 1 | 2 | 3 }), built: true,
      conversion: conversionWords(line),
      workers, capacity: takesWorkers(line) ? C.labour.workersPerBuilding : 0,
      output: Math.round(outputs[line] ?? 0),
      outputWord: def.output ? (def.output === 'frame' ? 'frame' : GOOD_WORDS[def.output]) : null,
      warning, option: null, cost: null, gate: null,
    })
  }
  for (const b of buildable(s, st)) {
    const cost = C.buildings.costs[b.tier]!
    const start = canStart(st, b)
    slots.push({
      line: b.line, tier: b.tier, name: buildingName(b), built: false,
      conversion: conversionWords(b.line), workers: [], capacity: 0, output: 0, outputWord: null,
      warning: null, option: b,
      cost: b.imported ? `${C.buildings.importedMachineGold} gold` : `${cost.frame} frame${cost.tooling ? `, ${cost.tooling} tooling` : ''}`,
      gate: start.ok ? null : (start.reason ?? null),
    })
  }
  return slots
}

// ---- who can work what --------------------------------------------------------------------------

export interface Candidate {
  index: number
  colonist: Colonist
  /** What they would make there, per turn. */
  amount: number
  /** Where they are now, in words. */
  now: string
  /** True when taking this place means the two of them trade places. */
  swap: boolean
}

/** Everyone in the settlement, best first, for a tile and a good. */
export function tileCandidates(s: GameState, st: Settlement, tile: number, good: TileGood): Candidate[] {
  const holder = st.colonists.findIndex(c => c.job.kind === 'tile' && c.job.tile === tile)
  const rows: Candidate[] = []
  st.colonists.forEach((c, i) => {
    if (i === holder) return
    rows.push({ index: i, colonist: c, amount: tileYield(s, tile, good, c), now: jobWords(s, st, c), swap: holder >= 0 && c.job.kind !== 'idle' })
  })
  rows.sort((a, b) => b.amount - a.amount || a.index - b.index)
  return rows
}

/** Everyone in the settlement, best first, for a building line. */
export function buildingCandidates(s: GameState, st: Settlement, line: BuildingLine): Candidate[] {
  const mod = outputModifier(s, st)
  const tier = effectiveTier(st, line)
  const inside = st.colonists.some(c => c.job.kind === 'building' && c.job.line === line)
  const full = buildingWorkers(st, line) >= C.labour.workersPerBuilding
  const rows: Candidate[] = []
  st.colonists.forEach((c, i) => {
    if (c.job.kind === 'building' && c.job.line === line) return
    const per = C.buildings.lines[line].output ? Math.max(0, workerOutput(c, line) + mod) * C.labour.tierMultiplier[tier] : 0
    rows.push({ index: i, colonist: c, amount: per, now: jobWords(s, st, c), swap: full && inside && c.job.kind !== 'idle' })
  })
  rows.sort((a, b) => b.amount - a.amount || a.index - b.index)
  return rows
}

/** Where one colonist would be useful: the ring cells that would yield and the slots with room. */
export function destinationsFor(s: GameState, st: Settlement, colonist: number): { tiles: Set<number>; lines: Set<BuildingLine> } {
  const c = st.colonists[colonist]
  const tiles = new Set<number>()
  const lines = new Set<BuildingLine>()
  if (!c) return { tiles, lines }
  for (const cell of ringCells(s, st)) {
    if (!cell.tile || !cell.available || !cell.best) continue
    // somewhere someone already works is not a free destination; a swap is offered by tapping it
    if (cell.worker) continue
    if (tileYield(s, cell.tile, cell.best.good, c) > 0) tiles.add(cell.tile)
  }
  for (const line of BUILDING_LINES) {
    if (st.buildings[line] === 0 || !takesWorkers(line)) continue
    if (c.job.kind === 'building' && c.job.line === line) continue
    if (buildingWorkers(st, line) >= C.labour.workersPerBuilding) continue
    lines.add(line)
  }
  return { tiles, lines }
}

export function jobWords(s: GameState, st: Settlement, c: Colonist): string {
  if (c.job.kind === 'idle') return 'idle'
  if (c.job.kind === 'tile') return `${GOOD_WORDS[c.job.good]} ${tileYield(s, c.job.tile, c.job.good, c)}`
  return buildingName({ line: c.job.line, tier: 1 })
}

export function standingWords(c: Colonist): string {
  if (c.standing !== 'master' || !c.speciality) return c.standing
  const sp = (GOOD_WORDS[c.speciality as GoodId] ?? buildingName({ line: c.speciality as BuildingLine, tier: 1 })).toLowerCase()
  return `master of ${sp}`
}

/** One letter for the ring's worker mark. */
export function standingMark(c: Colonist): string {
  return c.standing === 'master' ? 'M' : c.standing === 'free' ? 'F' : c.standing === 'contracted' ? 'C' : 'D'
}

// ---- goods --------------------------------------------------------------------------------------

export interface GoodChip {
  good: GoodId
  stock: number
  capacity: number
  spoiling: boolean
  price: number | null
  made: number
}

/** What is stored against capacity, what is about to spoil, what it fetches. */
export function goodsStrip(s: GameState, st: Settlement): GoodChip[] {
  const cap = storageCapacity(st)
  const made = previewProduction(s, st)
  const out: GoodChip[] = []
  for (const g of GOODS) {
    const stock = st.stock[g]
    const m = made[g] ?? 0
    if (stock <= 0 && m <= 0) continue
    out.push({
      good: g, stock, capacity: cap,
      spoiling: g !== 'food' && stock > cap,
      price: C.market.goods[g].traded ? sellPrice(s, g) : null,
      made: m,
    })
  }
  out.sort((a, b) => (b.spoiling ? 1 : 0) - (a.spoiling ? 1 : 0) || b.stock - a.stock)
  return out
}

export function consignable(s: GameState, st: Settlement): { ok: boolean; reason?: string } {
  return canConsign(s, st)
}

/** The player's own settlements in id order, for the header's previous and next. */
export function ownSettlements(s: GameState): Settlement[] {
  return s.settlements.filter(x => x.owner === 0)
}

export type { PrimeId }
