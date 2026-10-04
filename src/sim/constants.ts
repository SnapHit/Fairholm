// THE single named constants block. Every number from every brief lives here and nothing else
// holds any. Each group names the brief and section it came from. Everything here is a starting
// value; nothing has been tuned by playing. Set the feel constants, verify by playing, then leave
// them alone while changing other things. Never tune a constant to fix a turn-order bug in turn.ts.

import type { GoodId, TerrainId, ForestId, PrimeId, TileGood, BuildingLine, Difficulty, MapSize, LandShape, Standing, HullKind } from './state'

// Two: the opening changed from three offered landing sites to a lander at sea in fog, which
// changed the world (splashdowns in place of anchorages and landing sites), the units (the lander
// and its passengers) and the fleet's waves. Saves from one are turned away with a plain message.
export const SCHEMA_VERSION = 2
// Worldgen three: the lander sails six tiles a turn and sees three, so the splashdowns moved nearer
// the coast and to where land lies in the most directions. The same seed now puts every charter
// somewhere else, so a save from worldgen two would regenerate the wrong world under its deltas.
export const WORLDGEN_VERSION = 3

export interface GoodParams {
  open: number
  floor: number
  ceiling: number
  volumeToShift: number        // cumulative units sold that move the price down by one
  recovery: number             // pressure removed per turn when little is sold
  drift: number                // per-turn movement of the baseline, signed
  spread: number               // the Company sells at price + spread
  traded: boolean
  predecessor: boolean         // manufactured goods the predecessors will buy
}

export interface DifficultyBundle {
  startingColonists: number
  openingCharge: number
  chargeRise: number
  turnsBetweenDemands: number
  fleetMultiplier: number
  unresolvedThreshold: number
  rivalExpansion: number
  rivalsMayDeclare: boolean
  alarmSensitivity: number
  wordPerValue: number
  recoveryRate: number
  /** Grievance needed per head for full resolve, as a multiple of the base: generous terms give
   *  the declaration sooner, punitive later but still within the game (DECISIONS.md 153). */
  resolveNeed: number
}

export const C = {
  // -------------------------------------------------------------------------------------------
  // Session, map and economy brief sections 2 to 4
  // -------------------------------------------------------------------------------------------
  session: {
    turnsPerYear: 12,
    turnsPerSeason: 3,
    sizes: {
      small: { w: 40, h: 26, turns: 300 },
      standard: { w: 56, h: 36, turns: 480 },
      large: { w: 72, h: 48, turns: 660 },
      massive: { w: 92, h: 60, turns: 900 },
    } as Record<MapSize, { w: number; h: number; turns: number }>,
    /** The one per-size pace factor (DECISIONS.md 153). The early milestones are the same number of
     *  turns on every size, and the economy's rates are per turn, so they need no scaling; but the
     *  eras that are fractions of the game, the declaration above all, must come at the same
     *  fraction on a 660 turn map as on a 300 turn one. Resolve needs this much more grievance per
     *  head by size, and the fleet grows this much more slowly with it. Less than the game's length
     *  over the small game's, because a bigger map carries more settlements and more people and
     *  they take longer to bring round by themselves. Measured, not derived. */
    pace: { small: 1, standard: 1.15, large: 1.6, massive: 2.1 } as Record<MapSize, number>,
    landFraction: { continent: 0.47, coast: 0.42, archipelago: 0.36 } as Record<LandShape, number>,
    dispatchCap: 400,
    intentDefault: 'You owe the Company for your passage. You intend to stop owing them.',
  },

  // -------------------------------------------------------------------------------------------
  // Colonists and labour brief
  // -------------------------------------------------------------------------------------------
  labour: {
    granaryThreshold: 100,     // section 3, surplus food that converts to a colonist; 160 in the brief, see DECISIONS.md 152
    /** Food per colonist per turn. One, down from the brief's two (DECISIONS.md 152): the brief's
     *  own derivation has a settlement of eight with four on the ground banking five or six food a
     *  turn, which at two a head and three a tile is impossible, and at one a head is what three
     *  on food and the settlement's own tile give. Food is a pressure, not a wall. */
    eats: 1,
    firstPassageWord: 20,      // section 3 has 30; 20 so the first lot consigned pays the first passage, DECISIONS.md 152
    passageWordStep: 8,
    goldPassageBase: 60,       // gold buys passage at a price that rises with the count
    goldPassageStep: 15,
    agentOfficeWord: 1.5,      // section 3
    baseBuildingOutput: 3,     // per worker per turn at tier one
    standingPenalty: { debtor: 2, contracted: 1, free: 0, master: 0 } as Record<Standing, number>,
    masterMultiplier: 2,       // section 6, doubled in speciality
    workersPerBuilding: 2,     // section 8
    tierMultiplier: [0, 1, 2, 3],   // section 8, tiers multiply output rather than adding slots
    clerkFirstAt: 8,           // section 9
    clerkEvery: 6,
    educationCycle: [0, 12, 20, 30],   // section 7, by school tier
    starvationTurns: 3,        // turns of deficit before a colonist is lost (decided, see DECISIONS.md)
    predecessorSkills: ['flax', 'hemp', 'madder', 'bloom'] as TileGood[],
  },

  // -------------------------------------------------------------------------------------------
  // Remaining systems proposal section 3, the Company market
  // -------------------------------------------------------------------------------------------
  market: {
    lotSize: 25,
    rivalCoupling: 0.3,        // rival charters brief section 4
    demandFirstTurn: 36,       // the first demand arrives a little earlier than the interval
    demandAcceleration: 0.92,  // each interval shrinks by this factor
    demandDeadline: 4,         // turns to answer
    embargoGrievanceBurst: 40,
    consignmentOfficeThreshold: 60,   // surplus above this is sold automatically
    /** The surplus threshold a new settlement's orders are inferred with. Half the base storage,
     *  so the rule can fire before the store is full (DECISIONS.md 151): at the old forty, equal to
     *  the base storage, a standing order waiting for a full lot above it could never sell. */
    defaultSurplusThreshold: 20,
    /** When the store is full the surplus rule sells what is above the threshold short of a lot,
     *  but never a dribble smaller than this: the rest is the spoilage card's to say. */
    fullStoreMinSale: 5,
    /** Dumping by standing order is never silent. When the player's own automatic sales account for
     *  at least this share of a good's fall below its baseline, and the fall is at least this share
     *  of the baseline (never under one price point), a loss card says so until the price recovers or
     *  the orders change. RISKS.md risk seven. */
    dumpingAlertShare: 0.5,
    dumpingAlertDrop: 0.25,
    dumpingAlertMinPoints: 2,
    smugglerRate: 0.5,         // consignment office after the declaration or under blockade
    freightLossPerTile: 0.004, // the third soft pressure: distance from the Landing
    freightLossMax: 0.25,
    crossingTurns: { short: 2, standard: 3, long: 5 },   // payment lag, months each way
    priceJitter: 0.04,         // play randomness on displayed price movement, fraction
    /** volumeToShift is the units of a good that move its price one point, and it is half what the
     *  proposal's table gave (DECISIONS.md 157): at the old numbers a lot of twenty five never
     *  moved a refined good's price a visible point, and the dumping lesson was never taught by
     *  one sale. At these a single lot of linen shows the fall. recovery, the pressure a quiet turn
     *  takes off, is doubled with it, so that a settlement selling what two workers make holds its
     *  price and only a colony that sends more than that walks it down. */
    goods: {
      food:        { open: 2,  floor: 1, ceiling: 3,  volumeToShift: 125, recovery: 6,   drift: 0,     spread: 2,  traded: false, predecessor: false },
      timber:      { open: 2,  floor: 1, ceiling: 4,  volumeToShift: 100, recovery: 6,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      gold:        { open: 22, floor: 2, ceiling: 24, volumeToShift: 20,  recovery: 0,   drift: 0,     spread: 6,  traded: true,  predecessor: false },
      horses:      { open: 6,  floor: 2, ceiling: 14, volumeToShift: 45,  recovery: 4,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      ore:         { open: 3,  floor: 1, ceiling: 6,  volumeToShift: 75, recovery: 6,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      metal:       { open: 7,  floor: 2, ceiling: 12, volumeToShift: 55, recovery: 4,   drift: 0,     spread: 3,  traded: true,  predecessor: true },
      tooling:     { open: 4,  floor: 2, ceiling: 14, volumeToShift: 50, recovery: 4,   drift: 0.012, spread: 5,  traded: true,  predecessor: true },
      arms:        { open: 5,  floor: 3, ceiling: 24, volumeToShift: 45,  recovery: 4,   drift: 0.018, spread: 5,  traded: true,  predecessor: true },
      flax:        { open: 3,  floor: 1, ceiling: 7,  volumeToShift: 60, recovery: 2,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      linen:       { open: 11, floor: 3, ceiling: 22, volumeToShift: 45,  recovery: 6,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      hemp:        { open: 4,  floor: 1, ceiling: 7,  volumeToShift: 60, recovery: 2,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      cordage:     { open: 9,  floor: 3, ceiling: 22, volumeToShift: 45,  recovery: 6,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      madder:      { open: 5,  floor: 1, ceiling: 7,  volumeToShift: 60, recovery: 2,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      dye:         { open: 14, floor: 3, ceiling: 22, volumeToShift: 45,  recovery: 6,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      bloom:       { open: 6,  floor: 2, ceiling: 9,  volumeToShift: 55, recovery: 4,   drift: 0,     spread: 3,  traded: true,  predecessor: false },
      attar:       { open: 15, floor: 5, ceiling: 26, volumeToShift: 40,  recovery: 4,   drift: 0,     spread: 5,  traded: true,  predecessor: true },
      cores:       { open: 18, floor: 6, ceiling: 34, volumeToShift: 35,  recovery: 4,   drift: 0,     spread: 6,  traded: true,  predecessor: true },
      instruments: { open: 12, floor: 8, ceiling: 40, volumeToShift: 30,  recovery: 2,   drift: 0.04,  spread: 6,  traded: true,  predecessor: false },
    } as Record<GoodId, GoodParams>,
  },

  // -------------------------------------------------------------------------------------------
  // Remaining systems proposal sections 1 and 2, grievance and signatories
  // -------------------------------------------------------------------------------------------
  grievance: {
    perWorker: 3,
    pressMultiplier: 1.5,
    bulletinMultiplier: 2,
    maxPerSettlement: 12,
    perPopulationForResolve: 150,   // 250 in the proposal, see DECISIONS.md 153
    declarationGate: 0.60,
    bonusAt50: 1,              // extra output per producing worker once resolve crosses 50%
    bonusAt100: 1,             // again at 100%
    unresolvedPenalty: 1,      // flat output penalty per worker when unresolved exceeds the threshold
    decayPerTurn: 0.004,       // fraction of accumulated grievance lost per turn with no civic work
    signatoryFirstCost: 300,
    signatoryStep: 250,
    signatoryVoiceBonus: 0.5,  // signatory 11
    signatoryPassageDiscount: 0.5,   // signatory 12
  },

  // -------------------------------------------------------------------------------------------
  // Military and revolution brief
  // -------------------------------------------------------------------------------------------
  military: {
    exchanges: 3,              // section 4
    fortMultipliers: [1, 1.5, 2.25, 3],     // section 7
    garrisonCapacity: [2, 3, 5, 8],
    batterySlots: [0, 1, 2, 3],
    units: {                   // section 3
      colonist:  { attack: 0, defence: 1, moves: 1 },
      militia:   { attack: 3, defence: 3, moves: 1, arms: 15 },
      outrider:  { attack: 5, defence: 5, moves: 3, horses: 10 },
      battery:   { attackSettlement: 10, attackOpen: 2, defenceSettlement: 8, defenceOpen: 2, moves: 1, arms: 30 },
      improver:  { attack: 0, defence: 1, moves: 1, tooling: 10 },
      hauler:    { attack: 0, defence: 1, moves: 2, horses: 4, capacity: 120 },
    },
    qualityStep: 2,            // section 3, raw to hardened to sworn
    company: { regulars: 8, horse: 10, siegeAttack: 12, siegeOpen: 3, siegeDefenceSettlement: 8 },
    terrainDefence: { grassland: 1, plains: 1, downs: 1.1, marsh: 1.2, highland: 1.4, mountain: 1.7, dry: 1, water: 1 } as Record<TerrainId, number>,
    forestDefence: 1.3,
    riverDefence: 1.15,
    breachThreshold: 5,        // section 11, turns of adjacency before a tier falls, per settlement
    /** A sacked settlement is left alone for this many turns; the Company marches on (decision 20
     *  and 154). And the share of its store left after a sack. */
    sackCooldown: 12,
    sackFraction: 0.5,
    approachTurns: 3,          // section 10
    /** How far the recall fleet's landers motor in a turn, in tiles. Not the player's lander's
     *  speed: at six a turn a three turn approach would splash down eighteen tiles out, which on
     *  a small map is off the edge or over land. One, so they come down three tiles offshore. */
    approachMoves: 1,
    /** A wave comes ashore within this many tiles of one of the player's settlements. */
    landingRadius: 2,
    declarationWindow: 6,
    fleetBase: 4,              // units before any grievance
    fleetPerGrievance: 0.0025, // units per point of cumulative national grievance, times difficulty; 0.004 before DECISIONS.md 155
    fleetMaxUnits: 60,
    waveSize: 5,
    waveInterval: 5,
    promotionChance: 0.3,      // section 8
    interventionGrievance: 360,    // section 12, wartime grievance that buys a rival's ships; 1200 before DECISIONS.md 155
    fleetComposition: { regulars: 0.55, horse: 0.25, siegeTrain: 0.2 },
  },

  // -------------------------------------------------------------------------------------------
  // Rival charters brief section 8, hulls and raiding
  // -------------------------------------------------------------------------------------------
  naval: {
    hulls: {
      lighter: { speed: 2, guns: 0, capacity: 100, cost: { timber: 40, cordage: 0 }, wharfTier: 1 },
      trader:  { speed: 3, guns: 2, capacity: 300, cost: { timber: 90, cordage: 20 }, wharfTier: 2 },
      raider:  { speed: 5, guns: 4, capacity: 100, cost: { timber: 70, cordage: 25, arms: 10 }, wharfTier: 2 },
      cutter:  { speed: 4, guns: 7, capacity: 80,  cost: { timber: 110, cordage: 30, arms: 20 }, wharfTier: 3 },
    },
    damagePerLostRound: 1,     // lost speed and capacity fraction per lost exchange
    raidCargoFraction: 0.6,    // cargo transferred on a successful raid
    rivalRaidChancePerTurn: 0.03,
    repairPerTurn: 1,
    /** Coastal batteries fire on adjacent hostile ships automatically, military brief section 11.
     *  Each battery standing on a settlement's tile fires once a turn at each hostile armed ship on
     *  the water beside it: a hit does one round's damage, as a lost exchange does. A damaged
     *  battery hits less often. A hull founders by the naval rule; the Company's landing craft,
     *  which has no hull entry, is driven off after this many hits. */
    batteryFire: { hit: 0.5, damagedHit: 0.25, companyShipEndurance: 4 },
  },

  // -------------------------------------------------------------------------------------------
  // Units under standing orders, queue brief section 4 and rival charters brief section 8
  // -------------------------------------------------------------------------------------------
  orders: {
    /** How near a hostile armed unit has to be, in tiles, for a haul route's avoid or escort
     *  posture to stop the hauler. */
    hostileRadius: 3,
  },

  // -------------------------------------------------------------------------------------------
  // Turn, queue and standing orders brief
  // -------------------------------------------------------------------------------------------
  queue: {
    shown: 8,                  // section 7
    paces: { light: 5, normal: 8, all: 999 },   // section 12
    persistenceBoost: 0.15,    // rank gained per turn a condition has persisted
    opportunityReturns: 1,     // section 8, an opportunity returns once more before lapsing
    reviewOrdersAfter: 4,      // section 3, turns after founding before "review orders"
    typeWeight: [0, 1000, 800, 400, 200, 100],
  },

  // -------------------------------------------------------------------------------------------
  // Buildings, remaining systems proposal section 4
  // -------------------------------------------------------------------------------------------
  buildings: {
    costs: [null, { frame: 30, tooling: 0 }, { frame: 80, tooling: 25 }, { frame: 180, tooling: 90 }],
    popGate: [0, 0, 5, 9],
    storage: [40, 80, 200, 400],   // capacity per good with no building, granary, warehouse, depot
    importedMachineGold: 400,      // buy-or-build: gold now
    importedInstrumentsPerTurn: 1, // running cost
    importedFailBase: 0.01,        // chance per turn of failure, rising each year
    importedFailPerYear: 0.01,
    lines: {
      carpenter:   { tiers: 2, input: 'timber', output: 'frame', names: ["Carpenter's shop", 'Sawmill', ''] },
      smelter:     { tiers: 3, input: 'ore', output: 'metal', names: ['Smelter', 'Foundry', 'Ironworks'] },
      toolworks:   { tiers: 2, input: 'metal', output: 'tooling', names: ['Toolworks', 'Manufactory', ''] },
      armoury:     { tiers: 3, input: 'metal', output: 'arms', names: ['Armoury', 'Magazine', 'Arsenal'] },
      linenWorks:  { tiers: 3, input: 'flax', output: 'linen', names: ['Linen shop', 'Linen works', 'Linen mill'] },
      ropeWorks:   { tiers: 3, input: 'hemp', output: 'cordage', names: ['Rope shop', 'Rope works', 'Rope mill'] },
      dyeWorks:    { tiers: 3, input: 'madder', output: 'dye', names: ['Dye shop', 'Dye works', 'Dye house'] },
      still:       { tiers: 3, input: 'bloom', output: 'attar', names: ['Still', 'Distillery', 'Attar works'] },
      finishing:   { tiers: 2, input: 'attar', output: 'cores', names: ['Finishing house', 'Finishing works', ''], secondInput: 'metal' },
      meeting:     { tiers: 1, input: null, output: null, names: ['Meeting house', '', ''] },
      press:       { tiers: 2, input: null, output: null, names: ['Press', 'Bulletin', ''] },
      school:      { tiers: 3, input: null, output: null, names: ['School', 'Academy', 'Institute'] },
      storage:     { tiers: 3, input: null, output: null, names: ['Granary', 'Warehouse', 'Depot'] },
      stable:      { tiers: 1, input: null, output: null, names: ['Stable', '', ''] },
      wharf:       { tiers: 3, input: null, output: null, names: ['Wharf', 'Drydock', 'Shipyard'] },
      works:       { tiers: 3, input: null, output: null, names: ['Palisade', 'Redoubt', 'Bastion'] },
      agentOffice: { tiers: 1, input: null, output: null, names: ["Agent's office", '', ''] },
      consignment: { tiers: 1, input: null, output: null, names: ['Consignment office', '', ''] },
    } as Record<BuildingLine, { tiers: number; input: GoodId | null; output: GoodId | 'frame' | null; names: [string, string, string]; secondInput?: GoodId }>,
    stableHorseBonus: 2,       // extra horses bred per turn
    horseBreedBase: 0.05,      // fraction of held horses that breed each turn
  },

  // -------------------------------------------------------------------------------------------
  // Terrain and yields, remaining systems proposal section 6. Base yields run 2 to 4.
  // -------------------------------------------------------------------------------------------
  terrain: {
    yields: {
      grassland: { food: 3, horses: 2, bloom: 1 },
      plains:    { food: 3, flax: 2, madder: 2 },
      downs:     { food: 1, hemp: 3, madder: 1, horses: 3, bloom: 2 },
      marsh:     { food: 1, ore: 1, bloom: 2 },
      highland:  { food: 1, ore: 3 },
      mountain:  { ore: 4 },
      dry:       { food: 1 },
      water:     { food: 3 },
    } as Record<TerrainId, Partial<Record<TileGood, number>>>,
    forestTimber: { lightWoodland: 2, deepTimber: 4, highlandForest: 3, coastalScrub: 2 } as Record<ForestId, number>,
    forestClearsTo: { lightWoodland: 'plains', deepTimber: 'grassland', highlandForest: 'highland', coastalScrub: 'downs' } as Record<ForestId, TerrainId>,
    forestFoodCap: 1,          // a forested tile yields little food until cleared
    clearingTimber: 30,        // one-off timber from clearing
    ploughBonus: 1,            // +1 to the primary yield on cleared land
    minorRiverBonus: 1,
    majorRiverBonus: 2,
    primeMultiply: 2,
    primeFlat: 2,
    workingsOre: 1,
    masterMultiply: 2,         // a master of a good doubles its yield
    goldYield: 3,              // per turn from a seam while the reserve lasts
    goldReserve: { min: 120, max: 400 },
    primes: {
      richSoil:    { good: 'food',   kind: 'multiply' },
      pasture:     { good: 'horses', kind: 'flat' },
      stand:       { good: 'timber', kind: 'flat' },
      lode:        { good: 'ore',    kind: 'multiply' },
      seam:        { good: 'gold',   kind: 'flat' },
      flaxField:   { good: 'flax',   kind: 'multiply' },
      hempField:   { good: 'hemp',   kind: 'flat' },
      madderBed:   { good: 'madder', kind: 'multiply' },
      bloomMeadow: { good: 'bloom',  kind: 'multiply' },
      shoal:       { good: 'food',   kind: 'flat' },
    } as Record<PrimeId, { good: TileGood; kind: 'multiply' | 'flat' }>,
    moveCost: { grassland: 1, plains: 1, downs: 1, marsh: 2, highland: 2, mountain: 3, dry: 1, water: 99 } as Record<TerrainId, number>,
    forestMoveCost: 1,         // added
    roadMoveCost: 0.5,
    /** Planning only: a step on the diagonal is reckoned this much dearer than one straight, so of
     *  two ways equally long the straighter is planned. A lander sent due south sails due south
     *  rather than zigzagging into water nobody has seen and finding the coast there. */
    diagonalTieBreak: 1e-6,
    improveTurns: { road: 2, clear: 4, plough: 3 },
  },

  // -------------------------------------------------------------------------------------------
  // World generation, session brief section 8 and military brief section 9
  // -------------------------------------------------------------------------------------------
  worldgen: {
    /** Tries before a world is accepted with its problem recorded. Twenty four, up from twelve: with
     *  the lander seeing three tiles a splashdown needs nine tiles of clear water square, and a
     *  small archipelago can take eighteen tries to fit four charters. A try costs a few
     *  milliseconds on a small map. */
    maxAttempts: 24,
    noiseOctaves: 4,
    noiseScale: 0.11,
    edgeFalloff: 0.18,         // fraction of each edge pushed toward water
    mountainThreshold: 0.78,
    highlandThreshold: 0.62,
    forestChance: 0.42,
    primeChance: 0.08,
    goldChance: 0.25,          // of dry and mountain tiles that carry a seam
    workingsChance: 0.015,
    riversPerThousandTiles: 5,
    majorRiverFraction: 0.35,
    charterSeparation: { small: 9, standard: 13, large: 17, massive: 22 } as Record<MapSize, number>,
    predecessorsPerThousandTiles: 4,
    predecessorTerritory: 8,   // tiles
    landingReach: 2,           // radius checked for food, timber and water
    minReachableChains: 2,
    minPredecessorsReachable: 2,
    /** The smallest landmass a charter's lander is sent toward, in tiles. */
    homeLandmassMin: 40,
    /** How many moves a heading from a splashdown has to sight land in to count, session brief
     *  section 8: "within the first one or two moves". */
    sightedWithinMoves: 2,
    /** How many of the player's splashdowns a placement tries before settling for less, because one
     *  drawn in the wrong place can crowd the rivals out when another would not. */
    splashdownDraws: 12,
    /** A rival's splashdown may come this many tiles nearer its coast, and see land a tile nearer,
     *  than the player's, where a tight map has no other room for all four charters. Only ever used
     *  when the strict rule places fewer than four. */
    rivalSplashdownGive: 1,
  },

  // -------------------------------------------------------------------------------------------
  // The lander and the voyage. Setting brief section 7, onboarding brief section 2, session brief
  // section 8. The lander is the first ship and the opening is sailing it to a coast of your own
  // choosing.
  // -------------------------------------------------------------------------------------------
  lander: {
    /** How far the lander sails in a turn, in tiles. Six: the opening turns are for choosing
     *  ground, not for reaching it, so one move crosses the open water and each move after it
     *  runs a good stretch of coast. Rivals' landers sail at the same speed. The boat it leaves
     *  behind is a lighter and sails at a lighter's speed; the drop is meant. */
    moves: 6,
    /** How far the splashdown lies from the nearest coast with food, timber and fresh water, in
     *  tiles of open water. The near end is out of sight of all land with a tile to spare
     *  (sight plus two); the far end is near enough that one move straight at the coast brings it
     *  a tile inside sight (moves plus sight, less one). Session brief section 8. */
    splashdown: { near: 5, far: 8 },
    /** How far the lander sees, in tiles. Three, so a move of six reveals a swathe seven tiles
     *  wide and each one is worth making. */
    sight: 3,
    /** What it can carry besides its people. The starting stores fit with room over. */
    capacity: 400,
    /** The boat it carries, which survives founding as the player's first ship. */
    boat: 'lighter' as HullKind,
    /** How many turns after coming down a lander steams. The map draws the plume for these. */
    steamTurns: 2,
    /** The first settlement's default name. */
    firstName: 'The Landing',
    /** How the machine sails a lander, for the rival charters and the tests: it looks this many
     *  turns of sailing out for a site, gives a coast that can feed a settlement this much more
     *  than its ring is worth, and takes this much off for every turn of sailing to it. */
    autopilot: { reachTurns: 3, viableBonus: 15, sailPenaltyPerTurn: 3 },
  },

  // -------------------------------------------------------------------------------------------
  // The machine that plays a whole game, src/sim/policy.ts. Three policies: lazy does what the
  // cards suggest and no more, competent plays a sensible game and is what the pace is tuned to,
  // strong plays a sharp one. The difficulty of the game is what these three feel like; the
  // reachability tables in DECISIONS.md are measured with them. Nothing here touches play.
  // -------------------------------------------------------------------------------------------
  autopilot: {
    policies: {
      lazy: {
        civicAtPop: 5,           // staff the meeting house once a settlement is this big
        civicWorkers: 2,         // with this many: the card says what a meeting house is for
        foodSurplus: 0,          // aim for this much food over what is eaten, in units a turn
        settleAtPop: 7,          // send a settler out once a settlement is this big
        settlements: { small: 2, standard: 2, large: 2, massive: 2 } as Record<MapSize, number>,
        sendAtPop: 99,           // a settlement this big sends its children to a smaller one
        acceptChargeTo: 1,       // accept the Company's demands while the charge is below this
        buyToolingGold: Infinity,   // buy tooling for a build when gold is above this
        buyPassageGold: Infinity,   // buy a passage when gold is above this many times its price
        musterShare: 0,          // declare once this share of the fleet is matched by armed units
        declareBy: 0,            // or by this fraction of the game, if the gate is open
        batteries: 0,            // batteries wanted at the landing before declaring
        worksTier: 1,            // works wanted at the landing before declaring
        armsStock: 0,            // arms held at the landing before declaring, bought if not made
        musterFrom: 1,           // begin buying arms and raising works at this fraction of the game
        tierTwoAtPop: 99,        // raise the main building to tier two at this population
      },
      competent: {
        civicAtPop: 4, civicWorkers: 2, foodSurplus: 3, settleAtPop: 5,
        settlements: { small: 5, standard: 9, large: 14, massive: 18 } as Record<MapSize, number>,
        sendAtPop: 12, acceptChargeTo: 0.35, buyToolingGold: 100, buyPassageGold: 4, musterShare: 0.5, declareBy: 0.85,
        batteries: 3, worksTier: 3, armsStock: 160, musterFrom: 0.45, tierTwoAtPop: 5,
      },
      strong: {
        // sharper, not wider: the gate is a share of everyone, so a strong player keeps the colony
        // compact and civic rather than sprawling, and does not buy people it must then bring round
        civicAtPop: 3, civicWorkers: 2, foodSurplus: 4, settleAtPop: 4,
        settlements: { small: 5, standard: 8, large: 12, massive: 16 } as Record<MapSize, number>,
        sendAtPop: 10, acceptChargeTo: 0.3, buyToolingGold: 80, buyPassageGold: 4, musterShare: 0.7, declareBy: 0.8,
        batteries: 3, worksTier: 3, armsStock: 220, musterFrom: 0.4, tierTwoAtPop: 5,
      },
    },
    /** A settler looks for ground this far from the settlement that sends it, in tiles. */
    settleRange: { min: 3, max: 6 },
    /** A coastal site is worth this much more than an inland one: it can consign by itself. */
    coastalSiteBonus: 10,
    /** A site within this many tiles of a rival's settlement is left alone. */
    rivalClearance: 4,
    /** A site nobody has seen yet scores this much less than one in known ground. */
    unseenSitePenalty: 5,
    /** A sally is made at these odds or better: against a siege train, and against anything else. */
    sallyOdds: { siege: 0.45, other: 0.55 },
    /** A good standing below this share of its baseline is held by a rule of its own, and sold
     *  again once it stands at this share. */
    holdBelow: 0.7,
    sellAgainAt: 0.9,
    /** Gold kept in hand when buying the tooling a build in progress is waiting on. */
    toolingFloat: 40,
    /** Buy arms for the muster only while gold stays above this, a lot at a time. */
    armsGold: 120,
    armsLot: 10,
  },

  // -------------------------------------------------------------------------------------------
  // Founding. Session brief section 8: anywhere but mountain and water, and two settlements'
  // centres at least this far apart in every direction, anyone's, so no two rings share a tile.
  // -------------------------------------------------------------------------------------------
  founding: {
    spacing: 3,
  },

  // -------------------------------------------------------------------------------------------
  // Fog of war. Ground is hidden until seen and then stays revealed; other charters' units are
  // seen only within sight. Art direction brief section 10a.
  // -------------------------------------------------------------------------------------------
  fog: {
    /** How far each thing sees, in tiles (Chebyshev). A settlement sees its ring and a tile past
     *  it. A unit on foot sees the tiles around it. A rider and a ship see further. */
    sight: { settlement: 2, colonist: 1, outrider: 2, hull: 2, default: 1 },
  },

  // -------------------------------------------------------------------------------------------
  // The predecessors, remaining systems proposal section 5
  // -------------------------------------------------------------------------------------------
  predecessors: {
    transactionCap: 600,
    strongPremium: 1.8,
    minorPremium: 1.25,
    basePriceFraction: 0.9,    // of the Company price, before premiums; no charge is paid
    haulerBonus: 1.1,          // haulers get better terms than boats
    wealthPerTrade: 0.02,      // wealth rises as you trade with them
    wealthPriceCap: 0.5,       // wealth can lift prices by up to this fraction
    alarmPerTileTaken: 0.04,
    /** A player settlement within this many tiles of theirs counts as a tile taken, every turn. */
    crowdingReach: 3,
    alarmDecay: 0.01,
    alarmRefuse: 0.5,          // above this they refuse to trade
    alarmClose: 0.85,          // above this they close to you entirely
    agentAlarmRelief: 0.5,
    agentTermsBonus: 1.1,
    preferenceRotateEvery: 24, // turns
    haggleSuccess: 0.5,
    haggleGain: 0.15,
    giftChance: 0.25,
    giftAmount: 20,
    /** Barter, remaining systems proposal section 5: they trade in kind as well as coin. Their crop
     *  accrues to their store each turn up to a cap; a good taken in kind is reckoned at the
     *  Company's buy price over this bonus, so goods for goods beats buying them with the gold. The
     *  rest of an offer's value, when their store runs short, is paid in gold (DECISIONS.md 160). */
    storePerTurn: 3,
    storeCap: 150,
    barterBonus: 1.25,
    /** The surplus rule's offer destination reaches a people this many tiles from the settlement. */
    offerReach: 6,
  },

  // -------------------------------------------------------------------------------------------
  // Rival charters brief
  // -------------------------------------------------------------------------------------------
  rivals: {
    count: 3,
    /** Progress per turn toward a rival's next settlement, before the drag. The drag is the same
     *  shape as the player's three soft pressures (DECISIONS.md 15 and 149): one for every
     *  settlement held, as the resolve fraction; one for every person, as the overhead of
     *  administering them; one for every tile a rival's settlements lie, on average, from its
     *  landing, as freight loss. Progress each turn is expansionBase * terms / drag. */
    expansionBase: 0.03,
    expansionPerSettlement: 1.0,
    expansionPerPop: 0.02,
    expansionPerTile: 0.05,
    /** A backstop only, all rivals together. The drag sets the number of settlements a rival holds;
     *  the cap is set above where the curve reaches by the end of a game on standard terms, and
     *  tests/rivals.test.ts checks that it did not bind. */
    settlementCap: { small: 12, standard: 16, large: 22, massive: 30 } as Record<MapSize, number>,
    popGrowthPerTurn: 0.06,
    strengthPerTurn: 0.08,
    marketFootprintPerPop: 0.8,   // units of a good sold per population point per turn
    crowdingRadius: 6,         // 4 before DECISIONS.md 156: rivals settle four tiles from the player, so four never crowded
    crowdingRelationPerTurn: 0.02,
    /** A rival's lander makes for a site at least this far from any other charter's settlement and
     *  from the player's lander, so a rival as fast as the player does not come ashore on top of
     *  them. Wider than the crowding radius, so a first landing never starts out crowded. */
    landingClearance: 6,
    /** And this far from the player's lander while it is at sea: the voyage band's far edge and two,
     *  so the coast the player's splashdown was measured against, and can sight in the first moves,
     *  is not taken on the first turn. Relaxed to landingClearance where it leaves nothing in reach. */
    playerLanderClearance: 10,
    suspicionPerRaid: 0.2,
    /** Undercutting their trade, rival charters brief section 5: a good a rival lives by, standing
     *  below this share of its baseline in the Company's book because of what the player has sent,
     *  adds this much suspicion a turn to that rival, as far as tense and no further: war needs
     *  proof. Each rival lives by a third of the shared goods, so a colony that dumps one good
     *  wears on one rival first (DECISIONS.md 156). */
    undercutBelow: 0.75,
    suspicionPerUndercut: 0.012,
    tenseAt: 0.4,
    warAt: 1.0,
    colours: ['#7a1f2b', '#2b2f6e', '#2e2e2e'],   // deep crimson, indigo, charcoal
    names: ['Harrow Charter', 'Vane and Marlow', 'The Sable Company'],
  },

  // -------------------------------------------------------------------------------------------
  // Difficulty brief section 3. Difficulty changes the terms, never the rules.
  // -------------------------------------------------------------------------------------------
  difficulty: {
    generous: { startingColonists: 5, openingCharge: 0.03, chargeRise: 0.02, turnsBetweenDemands: 50, fleetMultiplier: 0.6, unresolvedThreshold: 8, rivalExpansion: 0.7, rivalsMayDeclare: false, alarmSensitivity: 0.7, wordPerValue: 8,  recoveryRate: 1.3, resolveNeed: 0.85 },
    standard: { startingColonists: 3, openingCharge: 0.05, chargeRise: 0.03, turnsBetweenDemands: 40, fleetMultiplier: 1.0, unresolvedThreshold: 6, rivalExpansion: 1.0, rivalsMayDeclare: false, alarmSensitivity: 1.0, wordPerValue: 10, recoveryRate: 1.0, resolveNeed: 1.0 },
    hard:     { startingColonists: 3, openingCharge: 0.08, chargeRise: 0.04, turnsBetweenDemands: 32, fleetMultiplier: 1.5, unresolvedThreshold: 5, rivalExpansion: 1.3, rivalsMayDeclare: true,  alarmSensitivity: 1.3, wordPerValue: 13, recoveryRate: 0.8, resolveNeed: 1.15 },
    punitive: { startingColonists: 2, openingCharge: 0.12, chargeRise: 0.05, turnsBetweenDemands: 25, fleetMultiplier: 2.2, unresolvedThreshold: 4, rivalExpansion: 1.6, rivalsMayDeclare: true,  alarmSensitivity: 1.6, wordPerValue: 16, recoveryRate: 0.6, resolveNeed: 1.3 },
  } as Record<Difficulty, DifficultyBundle>,

  // -------------------------------------------------------------------------------------------
  // Onboarding brief: starting position and unlock backstops
  // -------------------------------------------------------------------------------------------
  onboarding: {
    startingGold: 40,
    startingStock: { food: 20, timber: 10, tooling: 8, arms: 0 } as Partial<Record<GoodId, number>>,
    unlockBackstop: { market: 12, refining: 30, orders: 60, grievance: 90, predecessors: 90, rivals: 140, signatories: 140, military: 140, fleet: 220 },
    marketUnlockValue: 30,     // the Company market appears when surplus worth this much is held
    refiningUnlockCrop: 20,    // a refinery appears when this much of its crop is held
    grievanceUnlockPop: 6,
  },

  // -------------------------------------------------------------------------------------------
  // Feel brief: gesture, level of detail, audio
  // -------------------------------------------------------------------------------------------
  feel: {
    holdMs: 250,               // section 4
    holdCancelPx: 14,          // moving beyond this cancels the hold and becomes a pan
    tapMaxMs: 260,             // architecture brief section 10
    tapMaxPx: 8,
    doubleTapMs: 300,
    tileTapFloor: 44,          // below this many pixels a tile, tiles are not tappable
    /** A hold plots a route, and nothing commits until the route's end or Go is tapped, so a hold
     *  reaches tiles below the tap floor: down to this many pixels a tile, the overview zoom, where
     *  the route and its numbered turn ends can still be read. A slightly wrong tile shows in the
     *  plot and is put right by holding again. Below it a hold is a tap. */
    routeHoldFloor: 16,
    /** The margin a chosen unit or a plotted route is kept inside the free map by, in pixels: a
     *  thumb's half width, so what the camera keeps in view is not half under the card. */
    routeEndHitPx: 22,
    /** Movement is one gesture (feel brief section 4, DECISIONS.md 163): press and hold the
     *  destination, the route shows, slide to re-aim, let go to move. An attack commits on release
     *  only once its odds have been on the screen this long, so sliding across an enemy on the way
     *  somewhere else never fires. */
    attackDwellMs: 500,
    /** Holding this near an edge of the visible map scrolls it that way, at up to this many pixels
     *  a frame at the edge itself, so a destination off the screen is reachable in one gesture. */
    edgeScrollPx: 48,
    edgeScrollSpeed: 14,
    /** The short vibration that marks the hold engaging, where the device supports it. */
    holdVibrateMs: 12,
    lodCull: 40,               // section 2, hysteretic
    lodRestore: 48,
    zoom: { fit: 0, overview: 16, working: 44, detail: 72, min: 6, max: 110 },
    momentumDecay: 0.92,       // per frame
    momentumStop: 0.02,
    rubberBand: 0.35,
    openingOverhang: 4,        // tiles the camera may pass the map's edge while the lander is at sea
    settleRefineDelayMs: 120,
    dprMoving: 1,
    dprSettled: 2.5,
    audio: {
      fadeInMs: 2000,          // section 6
      crossfadeMs: 2000,
      preloadAt: 0.66,         // fraction of the current track at which the next begins preloading
      defaultVolume: 0.7,
      tracks: [
        '01-echoes-of-the-unmapped.mp3',
        '02-echoes-of-the-unmapped-ii.mp3',
        '03-pendulum-of-glass.mp3',
        '04-marginalia.mp3',
      ],
    },
  },

  // -------------------------------------------------------------------------------------------
  // Art direction brief: palette, jitter, light
  // -------------------------------------------------------------------------------------------
  art: {
    subdivisions: 4,           // section 3, quads per tile edge
    jitter: 0.22,              // fraction of a subdivision cell
    blendRadius: 0.9,          // tiles, for vertex colour blending
    shoreBand: 0.35,
    sunElevation: 0.42,        // radians, low raking sun
    seasonHueShift: [0.0, 0.02, -0.05, -0.08],   // new green, deep summer, turn of the leaf, bare ground
    seasonSaturation: [1.05, 1.0, 0.9, 0.7],
    cloudScale: 0.045,
    cloudSpeed: 0.012,
    cloudStrength: 0.12,
    palette: {
      water: '#1e5f66', deepWater: '#153f48', shore: '#a8a07a',
      grassland: '#7fa24a', plains: '#b0a84e', downs: '#9ea65c', marsh: '#5f7f55',
      highland: '#9c8a5a', mountain: '#8a7f72', dry: '#c6a86b', snow: '#e8e2d2',
      lightWoodland: '#5f8a3c', deepTimber: '#3f6b32', highlandForest: '#4e6f3b', coastalScrub: '#7a8a48',
      river: '#2c7a80', road: '#cdbb8a',
      bloom: '#ff9a3c',        // the highest-saturation colour on the map, reserved for the headline export
      player: '#e9e2cc',       // bone
      sky: '#f0d9a5',
    },
  },

  // -------------------------------------------------------------------------------------------
  // Feature flags. A half-built system is switched off here, not removed.
  // -------------------------------------------------------------------------------------------
  flags: {
    settlement: true,
    market: true,
    labour: true,
    orders: true,
    grievance: true,
    signatories: true,
    predecessors: true,
    rivals: true,
    military: true,
    naval: true,
    fleet: true,
    audio: true,
    telemetry: true,
    onboarding: true,
    rivalDiplomacyOffers: false,   // no offers arrive; relations move by events only, build specification section 12
    fogOfWar: true,                // on since the fog opening, see DECISIONS.md
    massiveValidated: false,       // generated but unvalidated, section 12
  },
} as const

export type Constants = typeof C

export function difficultyOf(d: Difficulty): DifficultyBundle {
  return C.difficulty[d]
}
