// Fairholm state definitions. One plain-data object, serialisable at any instant.
// No class instances, no Maps keyed by object identity, no functions, no DOM references.
// See build-specification section 3. Nothing in /sim imports from /render, /ui or window.

// ---------------------------------------------------------------------------------------------
// Goods. Eighteen tradeable goods per the naming brief section 4. Frame is NOT one of them; it is
// an internal construction accumulator held on the settlement as `frame`.
// ---------------------------------------------------------------------------------------------
export type GoodId =
  | 'food' | 'timber' | 'gold' | 'horses'
  | 'ore' | 'metal' | 'tooling' | 'arms'
  | 'flax' | 'linen'
  | 'hemp' | 'cordage'
  | 'madder' | 'dye'
  | 'bloom' | 'attar' | 'cores'
  | 'instruments'

export const GOODS: GoodId[] = [
  'food', 'timber', 'gold', 'horses',
  'ore', 'metal', 'tooling', 'arms',
  'flax', 'linen', 'hemp', 'cordage', 'madder', 'dye',
  'bloom', 'attar', 'cores',
  'instruments',
]

/** Goods a tile can yield when worked. */
export type TileGood = 'food' | 'timber' | 'ore' | 'gold' | 'horses' | 'flax' | 'hemp' | 'madder' | 'bloom'

// ---------------------------------------------------------------------------------------------
// Terrain. Eight base types and four forested variants, remaining systems proposal section 6.
// ---------------------------------------------------------------------------------------------
export type TerrainId = 'grassland' | 'plains' | 'downs' | 'marsh' | 'highland' | 'mountain' | 'dry' | 'water'
export type ForestId = 'lightWoodland' | 'deepTimber' | 'highlandForest' | 'coastalScrub'

/** Prime resources. Some multiply the yield, some add a flat amount. */
export type PrimeId =
  | 'richSoil'      // food x2
  | 'pasture'       // horses +2
  | 'stand'         // timber +2 (forested only)
  | 'lode'          // ore x2
  | 'seam'          // gold: the tile carries a hidden reserve
  | 'flaxField'     // flax x2
  | 'hempField'     // hemp +2
  | 'madderBed'     // madder x2
  | 'bloomMeadow'   // bloom x2
  | 'shoal'         // food +2 on water

export interface Tile {
  terrain: TerrainId
  forest: ForestId | null
  river: 0 | 1 | 2
  road: boolean
  improved: boolean
  prime: PrimeId | null
  goldReserve: number          // hidden, generated, depletes
  owner: number | null         // charter index
  worked: number | null        // settlement index
  workings: boolean            // old workings: visual history and a small ore bonus
  explored: boolean            // whether the player has seen this tile
}

/** The subset of Tile that play can change and a save therefore records. */
export type TileDelta = Partial<Pick<Tile, 'forest' | 'road' | 'improved' | 'goldReserve' | 'owner' | 'worked' | 'workings' | 'explored'>>

export interface RiverSegment {
  tiles: number[]              // tile indices from source to mouth
  major: boolean
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------
export type Standing = 'debtor' | 'contracted' | 'free' | 'master'
export const STANDINGS: Standing[] = ['debtor', 'contracted', 'free', 'master']

/** What a master can be a master of. The four predecessor-only specialities are the crops. */
export type Speciality = TileGood | BuildingLine

export type Job =
  | { kind: 'tile'; tile: number; good: TileGood }
  | { kind: 'building'; line: BuildingLine }
  | { kind: 'idle' }

export interface Colonist {
  id: number
  standing: Standing
  speciality: Speciality | null
  job: Job
  arrived: number              // turn
}

// ---------------------------------------------------------------------------------------------
// Buildings. Each line has up to three tiers. Tier 0 means absent.
// ---------------------------------------------------------------------------------------------
export type BuildingLine =
  | 'carpenter' | 'smelter' | 'toolworks' | 'armoury'
  | 'linenWorks' | 'ropeWorks' | 'dyeWorks'
  | 'still' | 'finishing'
  | 'meeting' | 'press' | 'school' | 'storage' | 'stable' | 'wharf' | 'works'
  | 'agentOffice' | 'consignment'

export const BUILDING_LINES: BuildingLine[] = [
  'carpenter', 'smelter', 'toolworks', 'armoury',
  'linenWorks', 'ropeWorks', 'dyeWorks',
  'still', 'finishing',
  'meeting', 'press', 'school', 'storage', 'stable', 'wharf', 'works',
  'agentOffice', 'consignment',
]

/** A build identifier is a line plus the tier it raises to, or an imported machine at tier 3. */
export interface BuildId {
  line: BuildingLine
  tier: 1 | 2 | 3
  imported?: boolean
}

export interface BuildProgress {
  id: BuildId
  frame: number                // Frame applied so far
  tooling: number              // Tooling applied so far
}

export interface ImportedMachine {
  boughtTurn: number
  starved: number              // consecutive turns without Instruments
}

// ---------------------------------------------------------------------------------------------
// Standing orders, turn queue brief section 3
// ---------------------------------------------------------------------------------------------
export type Purpose = 'food' | 'timber' | 'ore' | 'gold' | 'horses' | 'flax' | 'hemp' | 'madder' | 'bloom' | 'industry' | 'civic'

export type SurplusDestination =
  | { kind: 'consign' }
  | { kind: 'hold' }
  | { kind: 'ship'; settlement: number }
  | { kind: 'offer'; predecessor: number }
  | { kind: 'ask' }

export type GrowthRule =
  | { kind: 'keep' }
  | { kind: 'send'; settlement: number }
  | { kind: 'ask' }

export interface StandingOrders {
  purpose: Purpose | 'ask'
  surplus: { threshold: number; destination: SurplusDestination }
  growth: GrowthRule
  reviewed: boolean            // the one-tap founding review has been done
}

// ---------------------------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------------------------
export interface Settlement {
  id: number
  name: string
  tile: number
  owner: number                // charter index
  founded: number              // turn
  colonists: Colonist[]
  stock: Record<GoodId, number>
  frame: number                // internal construction accumulator
  foodStore: number            // surplus food banked toward growth
  hunger: number               // consecutive turns of food deficit
  buildings: Record<BuildingLine, number>   // tier held, 0 if absent
  imported: Partial<Record<BuildingLine, ImportedMachine>>
  buildQueue: BuildId[]
  building: BuildProgress | null
  orders: StandingOrders
  grievance: number            // accumulated, for resolve
  resolve: number              // 0..1, stored so it can decay
  education: { colonist: number; turnsLeft: number } | null
  conditions: Record<string, number>  // condition key -> turn it began. The only stored queue input
  lastProduced: Partial<Record<GoodId, number>>   // for the sheet and the dispatch
  /** Rival settlements carry an abstract size instead of colonists. */
  abstractPop: number
  nameChosen: boolean
}

// ---------------------------------------------------------------------------------------------
// Units. Equipment defines the unit, not a type, per military brief section 1.
// ---------------------------------------------------------------------------------------------
export type LandKind = 'colonist' | 'militia' | 'outrider' | 'battery' | 'damagedBattery' | 'improver' | 'hauler'
export type HullKind = 'lighter' | 'trader' | 'raider' | 'cutter'
export type CompanyKind = 'regulars' | 'horse' | 'siegeTrain' | 'damagedSiegeTrain' | 'companyShip'
export type UnitKind = LandKind | HullKind | CompanyKind
export type Quality = 'raw' | 'hardened' | 'sworn'

export type UnitOrder =
  | { kind: 'explore' }
  | { kind: 'goto'; tile: number }
  | { kind: 'garrison'; settlement: number }
  | { kind: 'patrol'; tiles: number[]; next: number }
  | { kind: 'haul'; stops: HaulStop[]; next: number; risk: 'avoid' | 'run' | 'escort' }
  | { kind: 'improve'; tasks: ImproveTask[] }
  | { kind: 'reserve' }
  | { kind: 'screen'; settlement: number }

export interface HaulStop {
  settlement: number
  load: Partial<Record<GoodId, number>>     // take up to this much
  unload: Partial<Record<GoodId, number>>   // leave up to this much, or 'all' when the amount is large
}

export interface ImproveTask {
  tile: number
  task: 'road' | 'clear' | 'plough'
}

export interface Unit {
  id: number
  owner: number
  kind: UnitKind
  tile: number
  quality: Quality
  moves: number                // remaining this turn
  cargo: Partial<Record<GoodId, number>>
  colonist: Colonist | null    // the body inside a land unit, returned when disbanded
  order: UnitOrder | null
  path: number[]
  damage: number               // hulls: lost speed and capacity
  progress: number             // improver work done on current task; breach progress for siege trains
  since: Record<string, number>
  flagged: boolean             // raiders: false means unflagged and unattributed
}

// ---------------------------------------------------------------------------------------------
// Charters. Index 0 is always the player.
// ---------------------------------------------------------------------------------------------
export type Relation = 'peace' | 'tense' | 'war'
export type SignatoryCategory = 'trade' | 'land' | 'arms' | 'voice'

export interface Charter {
  id: number
  name: string
  colour: string               // hex
  player: boolean
  gold: number
  word: number
  passages: number             // passages already brought
  grievance: number            // national pool, spent on signatories
  grievanceTotal: number       // cumulative, scales the fleet
  signatories: number[]        // indices into the twelve, in order recruited
  signatoryTarget: SignatoryCategory
  relation: Relation           // with the player (ignored for the player)
  suspicion: number            // unattributed raiding, moves relation toward tense
  strength: number             // rivals: abstract military strength
  expansion: number            // rivals: progress toward the next settlement
  declared: boolean
  independent: boolean
  fell: boolean                // rival lost its war and reverted to its Company
  landing: number              // tile index of its Landing anchorage
  charge: number               // its own Company's charge on consignments
  unlocked: Record<string, boolean>   // onboarding: which systems have been introduced
  explained: Record<string, boolean>  // onboarding: one sentence, once
}

// ---------------------------------------------------------------------------------------------
// The predecessors, remaining systems proposal section 5
// ---------------------------------------------------------------------------------------------
export interface PredecessorSettlement {
  id: number
  name: string
  tile: number
  territory: number[]
  teaches: 'flax' | 'hemp' | 'madder' | 'bloom'
  taught: boolean
  strong: GoodId
  minor: [GoodId, GoodId]
  lastBought: GoodId | null
  wealth: number
  alarm: number                // 0..1
  agent: boolean
  scouted: boolean
  closed: boolean
  haggled: boolean             // one haggle per visit
  gifts: number
}

// ---------------------------------------------------------------------------------------------
// Market, remaining systems proposal section 3
// ---------------------------------------------------------------------------------------------
export interface PriceEntry {
  price: number
  baseline: number             // drift anchor
  pressure: number             // cumulative volume pressure; price = baseline - pressure / volumeToShift
  soldThisTurn: number
}

export type PriceTable = Record<GoodId, PriceEntry>

export interface Market {
  tables: PriceTable[]         // indexed by charter
}

export interface Payment { due: number; gold: number; word: number }

export interface Transit { to: number; good: GoodId; amount: number; due: number }

export interface Demand { turnOffered: number; rise: number; good: GoodId }

// ---------------------------------------------------------------------------------------------
// The recall fleet and the declaration, military brief sections 10 and 11
// ---------------------------------------------------------------------------------------------
export interface FleetUnit { kind: CompanyKind; quality: Quality }

export interface Wave {
  id: number
  units: FleetUnit[]
  anchorage: number            // chosen by rng.play, never persisted before landing
  turnsToLand: number          // 3, 2, 1, then lands at 0
  landed: boolean
  excluded: number[]           // anchorages ruled out so far, for the narrowing display
}

export interface Declaration {
  declared: boolean
  turnDeclared: number | null
  waves: Wave[]
  interventionProgress: number
  nextWaveId: number
  won: boolean
  lost: boolean
  intervened: number | null    // charter index of the intervening rival
}

// ---------------------------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------------------------
export type DispatchKind = 'event' | 'market' | 'growth' | 'build' | 'loss' | 'company' | 'rival' | 'predecessor' | 'war' | 'resolved' | 'note'

export interface DispatchEntry {
  turn: number
  kind: DispatchKind
  text: string
  why?: string                 // the cause, for the "why" affordance
  settlement?: number
  tile?: number
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
export type MapSize = 'small' | 'standard' | 'large' | 'massive'
export type LandShape = 'continent' | 'coast' | 'archipelago'
export type Difficulty = 'generous' | 'standard' | 'hard' | 'punitive'
export type Pace = 'light' | 'normal' | 'all'

export interface Settings {
  size: MapSize
  shape: LandShape
  landArea: number             // 0.3 .. 0.6, fraction of tiles that are land
  roughness: number            // 0..1
  temperature: number          // 0..1
  moisture: number             // 0..1
  abundance: number            // 0..1, resource abundance
  predecessorDensity: number   // 0..1
  crossing: 'short' | 'standard' | 'long'
  difficulty: Difficulty
  turns: number                // total turns, defaults from size
  pace: Pace
  audio: { on: boolean; muted: boolean; volume: number; track: number }
  firstGame: boolean
}

// ---------------------------------------------------------------------------------------------
// Randomness, build specification section 8. Plain arrays so the state stays serialisable.
// ---------------------------------------------------------------------------------------------
export type RngState = [number, number, number, number]

// ---------------------------------------------------------------------------------------------
// The state object
// ---------------------------------------------------------------------------------------------
export interface GameState {
  schemaVersion: number
  worldgenVersion: number
  seed: string
  settings: Settings
  turn: number                 // 1 = first month after landing. 0 = not yet landed

  world: {
    width: number
    height: number
    tiles: Tile[]              // flat, index = y * width + x
    anchorages: number[]       // tile indices
    rivers: RiverSegment[]
    landingSites: number[]     // the three offered at arrival, in order
  }

  charters: Charter[]          // index 0 is always the player
  settlements: Settlement[]
  units: Unit[]
  predecessors: PredecessorSettlement[]

  market: Market
  company: {
    charge: number             // current percentage, 0..1
    nextDemandTurn: number
    demand: Demand | null      // an open demand awaiting an answer
    embargoed: GoodId[]
    embargoShield: number      // demands blocked by a signatory
    fleetStrength: number      // visible at all times
    fleetPool: FleetUnit[] | null
    payments: Payment[]        // consigned, in transit, not yet paid
    demandsAccepted: number
  }

  declaration: Declaration | null

  dispatch: DispatchEntry[]    // capped ring buffer
  intent: string               // the persistent objective line
  flags: Record<string, boolean>

  rng: { world: RngState; play: RngState }
  nextId: number
  telemetry: {
    firstConsignment: number | null
    secondSettlement: number | null
    foldOpened: number | null
  }
  /** Queue bookkeeping that must survive a turn: opportunities that have appeared once. */
  opportunitiesShown: Record<string, number>
  /** Undo support: id of the last action applied this turn, for the dispatch. */
  actionsThisTurn: number
  /** Goods on the road between settlements under a surplus rule, orders.ts */
  transits: Transit[]
}

export interface TurnContext {
  rngPlay: RngState
  log: (e: Omit<DispatchEntry, 'turn'>) => void
}

// ---------------------------------------------------------------------------------------------
// Queue items are derived, never stored. See queue brief section 10.
// ---------------------------------------------------------------------------------------------
export type QueueType = 1 | 2 | 3 | 4 | 5

export interface QueueChoice {
  label: string
  action: unknown              // an Action, typed loosely here to avoid a cycle
  hint?: string
}

export interface QueueItem {
  key: string                  // unique condition key, stable across turns
  group: string                // items sharing a group collapse into one
  type: QueueType
  title: string
  body: string
  explain?: string             // one sentence, shown the first time a system appears
  settlement?: number
  unit?: number
  tile?: number
  magnitude: number
  since: number                // turn the condition began
  choices: QueueChoice[]
  opens?: 'settlement' | 'unit' | 'market' | 'demand' | 'signatories' | 'predecessor' | 'declaration' | 'orders'
}

export interface QueueGroup {
  group: string
  type: QueueType
  title: string
  body: string
  explain?: string
  items: QueueItem[]
  rank: number
  since: number
}

export interface DerivedQueue {
  shown: QueueGroup[]
  folded: QueueGroup[]
  crisis: boolean
}

/** Helpers that do not allocate. */
export function tileIndex(s: GameState, x: number, y: number): number {
  return y * s.world.width + x
}
export function tileXY(s: GameState, i: number): [number, number] {
  return [i % s.world.width, Math.floor(i / s.world.width)]
}
export function emptyStock(): Record<GoodId, number> {
  const r = {} as Record<GoodId, number>
  for (const g of GOODS) r[g] = 0
  return r
}
export function emptyBuildings(): Record<BuildingLine, number> {
  const r = {} as Record<BuildingLine, number>
  for (const b of BUILDING_LINES) r[b] = 0
  return r
}
