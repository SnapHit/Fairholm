// Colonists, jobs, education and standing. Colonists and labour brief. Word accrues from consigned
// value (remaining systems proposal section 7) and is credited here when payments land.

import { C, difficultyOf } from './constants'
import type { GameState, Settlement, Colonist, Tile, TileGood, BuildingLine, Standing, TurnContext, Speciality } from './state'
import type { System } from './turn'
import { neighbours8 } from './worldgen'

/** The nine tiles a settlement works: its own and the eight around it. Art brief section 3. */
export function workableTiles(s: GameState, st: Settlement): number[] {
  return [st.tile, ...neighbours8(s.world.width, s.world.height, st.tile)]
}

/** Does a tile yield this good at all, ignoring who works it? */
export function tileOffers(t: Tile): TileGood[] {
  const out: TileGood[] = []
  const base = C.terrain.yields[t.terrain]
  if (t.forest) {
    out.push('timber')
    if (base.food) out.push('food')
  } else {
    for (const g of Object.keys(base) as TileGood[]) out.push(g)
  }
  if (t.prime === 'seam' && t.goldReserve > 0) out.push('gold')
  if (t.workings && !out.includes('ore')) out.push('ore')
  return out
}

/** Yield of one tile for one good, with all modifiers. A master of the good doubles it. */
export function tileYield(s: GameState, tileIdx: number, good: TileGood, worker: Colonist | null): number {
  const t = s.world.tiles[tileIdx]
  const base = C.terrain.yields[t.terrain]
  let v = 0
  if (good === 'timber') {
    if (!t.forest) return 0
    v = C.terrain.forestTimber[t.forest]
  } else if (good === 'gold') {
    if (t.prime !== 'seam' || t.goldReserve <= 0) return 0
    v = C.terrain.goldYield
  } else {
    v = base[good] ?? 0
    if (t.forest && good === 'food') v = Math.min(v, C.terrain.forestFoodCap)
    if (t.forest && good !== 'food') return 0
    if (good === 'ore' && t.workings) v += C.terrain.workingsOre
  }
  if (v <= 0) return 0
  // primes
  if (t.prime && t.prime !== 'seam') {
    const p = C.terrain.primes[t.prime]
    if (p.good === good) v = p.kind === 'multiply' ? v * C.terrain.primeMultiply : v + C.terrain.primeFlat
  }
  // rivers and improvement, which apply to the primary (first listed) yield of the terrain
  const primary = t.forest ? 'timber' : (Object.keys(base)[0] as TileGood)
  if (good === primary || (t.forest && good === 'timber')) {
    if (t.river === 1) v += C.terrain.minorRiverBonus
    if (t.river === 2) v += C.terrain.majorRiverBonus
    if (t.improved && !t.forest) v += C.terrain.ploughBonus
  }
  if (worker && worker.standing === 'master' && worker.speciality === good) v *= C.terrain.masterMultiply
  return Math.floor(v)
}

/** Output of one building worker per turn, before tier multiplier. */
export function workerOutput(worker: Colonist, line: BuildingLine): number {
  const base = C.labour.baseBuildingOutput
  if (worker.standing === 'master') return worker.speciality === line ? base * C.labour.masterMultiplier : base
  return Math.max(0, base - C.labour.standingPenalty[worker.standing])
}

export function clerksRequired(pop: number): number {
  if (pop < C.labour.clerkFirstAt) return 0
  return 1 + Math.floor((pop - C.labour.clerkFirstAt) / C.labour.clerkEvery)
}

export function population(st: Settlement): number {
  return st.colonists.length
}

export function nextStanding(st: Standing): Standing | null {
  const i = ['debtor', 'contracted', 'free', 'master'].indexOf(st)
  return i < 3 ? (['contracted', 'free', 'master'][i] as Standing) : null
}

export function passageCost(s: GameState): number {
  const ch = s.charters[0]
  let cost = C.labour.firstPassageWord + ch.passages * C.labour.passageWordStep
  if (ch.signatories.includes(11)) cost = Math.round(cost * C.grievance.signatoryPassageDiscount)
  return cost
}

export function goldPassageCost(s: GameState): number {
  const ch = s.charters[0]
  let cost = C.labour.goldPassageBase + ch.passages * C.labour.goldPassageStep
  if (ch.signatories.includes(11)) cost = Math.round(cost * C.grievance.signatoryPassageDiscount)
  return cost
}

/** Where an arriving colonist lands: the settlement at the player's Landing, else the nearest coastal one. */
export function landingSettlement(s: GameState): Settlement | null {
  const landing = s.charters[0].landing
  const own = s.settlements.filter(st => st.owner === 0)
  if (!own.length) return null
  const at = own.find(st => st.tile === landing)
  if (at) return at
  const w = s.world.width
  const d = (a: number, b: number) => Math.max(Math.abs(a % w - b % w), Math.abs(Math.floor(a / w) - Math.floor(b / w)))
  return own.slice().sort((a, b) => d(a.tile, landing) - d(b.tile, landing))[0]
}

export function makeColonist(s: GameState, standing: Standing, speciality: Speciality | null = null): Colonist {
  return { id: s.nextId++, standing, speciality, job: { kind: 'idle' }, arrived: s.turn }
}

/** Credit Word for consigned value. Called by the market when a consignment is made. */
export function wordForValue(s: GameState, value: number): number {
  const d = difficultyOf(s.settings.difficulty)
  let word = value / d.wordPerValue
  const hasAgentOffice = s.settlements.some(st => st.owner === 0 && st.buildings.agentOffice > 0)
  if (hasAgentOffice) word *= C.labour.agentOfficeWord
  return word
}

/** Pick a job for a new arrival based on the settlement's purpose and what is free. */
export function defaultJob(s: GameState, st: Settlement): Colonist['job'] {
  const purpose = st.orders.purpose
  const tiles = workableTiles(s, st)
  const free = tiles.filter(t => {
    const tile = s.world.tiles[t]
    if (tile.worked !== null && tile.worked !== st.id) return false
    return !st.colonists.some(c => c.job.kind === 'tile' && c.job.tile === t)
  })
  const want = (good: TileGood) => {
    let best = -1, bestV = 0
    for (const t of free) {
      const v = tileYield(s, t, good, null)
      if (v > bestV) { bestV = v; best = t }
    }
    return best >= 0 ? { kind: 'tile' as const, tile: best, good } : null
  }
  // a settlement keeps itself fed first
  const fed = foodBalance(s, st)
  if (fed < C.labour.eats) { const j = want('food'); if (j) return j }
  if (purpose !== 'ask' && purpose !== 'industry' && purpose !== 'civic') { const j = want(purpose); if (j) return j }
  if (purpose === 'industry') {
    for (const line of ['carpenter', 'smelter', 'toolworks', 'armoury', 'linenWorks', 'ropeWorks', 'dyeWorks', 'still', 'finishing'] as BuildingLine[]) {
      if (st.buildings[line] > 0 && buildingWorkers(st, line) < C.labour.workersPerBuilding && st.stock[C.buildings.lines[line].input!] > 0) return { kind: 'building', line }
    }
  }
  if (purpose === 'civic' && st.buildings.meeting > 0 && buildingWorkers(st, 'meeting') < C.labour.workersPerBuilding) return { kind: 'building', line: 'meeting' }
  for (const g of ['food', 'timber', 'ore', 'flax', 'hemp', 'madder', 'bloom', 'horses'] as TileGood[]) { const j = want(g); if (j) return j }
  return { kind: 'idle' }
}

export function buildingWorkers(st: Settlement, line: BuildingLine): number {
  let n = 0
  for (const c of st.colonists) if (c.job.kind === 'building' && c.job.line === line) n++
  return n
}

/** Food produced minus food eaten this turn, at current assignments. */
export function foodBalance(s: GameState, st: Settlement): number {
  let food = 0
  for (const c of st.colonists) if (c.job.kind === 'tile' && c.job.good === 'food') food += tileYield(s, c.job.tile, 'food', c)
  // the settlement's own tile is worked for free for food
  food += tileYield(s, st.tile, 'food', null)
  return food - st.colonists.length * C.labour.eats
}

/** Word and passage, turn loop step 8. */
export const labourSystem: System = {
  id: 'labour',
  enabled: c => c.flags.labour,
  resolve(s: GameState, ctx: TurnContext) {
    const ch = s.charters[0]
    // payments in transit land here; gold and word are credited
    const due = s.company.payments.filter(p => p.due <= s.turn)
    if (due.length) {
      let gold = 0, word = 0
      for (const p of due) { gold += p.gold; word += p.word }
      ch.gold += gold
      ch.word += word
      s.company.payments = s.company.payments.filter(p => p.due > s.turn)
      if (gold > 0) ctx.log({ kind: 'company', text: `Payment landed: ${Math.round(gold)} gold for consigned freight.`, why: 'Consignments are paid when the crossing completes.' })
    }
    // immigration
    // passages stop while a wave is at sea, and for good once the charter is torn up and won
    const blockaded = s.declaration?.declared && (s.declaration.won || s.declaration.waves.some(w => !w.landed))
    let guard = 0
    while (!blockaded && ch.word >= passageCost(s) && guard++ < 3) {
      const dest = landingSettlement(s)
      if (!dest) break
      ch.word -= passageCost(s)
      ch.passages++
      const col = makeColonist(s, 'debtor')
      col.job = defaultJob(s, dest)
      dest.colonists.push(col)
      ctx.log({ kind: 'growth', text: `A settler took passage and came ashore at ${dest.name}.`, why: 'Word of the colony travelled home with the freight.', settlement: dest.id })
    }
    // education
    for (const st of s.settlements) {
      if (st.owner !== 0 || !st.education) continue
      const teacher = st.colonists.find(c => c.job.kind === 'building' && c.job.line === 'school')
      if (!teacher) continue
      st.education.turnsLeft--
      if (st.education.turnsLeft > 0) continue
      const student = st.colonists.find(c => c.id === st.education!.colonist)
      st.education = null
      if (!student) continue
      const up = nextStanding(student.standing)
      if (!up) continue
      if (up === 'master') {
        if (teacher.standing !== 'master' || !teacher.speciality) continue
        if (C.labour.predecessorSkills.includes(teacher.speciality as TileGood) === false) {
          student.standing = 'master'
          student.speciality = teacher.speciality
        } else continue
      } else {
        student.standing = up
      }
      ctx.log({ kind: 'growth', text: `${st.name}: a colonist completed schooling and now stands ${student.standing}.`, settlement: st.id })
    }
  },
  queueItems: () => [],
}
