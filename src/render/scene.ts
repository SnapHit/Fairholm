// The renderer. Architecture brief section 5 and art direction brief section 9. Draws on demand:
// once after a state change or a settled camera, continuously only while a gesture, momentum,
// glide or the arrival animation is in flight. DPR drops while moving and refines when settled.
// Props cull hysteretically with zoom in two tiers and nothing is rebuilt during a gesture; a state
// change during a gesture is deferred until it ends. A lost WebGL context is survived by rebuilding.
//
// What is baked, and when, per architecture brief section 3:
//   world     terrain mesh, vertex colours, baked occlusion, props, the shadow map's base
//   season    vertex colours, prop colours, the light, the shadow map's base, the clear colour
//   turn      ribbons, settlements, units, the visibility texture, and the shadow map's dynamic layer
//   frame     nothing but the draw itself and the drifting cloud
//
// The fog, art direction brief section 10a, is one texture a texel a tile (explored, in sight, how
// deep into the unknown) that every shader reads through one function in shading.ts, and a filter on
// what is built at all: a unit out of sight or a settlement never seen is not drawn, not tappable and
// not counted. The haze drifts on the cloud clock, which only runs while frames are drawn.
//
// There are no three.js lights in this scene. Every material is one custom shader in shading.ts, so
// the ground, a canopy, a roof and a unit are lit by the same warm key and the same cool sky.

import * as THREE from 'three'
import type { GameState } from '../sim/state'
import { C } from '../sim/constants'
import { MapCamera } from './camera'
import { buildTerrain, setOverlayTile, clearOverlay, type TerrainBuild } from './terrain'
import { buildRibbons } from './ribbons'
import { buildProps } from './props'
import { buildSettlements } from './settlements'
import { buildUnits, buildArrival, buildGhostLander, buildGhost, buildPlume, stacksAt, makeRing } from './units'
import { season } from '../sim/turn'
import { hex, tileColour, clearColour, type RGB } from './palette'
import { workableTiles, tileYield, tileOffers } from '../sim/labour'
import { neighbours8 } from '../sim/worldgen'
import { sightMask, unitVisible, settlementKnown } from '../sim/fog'
import { seedNumber } from './seed'
import { makeLightUniforms, applyLook, type LightUniforms } from './shading'
import { ShadowBake, type Occluder } from './shadow'
import { detailTextures, type DetailTextures } from './textures'
import { spriteSheet, buildBillboards, setBillboardFade, placeBillboard, manifestFrom, pictureBox, pictureCover, type AtlasManifest, type BillboardTag, type Billboard } from './billboards'
import { SelectionMark } from './selection'
import { SETTLEMENT_ATLAS } from './settlement-atlas'
import UNITS_ATLAS_JSON from '../../public/textures/units.json'
import { seasonLook, sunVector, hexRgb, PROPS, SHADOW, FOG, FOUND_PREVIEW, ARRIVAL, WAVE_COAST, MOVE } from './look'
import { sightOf } from '../sim/fog'
import { waveCandidates } from './selectors'

/** Where each sheet stands in the list handed to billboards.ts. */
const SHEET_SETTLEMENTS = 0
const SHEET_UNITS = 1
// the people's sheet ships with its manifest beside it in public/textures, and that manifest is
// the whole of what the renderer knows about it: a new figure on the sheet under its kind's name
// needs nothing here
const UNITS_ATLAS = manifestFrom(UNITS_ATLAS_JSON, 'units.json')

/** One unit's part in a move being drawn: the tiles it went through, from where it stood, and the
 *  picture travelling them. */
interface MoveTrail {
  id: number
  trail: number[]
  ghost: THREE.InstancedMesh | null
  plume: THREE.InstancedMesh | null
  /** Where the picture was built, so the plume can be moved by an offset from it, and the height a
   *  picture on the water stands at. */
  x0: number
  z0: number
  ghostY: number
  right: boolean
}

/** A move being drawn. The state has already moved on: the units are where they stopped and the
 *  ground they saw is explored. This is the moment between, drawn from what was known before. */
interface MoveAnim {
  ids: Set<number>
  /** What was explored before the move, one byte a tile. */
  before: Uint8Array
  trails: MoveTrail[]
  /** For each tile the move reveals, the step of the move at which it comes into sight, as a
   *  fraction of the way along; minus one for a tile the move does not reveal. */
  when: Float32Array
  /** What everything else of the player's can see, without the units that are moving. */
  others: Uint8Array
  started: boolean
  start: number
  /** When the last frame of the move was drawn, so the camera's pull is the same at any frame rate. */
  lastTick: number
  duration: number
  steps: number
  /** How far through the move the pictures are, in tiles. */
  p: number
  follow: number | null
  /** Where on the screen, in pixels, the followed unit is kept: the middle of the map left beside
   *  or above an open sheet, or the screen's middle when null. */
  hold: [number, number] | null
  done: (() => void) | null
}

export class Scene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  cam: MapCamera
  canvas: HTMLCanvasElement
  terrain: TerrainBuild | null = null
  ribbons: THREE.Mesh | null = null
  props: THREE.Group | null = null
  propsFine: THREE.Group | null = null
  propCount = 0
  settlements: THREE.Group | null = null
  private settlementClose: THREE.Group | null = null
  private settlementFar: THREE.Group | null = null
  units: THREE.Group | null = null
  unitPositions = new Map<number, [number, number]>()
  /** What is on the water that is not a unit: steam, and the Company's landers while a wave is at sea. */
  arrival: THREE.Group | null = null
  /** How many plumes are rising. While any is, the loop runs so the steam moves, for as long as
   *  ARRIVAL.steamSeconds from the turn's first picture of it, and then the steam thins away. */
  private steamCount = 0
  private steamTurn = -1
  private steamSince = 0
  /** The fog's texture, one texel a tile, and the sight mask it was last written from. */
  private vis: THREE.DataTexture | null = null
  private visMask: Uint8Array | null = null
  /** The nine tiles a settlement would work if founded here, painted on the map while the founding
   *  control is in focus: in bone where it may be founded, in the loss colour where it may not. */
  foundPreview: { tile: number; legal: boolean } | null = null
  /** The beaching: the settlement and the boat coming up out of nothing while the lander goes. */
  private fading: { k: number; settlements: Set<number>; units: Set<number> } | null = null
  private ghost: THREE.InstancedMesh | null = null
  beaching = false
  /** A move being drawn, between being prepared before the action and finishing after it. */
  private move: MoveAnim | null = null
  /** Which way each unit of the player's last went, true for right, so a unit that stops keeps
   *  facing the way it was going. View state only; nothing here is saved. */
  private lastRight = new Map<number, boolean>()
  /** The tile looked at when no unit is selected: a ring on it. */
  selRing: THREE.Mesh
  /** The selected unit: a ring in its owner's colour under it and an outline round its picture. */
  private selMark: SelectionMark
  /** Every unit's picture as it was last built: its box as offsets from where the unit stands, so a
   *  picture drawn travelling is found where it is, and the billboard it came from. What a tap is
   *  measured against, and what the selection outlines. */
  unitPictures = new Map<number, { box: [number, number, number, number]; bill: Billboard }>()
  /** Every settlement picture, where it stands: a tap on a building in front of a unit is a tap on
   *  the settlement. */
  settlementPictures: { id: number; box: [number, number, number, number]; foot: number; bill: Billboard }[] = []
  /** One set of light uniforms, shared by every material on the map. */
  light: LightUniforms = makeLightUniforms()
  detail: DetailTextures
  /** The two sheets everything drawn rather than built is drawn from: the early era buildings and
   *  the people. Their order here is the order billboards.ts is handed them in. */
  sheets: THREE.IUniform[]
  private sheetManifests: AtlasManifest[]
  /** Every picture standing on the map, in one mesh, sorted back to front with the settlements. */
  private billboards: THREE.InstancedMesh | null = null
  private unitClose: THREE.Group | null = null
  private unitFar: THREE.Group | null = null
  shadow: ShadowBake | null = null
  private staticOccluders: Occluder[] = []
  /** Whatever moved this turn, kept so the shadow bake can put it back on top of a fresh base. */
  private dynamicOccluders: Occluder[] = []
  /** The first bake of a world waits until a frame has been drawn. Everything else about the map is
   *  in that frame; the shadows are the one part worth a hundred and fifty milliseconds of the
   *  second the whole thing is supposed to take, and they can arrive on the frame after. */
  private bakePending = false
  private lastSeason = -1
  /** Which tiles people live on. Props are cleared around those, so founding a settlement has to
   *  rebuild them; the world's props are otherwise built once and left alone. */
  private lastClearKey = ''
  gestureActive = false
  private loopRunning = false
  private pendingState: GameState | null = null
  private pendingKind: 'full' | 'dynamic' | null = null
  private refineTimer: number | null = null
  private drawQueued = false
  private propsVisible = true
  private fineVisible = false
  /** Verification only: hold the level of detail where it is, so a frame can be shot with a tier
   *  switched off. Never set in play. */
  lockLod = false
  /** Verification only: hold a move being drawn at this share of the way through it, so a frame
   *  part way through can be shot on a machine too slow to catch one. Never set in play. */
  holdMoveAt: number | null = null
  private lastState: GameState | null = null
  private lastWorldKey = ''
  private contextLost = false
  private cloudTime = 0
  private lastFrame = 0
  overlayMode: 'none' | 'yields' | 'territory' | 'threat' = 'none'
  onFrame: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false })
    this.renderer.setClearColor(new THREE.Color(...hex(C.art.palette.deepWater)))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.cam = new MapCamera(1, 1)
    this.detail = detailTextures(() => this.requestDraw())
    this.sheetManifests = [SETTLEMENT_ATLAS, UNITS_ATLAS]
    this.sheets = this.sheetManifests.map(m => spriteSheet(m, () => this.requestDraw()))
    applyLook(this.light, seasonLook(1))
    this.selRing = makeRing(0xf4efe2, 0.52)
    this.selMark = new SelectionMark(this.sheets[SHEET_UNITS], this.light.uTime)
    this.scene.add(this.selRing, this.selMark.ring, this.selMark.outline)
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; this.finishMove() }, false)
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; if (this.lastState) { this.lastWorldKey = ''; this.rebuild(this.lastState, 'full') } }, false)
  }

  resize(width: number, height: number) {
    this.cam.resize(width, height)
    this.renderer.setSize(width, height, false)
    this.requestDraw()
  }

  /** Rebuild everything from state (world + dynamic) or only the dynamic layers. Deferred during a gesture. */
  rebuild(s: GameState, kind: 'full' | 'dynamic' = 'dynamic') {
    this.lastState = s
    if (this.gestureActive) {
      this.pendingState = s
      this.pendingKind = this.pendingKind === 'full' ? 'full' : kind
      return
    }
    const worldKey = s.seed + ':' + s.world.width + 'x' + s.world.height
    const needWorld = kind === 'full' || worldKey !== this.lastWorldKey || !this.terrain
    if (needWorld) {
      this.disposeWorld()
      const sn = season(s.turn)
      this.lastSeason = sn
      applyLook(this.light, seasonLook(sn))
      this.terrain = buildTerrain(s, seedNumber(s.seed), this.light, this.detail, sn)
      this.scene.add(this.terrain.mesh, this.terrain.water)
      // the fog's texture: a texel a tile, filtered, so a tile edge is already a gradient before
      // the shader softens it further
      if (this.vis) this.vis.dispose()
      this.vis = new THREE.DataTexture(new Uint8Array(s.world.width * s.world.height * 4), s.world.width, s.world.height, THREE.RGBAFormat)
      this.vis.magFilter = THREE.LinearFilter
      this.vis.minFilter = THREE.LinearFilter
      this.vis.needsUpdate = true
      this.light.uVis.value = this.vis
      this.lastClearKey = s.settlements.map(x => x.tile).join(',') + '|' + s.predecessors.map(x => x.tile).join(',')
      this.buildPropLayers(s, sn)
      this.shadow = new ShadowBake(s.world.width, s.world.height)
      this.light.uShadowMap.value = this.shadow.texture
      this.bakePending = true
      this.setClear(sn)
      this.cam.setMap(s.world.width, s.world.height)
      this.lastWorldKey = worldKey
    }
    this.rebuildDynamic(s)
    this.applySeason(s)
    this.requestDraw()
  }

  private buildPropLayers(s: GameState, sn: number) {
    if (!this.terrain) return
    if (this.props) { this.scene.remove(this.props); disposeGroup(this.props) }
    if (this.propsFine) { this.scene.remove(this.propsFine); disposeGroup(this.propsFine) }
    const pb = buildProps(s, this.terrain.heightAt, this.light, sn)
    this.props = pb.coarse
    this.propsFine = pb.fine
    this.propCount = pb.count
    this.staticOccluders = pb.occluders
    this.props.visible = this.propsVisible
    this.propsFine.visible = this.fineVisible
    this.scene.add(this.props, this.propsFine)
  }

  /** The ground's own shadow plus everything permanent standing on it. Per world and per season. */
  private bakeShadowBase(s: GameState) {
    if (!this.shadow || !this.terrain) return
    const sun = sunVector(seasonLook(this.lastSeason))
    // the sea is a surface at zero, not the bed under it: without the clamp the land throws a long
    // shadow across the water as though the water were not there
    const h = this.terrain.heightAt
    this.shadow.bakeBase((x, z) => Math.max(0, h(x, z)) * SHADOW.terrainScale, sun, this.staticOccluders)
  }

  /** Beyond everything drawn is the clear colour: with the fog on it is the haze, because nothing
   *  beyond the map is known either; off, the season's own. */
  private setClear(sn: number) {
    const c = C.flags.fogOfWar ? hexRgb(seasonLook(sn).hazeDeep) : clearColour(sn)
    this.renderer.setClearColor(new THREE.Color(c[0], c[1], c[2]))
  }

  /** Write what is known into the fog's texture: red where the ground has been seen, green where it
   *  is in sight now, blue how far into the unknown a tile lies, from the frontier out to the depth
   *  at which the haze is at its deepest. A breadth first spread from the known tiles, eight ways,
   *  once per state change. */
  private updateVisibility(s: GameState) {
    if (!this.vis) return
    const mask = sightMask(s)
    this.visMask = mask
    if (this.move) { this.writeMoveVisibility(s); return }
    const n = s.world.width * s.world.height
    const known = new Float32Array(n)
    for (let i = 0; i < n; i++) known[i] = s.world.tiles[i].explored ? 1 : 0
    this.writeVisibility(s, known, mask)
  }

  /** Write the fog's texture from how known each tile is, nought to one, and what is in sight. */
  private writeVisibility(s: GameState, knownness: Float32Array, mask: Uint8Array) {
    if (!this.vis) return
    const w = s.world.width, h = s.world.height, n = w * h
    const data = this.vis.image.data as Uint8Array
    const far = new Int16Array(n).fill(-1)
    const queue: number[] = []
    for (let i = 0; i < n; i++) if (knownness[i] >= 0.5) { far[i] = 0; queue.push(i) }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]
      if (far[i] >= FOG.depthTiles) continue
      const x = i % w, z = (i - x) / w
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, zz = z + dz
        if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue
        const j = zz * w + xx
        if (far[j] < 0) { far[j] = far[i] + 1; queue.push(j) }
      }
    }
    for (let i = 0; i < n; i++) {
      const k = knownness[i]
      data[i * 4] = Math.round(255 * k)
      data[i * 4 + 1] = mask[i] ? 255 : 0
      data[i * 4 + 2] = k >= 0.5 ? 0 : Math.round(255 * Math.min(1, (far[i] < 0 ? FOG.depthTiles : far[i]) / FOG.depthTiles))
      data[i * 4 + 3] = 255
    }
    this.vis.needsUpdate = true
  }

  /** The fog part way through a move: what was known before, and each tile the move reveals coming
   *  up as the picture nears the step it is first seen from; in sight, what the rest of the player's
   *  things see and what the moving units see from where their pictures are now. */
  private writeMoveVisibility(s: GameState) {
    const m = this.move
    if (!m) return
    const w = s.world.width, n = w * s.world.height
    const known = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      if (m.before[i]) { known[i] = 1; continue }
      const at = m.when[i]
      // a tile explored by the move but never in sight of its path comes up as the move ends
      known[i] = at < 0 ? (s.world.tiles[i].explored && m.started && m.p >= m.steps ? 1 : 0) : Math.max(0, Math.min(1, m.p - (at - 1)))
    }
    const mask = m.others.slice()
    for (const t of m.trails) {
      const here = t.trail[Math.min(t.trail.length - 1, Math.round(Math.min(m.p, t.trail.length - 1)))]
      const u = s.units.find(x => x.id === t.id)
      const r = u ? sightOf(u.kind) : 1
      const x0 = here % w, z0 = Math.floor(here / w)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx, z = z0 + dz
        if (x < 0 || z < 0 || x >= w || z >= s.world.height) continue
        mask[z * w + x] = 1
      }
    }
    this.writeVisibility(s, known, mask)
  }

  /** The fog as a filter on what is built: the player's own things always, the Company's landers
   *  always, anyone else's only in sight; a settlement once seen; a predecessor people once found. */
  private visibility(s: GameState) {
    const moving = this.move?.ids
    if (!C.flags.fogOfWar) return moving ? { unit: (u: GameState['units'][number]) => !moving.has(u.id), settlements: null } : null
    const mask = this.visMask ?? sightMask(s)
    return {
      // a unit being drawn travelling is drawn by its picture, not where it stopped
      unit: (u: GameState['units'][number]) => !(moving && moving.has(u.id)) && unitVisible(s, u, mask),
      settlements: {
        known: settlementKnown,
        inSight: (tile: number) => mask[tile] === 1,
        predecessor: (p: GameState['predecessors'][number]) => p.scouted,
      },
    }
  }

  private rebuildDynamic(s: GameState) {
    if (!this.terrain) return
    const h = this.terrain.heightAt
    const sn = this.lastSeason >= 0 ? this.lastSeason : season(s.turn)
    this.updateVisibility(s)
    const vis = this.visibility(s)
    // a settlement clears the ground it stands on, so a new one means the props change
    const clearKey = s.settlements.map(x => x.tile).join(',') + '|' + s.predecessors.map(x => x.tile).join(',')
    if (clearKey !== this.lastClearKey) {
      this.lastClearKey = clearKey
      this.buildPropLayers(s, sn)
      this.bakeShadowBase(s)
    }
    if (this.ribbons) { this.scene.remove(this.ribbons); this.ribbons.geometry.dispose(); (this.ribbons.material as THREE.Material).dispose() }
    this.ribbons = buildRibbons(s, h, this.light, sn)
    this.scene.add(this.ribbons)
    if (this.settlements) { this.scene.remove(this.settlements); disposeGroup(this.settlements) }
    const sb = buildSettlements(s, h, this.light, SHEET_SETTLEMENTS, sn, vis ? vis.settlements : null)
    this.settlements = sb.group
    this.settlementClose = sb.close
    this.settlementFar = sb.far
    this.scene.add(this.settlements)
    if (this.units) { this.scene.remove(this.units); disposeGroup(this.units) }
    const ub = buildUnits(s, h, this.light, this.sheetManifests[SHEET_UNITS], SHEET_UNITS, vis?.unit, (id) => this.lastRight.get(id))
    this.units = ub.group
    this.unitClose = ub.close
    this.unitFar = ub.far
    this.unitPositions = ub.positions
    this.unitPictures = new Map()
    for (const b of ub.billboards) if (b.tag?.kind === 'unit') this.unitPictures.set(b.tag.id, { box: pictureBox(b), bill: b })
    this.settlementPictures = sb.billboards.filter(b => b.tag?.kind === 'settlement').map(b => {
      const [l, t, r, d] = pictureBox(b)
      return { id: b.tag!.id, box: [b.x + l, b.z + t, b.x + r, b.z + d] as [number, number, number, number], foot: b.z, bill: b }
    })
    // a unit being drawn travelling can still be tapped where it stopped
    if (this.move) for (const id of this.move.ids) {
      const u = s.units.find(x => x.id === id)
      if (u) this.unitPositions.set(id, [(u.tile % s.world.width) + 0.5, Math.floor(u.tile / s.world.width) + 0.5])
    }
    this.scene.add(this.units)
    // every picture on the map in one layer, so a person in front of a barn is drawn in front of it
    if (this.billboards) { this.scene.remove(this.billboards); this.billboards.geometry.dispose(); (this.billboards.material as THREE.Material).dispose() }
    this.billboards = buildBillboards([...sb.billboards, ...ub.billboards], this.light, this.sheets, this.sheetManifests.map(m => m.size))
    if (this.billboards) this.scene.add(this.billboards)
    this.applyFades()
    this.applyTierVisibility()
    // what is on the water that is not a unit: steam, and the Company's landers while a wave is at sea
    this.showArrival(s)
    // whatever moved this turn puts its shadow back on top of the baked base
    this.dynamicOccluders = [...sb.occluders, ...ub.occluders]
    if (this.shadow && !this.bakePending) this.shadow.stampDynamic(sunVector(seasonLook(sn)), this.dynamicOccluders)
    this.updateOverlay(s)
    this.updateRings(s)
  }

  private disposeWorld() {
    if (this.vis) { this.vis.dispose(); this.vis = null; this.light.uVis.value = null }
    if (this.terrain) {
      this.scene.remove(this.terrain.mesh, this.terrain.water)
      this.terrain.mesh.geometry.dispose(); this.terrain.material.dispose()
      this.terrain.water.geometry.dispose(); this.terrain.waterMaterial.dispose()
      this.terrain.overlay.dispose()
      this.terrain = null
    }
    if (this.ribbons) { this.scene.remove(this.ribbons); this.ribbons.geometry.dispose(); this.ribbons = null }
    if (this.props) { this.scene.remove(this.props); disposeGroup(this.props); this.props = null }
    if (this.propsFine) { this.scene.remove(this.propsFine); disposeGroup(this.propsFine); this.propsFine = null }
    if (this.shadow) { this.shadow.dispose(); this.shadow = null }
  }

  /** The season turns four times a year and takes the whole palette with it: the light, the ground,
   *  the canopies, the water and the length of every shadow. A bake, not a tint, and only when the
   *  season index actually moves. */
  applySeason(s: GameState) {
    if (!this.terrain) return
    const sn = season(s.turn)
    if (sn === this.lastSeason) return
    this.lastSeason = sn
    applyLook(this.light, seasonLook(sn))
    this.terrain.recolour(s, sn)
    this.setClear(sn)
    this.buildPropLayers(s, sn)
    this.bakeShadowBase(s)
    this.rebuildDynamic(s)
    this.requestDraw()
  }

  /** What is on the water that is not a unit: the steam off a lander just down, and the Company's
   *  landers while a wave is at sea. */
  showArrival(s: GameState) {
    if (this.arrival) { this.scene.remove(this.arrival); disposeGroup(this.arrival); this.arrival = null }
    const vis = this.visibility(s)
    const positions = new Map(this.unitPositions)
    // a rival's lander steams only where it can be seen, which is wherever it was drawn
    if (vis) for (const u of s.units) if (!vis.unit(u)) positions.delete(u.id)
    const ab = buildArrival(s, this.light, this.sheetManifests[SHEET_UNITS], SHEET_UNITS, this.sheets, this.sheetManifests.map(m => m.size), positions)
    this.arrival = ab.group
    this.steamCount = ab.steaming
    if (ab.steaming && this.steamTurn !== s.turn) { this.steamTurn = s.turn; this.steamSince = performance.now() }
    if (this.arrival) this.scene.add(this.arrival)
    if (this.steaming()) this.startLoop()
  }

  /** The beaching, onboarding brief section 2. The state has already changed: the lander is gone,
   *  the settlement stands on the shore and the boat lies on the water. This draws the moment
   *  between: a picture of the lander runs from where it lay onto the shore and fades as the
   *  settlement's first buildings and the boat come up out of nothing. Nothing in the state moves.
   *  Call `prepareBeaching` before the action is applied, so the first rebuild after it draws the
   *  settlement and the boat at nothing rather than letting them pop in. */
  prepareBeaching(settlementId: number, boatId: number) {
    this.fading = { k: 0, settlements: new Set([settlementId]), units: new Set([boatId]) }
    this.beaching = true
  }

  animateBeaching(s: GameState, from: [number, number], shoreTile: number, done: () => void) {
    if (!this.fading) { done(); return }
    const w = s.world.width
    const to: [number, number] = [(shoreTile % w) + 0.5, Math.floor(shoreTile / w) + 0.5]
    const B = ARRIVAL.beach
    const start = performance.now()
    const smooth = (t: number) => t * t * (3 - 2 * t)
    const band = (t: number, a: number, b: number) => smooth(Math.max(0, Math.min(1, (t - a) / (b - a))))
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / B.ms)
      const move = smooth(Math.min(1, t / B.moveUntil))
      const x = from[0] + (to[0] - from[0]) * move, z = from[1] + (to[1] - from[1]) * move
      const gone = band(t, B.fadeFrom, B.fadeTo)
      if (this.ghost) { this.scene.remove(this.ghost); this.ghost.geometry.dispose(); (this.ghost.material as THREE.Material).dispose(); this.ghost = null }
      if (gone < 1) {
        this.ghost = buildGhostLander(x, z, 1 - gone, this.light, this.sheetManifests[SHEET_UNITS], SHEET_UNITS, this.sheets, this.sheetManifests.map(m => m.size))
        if (this.ghost) this.scene.add(this.ghost)
      }
      if (this.fading) { this.fading.k = band(t, B.appearFrom, B.appearTo); this.applyFades() }
      if (!this.loopRunning) this.draw(true)
      if (t < 1) requestAnimationFrame(step)
      else {
        this.fading = null
        this.beaching = false
        this.applyFades()
        this.requestDraw()
        done()
      }
    }
    requestAnimationFrame(step)
  }

  /** Put the beaching's fade onto the pictures it concerns, in place, without a rebuild. */
  private applyFades() {
    if (!this.billboards) return
    const f = this.fading
    setBillboardFade(this.billboards, (tag: BillboardTag | null) => {
      if (!tag) return null
      if (!f) return 1
      if (tag.kind === 'settlement' && f.settlements.has(tag.id)) return f.k
      if (tag.kind === 'unit' && f.units.has(tag.id)) return f.k
      return 1
    })
  }

  // ---- a move, drawn --------------------------------------------------------------------------
  /** Before an action that moves units of the player's: take what is explored now, so the first
   *  rebuild after the action draws the fog as it was and leaves the moving units out, rather than
   *  showing them already arrived. Ends any move still being drawn. */
  prepareMove(s: GameState, ids: number[]) {
    this.finishMove()
    const n = s.world.width * s.world.height
    const before = new Uint8Array(n)
    for (let i = 0; i < n; i++) before[i] = s.world.tiles[i].explored ? 1 : 0
    // what everything else sees does not change with the move; the moving units' own sight is
    // added from wherever their pictures are
    const others = sightMask({ ...s, units: s.units.filter(u => !ids.includes(u.id)) } as GameState)
    this.move = {
      ids: new Set(ids), before, trails: [], when: new Float32Array(n).fill(-1), others,
      started: false, start: 0, lastTick: 0, duration: 0, steps: 0, p: 0, follow: null, hold: null, done: null,
    }
  }

  /** Draw the prepared move: each unit's picture travels the tiles it went through, from where it
   *  stood to where it stopped, while the fog lifts as it comes into sight of new ground, and the
   *  camera keeps `follow` on the screen at the point `hold`, in pixels. A unit in the prepared set
   *  with no trail here did not move and is drawn where it is at once. Nothing in the state moves. */
  animateMoves(s: GameState, trails: { id: number; trail: number[] }[], follow: number | null, hold: [number, number] | null, done: () => void) {
    const m = this.move
    const real = trails.filter(t => t.trail.length > 1 && s.units.some(u => u.id === t.id))
    if (!m || !real.length || !this.terrain) { this.cancelMove(); done(); return }
    const w = s.world.width, h = s.world.height
    m.ids = new Set(real.map(t => t.id))
    m.steps = Math.max(...real.map(t => t.trail.length - 1))
    // which tiles each step brings into sight, first come first served
    m.when.fill(-1)
    for (const t of real) {
      const u = s.units.find(x => x.id === t.id)!
      const r = sightOf(u.kind)
      t.trail.forEach((tile, k) => {
        const x0 = tile % w, z0 = Math.floor(tile / w)
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const x = x0 + dx, z = z0 + dz
          if (x < 0 || z < 0 || x >= w || z >= h) continue
          const i = z * w + x
          if (m.before[i]) continue
          if (m.when[i] < 0 || k < m.when[i]) m.when[i] = k
        }
      })
    }
    m.others = sightMask({ ...s, units: s.units.filter(u => !m.ids.has(u.id)) } as GameState)
    const sheet = this.sheetManifests[SHEET_UNITS], sizes = this.sheetManifests.map(x => x.size)
    const heightAt = this.terrain.heightAt
    m.trails = real.map(t => {
      const u = s.units.find(x => x.id === t.id)!
      const x0 = (t.trail[0] % w) + 0.5, z0 = Math.floor(t.trail[0] / w) + 0.5
      const right = (t.trail[1] % w) > (t.trail[0] % w) ? true : (t.trail[1] % w) < (t.trail[0] % w) ? false : (this.lastRight.get(t.id) ?? false)
      const ghost = buildGhost(u, x0, z0, right, heightAt, this.light, sheet, SHEET_UNITS, this.sheets, sizes)
      if (ghost) this.scene.add(ghost)
      const ghostY = ghost ? (ghost.geometry.getAttribute('aFoot').array as Float32Array)[1] : 0
      // a lander just down steams as it goes
      const plume = u.kind === 'lander' && s.turn <= C.lander.steamTurns ? buildPlume([stacksAt(x0, z0, sheet)], this.light) : null
      if (plume) this.scene.add(plume)
      return { id: t.id, trail: t.trail, ghost, plume, x0, z0, right, ghostY }
    })
    m.follow = follow !== null && m.ids.has(follow) ? follow : null
    m.hold = hold
    m.done = done
    m.duration = MOVE.tileMs * (m.steps + MOVE.easeTiles)
    m.start = performance.now()
    m.lastTick = m.start
    m.started = true
    m.p = 0
    // the units leave their arrival tiles and their pictures start from where they stood
    if (this.lastState) this.rebuild(this.lastState, 'dynamic')
    this.startLoop()
  }

  /** How far the camera's centre sits from a point it keeps at screen position `hold`, in tiles. */
  holdOffset(hold: [number, number] | null): [number, number] {
    if (!hold) return [0, 0]
    const z = this.cam.view.zoom
    return [(this.cam.width / 2 - hold[0]) / z, (this.cam.height / 2 - hold[1]) / z]
  }

  /** Where a unit's picture is while a move is drawn, or null when it is not moving. */
  ghostAt(id: number): [number, number] | null {
    const m = this.move
    if (!m || !m.started || !this.lastState) return null
    const t = m.trails.find(x => x.id === id)
    if (!t) return null
    return this.trailPoint(t, m.p, this.lastState.world.width)
  }

  private trailPoint(t: MoveTrail, p: number, w: number): [number, number] {
    const last = t.trail.length - 1
    const q = Math.max(0, Math.min(last, p))
    const k = Math.min(last - 1, Math.floor(q)), f = q - k
    const a = t.trail[k], b = t.trail[Math.min(last, k + 1)]
    const ax = (a % w) + 0.5, az = Math.floor(a / w) + 0.5, bx = (b % w) + 0.5, bz = Math.floor(b / w) + 0.5
    return [ax + (bx - ax) * f, az + (bz - az) * f]
  }

  /** One frame of a move: the pictures along their trails, the fog behind them, the camera after
   *  the one being followed. Returns whether the move is still being drawn. */
  private tickMove(now: number): boolean {
    const m = this.move
    const s = this.lastState
    if (!m || !m.started || !s) return false
    const w = s.world.width
    let t = Math.min(1, (now - m.start) / Math.max(1, m.duration))
    if (this.holdMoveAt !== null && t > this.holdMoveAt) { t = this.holdMoveAt; m.start = now - t * m.duration }
    // even pace with a short ease at either end, in tiles
    const e = MOVE.easeTiles / (m.steps + MOVE.easeTiles)
    const eased = t < e ? (t * t) / (2 * e) / (1 - e) : t > 1 - e ? 1 - ((1 - t) * (1 - t)) / (2 * e) / (1 - e) : (t - e / 2) / (1 - e)
    m.p = Math.max(0, Math.min(1, eased)) * m.steps
    const sheet = this.sheetManifests[SHEET_UNITS], sizes = this.sheetManifests.map(x => x.size)
    for (const tr of m.trails) {
      const [x, z] = this.trailPoint(tr, m.p, w)
      // a profile turns when its heading does
      const k = Math.min(tr.trail.length - 2, Math.floor(Math.min(m.p, tr.trail.length - 1)))
      if (k >= 0) {
        const ax = tr.trail[k] % w, bx = tr.trail[k + 1] % w
        const right = bx > ax ? true : bx < ax ? false : tr.right
        if (right !== tr.right && this.terrain) {
          tr.right = right
          const u = s.units.find(q => q.id === tr.id)
          if (tr.ghost) { this.scene.remove(tr.ghost); tr.ghost.geometry.dispose(); (tr.ghost.material as THREE.Material).dispose() }
          tr.ghost = u ? buildGhost(u, tr.x0, tr.z0, right, this.terrain.heightAt, this.light, sheet, SHEET_UNITS, this.sheets, sizes) : null
          if (tr.ghost) this.scene.add(tr.ghost)
        }
      }
      // the picture's foot goes with it, so it reads the light and the fog where it is now
      if (tr.ghost) placeBillboard(tr.ghost, 0, x, isHullKind(s, tr.id) ? tr.ghostY : this.terrain ? this.terrain.heightAt(x, z) : tr.ghostY, z)
      if (tr.plume) tr.plume.position.set(x - tr.x0, 0, z - tr.z0)
      // and a tap on it, and the ring round it, find it where it is drawn
      this.unitPositions.set(tr.id, [x, z])
    }
    this.writeMoveVisibility(s)
    // the camera keeps the followed unit, and the ground just ahead of it, on the screen
    if (m.follow !== null && !this.gestureActive) {
      const tr = m.trails.find(q => q.id === m.follow)
      if (tr) {
        const [x, z] = this.trailPoint(tr, m.p, w)
        const [ax, az] = this.trailPoint(tr, m.p + 1, w)
        const dx = ax - x, dz = az - z, len = Math.hypot(dx, dz) || 1
        const v = this.cam.view
        const [ox, oz] = this.holdOffset(m.hold)
        const ahead = t < 1 ? MOVE.lookAhead : 0
        const tx = x + (dx / len) * ahead + ox, tz = z + (dz / len) * ahead + oz
        // the pull is per sixtieth of a second, so a phone dropping frames still keeps up
        const pull = 1 - Math.pow(1 - MOVE.follow, Math.max(0, now - m.lastTick) / (1000 / 60))
        v.cx += (tx - v.cx) * pull
        v.cz += (tz - v.cz) * pull
        this.cam.glideTarget = null
        this.cam.apply()
      }
    }
    m.lastTick = now
    // the frame that ends the move still counts as moving, so the loop draws once more and picks up
    // the glide that settles the camera
    if (t >= 1) this.endMove()
    return true
  }

  /** The move is over: the units stand where they stopped, facing the way they were going, and the
   *  fog is the state's own again. */
  private endMove() {
    const m = this.move
    if (!m) return
    const s = this.lastState
    for (const tr of m.trails) {
      this.lastRight.set(tr.id, tr.right)
      if (tr.ghost) { this.scene.remove(tr.ghost); tr.ghost.geometry.dispose(); (tr.ghost.material as THREE.Material).dispose() }
      if (tr.plume) { this.scene.remove(tr.plume); tr.plume.geometry.dispose(); (tr.plume.material as THREE.Material).dispose() }
    }
    // settle the camera on the followed unit where it stopped
    if (m.follow !== null && s && !this.gestureActive) {
      const u = s.units.find(x => x.id === m.follow)
      if (u) {
        const w = s.world.width
        const [ox, oz] = this.holdOffset(m.hold)
        this.cam.glideToPoint((u.tile % w) + 0.5 + ox, Math.floor(u.tile / w) + 0.5 + oz, this.cam.view.zoom)
      }
    }
    const done = m.done
    this.move = null
    if (s) this.rebuild(s, 'dynamic')
    if (done) done()
  }

  /** End a move being drawn, if one is, and leave a prepared one alone: before any other action. */
  endRunningMove() {
    if (this.move?.started) this.endMove()
  }

  /** Draw a move still in progress to its end at once: before another action, an undo, a new game. */
  finishMove() {
    if (this.move?.started) this.endMove()
    else if (this.move) this.cancelMove()
  }

  /** Forget a prepared move that did not happen, and draw the state as it is. */
  cancelMove() {
    if (!this.move) return
    const m = this.move
    for (const tr of m.trails) {
      if (tr.ghost) { this.scene.remove(tr.ghost); tr.ghost.geometry.dispose(); (tr.ghost.material as THREE.Material).dispose() }
      if (tr.plume) { this.scene.remove(tr.plume); tr.plume.geometry.dispose(); (tr.plume.material as THREE.Material).dispose() }
    }
    this.move = null
    if (this.lastState) this.rebuild(this.lastState, 'dynamic')
  }

  /** Whether a move is being drawn now. */
  get moving(): boolean { return !!this.move?.started }

  /** Selection ring and unit ring follow ViewState. */
  updateRings(s: GameState) {
    const v = this.cam.view
    const w = s.world.width
    // a tile looked at has its ring; a selected unit has its own mark instead, not both
    if (v.selectedTile !== null && v.activeUnit === null && this.terrain) {
      const x = (v.selectedTile % w) + 0.5, z = Math.floor(v.selectedTile / w) + 0.5
      this.selRing.position.set(x, this.terrain.heightAt(x, z) + 0.02, z)
      this.selRing.visible = true
    } else this.selRing.visible = false
    const u = v.activeUnit !== null ? s.units.find(x => x.id === v.activeUnit) : undefined
    const p = u ? this.ghostAt(u.id) ?? this.unitPositions.get(u.id) ?? null : null
    if (u && p) {
      const pic = this.unitPictures.get(u.id)
      const colour = u.owner === 0 ? s.charters[0].colour : s.charters[u.owner]?.colour ?? s.charters[0].colour
      // the outline goes round the picture where it is drawn; a picture being drawn travelling is a
      // ghost of it, and the ring alone follows that
      const outlined = pic && this.propsVisible && !this.move?.ids.has(u.id) ? {
        box: [p[0] + pic.box[0], p[1] + pic.box[1], p[0] + pic.box[2], p[1] + pic.box[3]] as [number, number, number, number],
        piece: pic.bill.piece, sheetSize: this.sheetManifests[SHEET_UNITS].size, flip: pic.bill.flip,
        share: pic.bill.cut > 0 ? 1 - pic.bill.cut : 1, foot: p, bob: pic.bill.bob,
      } : null
      this.selMark.show(p, colour, outlined, v.zoom, pic && this.propsVisible ? pic.box[2] - pic.box[0] : 0)
    } else this.selMark.hide()
    // the selection grid: light lines on the selected tile only, via the overlay alpha
    if (this.terrain) {
      this.terrain.material.uniforms.selected.value = v.selectedTile ?? -1
    }
  }

  /** Overlays paint the overlay texture. Territory, yields, threat. */
  updateOverlay(s: GameState) {
    if (!this.terrain) return
    const tex = this.terrain.overlay
    clearOverlay(tex)
    const w = s.world.width
    const mode = this.overlayMode
    const fog = C.flags.fogOfWar
    const known = (i: number) => !fog || s.world.tiles[i].explored
    if (mode === 'territory') {
      for (let i = 0; i < s.world.tiles.length; i++) {
        const t = s.world.tiles[i]
        if (t.owner !== null && s.charters[t.owner] && known(i)) setOverlayTile(tex, w, i, hex(s.charters[t.owner].colour), 0.28)
      }
      for (const p of s.predecessors) if (!fog || p.scouted) for (const t of p.territory) if (known(t)) setOverlayTile(tex, w, t, [0.72, 0.6, 0.38], 0.22)
    } else if (mode === 'yields') {
      const v = this.cam.view
      const st = v.selectedTile !== null ? s.settlements.find(x => x.owner === 0 && workableTiles(s, x).includes(v.selectedTile!)) : undefined
      const home = st ?? s.settlements.find(x => x.owner === 0)
      if (home) {
        for (const t of workableTiles(s, home)) {
          let best = 0, bestGood = ''
          for (const g of tileOffers(s.world.tiles[t])) {
            const y = tileYield(s, t, g, null)
            if (y > best) { best = y; bestGood = g }
          }
          const a = Math.min(0.6, best * 0.09)
          const c: RGB = bestGood === 'bloom' ? hex(C.art.palette.bloom) : [0.98, 0.9, 0.5]
          setOverlayTile(tex, w, t, c, a)
        }
      }
    } else if (mode === 'threat') {
      const mask = fog ? (this.visMask ?? sightMask(s)) : null
      for (const u of s.units) {
        if (u.owner === 0) continue
        if (mask && !unitVisible(s, u, mask)) continue
        const hostile = u.owner === -1 || (s.charters[u.owner] && s.charters[u.owner].relation === 'war')
        if (!hostile) continue
        const x0 = u.tile % w, z0 = Math.floor(u.tile / w)
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x0 + dx, nz = z0 + dz
          if (nx < 0 || nz < 0 || nx >= w || nz >= s.world.height) continue
          setOverlayTile(tex, w, nz * w + nx, [0.85, 0.2, 0.15], 0.35 - 0.06 * (Math.abs(dx) + Math.abs(dz)))
        }
      }
    }
    // the war: while a wave is at sea, the coast it might still come ashore on, narrowing each turn.
    // Military brief section 10: three turns of visible, progressively narrowing approach
    const d = s.declaration
    if (d?.declared) {
      const wc = hexRgb(WAVE_COAST.colour)
      for (const wave of d.waves) {
        if (wave.landed) continue
        const k = 1 - wave.turnsToLand / C.military.approachTurns
        const a = WAVE_COAST.alphaFrom + (WAVE_COAST.alphaTo - WAVE_COAST.alphaFrom) * Math.max(0, Math.min(1, k))
        for (const t of waveCandidates(s, wave)) setOverlayTile(tex, w, t, wc, a)
      }
    }
    // the founding preview: the nine tiles a settlement here would work
    if (this.foundPreview) {
      const fp = this.foundPreview
      const c = hexRgb(fp.legal ? FOUND_PREVIEW.legal : FOUND_PREVIEW.illegal)
      for (const t of neighbours8(w, s.world.height, fp.tile)) setOverlayTile(tex, w, t, c, FOUND_PREVIEW.ring)
      setOverlayTile(tex, w, fp.tile, c, FOUND_PREVIEW.centre)
    }
    tex.needsUpdate = true
  }

  setOverlay(mode: 'none' | 'yields' | 'territory' | 'threat', s: GameState) {
    this.overlayMode = mode
    this.updateOverlay(s)
    this.requestDraw()
  }

  /** Two hysteretic tiers, art brief section 10. Trees and boulders from working zoom up; tufts,
   *  undergrowth and shingle only at detail zoom, where they are the difference between a lit
   *  surface and a place. Visibility only, never a rebuild. */
  private updateLod() {
    if (this.lockLod) return
    const z = this.cam.view.zoom
    if (this.propsVisible && z < PROPS.coarseCull) this.propsVisible = false
    else if (!this.propsVisible && z > PROPS.coarseRestore) this.propsVisible = true
    if (this.fineVisible && z < PROPS.fineCull) this.fineVisible = false
    else if (!this.fineVisible && z > PROPS.fineRestore) this.fineVisible = true
    if (this.props) this.props.visible = this.propsVisible
    if (this.propsFine) this.propsFine.visible = this.propsVisible && this.fineVisible
    this.applyTierVisibility()
  }

  /** What the coarse tier being on or off means for everything that is not a prop: a settlement or
   *  a drawn unit below that zoom is one mark in owner colour and nothing else, and the ground takes
   *  on the colour of the props it is no longer wearing. */
  private applyTierVisibility() {
    if (this.settlementClose) this.settlementClose.visible = this.propsVisible
    if (this.settlementFar) this.settlementFar.visible = !this.propsVisible
    if (this.unitClose) this.unitClose.visible = this.propsVisible
    if (this.unitFar) this.unitFar.visible = !this.propsVisible
    if (this.billboards) this.billboards.visible = this.propsVisible
    if (this.terrain) this.terrain.material.uniforms.uCover.value = this.propsVisible ? 0 : 1
  }

  /** Begin or end a gesture. Continuous drawing while active. */
  setGesture(active: boolean) {
    if (active === this.gestureActive) return
    this.gestureActive = active
    if (active) { this.cam.stop(); this.cam.glideTarget = null; this.startLoop() }
    else {
      this.flushPending()
      this.startLoop()   // momentum and spring-back continue in the loop until settled
    }
  }

  private flushPending() {
    if (this.pendingState) {
      const s = this.pendingState, k = this.pendingKind ?? 'dynamic'
      this.pendingState = null; this.pendingKind = null
      this.rebuild(s, k)
    }
  }

  glideTo(tile: number, zoom: number) {
    this.cam.glideTo(tile, zoom)
    this.startLoop()
  }

  glideToPoint(x: number, z: number, zoom: number) {
    this.cam.glideToPoint(x, z, zoom)
    this.startLoop()
  }

  requestDraw() {
    if (this.drawQueued) return
    this.drawQueued = true
    requestAnimationFrame(() => { this.drawQueued = false; if (!this.loopRunning) this.draw(false) })
  }

  private startLoop() {
    if (this.loopRunning) return
    this.loopRunning = true
    if (this.refineTimer !== null) { clearTimeout(this.refineTimer); this.refineTimer = null }
    const frame = () => {
      // both, every frame: a short-circuit here starves the glide whenever the camera is springing
      const settling = this.cam.tick()
      const gliding = this.cam.glideTick()
      const travelling = this.tickMove(performance.now())
      const moving = this.gestureActive || settling || gliding || this.beaching || travelling
      // the opening image is a lander down and steaming, and steam that does not move is not
      // steaming: while a plume rises the loop runs, and it ends when the steam does. Nothing else
      // idle draws anything; the haze drifts only when a frame is drawn for some other reason
      const ambient = this.steaming()
      this.draw(moving)
      if (moving || ambient) requestAnimationFrame(frame)
      else {
        this.loopRunning = false
        // settle: refine at full DPR after a short pause
        this.refineTimer = window.setTimeout(() => { this.refineTimer = null; this.draw(false) }, C.feel.settleRefineDelayMs)
      }
    }
    requestAnimationFrame(frame)
  }

  draw(moving: boolean) {
    if (this.contextLost) return
    const want = Math.min(window.devicePixelRatio || 1, moving ? C.feel.dprMoving : C.feel.dprSettled)
    if (Math.abs(this.renderer.getPixelRatio() - want) > 0.01) {
      this.renderer.setPixelRatio(want)
      this.renderer.setSize(this.cam.width, this.cam.height, false)
    }
    this.updateLod()
    const now = performance.now()
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0
    this.lastFrame = now
    this.cloudTime += dt * 0.02
    this.light.uCloudTime.value = this.cloudTime
    this.light.uTime.value = (now / 1000) % 3600
    this.light.uSteam.value = this.steamLeft(now)
    if (this.terrain) {
      this.terrain.material.uniforms.gridMix.value = this.cam.view.zoom >= C.feel.tileTapFloor ? 1 : 0
    }
    if (this.lastState) this.updateRings(this.lastState)
    this.renderer.render(this.scene, this.cam.camera)
    if (this.onFrame) this.onFrame()
    // the deferred first bake, now that there is a coastline on the screen
    if (this.bakePending && this.lastState && this.terrain && this.shadow) {
      this.bakePending = false
      this.bakeShadowBase(this.lastState)
      this.shadow.stampDynamic(sunVector(seasonLook(this.lastSeason)), this.dynamicOccluders)
      this.requestDraw()
    }
  }

  /** How much of a picture is drawn at a point on the ground, with its foot at (fx, fz): nought
   *  where it is clear, one where it is solid, null while its sheet cannot be read. For a tap. */
  pictureCover(b: Billboard, fx: number, fz: number, wx: number, wz: number): number | null {
    return pictureCover(b, this.sheets[b.sheet], this.sheetManifests[b.sheet].size, fx, fz, wx, wz)
  }

  /** True while a plume is rising off a lander just down. */
  private steaming(): boolean {
    return this.steamCount > 0 && !this.contextLost && this.steamLeft(performance.now()) > 0
  }

  /** How much of this turn's steam is left, one to nothing. */
  private steamLeft(now: number): number {
    const end = this.steamSince + (ARRIVAL.steamSeconds + ARRIVAL.steamFadeSeconds) * 1000
    return Math.max(0, Math.min(1, (end - now) / (ARRIVAL.steamFadeSeconds * 1000)))
  }

  /** Nudge the clouds a little between turns so a quiet turn still moves. */
  advanceClouds() { this.cloudTime += 0.35 }

  /** Warm the shaders so the first real frame is not the one that compiles them. */
  warm() { if (this.lastState) { this.renderer.compile(this.scene, this.cam.camera); this.draw(true) } }

  pixelsPerTile(): number { return this.cam.view.zoom }

  /** Whether the map is at a zoom where a unit is a drawing rather than a mark. */
  get drawnClose(): boolean { return this.propsVisible }

  /** Read the frame back as RGBA pixels, bottom row first. For verification: a WebGL canvas is
   *  cleared once it has been presented, so looking at what was drawn needs a render target. */
  readFrame(w: number, h: number): Uint8Array {
    const rt = new THREE.WebGLRenderTarget(w, h)
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(rt)
    this.renderer.render(this.scene, this.cam.camera)
    const buf = new Uint8Array(w * h * 4)
    this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf)
    this.renderer.setRenderTarget(prev)
    rt.dispose()
    return buf
  }
  colourOfTile(s: GameState, i: number): RGB { return tileColour(s.world.tiles[i], this.lastSeason) }
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach(x => x.dispose())
    else if (mat) mat.dispose()
  })
}

/** Whether a unit stands on the water, and so its picture at the waterline rather than on the ground. */
function isHullKind(s: GameState, id: number): boolean {
  const u = s.units.find(x => x.id === id)
  return !!u && (u.kind === 'lander' || u.kind === 'lighter' || u.kind === 'trader' || u.kind === 'raider' || u.kind === 'cutter' || u.kind === 'companyShip')
}
