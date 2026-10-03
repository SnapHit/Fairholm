// Every mutation is an action. Nothing writes to state except applyAction. This buys undo, the
// dispatch log and determinism in one move, and makes the read-only rule for /ui and /render
// enforceable. Build specification section 3.
//
// A game begins at sea: the lander is a unit, and the first settlement is founded from it with the
// `found` action, which a colonist uses afterwards to found the next. There is no landing action
// and no offered site.

import { C, SCHEMA_VERSION, WORLDGEN_VERSION, difficultyOf } from './constants'
import type { GameState, Settings, Job, BuildId, GoodId, UnitOrder, Charter, SignatoryCategory, Difficulty, Pace, LandKind, HullKind, Purpose, SurplusDestination, GrowthRule, MapSize, LandShape, Unit, TurnContext } from './state'
import { GOODS, emptyStock } from './state'
import { seedRng, playRng, fork, next } from './rng'
import { generateWorld, worldToState, describeSite, type World } from './worldgen'
import { foundSettlement, foundingProblem, buildable, canStart, completeBuilding, syncWorkedTiles, isCoastalSettlement, storageCapacity } from './settlement'
import { consign, buyFromCompany, answerDemand, canConsign, buyPrice } from './market'
import { makeColonist, defaultJob, workableTiles, tileYield, buildingWorkers, goldPassageCost, landingSettlement, tileOffers } from './labour'
import { initMarket } from './market'
import { runTurn, makeContext, pushDispatch } from './turn'
import { SYSTEMS } from './systems'
import { deriveQueue, noteUnresolved } from './queue'
import { findPath, advance, makeUnit, equipCost, cargoCapacity, isHull, isAfloat, maxMoves } from './units'
import { neighbours8, isLand } from './worldgen'
import { declareIndependence } from './fleet'
import { attackWith } from './military'
import { reveal } from './fog'
import { offerToPredecessor, learnFromPredecessor, stationAgent, scoutPredecessor } from './predecessors'
import { buildHull, raidTarget } from './naval'
import { signatoryList } from './grievance'

export type Action =
  | { t: 'assignWorker'; settlement: number; colonist: number; job: Job }
  | { t: 'autoAssign'; settlement: number }
  | { t: 'setBuildOrder'; settlement: number; queue: BuildId[] }
  | { t: 'setStandingOrder'; settlement: number; rule: 'purpose' | 'surplus' | 'growth'; value: unknown }
  | { t: 'reviewOrders'; settlement: number }
  | { t: 'renameSettlement'; settlement: number; name: string }
  | { t: 'consign'; settlement: number; good: GoodId; amount: number }
  | { t: 'buy'; settlement: number; good: GoodId; amount: number }
  | { t: 'buyImported'; settlement: number; line: BuildId['line'] }
  | { t: 'buyPassage' }
  | { t: 'educate'; settlement: number; colonist: number }
  | { t: 'equip'; settlement: number; colonist: number; as: LandKind }
  | { t: 'disband'; unit: number }
  | { t: 'moveUnit'; unit: number; path: number[] }
  | { t: 'setUnitOrder'; unit: number; order: UnitOrder | null }
  /** A colonist founds where it stands; the lander founds on the shore tile beside it. */
  | { t: 'found'; unit: number; tile?: number; name?: string }
  /** One of the lander's passengers steps ashore onto a land tile beside it, to scout on foot: the
   *  one at `aboard` in the lander's list, or the last aboard when none is named. */
  | { t: 'disembark'; unit: number; tile: number; aboard?: number }
  /** A colonist beside the lander climbs back aboard. */
  | { t: 'embark'; unit: number; lander: number }
  | { t: 'attack'; unit: number; tile: number }
  | { t: 'load'; unit: number; good: GoodId; amount: number }
  | { t: 'unload'; unit: number; good: GoodId; amount: number }
  | { t: 'improve'; unit: number; task: 'road' | 'clear' | 'plough' }
  | { t: 'buildHull'; settlement: number; hull: HullKind }
  | { t: 'offer'; unit: number; predecessor: number; good: GoodId; amount: number; haggle: boolean }
  | { t: 'learn'; unit: number; predecessor: number }
  | { t: 'stationAgent'; unit: number; predecessor: number }
  | { t: 'answerDemand'; accept: boolean }
  | { t: 'setSignatoryTarget'; category: SignatoryCategory }
  | { t: 'declare' }
  | { t: 'lowerDifficulty'; difficulty: Difficulty }
  | { t: 'setIntent'; text: string }
  | { t: 'setPace'; pace: Pace }
  | { t: 'setAudio'; audio: Partial<Settings['audio']> }
  | { t: 'markExplained'; key: string }
  | { t: 'dismiss'; key: string }
  | { t: 'endTurn' }

export const DEFAULT_SETTINGS: Settings = {
  size: 'small',
  shape: 'continent',
  landArea: 0,
  roughness: 0.5,
  temperature: 0.5,
  moisture: 0.5,
  abundance: 0.5,
  predecessorDensity: 0.5,
  crossing: 'standard',
  difficulty: 'generous',
  turns: C.session.sizes.small.turns,
  pace: 'normal',
  audio: { on: true, muted: false, volume: C.feel.audio.defaultVolume, track: 0 },
  firstGame: true,
}

export function settingsFor(partial: Partial<Settings>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...partial, audio: { ...DEFAULT_SETTINGS.audio, ...(partial.audio ?? {}) } }
  if (!partial.turns) s.turns = C.session.sizes[s.size].turns
  return s
}

function makeCharter(id: number, name: string, colour: string, player: boolean, landing: number, charge: number): Charter {
  return {
    id, name, colour, player, gold: 0, word: 0, passages: 0, grievance: 0, grievanceTotal: 0, signatories: [], signatoryTarget: 'trade',
    relation: 'peace', suspicion: 0, strength: 0, expansion: 0, declared: false, independent: false, fell: false, landing, charge,
    unlocked: {}, explained: {},
  }
}

/** Create a new game at turn one, at sea. The world is generated here, and every charter's lander
 *  is put down at its splashdown with its people and stores aboard. Nothing is ashore yet. */
export function createGame(seed: string, partial: Partial<Settings>, now: number): GameState {
  const settings = settingsFor(partial)
  const world: World = generateWorld(seed, settings)
  const diff = difficultyOf(settings.difficulty)
  const charters: Charter[] = []
  const splash = (i: number) => world.splashdowns[i] ?? world.splashdowns[0] ?? 0
  charters.push(makeCharter(0, 'Your charter', C.art.palette.player, true, splash(0), diff.openingCharge))
  for (let i = 0; i < C.rivals.count; i++) {
    charters.push(makeCharter(i + 1, C.rivals.names[i], C.rivals.colours[i], false, splash(i + 1), diff.openingCharge))
  }
  const s: GameState = {
    schemaVersion: SCHEMA_VERSION,
    worldgenVersion: WORLDGEN_VERSION,
    seed,
    settings,
    turn: 1,
    world: worldToState(world),
    charters,
    settlements: [],
    units: [],
    predecessors: world.predecessors,
    market: initMarket(charters.length),
    company: { charge: diff.openingCharge, nextDemandTurn: diff.turnsBetweenDemands, demand: null, embargoed: [], embargoShield: 0, fleetStrength: C.military.fleetBase, fleetPool: null, payments: [], demandsAccepted: 0 },
    declaration: null,
    dispatch: [],
    intent: 'Find a coast and go ashore.',
    flags: { ...C.flags },
    rng: { world: seedRng(seed + ':world:' + WORLDGEN_VERSION), play: playRng(now) },
    nextId: 1,
    telemetry: { firstConsignment: null, secondSettlement: null, foldOpened: null, founded: null },
    opportunitiesShown: {},
    actionsThisTurn: 0,
    transits: [],
  }
  const problem = (world as World & { problem?: string }).problem
  if (problem) s.flags['worldgenProblem'] = true
  charters[0].gold = C.onboarding.startingGold
  // the landers, down in open sea. The player's carries the starting colonists, the first of them
  // contracted and the rest in debt, and the stores; a rival's people are abstract until it founds
  for (let i = 0; i < charters.length; i++) {
    if (world.splashdowns[i] === undefined) continue
    const lander = makeUnit(s, i, 'lander', world.splashdowns[i], null)
    if (i === 0) {
      for (let k = 0; k < diff.startingColonists; k++) lander.aboard.push(makeColonist(s, k === 0 ? 'contracted' : 'debtor'))
      for (const g of Object.keys(C.onboarding.startingStock) as GoodId[]) { const n = C.onboarding.startingStock[g] ?? 0; if (n > 0) lander.cargo[g] = n }
    }
    lander.moves = maxMoves(lander)
    s.units.push(lander)
  }
  pushDispatch(s, { turn: 1, kind: 'event', text: 'The lander is down and steaming in open sea. Land is near, just out of sight. Sail and look, and go ashore where you choose.', why: 'The Company sent you on what cores it had left. No one is waiting.' })
  reveal(s)
  return s
}

/** One line of plain characterisation of the ground around a tile, for the founding preview. */
export function describeTile(s: GameState, tile: number): string {
  return describeSite(s.world.width, s.world.height, s.world.tiles, tile)
}

function settlementOf(s: GameState, i: number) {
  const st = s.settlements[i]
  if (!st || st.owner !== 0) throw new Error('not your settlement')
  return st
}
function unitOf(s: GameState, id: number): Unit {
  const u = s.units.find(x => x.id === id)
  if (!u || u.owner !== 0) throw new Error('not your unit')
  return u
}

/** The settlement a unit can load from and unload to: the one it stands in, or, for a ship, one
 *  on the shore beside it. A ship may unload onto any coastal tile, and a settlement there takes
 *  the goods; bare shore has nowhere to put them. */
function settlementToTrade(s: GameState, u: Unit) {
  const at = s.settlements.find(x => x.tile === u.tile && x.owner === 0)
  if (at || !isAfloat(u.kind)) return at
  const beside = neighbours8(s.world.width, s.world.height, u.tile)
  return s.settlements.find(x => x.owner === 0 && beside.includes(x.tile))
}

/** Apply one action. Mutates and returns the same state object. Throws on an invalid action, which
 * the interface treats as "nothing happened". */
export function applyAction(s: GameState, a: Action): GameState {
  const ctx = makeContext(s)
  applyOne(s, a, ctx)
  // whatever moved, the ground in its sight is known now
  reveal(s)
  return s
}

function applyOne(s: GameState, a: Action, ctx: TurnContext): GameState {
  switch (a.t) {
    case 'assignWorker': {
      const st = settlementOf(s, a.settlement)
      const col = st.colonists[a.colonist]
      if (!col) throw new Error('no such colonist')
      if (a.job.kind === 'tile') {
        if (!workableTiles(s, st).includes(a.job.tile)) throw new Error('tile out of reach')
        const t = s.world.tiles[a.job.tile]
        if (t.worked !== null && t.worked !== st.id) throw new Error('tile worked by another settlement')
        const target = a.job.tile
        if (st.colonists.some((c, i) => i !== a.colonist && c.job.kind === 'tile' && c.job.tile === target)) throw new Error('tile already worked')
        if (tileYield(s, a.job.tile, a.job.good, col) <= 0 && !tileOffers(t).includes(a.job.good)) throw new Error('tile does not yield that')
      }
      if (a.job.kind === 'building') {
        if (st.buildings[a.job.line] === 0) throw new Error('no such building')
        if (buildingWorkers(st, a.job.line) >= C.labour.workersPerBuilding && !(col.job.kind === 'building' && col.job.line === a.job.line)) throw new Error('building full')
      }
      col.job = a.job
      syncWorkedTiles(s)
      s.actionsThisTurn++
      return s
    }
    case 'autoAssign': {
      const st = settlementOf(s, a.settlement)
      for (const c of st.colonists) if (c.job.kind === 'idle') c.job = defaultJob(s, st)
      syncWorkedTiles(s)
      s.actionsThisTurn++
      return s
    }
    case 'setBuildOrder': {
      const st = settlementOf(s, a.settlement)
      const allowed = buildable(s, st)
      st.buildQueue = a.queue.filter(b => allowed.some(x => x.line === b.line && x.tier === b.tier && !!x.imported === !!b.imported) || st.buildQueue.some(x => x.line === b.line && x.tier === b.tier))
      if (st.buildQueue.length) delete st.conditions['buildEmpty']
      s.actionsThisTurn++
      return s
    }
    case 'setStandingOrder': {
      const st = settlementOf(s, a.settlement)
      if (a.rule === 'purpose') st.orders.purpose = a.value as Purpose | 'ask'
      if (a.rule === 'surplus') st.orders.surplus = a.value as { threshold: number; destination: SurplusDestination }
      if (a.rule === 'growth') st.orders.growth = a.value as GrowthRule
      s.actionsThisTurn++
      return s
    }
    case 'reviewOrders': {
      const st = settlementOf(s, a.settlement)
      st.orders.reviewed = true
      delete st.conditions['reviewOrders']
      return s
    }
    case 'renameSettlement': {
      const st = settlementOf(s, a.settlement)
      st.name = a.name.trim().slice(0, 24) || st.name
      st.nameChosen = true
      return s
    }
    case 'consign': {
      const st = settlementOf(s, a.settlement)
      const ok = canConsign(s, st)
      if (!ok.ok) throw new Error(ok.reason)
      const r = consign(s, st, a.good, a.amount, ctx)
      if (r.units === 0) throw new Error('nothing consigned')
      s.charters[0].unlocked.market = true
      s.actionsThisTurn++
      return s
    }
    case 'buy': {
      const st = settlementOf(s, a.settlement)
      const ok = canConsign(s, st)
      if (!ok.ok) throw new Error(ok.reason)
      const n = buyFromCompany(s, st, a.good, a.amount)
      if (n === 0) throw new Error('cannot afford')
      ctx.log({ kind: 'market', text: `${st.name} bought ${n} ${a.good} from the Company at ${buyPrice(s, a.good)}.`, settlement: st.id })
      s.actionsThisTurn++
      return s
    }
    case 'buyImported': {
      const st = settlementOf(s, a.settlement)
      const ch = s.charters[0]
      if (st.buildings[a.line] !== 2) throw new Error('needs the tier-two building first')
      if (ch.gold < C.buildings.importedMachineGold) throw new Error('cannot afford')
      const ok = canStart(st, { line: a.line, tier: 3 })
      if (!ok.ok) throw new Error(ok.reason)
      ch.gold -= C.buildings.importedMachineGold
      completeBuilding(s, st, { line: a.line, tier: 3, imported: true }, ctx)
      ctx.log({ kind: 'company', text: `${st.name} bought an imported machine. It runs on Instruments the Company sells, and it will fail one day.`, why: 'A machine you cannot mend is a subscription.', settlement: st.id })
      s.actionsThisTurn++
      return s
    }
    case 'buyPassage': {
      const ch = s.charters[0]
      const cost = goldPassageCost(s)
      if (ch.gold < cost) throw new Error('cannot afford')
      const dest = landingSettlement(s)
      if (!dest) throw new Error('no settlement at the Landing')
      ch.gold -= cost
      ch.passages++
      const col = makeColonist(s, 'debtor')
      col.job = defaultJob(s, dest)
      dest.colonists.push(col)
      ctx.log({ kind: 'growth', text: `You paid ${cost} gold for a passage. A settler came ashore at ${dest.name}, owing the Company for the trip.`, settlement: dest.id })
      s.actionsThisTurn++
      return s
    }
    case 'educate': {
      const st = settlementOf(s, a.settlement)
      if (st.buildings.school === 0) throw new Error('no school')
      const col = st.colonists[a.colonist]
      if (!col || col.standing === 'master') throw new Error('nothing to learn')
      st.education = { colonist: col.id, turnsLeft: C.labour.educationCycle[st.buildings.school] }
      s.actionsThisTurn++
      return s
    }
    case 'equip': {
      const st = settlementOf(s, a.settlement)
      const col = st.colonists[a.colonist]
      if (!col) throw new Error('no such colonist')
      const cost = equipCost(a.as)
      for (const g of Object.keys(cost) as GoodId[]) if (st.stock[g] < (cost[g as keyof typeof cost] ?? 0)) throw new Error(`needs ${cost[g as keyof typeof cost]} ${g}`)
      for (const g of Object.keys(cost) as GoodId[]) st.stock[g] -= cost[g as keyof typeof cost] ?? 0
      st.colonists.splice(a.colonist, 1)
      col.job = { kind: 'idle' }
      const u = makeUnit(s, 0, a.as, st.tile, col)
      s.units.push(u)
      syncWorkedTiles(s)
      s.actionsThisTurn++
      return s
    }
    case 'disband': {
      const u = unitOf(s, a.unit)
      const st = s.settlements.find(x => x.tile === u.tile && x.owner === 0)
      if (!st) throw new Error('must be at a settlement')
      // equipment returns to stock, the person returns to the roster
      const cost = equipCost(u.kind as LandKind)
      for (const g of Object.keys(cost) as GoodId[]) st.stock[g] += cost[g as keyof typeof cost] ?? 0
      if (u.kind === 'damagedBattery') st.stock.arms -= Math.floor(C.military.units.battery.arms / 2)
      for (const g of Object.keys(u.cargo) as GoodId[]) st.stock[g] += u.cargo[g] ?? 0
      if (u.colonist) { u.colonist.job = defaultJob(s, st); st.colonists.push(u.colonist) }
      s.units = s.units.filter(x => x !== u)
      syncWorkedTiles(s)
      s.actionsThisTurn++
      return s
    }
    case 'moveUnit': {
      const u = unitOf(s, a.unit)
      const dest = a.path[a.path.length - 1]
      if (dest === undefined) throw new Error('empty path')
      const path = findPath(s, u, u.tile, dest)
      if (!path) throw new Error('no route')
      u.path = path
      u.order = path.length ? { kind: 'goto', tile: dest } : null
      delete u.since['contact']
      delete u.since['idle']
      advance(s, u)
      if (u.path.length === 0) u.order = null
      arriveAtSettlement(s, u)
      s.actionsThisTurn++
      return s
    }
    case 'setUnitOrder': {
      const u = unitOf(s, a.unit)
      u.order = a.order
      delete u.since['contact']
      delete u.since['idle']
      if (a.order && a.order.kind === 'goto') { u.path = findPath(s, u, u.tile, a.order.tile) ?? [] }
      s.actionsThisTurn++
      return s
    }
    case 'found': {
      const u = unitOf(s, a.unit)
      const w = s.world.width, h = s.world.height
      const own = s.settlements.filter(x => x.owner === 0)
      if (u.kind === 'lander') {
        // the lander beaches on the shore beside it and is consumed; everyone aboard is the
        // settlement's people, the stores are its stores, and the boat it carried is the first ship
        if (!u.aboard.length) throw new Error('No one is aboard to found with.')
        if (a.tile === undefined) throw new Error('Choose the shore to beach on.')
        if (!neighbours8(w, h, u.tile).includes(a.tile)) throw new Error('The lander must lie beside the shore it beaches on.')
        const problem = foundingProblem(s, a.tile)
        if (problem) throw new Error(`Not there: ${problem}.`)
        const first = own.length === 0
        const st = foundSettlement(s, a.tile, 0, u.aboard, a.name ?? (first ? C.lander.firstName : undefined))
        st.nameChosen = first
        u.aboard = []
        for (const g of Object.keys(u.cargo) as GoodId[]) {
          const n = u.cargo[g] ?? 0
          if (g === 'food') st.foodStore += n
          else st.stock[g] += n
        }
        s.units.push(makeUnit(s, 0, C.lander.boat, u.tile, null))
        s.units = s.units.filter(x => x !== u)
        if (first) {
          s.charters[0].landing = st.tile
          s.telemetry.founded = s.turn
          s.intent = `Get ${st.name} fed. Put people on food and timber.`
          s.company.nextDemandTurn = s.turn + Math.max(C.market.demandFirstTurn, difficultyOf(s.settings.difficulty).turnsBetweenDemands)
          ctx.log({ kind: 'event', text: `The lander beached and ${st.name} was founded from what came out of it. The boat it carried is yours. The Company has written the lander off against your passage.`, why: 'The first metal in the colony is the thing that brought you.', settlement: st.id })
        } else {
          ctx.log({ kind: 'event', text: `${st.name} was founded from the lander.`, settlement: st.id })
        }
        s.actionsThisTurn++
        return s
      }
      if (u.kind !== 'colonist' || !u.colonist) throw new Error('Only a colonist or the lander can found.')
      if (!own.length) throw new Error('The lander founds the first settlement. Beach it first.')
      if (a.tile !== undefined && a.tile !== u.tile) throw new Error('A colonist founds where it stands.')
      const problem = foundingProblem(s, u.tile)
      if (problem) throw new Error(`Not here: ${problem}.`)
      const st = foundSettlement(s, u.tile, 0, [u.colonist], a.name)
      s.units = s.units.filter(x => x !== u)
      const count = s.settlements.filter(x => x.owner === 0).length
      if (count === 2 && s.telemetry.secondSettlement === null) s.telemetry.secondSettlement = s.turn
      if (count >= 2) s.charters[0].unlocked.orders = true
      ctx.log({ kind: 'event', text: `${st.name} was founded. Its standing orders were inferred from the ground around it.`, settlement: st.id })
      s.actionsThisTurn++
      return s
    }
    case 'disembark': {
      const u = unitOf(s, a.unit)
      if (u.kind !== 'lander') throw new Error('Only the lander carries people.')
      if (!u.aboard.length) throw new Error('No one is aboard.')
      const w = s.world.width, h = s.world.height
      if (!neighbours8(w, h, u.tile).includes(a.tile)) throw new Error('The shore must be beside the lander.')
      const t = s.world.tiles[a.tile]
      if (!isLand(t) || t.terrain === 'mountain') throw new Error('Not onto that.')
      // the last aboard steps off unless one is named, so the contracted colonist at the head of the
      // list stays to found by default
      const idx = a.aboard ?? u.aboard.length - 1
      if (idx < 0 || idx >= u.aboard.length) throw new Error('No one of that number is aboard.')
      const col = u.aboard.splice(idx, 1)[0]
      const scout = makeUnit(s, 0, 'colonist', a.tile, col)
      scout.moves = 0
      s.units.push(scout)
      s.actionsThisTurn++
      return s
    }
    case 'embark': {
      const u = unitOf(s, a.unit)
      const lander = unitOf(s, a.lander)
      if (u.kind !== 'colonist' || !u.colonist) throw new Error('Only a colonist can go aboard.')
      if (lander.kind !== 'lander') throw new Error('That is not the lander.')
      const w = s.world.width, h = s.world.height
      if (!neighbours8(w, h, lander.tile).includes(u.tile)) throw new Error('The colonist must be beside the lander.')
      lander.aboard.push(u.colonist)
      s.units = s.units.filter(x => x !== u)
      s.actionsThisTurn++
      return s
    }
    case 'attack': {
      const u = unitOf(s, a.unit)
      attackWith(s, u, a.tile, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'load': {
      const u = unitOf(s, a.unit)
      const st = settlementToTrade(s, u)
      if (!st) throw new Error('must be at a settlement')
      const held = Object.values(u.cargo).reduce((x, y) => x + (y ?? 0), 0)
      const room = cargoCapacity(u) - held
      const n = Math.max(0, Math.min(a.amount, st.stock[a.good], room))
      if (n <= 0) throw new Error('no room or nothing to load')
      st.stock[a.good] -= n
      u.cargo[a.good] = (u.cargo[a.good] ?? 0) + n
      s.actionsThisTurn++
      return s
    }
    case 'unload': {
      const u = unitOf(s, a.unit)
      const st = settlementToTrade(s, u)
      if (!st) throw new Error('must be at a settlement')
      const n = Math.min(a.amount, u.cargo[a.good] ?? 0)
      if (n <= 0) throw new Error('nothing to unload')
      u.cargo[a.good] = (u.cargo[a.good] ?? 0) - n
      if ((u.cargo[a.good] ?? 0) <= 0) delete u.cargo[a.good]
      st.stock[a.good] += n
      s.actionsThisTurn++
      return s
    }
    case 'improve': {
      const u = unitOf(s, a.unit)
      if (u.kind !== 'improver') throw new Error('only an improver can')
      const t = s.world.tiles[u.tile]
      if (a.task === 'road' && t.road) throw new Error('already a road')
      if (a.task === 'clear' && !t.forest) throw new Error('nothing to clear')
      if (a.task === 'plough' && (t.improved || t.forest || t.terrain === 'water' || t.terrain === 'mountain')) throw new Error('cannot plough here')
      u.order = { kind: 'improve', tasks: [{ tile: u.tile, task: a.task }] }
      u.progress = 0
      delete u.since['idle']
      s.actionsThisTurn++
      return s
    }
    case 'buildHull': {
      const st = settlementOf(s, a.settlement)
      buildHull(s, st, a.hull, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'offer': {
      const u = unitOf(s, a.unit)
      offerToPredecessor(s, u, a.predecessor, a.good, a.amount, a.haggle, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'learn': {
      const u = unitOf(s, a.unit)
      learnFromPredecessor(s, u, a.predecessor, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'stationAgent': {
      const u = unitOf(s, a.unit)
      stationAgent(s, u, a.predecessor, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'answerDemand': {
      if (!s.company.demand) throw new Error('no demand open')
      answerDemand(s, a.accept, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'setSignatoryTarget': {
      s.charters[0].signatoryTarget = a.category
      return s
    }
    case 'declare': {
      declareIndependence(s, ctx)
      s.actionsThisTurn++
      return s
    }
    case 'lowerDifficulty': {
      const order: Difficulty[] = ['generous', 'standard', 'hard', 'punitive']
      if (order.indexOf(a.difficulty) >= order.indexOf(s.settings.difficulty)) throw new Error('raising requires a new game')
      s.settings.difficulty = a.difficulty
      ctx.log({ kind: 'note', text: `The charter was renegotiated to ${a.difficulty} terms.` })
      return s
    }
    case 'setIntent': {
      s.intent = a.text.slice(0, 120)
      return s
    }
    case 'setPace': {
      s.settings.pace = a.pace
      return s
    }
    case 'setAudio': {
      s.settings.audio = { ...s.settings.audio, ...a.audio }
      return s
    }
    case 'markExplained': {
      s.charters[0].explained[a.key] = true
      return s
    }
    case 'dismiss': {
      s.opportunitiesShown[a.key] = (s.opportunitiesShown[a.key] ?? 0) + 2
      return s
    }
    case 'endTurn': {
      if (s.turn === 0) throw new Error('not landed')
      const q = deriveQueue(s, SYSTEMS)
      noteUnresolved(s, q, text => pushDispatch(s, { turn: s.turn, kind: 'note', text }))
      runTurn(s, SYSTEMS)
      updateIntent(s)
      return s
    }
  }
  return s
}

/** A unit arriving at one of the player's settlements joins it if it was sent there. */
export function arriveAtSettlement(s: GameState, u: Unit) {
  if (u.kind !== 'colonist' || !u.colonist) return
  if (!u.order || u.order.kind !== 'goto') return
  const st = s.settlements.find(x => x.tile === u.tile && x.owner === 0)
  if (!st || u.path.length) return
  if (u.order.tile !== u.tile) return
  // a colonist walking home joins the roster
  u.colonist.job = defaultJob(s, st)
  st.colonists.push(u.colonist)
  s.units = s.units.filter(x => x !== u)
}

/** The persistent objective line, onboarding brief section 10. Early concrete, later the real one. */
export function updateIntent(s: GameState) {
  if (s.intent && !s.intent.startsWith('Get ') && !s.intent.startsWith('Consign') && !s.intent.startsWith('Found') && !s.intent.startsWith('Build') && !s.intent.startsWith('You owe') && !s.intent.startsWith('Choose')) return
  const own = s.settlements.filter(st => st.owner === 0)
  const home = own[0]
  if (!home) return
  const fed = home.lastProduced.food !== undefined && home.lastProduced.food >= home.colonists.length * C.labour.eats
  if (!fed) { s.intent = `Get ${home.name} fed. Put people on food and timber.`; return }
  if (s.telemetry.firstConsignment === null) { s.intent = 'Consign something to the Company and watch what it pays.'; return }
  if (own.length < 2) { s.intent = 'Found a second settlement where the ground is different.'; return }
  if (!own.some(st => Object.values(C.buildings.lines).some((l, i) => l.output && l.output !== 'frame' && st.buildings[Object.keys(C.buildings.lines)[i] as keyof typeof st.buildings] > 0 && st.colonists.some(c => c.job.kind === 'building' && c.job.line === Object.keys(C.buildings.lines)[i])))) {
    s.intent = 'Build something that refines. Raw goods cap low; refined goods do not.'; return
  }
  s.intent = C.session.intentDefault
}

export { deriveQueue, SYSTEMS, next, fork, storageCapacity, isCoastalSettlement, isHull, maxMoves, GOODS, emptyStock, signatoryList, raidTarget, scoutPredecessor, type MapSize, type LandShape }
