// World generation. Deterministic from the seed, versioned by WORLDGEN_VERSION, validated and
// retried per session brief section 8. Uses rng.world only. Rivers, anchorages, primes, gold
// reserves, charter starts and predecessor placement all come from here.

import { C, WORLDGEN_VERSION } from './constants'
import { seedRng, next, int, chance, pick, shuffle, fork, makeNoise, fbm } from './rng'
import type { GameState, Settings, Tile, TerrainId, ForestId, PrimeId, RiverSegment, PredecessorSettlement, RngState, GoodId } from './state'
import { emptyStock } from './state'

export interface World {
  width: number
  height: number
  tiles: Tile[]
  anchorages: number[]
  rivers: RiverSegment[]
  charterLandings: number[]   // index 0 player
  landingSites: number[]      // three offered to the player
  predecessors: PredecessorSettlement[]
  attempts: number
}

const DIRS8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const DIRS4: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]]

export function neighbours8(w: number, h: number, i: number): number[] {
  const x = i % w, y = Math.floor(i / w)
  const out: number[] = []
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx)
  }
  return out
}
export function neighbours4(w: number, h: number, i: number): number[] {
  const x = i % w, y = Math.floor(i / w)
  const out: number[] = []
  for (const [dx, dy] of DIRS4) {
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx)
  }
  return out
}
export function dist(w: number, a: number, b: number): number {
  const ax = a % w, ay = Math.floor(a / w), bx = b % w, by = Math.floor(b / w)
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}
export function isLand(t: Tile): boolean { return t.terrain !== 'water' }

export function blankTile(terrain: TerrainId): Tile {
  return { terrain, forest: null, river: 0, road: false, improved: false, prime: null, goldReserve: 0, owner: null, worked: null, workings: false, explored: true }
}

/** Flood-fill land components. Returns component id per tile, -1 for water. */
export function landComponents(w: number, h: number, tiles: Tile[]): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(tiles.length).fill(-1)
  const sizes: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (!isLand(tiles[i]) || comp[i] >= 0) continue
    const id = sizes.length
    let size = 0
    const stack = [i]
    comp[i] = id
    while (stack.length) {
      const c = stack.pop()!
      size++
      for (const n of neighbours8(w, h, c)) {
        if (isLand(tiles[n]) && comp[n] < 0) { comp[n] = id; stack.push(n) }
      }
    }
    sizes.push(size)
  }
  return { comp, sizes }
}

/** Is this land tile coastal, meaning adjacent (4-way) to water? */
export function isCoastal(w: number, h: number, tiles: Tile[], i: number): boolean {
  if (!isLand(tiles[i])) return false
  for (const n of neighbours4(w, h, i)) if (tiles[n].terrain === 'water') return true
  return false
}

function generateOnce(seed: string, settings: Settings, attempt: number): World {
  const size = C.session.sizes[settings.size]
  const w = size.w, h = size.h, N = w * h
  const rng = fork(seedRng(seed + ':v' + WORLDGEN_VERSION), 'attempt' + attempt)
  const heightNoise = makeNoise(seed + ':h' + attempt)
  const moistNoise = makeNoise(seed + ':m' + attempt)
  const tempNoise = makeNoise(seed + ':t' + attempt)
  const forestNoise = makeNoise(seed + ':f' + attempt)
  const detailNoise = makeNoise(seed + ':d' + attempt)

  // ---- heightfield ------------------------------------------------------------------------
  const height = new Float64Array(N)
  const scale = C.worldgen.noiseScale * (settings.shape === 'archipelago' ? 1.9 : settings.shape === 'coast' ? 1.3 : 1)
  const cx = w / 2, cy = h / 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    let v = fbm(heightNoise, x * scale, y * scale, C.worldgen.noiseOctaves)
    v = v * 0.85 + detailNoise(x * 0.5, y * 0.5) * 0.15
    // edge falloff so the landmass has no dominant axis and the coast is reachable
    const ex = Math.min(x, w - 1 - x) / w, ey = Math.min(y, h - 1 - y) / h
    const edge = Math.min(ex, ey) / C.worldgen.edgeFalloff
    const fall = Math.min(1, edge)
    let shaped: number
    if (settings.shape === 'continent') {
      const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2)
      const r = Math.sqrt(dx * dx + dy * dy)
      shaped = v * fall * (1.15 - 0.55 * r * r)
    } else if (settings.shape === 'coast') {
      const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2)
      const r = Math.sqrt(dx * dx + dy * dy)
      shaped = v * fall * (1.05 - 0.3 * r)
    } else {
      shaped = v * Math.min(1, edge * 1.4)
    }
    height[i] = shaped
  }
  // land fraction by rank, so the setting is honoured exactly
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => height[b] - height[a])
  const landFrac = settings.landArea || C.session.landFraction[settings.shape]
  const landCount = Math.floor(N * landFrac)
  const tiles: Tile[] = new Array(N)
  for (let i = 0; i < N; i++) tiles[i] = blankTile('water')
  const landHeight = new Float64Array(N)
  const seaLevel = height[order[Math.min(N - 1, landCount)]]
  const maxH = height[order[0]]
  for (let k = 0; k < landCount; k++) {
    const i = order[k]
    tiles[i].terrain = 'grassland'
    landHeight[i] = (height[i] - seaLevel) / Math.max(1e-6, maxH - seaLevel)
  }

  // remove single-tile islands and lakes that are a single tile, for a readable coast
  for (let i = 0; i < N; i++) {
    if (isLand(tiles[i])) {
      let landN = 0
      for (const n of neighbours8(w, h, i)) if (isLand(tiles[n])) landN++
      if (landN === 0) tiles[i].terrain = 'water'
    }
  }

  // ---- terrain types ----------------------------------------------------------------------
  const rough = 0.35 + settings.roughness * 0.9
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const t = tiles[i]
    if (!isLand(t)) continue
    const hh = Math.pow(landHeight[i], 1 / rough)
    const m = fbm(moistNoise, x * 0.09, y * 0.09, 3) * 0.7 + settings.moisture * 0.3
    const temp = fbm(tempNoise, x * 0.07, y * 0.07, 3) * 0.6 + settings.temperature * 0.4
    let coastal = false
    for (const n of neighbours4(w, h, i)) if (tiles[n].terrain === 'water') coastal = true
    let terrain: TerrainId
    if (hh > C.worldgen.mountainThreshold) terrain = 'mountain'
    else if (hh > C.worldgen.highlandThreshold) terrain = 'highland'
    else if (m > 0.66 && hh < 0.22) terrain = 'marsh'
    else if (m < 0.3 && temp > 0.55) terrain = 'dry'
    else if (m > 0.52) terrain = 'grassland'
    else if (m > 0.4) terrain = 'plains'
    else terrain = 'downs'
    if (coastal && terrain === 'marsh' && m < 0.75) terrain = 'grassland'
    t.terrain = terrain
  }

  // ---- forest -----------------------------------------------------------------------------
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const t = tiles[i]
    if (!isLand(t) || t.terrain === 'mountain' || t.terrain === 'dry' || t.terrain === 'marsh') continue
    const f = fbm(forestNoise, x * 0.13, y * 0.13, 3) * 0.8 + settings.moisture * 0.2
    if (f < 1 - C.worldgen.forestChance) continue
    let coastal = false
    for (const n of neighbours8(w, h, i)) if (tiles[n].terrain === 'water') coastal = true
    let forest: ForestId
    if (t.terrain === 'highland') forest = 'highlandForest'
    else if (t.terrain === 'grassland') forest = 'deepTimber'
    else if (t.terrain === 'plains') forest = 'lightWoodland'
    else forest = coastal ? 'coastalScrub' : (f > 0.72 ? 'deepTimber' : 'coastalScrub')
    t.forest = forest
  }

  // ---- rivers -----------------------------------------------------------------------------
  const rivers: RiverSegment[] = []
  const riverCount = Math.max(2, Math.round(N / 1000 * C.worldgen.riversPerThousandTiles * (0.7 + settings.moisture * 0.6)))
  const sources = order.filter(i => isLand(tiles[i]) && (tiles[i].terrain === 'highland' || tiles[i].terrain === 'mountain'))
  shuffle(rng, sources)
  let made = 0
  const riverRng = fork(rng, 'rivers')
  for (const src of sources) {
    if (made >= riverCount) break
    const path: number[] = [src]
    let cur = src
    const seen = new Set<number>([src])
    let ok = false
    for (let step = 0; step < w + h; step++) {
      let best = -1, bestH = landHeight[cur]
      const ns = shuffle(riverRng, neighbours4(w, h, cur))
      for (const n of ns) {
        if (seen.has(n)) continue
        if (tiles[n].terrain === 'water') { best = n; bestH = -1; break }
        if (tiles[n].river > 0) { best = n; bestH = -1; break }
        const hn = landHeight[n] - (tiles[n].terrain === 'marsh' ? 0.08 : 0)
        if (hn < bestH) { bestH = hn; best = n }
      }
      if (best < 0) break
      if (tiles[best].terrain === 'water' || tiles[best].river > 0) { ok = true; break }
      path.push(best); seen.add(best); cur = best
    }
    if (!ok || path.length < 3) continue
    const major = path.length >= 6 && chance(riverRng, C.worldgen.majorRiverFraction)
    for (const i of path) {
      const level = major ? 2 : 1
      if (tiles[i].river < level) tiles[i].river = level as 1 | 2
    }
    rivers.push({ tiles: path, major })
    made++
  }

  // ---- primes, gold, workings -------------------------------------------------------------
  const primeRng = fork(rng, 'primes')
  const abundance = 0.5 + settings.abundance
  for (let i = 0; i < N; i++) {
    const t = tiles[i]
    if (t.terrain === 'water') {
      let nearLand = false
      for (const n of neighbours4(w, h, i)) if (isLand(tiles[n])) nearLand = true
      if (nearLand && chance(primeRng, C.worldgen.primeChance * abundance * 0.8)) t.prime = 'shoal'
      continue
    }
    if ((t.terrain === 'dry' || t.terrain === 'mountain') && chance(primeRng, C.worldgen.goldChance * abundance * 0.6)) {
      t.prime = 'seam'
      t.goldReserve = int(primeRng, C.terrain.goldReserve.min, C.terrain.goldReserve.max)
      continue
    }
    if (chance(primeRng, C.worldgen.workingsChance) && (t.terrain === 'highland' || t.terrain === 'downs' || t.terrain === 'dry')) {
      t.workings = true
      continue
    }
    if (!chance(primeRng, C.worldgen.primeChance * abundance)) continue
    const options: PrimeId[] = []
    if (t.forest) options.push('stand')
    switch (t.terrain) {
      case 'grassland': options.push('richSoil', 'pasture', 'bloomMeadow'); break
      case 'plains': options.push('richSoil', 'flaxField', 'madderBed'); break
      case 'downs': options.push('hempField', 'pasture', 'bloomMeadow', 'madderBed'); break
      case 'marsh': options.push('bloomMeadow'); break
      case 'highland': options.push('lode'); break
      case 'mountain': options.push('lode'); break
      default: break
    }
    if (options.length) t.prime = pick(primeRng, options)
  }

  // ---- anchorages -------------------------------------------------------------------------
  const anchorRng = fork(rng, 'anchorages')
  const coastTiles: number[] = []
  for (let i = 0; i < N; i++) {
    if (!isCoastal(w, h, tiles, i)) continue
    if (tiles[i].terrain === 'mountain') continue
    // needs open water: at least three water neighbours of eight
    let water = 0
    for (const n of neighbours8(w, h, i)) if (tiles[n].terrain === 'water') water++
    if (water >= 3) coastTiles.push(i)
  }
  shuffle(anchorRng, coastTiles)
  const wanted = Math.max(5, Math.round(coastTiles.length / C.worldgen.anchoragePerCoastTiles))
  const anchorages: number[] = []
  for (const i of coastTiles) {
    if (anchorages.length >= wanted) break
    if (anchorages.every(a => dist(w, a, i) >= C.worldgen.anchorageSpacing)) anchorages.push(i)
  }

  // ---- charter landings ------------------------------------------------------------------
  const { comp, sizes } = landComponents(w, h, tiles)
  const landingRng = fork(rng, 'landings')
  const viableAnchor = (i: number) => landingViable(w, h, tiles, i) && sizes[comp[i]] >= 40
  const candidates = shuffle(landingRng, anchorages.filter(viableAnchor))
  const sep = C.worldgen.charterSeparation[settings.size]
  const landings: number[] = []
  // the player gets the largest landmass's candidate first
  const bigComp = sizes.indexOf(Math.max(...sizes))
  const playerFirst = candidates.filter(i => comp[i] === bigComp)
  const rest = candidates.filter(i => comp[i] !== bigComp)
  for (const i of [...playerFirst, ...rest]) {
    if (landings.length >= 1 + C.rivals.count) break
    if (landings.every(l => dist(w, l, i) >= sep)) landings.push(i)
  }
  // relax separation if the map is tight
  if (landings.length < 1 + C.rivals.count) {
    for (const i of [...playerFirst, ...rest]) {
      if (landings.length >= 1 + C.rivals.count) break
      if (!landings.includes(i) && landings.every(l => dist(w, l, i) >= Math.floor(sep * 0.6))) landings.push(i)
    }
  }

  // three landing sites for the player: the player's anchorage and the two nearest viable ones on
  // the same landmass, so the choice is between coves of one coast rather than between continents
  const landingSites: number[] = []
  if (landings.length) {
    const home = landings[0]
    const near = anchorages
      .filter(a => comp[a] === comp[home] && viableAnchor(a) && !landings.slice(1).some(l => dist(w, l, a) < Math.floor(sep * 0.5)))
      .sort((a, b) => dist(w, home, a) - dist(w, home, b))
    for (const a of near) {
      if (landingSites.length >= C.onboarding.landingSites) break
      if (landingSites.every(s => dist(w, s, a) >= 3)) landingSites.push(a)
    }
    // fall back to viable coves near home that are not yet anchorages, and make them anchorages,
    // so the arrival still uses an anchorage
    if (landingSites.length < C.onboarding.landingSites) {
      const coves = coastTiles
        .filter(a => comp[a] === comp[home] && landingViable(w, h, tiles, a) && !anchorages.includes(a) && !landings.slice(1).some(l => dist(w, l, a) < Math.floor(sep * 0.5)))
        .sort((a, b) => dist(w, home, a) - dist(w, home, b))
      for (const a of coves) {
        if (landingSites.length >= C.onboarding.landingSites) break
        if (landingSites.every(s => dist(w, s, a) >= 3) && dist(w, home, a) <= 18) { landingSites.push(a); anchorages.push(a) }
      }
    }
  }

  // ---- predecessors -----------------------------------------------------------------------
  const predRng = fork(rng, 'predecessors')
  const predecessors: PredecessorSettlement[] = []
  const predWanted = Math.max(3, Math.round(N / 1000 * C.worldgen.predecessorsPerThousandTiles * (0.5 + settings.predecessorDensity)))
  const predCandidates = shuffle(predRng, order.filter(i => isLand(tiles[i]) && tiles[i].terrain !== 'mountain' && tiles[i].terrain !== 'dry' && sizes[comp[i]] >= 20))
  const skills: PredecessorSettlement['teaches'][] = ['flax', 'hemp', 'madder', 'bloom']
  const manufactured: GoodId[] = ['linen', 'cordage', 'dye', 'attar', 'cores', 'tooling', 'arms', 'metal', 'horses']
  let k = 0
  for (const i of predCandidates) {
    if (predecessors.length >= predWanted) break
    if (landings.some(l => dist(w, l, i) < 6)) continue
    if (landingSites.some(l => dist(w, l, i) < 5)) continue
    if (predecessors.some(p => dist(w, p.tile, i) < 6)) continue
    const territory = neighbours8(w, h, i).filter(n => isLand(tiles[n]))
    territory.push(i)
    const wants = shuffle(predRng, manufactured.slice())
    predecessors.push({
      id: predecessors.length,
      name: PREDECESSOR_NAMES[predecessors.length % PREDECESSOR_NAMES.length],
      tile: i,
      territory,
      teaches: skills[k++ % skills.length],
      taught: false,
      strong: wants[0],
      minor: [wants[1], wants[2]],
      lastBought: null,
      wealth: 0,
      alarm: 0,
      agent: false,
      scouted: false,
      closed: false,
      haggled: false,
      gifts: 0,
    })
  }

  return { width: w, height: h, tiles, anchorages, rivers, charterLandings: landings, landingSites, predecessors, attempts: attempt + 1 }
}

/** The landing invariant: food, timber and fresh water within reach. */
export function landingViable(w: number, h: number, tiles: Tile[], i: number): boolean {
  if (!isLand(tiles[i]) || tiles[i].terrain === 'mountain' || tiles[i].terrain === 'dry') return false
  let food = 0, timber = 0, water = 0
  const x = i % w, y = Math.floor(i / w)
  const r = C.worldgen.landingReach
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const t = tiles[ny * w + nx]
    if (t.terrain === 'water' || t.river > 0) water++
    if (t.forest) timber++
    const fy = C.terrain.yields[t.terrain].food ?? 0
    if (!t.forest && fy >= 3) food++
    if (t.terrain === 'water') food++
  }
  return food >= 3 && timber >= 1 && water >= 1
}

/** Which refining chain crops are on the same landmass as a tile. */
function chainsReachable(w: number, h: number, tiles: Tile[], comp: Int32Array, i: number): number {
  const c = comp[i]
  const found = new Set<string>()
  for (let k = 0; k < tiles.length; k++) {
    if (comp[k] !== c) continue
    const t = tiles[k]
    const y = C.terrain.yields[t.terrain]
    if (y.flax) found.add('flax')
    if (y.hemp) found.add('hemp')
    if (y.madder) found.add('madder')
    if (y.bloom) found.add('bloom')
    if (y.ore && y.ore >= 3) found.add('ore')
  }
  return found.size
}

function validate(world: World, settings: Settings): string | null {
  const { width: w, height: h, tiles } = world
  if (world.charterLandings.length < 1) return 'no landing'
  if (world.charterLandings.length < 1 + C.rivals.count) return 'too few charter landings'
  if (world.landingSites.length < C.onboarding.landingSites) return 'too few landing sites'
  const { comp, sizes } = landComponents(w, h, tiles)
  for (const l of world.charterLandings) {
    if (!landingViable(w, h, tiles, l)) return 'landing not viable'
    if (chainsReachable(w, h, tiles, comp, l) < C.worldgen.minReachableChains) return 'too few chains'
  }
  const home = world.charterLandings[0]
  const reachablePreds = world.predecessors.filter(p => comp[p.tile] === comp[home]).length
  if (reachablePreds < Math.min(C.worldgen.minPredecessorsReachable, world.predecessors.length)) return 'predecessors unreachable'
  if (world.anchorages.length < 4) return 'too few anchorages'
  // no unique resource on an unreachable landmass: bloom must exist on the home landmass
  let bloom = false
  for (let i = 0; i < tiles.length; i++) if (comp[i] === comp[home] && (C.terrain.yields[tiles[i].terrain].bloom ?? 0) >= 2) { bloom = true; break }
  if (!bloom) return 'no bloom reachable'
  if (sizes[comp[home]] < 60) return 'home landmass too small'
  return null
}

export function generateWorld(seed: string, settings: Settings): World {
  let last: World | null = null
  let reason = ''
  for (let attempt = 0; attempt < C.worldgen.maxAttempts; attempt++) {
    const world = generateOnce(seed, settings, attempt)
    const problem = validate(world, settings)
    last = world
    if (!problem) return world
    reason = problem
  }
  // Massive is generated but unvalidated per build specification section 12; for the tested sizes
  // the last attempt is returned and the problem is recorded on the state by the caller.
  ;(last as World & { problem?: string }).problem = reason
  return last!
}

/** One line of plain characterisation for a landing site, onboarding brief section 2. */
export function describeSite(w: number, h: number, tiles: Tile[], i: number): string {
  let food = 0, timber = 0, ore = 0, river = 0, water = 0, crops = 0, bloom = 0
  const x = i % w, y = Math.floor(i / w)
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const t = tiles[ny * w + nx]
    const yl = C.terrain.yields[t.terrain]
    if (t.terrain === 'water') water++
    if (t.river) river++
    if (t.forest) timber += C.terrain.forestTimber[t.forest]
    else food += yl.food ?? 0
    ore += yl.ore ?? 0
    crops += (yl.flax ?? 0) + (yl.hemp ?? 0) + (yl.madder ?? 0)
    bloom += yl.bloom ?? 0
  }
  const parts: string[] = []
  parts.push(timber >= 12 ? 'good timber' : timber >= 5 ? 'some timber' : 'little timber')
  if (ore >= 8) parts.push('ore in the hills')
  else if (ore <= 2) parts.push('poor ore')
  if (river >= 2) parts.push('a river')
  if (food >= 30) parts.push('open ground')
  else if (food < 16) parts.push('thin ground')
  if (bloom >= 6) parts.push('bloom meadows')
  if (crops >= 10) parts.push('crop country')
  if (water >= 12) parts.push('sheltered water')
  return parts.slice(0, 3).join(', ')
}

export const PREDECESSOR_NAMES = [
  'Ashby', 'Cold Harbour', 'Ferrier', 'Long Reach', 'Mallow', 'Nine Wells', 'Oxley', 'Redfern', 'Saltings', 'Tarn',
  'Wickham', 'Yarrow', 'Brackwater', 'Cray', 'Dunmere', 'Elder Flat', 'Fenwick', 'Gilling', 'Hartsop', 'Ings',
]

export const SETTLEMENT_NAMES = [
  'Fairholm', 'Brightwater', 'Carrick', 'Dunhaven', 'Easterly', 'Fenmoor', 'Greyling', 'Hollins', 'Inverlea', 'Kestrel',
  'Lanthorn', 'Marrow', 'Netherby', 'Orchard Hill', 'Pellam', 'Quarry Reach', 'Ravensmere', 'Sorrel', 'Thornfield', 'Upton',
  'Vale End', 'Westerly', 'Yewbank', 'Amble', 'Birchmoor', 'Cotterel', 'Dearing', 'Ember', 'Farrow', 'Glasswater',
]

/** Apply a world to a fresh state's world section. */
export function worldToState(world: World): GameState['world'] {
  return {
    width: world.width,
    height: world.height,
    tiles: world.tiles,
    anchorages: world.anchorages,
    rivers: world.rivers,
    landingSites: world.landingSites,
  }
}

export { emptyStock, seedRng, next, int, chance, pick, shuffle }
export type { RngState }
