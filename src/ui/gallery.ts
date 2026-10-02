// The gallery. A hidden view at /?gallery that stands every drawing the game has on the real map,
// under the real light, so that scale, shadow and colour can be judged side by side rather than
// one at a time in play. Art direction brief sections 6 and 7 ask for one family of drawings at one
// scale; this is where that is checked.
//
// It is the production renderer and nothing else: the same terrain, the same shadow bake, the same
// season palettes, the same billboard layer. What it stands on them is a stage rather than a game:
// a flat coast built by hand, with every kind of unit in every owner's colour in a row beside a
// colonist for scale, three settlements of two, six and twelve people behind them, every hull on
// the water, the lander offshore with its plume, and a wood at one side to compare shadows against.
//
// It never touches the player's save and nothing in the game links to it. It is reached by typing
// the address, and that is the whole of its interface, apart from a season to pick and the pinch
// the map already has.

import { createGame } from '../sim/actions'
import { blankTile } from '../sim/worldgen'
import { emptyStock, emptyBuildings, type GameState, type Unit, type UnitKind, type Settlement, type Colonist, type Tile } from '../sim/state'
import { C } from '../sim/constants'
import { SEASON_NAMES } from '../sim/turn'
import { Scene } from '../render/scene'
import { Input } from './input'
import { h, button, clear } from './dom'
import { installTheme } from './theme'
import { mountStackCounts } from './stacks'

/** The stage, in tiles. Water above the shore row, land from it down. */
const STAGE = {
  width: 30,
  height: 20,
  /** The first row of land. */
  shore: 9,
  /** Where the wood begins, to the right. */
  wood: 26,
  /** The land kinds every owner has, one row each, two tiles apart because a hauler is long. */
  landKinds: ['colonist', 'militia', 'improver', 'outrider', 'hauler', 'battery', 'damagedBattery'] as UnitKind[],
  /** The Company's kinds, in their own row, with a colonist at the head of it for scale. */
  companyKinds: ['regulars', 'horse', 'siegeTrain', 'damagedSiegeTrain'] as UnitKind[],
  /** The hulls every owner has, on the water, three tiles apart because a ship is long. */
  hullKinds: ['lighter', 'trader', 'raider', 'cutter'] as UnitKind[],
  /** The three settlements behind the rows, by how many live there. */
  settlements: [2, 6, 12],
  /** Which turn stands for each season: the first month of each. */
  seasonTurns: [1, 4, 7, 10],
}

function stageTile(x: number, z: number): Tile {
  if (z < STAGE.shore) { const t = blankTile('water'); t.explored = true; return t }
  // grassland, ploughed: the renderer rolls a landform under every map that can carry low ground
  // under the waterline, and a stage wants its floor above it everywhere. Ploughed ground is
  // flattened to less than half the roll, which with this seed keeps the whole stage dry
  const t = blankTile('grassland')
  t.explored = true
  t.improved = true
  if (x >= STAGE.wood) t.forest = x === STAGE.width - 1 ? 'deepTimber' : 'lightWoodland'
  return t
}

function stageUnit(id: number, owner: number, kind: UnitKind, tile: number, flagged = true, going: number[] = [], quality: Unit['quality'] = 'raw'): Unit {
  return { id, owner, kind, tile, quality, moves: 0, cargo: {}, colonist: null, order: null, path: going, damage: 0, progress: 0, since: {}, flagged, aboard: [] }
}

function stageSettlement(id: number, tile: number, pop: number): Settlement {
  const colonists: Colonist[] = []
  for (let i = 0; i < pop; i++) colonists.push({ id: 1000 + id * 100 + i, standing: 'free', speciality: null, job: { kind: 'idle' }, arrived: 1 })
  return {
    id, name: `Stage ${pop}`, tile, owner: 0, founded: 1, colonists,
    stock: emptyStock(), frame: 0, foodStore: 0, hunger: 0, buildings: emptyBuildings(), imported: {},
    buildQueue: [], building: null,
    orders: { purpose: 'food', surplus: { threshold: 0, destination: { kind: 'hold' } }, growth: { kind: 'keep' }, reviewed: true },
    grievance: 0, resolve: 0, education: null, conditions: {}, lastProduced: {}, abstractPop: pop, nameChosen: true, seen: null,
  }
}

/** A game state that is a stage: a real game's charters, market and settings around a coast laid
 *  out by hand. Built fresh as one object; nothing here is a save and nothing writes to it. */
export function stageState(turn: number): GameState {
  const base = createGame('gallery', { size: 'small', shape: 'continent', firstGame: false }, 0)
  const w = STAGE.width, hgt = STAGE.height
  const tiles: Tile[] = []
  for (let z = 0; z < hgt; z++) for (let x = 0; x < w; x++) tiles.push(stageTile(x, z))
  const at = (x: number, z: number) => z * w + x
  const units: Unit[] = []
  let id = 1
  const owners = base.charters.map(c => c.id)
  // the land rows, one per owner, from the shore down. Every second row is on its way to the right,
  // so the profiles in it are mirrored and the two can be compared
  // the second row is hardened and the third sworn, so the chevrons can be seen beside the rings
  const QUALITY: Unit['quality'][] = ['raw', 'hardened', 'sworn', 'raw']
  owners.forEach((owner, row) => {
    const z = STAGE.shore + 3 + row
    STAGE.landKinds.forEach((kind, k) => {
      const tile = at(2 + k * 2, z)
      units.push(stageUnit(id++, owner, kind, tile, true, row % 2 ? [tile + 1] : [], QUALITY[row % QUALITY.length]))
    })
  })
  // a stack: three of the player's on one tile, so the count can be seen
  const stackTile = at(16, STAGE.shore + 3)
  for (let k = 0; k < 3; k++) units.push(stageUnit(id++, 0, k === 0 ? 'militia' : 'colonist', stackTile))
  // the Company's row, with a colonist for scale
  const companyRow = STAGE.shore + 3 + owners.length + 1
  units.push(stageUnit(id++, 0, 'colonist', at(2, companyRow)))
  STAGE.companyKinds.forEach((kind, k) => units.push(stageUnit(id++, -1, kind, at(4 + k * 2, companyRow))))
  // the hulls, one row per owner on the water, the Company's ship and an unflagged raider after
  // them; the second row is under way to the right, so the wakes and the mirroring can be seen
  owners.forEach((owner, row) => {
    const z = 1 + row * 2
    STAGE.hullKinds.forEach((kind, k) => {
      const tile = at(3 + k * 3, z)
      units.push(stageUnit(id++, owner, kind, tile, true, row === 1 ? [tile + 1] : []))
    })
  })
  units.push(stageUnit(id++, 1, 'raider', at(15, 3), false))
  units.push(stageUnit(id++, -1, 'companyShip', at(15, 7)))
  const settlements = STAGE.settlements.map((pop, i) => stageSettlement(i, at(3 + i * 8, STAGE.shore + 1), pop))
  for (const st of settlements) tiles[st.tile].worked = st.id
  // the player's lander at sea in fog, off to the right of the hulls, as the opening finds it; and
  // a wave of the recall fleet motoring in toward the coast beside the middle settlement
  const splash = at(22, 4)
  const lander = stageUnit(id++, 0, 'lander', splash)
  lander.aboard = [{ id: 9000, standing: 'contracted', speciality: null, job: { kind: 'idle' }, arrived: 1 }]
  units.push(lander)
  const landing = settlements[0].tile
  return {
    ...base,
    turn,
    world: { width: w, height: hgt, tiles, rivers: [], splashdowns: [splash] },
    charters: base.charters.map(c => ({ ...c, landing })),
    settlements,
    units,
    predecessors: [],
    declaration: {
      declared: true, turnDeclared: turn, interventionProgress: 0, nextWaveId: 2, won: false, lost: false, intervened: null,
      waves: [{ id: 1, units: [], target: at(12, STAGE.shore), at: at(13, STAGE.shore - 3), turnsToLand: C.military.approachTurns, landed: false, excluded: [] }],
    },
    intent: 'The gallery.',
  }
}

export interface Gallery {
  scene: Scene
  state: GameState
  /** Show a season, nought to three. */
  season(k: number): void
}

export function mountGallery(root: HTMLElement): Gallery {
  installTheme()
  const canvas = h('canvas', { id: 'map' }) as HTMLCanvasElement
  const strip = h('div', { id: 'gallery' })
  root.append(canvas, strip)
  const scene = new Scene(canvas)
  const stacks = mountStackCounts(root, scene)
  let state = stageState(STAGE.seasonTurns[1])
  let seasonNow = 1
  const show = () => {
    scene.rebuild(state, 'full')
    scene.showArrival(state)
    stacks.rebuild(state)
    scene.requestDraw()
  }
  const season = (k: number) => {
    seasonNow = k
    state = stageState(STAGE.seasonTurns[k])
    show()
    renderStrip()
  }
  const renderStrip = () => {
    clear(strip)
    strip.append(
      h('span', { class: 'label' }, 'Gallery'),
      ...SEASON_NAMES.map((name, k) => button(name, () => season(k), k === seasonNow ? 'on' : '')),
      h('span', { class: 'zoom' }, `${Math.round(scene.cam.view.zoom)} px a tile`),
    )
  }
  const gallery: Gallery = { scene, state, season }
  Object.defineProperty(gallery, 'state', { get: () => state })
  new Input(canvas, scene.cam, {
    onTap: () => {},
    onDoubleTap: () => {},
    onHold: () => {},
    onHoldProgress: () => {},
    onGesture: (a) => scene.setGesture(a),
    onFirstInteraction: () => {},
  })
  const layout = () => {
    const w = root.clientWidth, hh = root.clientHeight
    canvas.style.width = w + 'px'
    canvas.style.height = hh + 'px'
    scene.resize(w, hh)
  }
  new ResizeObserver(layout).observe(root)
  layout()
  scene.onFrame = () => {
    stacks.place()
    const z = strip.querySelector('.zoom')
    if (z) z.textContent = `${Math.round(scene.cam.view.zoom)} px a tile`
  }
  show()
  scene.cam.centreOn((STAGE.shore + 4) * STAGE.width + 8, C.feel.zoom.working)
  renderStrip()
  return gallery
}
