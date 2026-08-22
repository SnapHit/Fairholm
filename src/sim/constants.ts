// THE single named constants block. Every number from every brief lives here and nothing else
// holds any. Each group names the brief and section it came from. Everything here is a starting
// value; nothing has been tuned by playing. Set the feel constants, verify by playing, then leave
// them alone while changing other things. Never tune a constant to fix a turn-order bug in turn.ts.

import type { GoodId, TerrainId, ForestId, PrimeId, TileGood, BuildingLine, Difficulty, MapSize, LandShape, Standing } from './state'

export const SCHEMA_VERSION = 1
export const WORLDGEN_VERSION = 1

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
    landFraction: { continent: 0.47, coast: 0.42, archipelago: 0.36 } as Record<LandShape, number>,
    dispatchCap: 400,
    intentDefault: 'You owe the Company for your passage. You intend to stop owing them.',
  },

  // -------------------------------------------------------------------------------------------
  // Colonists and labour brief
  // -------------------------------------------------------------------------------------------
  labour: {
    granaryThreshold: 160,     // section 3, surplus food that converts to a colonist
    eats: 2,                   // food per colonist per turn
    firstPassageWord: 30,      // section 3
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
    smugglerRate: 0.5,         // consignment office after the declaration or under blockade
    freightLossPerTile: 0.004, // the third soft pressure: distance from the Landing
    freightLossMax: 0.25,
    crossingTurns: { short: 2, standard: 3, long: 5 },   // payment lag, months each way
    priceJitter: 0.04,         // play randomness on displayed price movement, fraction
    goods: {
      food:        { open: 2,  floor: 1, ceiling: 3,  volumeToShift: 250, recovery: 3,   drift: 0,     spread: 2,  traded: false, predecessor: false },
      timber:      { open: 2,  floor: 1, ceiling: 4,  volumeToShift: 200, recovery: 3,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      gold:        { open: 22, floor: 2, ceiling: 24, volumeToShift: 40,  recovery: 0,   drift: 0,     spread: 6,  traded: true,  predecessor: false },
      horses:      { open: 6,  floor: 2, ceiling: 14, volumeToShift: 90,  recovery: 2,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      ore:         { open: 3,  floor: 1, ceiling: 6,  volumeToShift: 150, recovery: 3,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      metal:       { open: 7,  floor: 2, ceiling: 12, volumeToShift: 110, recovery: 2,   drift: 0,     spread: 3,  traded: true,  predecessor: true },
      tooling:     { open: 4,  floor: 2, ceiling: 14, volumeToShift: 100, recovery: 2,   drift: 0.012, spread: 5,  traded: true,  predecessor: true },
      arms:        { open: 5,  floor: 3, ceiling: 24, volumeToShift: 90,  recovery: 2,   drift: 0.018, spread: 5,  traded: true,  predecessor: true },
      flax:        { open: 3,  floor: 1, ceiling: 7,  volumeToShift: 120, recovery: 1,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      linen:       { open: 11, floor: 3, ceiling: 22, volumeToShift: 90,  recovery: 3,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      hemp:        { open: 4,  floor: 1, ceiling: 7,  volumeToShift: 120, recovery: 1,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      cordage:     { open: 9,  floor: 3, ceiling: 22, volumeToShift: 90,  recovery: 3,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      madder:      { open: 5,  floor: 1, ceiling: 7,  volumeToShift: 120, recovery: 1,   drift: 0,     spread: 2,  traded: true,  predecessor: false },
      dye:         { open: 14, floor: 3, ceiling: 22, volumeToShift: 90,  recovery: 3,   drift: 0,     spread: 4,  traded: true,  predecessor: true },
      bloom:       { open: 6,  floor: 2, ceiling: 9,  volumeToShift: 110, recovery: 2,   drift: 0,     spread: 3,  traded: true,  predecessor: false },
      attar:       { open: 15, floor: 5, ceiling: 26, volumeToShift: 80,  recovery: 2,   drift: 0,     spread: 5,  traded: true,  predecessor: true },
      cores:       { open: 18, floor: 6, ceiling: 34, volumeToShift: 70,  recovery: 2,   drift: 0,     spread: 6,  traded: true,  predecessor: true },
      instruments: { open: 12, floor: 8, ceiling: 40, volumeToShift: 60,  recovery: 1,   drift: 0.04,  spread: 6,  traded: true,  predecessor: false },
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
    perPopulationForResolve: 250,
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
    breachThreshold: 5,        // section 11, turns of adjacency before a tier falls
    approachTurns: 3,          // section 10
    declarationWindow: 6,
    fleetBase: 4,              // units before any grievance
    fleetPerGrievance: 0.004,  // units per point of cumulative national grievance, times difficulty
    fleetMaxUnits: 60,
    waveSize: 5,
    waveInterval: 5,
    promotionChance: 0.3,      // section 8
    interventionGrievance: 1200,   // section 12, wartime grievance that buys a rival's ships
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
    improveTurns: { road: 2, clear: 4, plough: 3 },
  },

  // -------------------------------------------------------------------------------------------
  // World generation, session brief section 8 and military brief section 9
  // -------------------------------------------------------------------------------------------
  worldgen: {
    maxAttempts: 12,
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
    anchorageSpacing: 5,       // minimum tiles between anchorages
    anchoragePerCoastTiles: 12,
    charterSeparation: { small: 9, standard: 13, large: 17, massive: 22 } as Record<MapSize, number>,
    predecessorsPerThousandTiles: 4,
    predecessorTerritory: 8,   // tiles
    landingReach: 2,           // radius checked for food, timber and water
    minReachableChains: 2,
    minPredecessorsReachable: 2,
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
  },

  // -------------------------------------------------------------------------------------------
  // Rival charters brief
  // -------------------------------------------------------------------------------------------
  rivals: {
    count: 3,
    expansionBase: 0.03,       // progress per turn toward the next settlement, divided by (1 + held * expansionPerSettlement)
    expansionPerSettlement: 0.7,
    settlementCap: { small: 7, standard: 11, large: 15, massive: 20 } as Record<MapSize, number>,   // all rivals together
    popGrowthPerTurn: 0.06,
    strengthPerTurn: 0.08,
    marketFootprintPerPop: 0.8,   // units of a good sold per population point per turn
    crowdingRadius: 4,
    crowdingRelationPerTurn: 0.02,
    suspicionPerRaid: 0.2,
    tenseAt: 0.4,
    warAt: 1.0,
    colours: ['#7a1f2b', '#2b2f6e', '#2e2e2e'],   // deep crimson, indigo, charcoal
    names: ['Harrow Charter', 'Vane and Marlow', 'The Sable Company'],
  },

  // -------------------------------------------------------------------------------------------
  // Difficulty brief section 3. Difficulty changes the terms, never the rules.
  // -------------------------------------------------------------------------------------------
  difficulty: {
    generous: { startingColonists: 5, openingCharge: 0.03, chargeRise: 0.02, turnsBetweenDemands: 50, fleetMultiplier: 0.6, unresolvedThreshold: 8, rivalExpansion: 0.7, rivalsMayDeclare: false, alarmSensitivity: 0.7, wordPerValue: 8,  recoveryRate: 1.3 },
    standard: { startingColonists: 3, openingCharge: 0.05, chargeRise: 0.03, turnsBetweenDemands: 40, fleetMultiplier: 1.0, unresolvedThreshold: 6, rivalExpansion: 1.0, rivalsMayDeclare: false, alarmSensitivity: 1.0, wordPerValue: 10, recoveryRate: 1.0 },
    hard:     { startingColonists: 3, openingCharge: 0.08, chargeRise: 0.04, turnsBetweenDemands: 32, fleetMultiplier: 1.5, unresolvedThreshold: 5, rivalExpansion: 1.3, rivalsMayDeclare: true,  alarmSensitivity: 1.3, wordPerValue: 13, recoveryRate: 0.8 },
    punitive: { startingColonists: 2, openingCharge: 0.12, chargeRise: 0.05, turnsBetweenDemands: 25, fleetMultiplier: 2.2, unresolvedThreshold: 4, rivalExpansion: 1.6, rivalsMayDeclare: true,  alarmSensitivity: 1.6, wordPerValue: 16, recoveryRate: 0.6 },
  } as Record<Difficulty, DifficultyBundle>,

  // -------------------------------------------------------------------------------------------
  // Onboarding brief: starting position and unlock backstops
  // -------------------------------------------------------------------------------------------
  onboarding: {
    startingGold: 40,
    startingStock: { food: 20, timber: 10, tooling: 8, arms: 0 } as Partial<Record<GoodId, number>>,
    landingSites: 3,
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
    lodCull: 40,               // section 2, hysteretic
    lodRestore: 48,
    zoom: { fit: 0, overview: 16, working: 44, detail: 72, min: 6, max: 110 },
    momentumDecay: 0.92,       // per frame
    momentumStop: 0.02,
    rubberBand: 0.35,
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
    fogOfWar: false,               // decided against for version one, see DECISIONS.md
    massiveValidated: false,       // generated but unvalidated, section 12
  },
} as const

export type Constants = typeof C

export function difficultyOf(d: Difficulty): DifficultyBundle {
  return C.difficulty[d]
}
