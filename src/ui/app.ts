// The interface core. Interaction brief sections 2 to 6, onboarding brief throughout, and the
// settlement screen and layout brief section 1: the map fills the viewport at all times, with two
// thin strips over it. The queue is a compact bar carrying its top item and a count; tapping it
// expands the list and resolving or dismissing collapses it again. Sheets slide up over the map and
// go away by a tap outside them or a swipe down. There are no confirmation dialogs: anything within
// a turn can be undone.

import type { GameState, DerivedQueue, QueueGroup, QueueItem, Settings, Settlement, BuildingLine, Unit } from '../sim/state'
import { applyAction, createGame, type Action } from '../sim/actions'
import { deriveQueue, unitLabel } from '../sim/queue'
import { SYSTEMS } from '../sim/systems'
import { SEASON_NAMES, season, year } from '../sim/turn'
import { randomSeed, playRng } from '../sim/rng'
import { C } from '../sim/constants'
import { findPath } from '../sim/units'
import { neighbours8, isLand } from '../sim/worldgen'
import { foundingProblem } from '../sim/settlement'
import { openingAction, siteScore } from '../sim/autopilot'
import { planRoute, type RoutePlan, type Route } from '../sim/route'
import type { HaulStop, UnitOrder } from '../sim/state'
import { authoringCard } from './card'

/** A haul circuit or a patrol being planned: the unit it is for, the stops so far, and for a haul
 *  the risk posture (rival charters brief section 8). Nothing is written to the state until Save. */
export interface Authoring {
  unit: number
  kind: 'haul' | 'patrol'
  stops: HaulStop[]
  tiles: number[]
  risk: 'avoid' | 'run' | 'escort'
}
import { Scene } from '../render/scene'
import { pick, tileUnderPoint } from '../render/picking'
import { Input } from './input'
import { MusicPlayer } from './audio'
import { mountStackCounts, type StackCounts } from './stacks'
import { mountRouteLayer, type RouteLayer } from './route'
import { unitCard, passengerCard, tileCard, type Card } from './card'
import { h, clear, append, button, row, muted, fmt, plural } from './dom'
import { renderSheet, type SheetSpec } from './sheets'
import { ownSettlements, type RingCell, type BuildingSlot } from './selectors'
import { SHEET_DISMISS_PX, TAP_MIN_PX, installTheme, shouldReflow } from './theme'
import { mountOpening, type Opening } from './opening'
import * as Save from '../io/save'
import * as Telemetry from '../io/telemetry'
import { term } from './glossary'

/** A passenger's step from the lander onto the shore beside it, plotted as a route is and drawn as a
 *  boarding is, the other way: the disembark action, which puts the next one off on that tile. */
export type AshoreRoute = Route & { ashore: true; aboard: number | null }
/** What a hold has plotted: a route the simulation planned, or a passenger's step ashore. */
export type UiRoute = RoutePlan | AshoreRoute

/** Sheets that take the whole display rather than sliding up over part of it. */
function isFullScreenSheet(spec: SheetSpec): boolean {
  return spec.kind === 'settlement'
}

export class App {
  state: GameState
  scene: Scene
  input: Input
  music: MusicPlayer
  queue: DerivedQueue = { shown: [], folded: [], crisis: false }
  sheet: SheetSpec = { kind: 'queue' }
  sheetHistory: SheetSpec[] = []
  undoStack: { snapshot: GameState; label: string }[] = []
  /** The route the active unit's hold is aiming, or the reason there is none: nothing has moved,
   *  and letting go commits it. Feel brief section 4. */
  route: UiRoute | null = null
  /** The tile looked at with a tap when no unit is selected: its card shows in the queue bar's place. */
  focusTile: number | null = null
  /** A passenger chosen from the lander's detail to go ashore: which one, by their place in the
   *  lander's list, or null for the next one off. A hold on the shore beside the lander then plots
   *  their step ashore. */
  passenger: { lander: number; aboard: number | null } | null = null
  /** The colonist being placed, while the player is choosing where they should work. */
  pick: { settlement: number; colonist: number } | null = null
  /** The tile the founding control is looking at: the shore the lander would beach on, or the
   *  ground a colonist stands on. The map paints the ring it would work while this is set. */
  foundTarget: number | null = null
  /** The five lines over the opening shot, while they are up. */
  opening: Opening | null = null
  /** Whether the queue is showing its list rather than just its top item. */
  queueExpanded = false
  root: HTMLElement
  canvas: HTMLCanvasElement
  hud: HTMLElement
  sheetEl: HTMLElement
  sheetBody: HTMLElement
  scrim: HTMLElement
  queuebar: HTMLElement
  toastEl: HTMLElement
  ring: HTMLElement
  overlayEl: HTMLElement
  audioStrip: HTMLElement
  turnStartedAt = performance.now()
  private toastTimer: number | null = null
  private stacks: StackCounts
  private routeLayer: RouteLayer

  constructor(root: HTMLElement, state: GameState, resumed: boolean, notice: string | null = null) {
    installTheme()
    this.root = root
    this.state = state
    this.canvas = h('canvas', { id: 'map' }) as HTMLCanvasElement
    this.hud = h('div', { id: 'hud' })
    // pointerdown rather than click: a tap on the map that opens a sheet puts the scrim up under
    // the finger before the browser's click arrives, and a click handler here closed the sheet
    // the same tap had opened. A dismissing tap begins on the scrim; the browser's click does not
    this.scrim = h('div', { id: 'scrim', onPointerdown: () => this.closeSheet() })
    this.sheetBody = h('div', { class: 'body' })
    this.sheetEl = h('div', { id: 'sheet' }, h('div', { class: 'grip' }), this.sheetBody)
    this.queuebar = h('div', { id: 'queuebar' })
    this.toastEl = h('div', { id: 'toast' })
    this.ring = h('div', { id: 'holdring' })
    this.overlayEl = h('div', { id: 'overlay' })
    this.audioStrip = h('div', { id: 'audio' })
    root.append(this.canvas, this.hud, this.audioStrip, this.scrim, this.sheetEl, this.queuebar, this.ring, this.toastEl, this.overlayEl)
    this.attachSheetSwipe()
    // the shell never scrolls: it hides its overflow, but a browser bringing a control into view, or
    // a focused field, can still scroll it, and then every tap lands a little off the map it meant
    root.addEventListener('scroll', () => { if (root.scrollTop || root.scrollLeft) { root.scrollTop = 0; root.scrollLeft = 0 } })
    this.scene = new Scene(this.canvas)
    this.stacks = mountStackCounts(root, this.scene)
    this.routeLayer = mountRouteLayer(root, this.scene)
    this.scene.onFrame = () => { this.stacks.place(); this.routeLayer.place() }
    this.music = new MusicPlayer(state.settings.audio)
    this.music.onChange = (a) => { this.state.settings.audio = { ...this.state.settings.audio, ...a }; this.renderAudio() }
    this.input = new Input(this.canvas, this.scene.cam, {
      onTap: (x, y) => this.tap(x, y),
      onDoubleTap: (x, y) => this.doubleTap(x, y),
      onHold: (x, y) => this.hold(x, y),
      onAim: (x, y) => this.aimMove(x, y),
      onRelease: (x, y) => this.release(x, y),
      onAimCancel: () => this.cancelAim(),
      onHoldProgress: (x, y, k) => this.holdRing(x, y, k),
      onGesture: (a) => this.scene.setGesture(a),
      onFirstInteraction: () => this.music.unlock(),
    })
    // the first tap anywhere starts the music; every tap after it quietly rescues a refused start
    document.addEventListener('pointerdown', () => this.music.unlock(), { capture: true })
    new ResizeObserver(() => this.layout()).observe(root)
    this.layout()
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save() })
    Save.requestPersistence()
    this.scene.rebuild(this.state, 'full')
    this.scene.warm()
    if (!resumed && !this.state.settlements.length) this.beginArrival()
    else {
      this.scene.cam.centreOn(this.homeTile(), C.feel.zoom.working)
      this.refresh()
      if (resumed) this.showReturnScreen()
    }
    if (notice) this.toast(notice)
  }

  /** Where the camera goes home to: the first settlement, else the lander, else where it came down. */
  homeTile(): number {
    const s = this.state
    const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
    return s.settlements.find(x => x.owner === 0)?.tile ?? lander?.tile ?? s.charters[0].landing
  }

  // ---- layout ---------------------------------------------------------------------------------
  /** The map is the whole viewport, portrait and landscape alike. Nothing is parked over it. */
  layout() {
    const w = this.root.clientWidth, hh = this.root.clientHeight
    this.root.classList.toggle('landscape', w > hh * 1.2)
    // the settlement screen's flanks move below the ring when the screen is narrow for the reader's
    // own font size, so nothing is ever squeezed to the point of being cut off
    const base = parseFloat(getComputedStyle(document.documentElement).fontSize)
    this.root.classList.toggle('narrow', shouldReflow(w, isFinite(base) ? base : 16))
    this.canvas.style.width = w + 'px'
    this.canvas.style.height = hh + 'px'
    this.scene.resize(w, hh)
    if (this.queuebar) this.updateInset()
  }

  // ---- arrival ----------------------------------------------------------------------------------
  /** The opening: a fresh game at sea. The camera settles on the lander at working zoom, the queue
   *  bar is there as always, the five lines fade in over the shot, and the first tap anywhere is the
   *  player's: it takes the lines away and starts the music, and nothing was ever blocked. */
  beginArrival() {
    this.scene.cam.centreOn(this.homeTile(), C.feel.zoom.working)
    this.scene.requestDraw()
    this.sheet = { kind: 'queue' }
    this.queueExpanded = false
    this.foundTarget = null
    this.scene.foundPreview = null
    this.opening?.dismiss()
    this.opening = mountOpening(this.root)
    Telemetry.newGame()
    this.refresh()
  }

  /** The voyage played by the machine, for the rigs and the smoke test: sail to the best coast and
   *  found, ending turns as it goes, through the same actions a player would take. Resolves to the
   *  turn the first settlement was founded on, or -1 if forty turns were not enough. */
  async autoplayOpening(maxTurns = 40): Promise<number> {
    this.opening?.dismiss()
    for (let i = 0; i < maxTurns; i++) {
      if (this.state.settlements.some(x => x.owner === 0)) return this.state.turn
      let guard = 0
      for (;;) {
        const a = openingAction(this.state)
        if (!a || guard++ > 4) break
        if (a.t === 'found') { await this.found(a.unit, a.tile); break }
        if (a.t === 'moveUnit') { if (!(await this.moveTo(a.unit, a.path[a.path.length - 1]))) break; continue }
        if (!this.dispatch(a)) break
      }
      if (this.state.settlements.some(x => x.owner === 0)) return this.state.turn
      this.endTurn()
    }
    return -1
  }

  // ---- founding ---------------------------------------------------------------------------------
  /** Look at a tile with the founding control: the map paints the ring a settlement there would
   *  work, in bone where it may be founded and in the loss colour where it may not. */
  setFoundTarget(tile: number | null) {
    this.foundTarget = tile
    this.scene.foundPreview = tile === null ? null : { tile, legal: foundingProblem(this.state, tile) === null }
    this.scene.updateOverlay(this.state)
    this.scene.requestDraw()
    this.renderSheet()
    if (tile !== null) this.showAboveSheet(tile)
  }

  /** Bring a tile into the strip of map left above the sheet, so what the sheet is talking about can
   *  be seen while it is open. In landscape the sheet is beside the map and nothing need move. */
  showAboveSheet(tile: number) {
    const hold = this.holdPoint()
    if (hold === null) return
    const w = this.state.world.width
    const cam = this.scene.cam
    const zoom = Math.max(cam.view.zoom, C.feel.zoom.working)
    const tx = (tile % w) + 0.5, tz = Math.floor(tile / w) + 0.5
    // the camera's centre sits as far from the tile as the free map's middle sits from the screen's
    this.scene.glideToPoint(tx + (this.canvas.clientWidth / 2 - hold[0]) / zoom, tz + (this.canvas.clientHeight / 2 - hold[1]) / zoom, zoom)
  }

  /** Found a settlement with a unit: a colonist where it stands, the lander on the shore beside it.
   *  The lander's founding is the beaching, drawn over a second and a half while the state has
   *  already moved on; the settlement screen opens when it is done. Resolves to whether it happened. */
  found(unitId: number, tile?: number): Promise<boolean> {
    // a move still being drawn ends first, so the beaching starts where the lander really is
    this.scene.finishMove()
    this.releaseUi()
    const s = this.state
    const u = s.units.find(x => x.id === unitId)
    if (!u) return Promise.resolve(false)
    const lander = u.kind === 'lander'
    const shore = tile ?? u.tile
    const from = this.scene.unitPositions.get(unitId) ?? [(u.tile % s.world.width) + 0.5, Math.floor(u.tile / s.world.width) + 0.5]
    // the ids the action will give the settlement and the boat, so the first frame after it draws
    // them at nothing rather than letting them pop in
    if (lander) this.scene.prepareBeaching(s.settlements.length, s.nextId)
    const first = !s.settlements.some(x => x.owner === 0)
    const ok = this.dispatch({ t: 'found', unit: unitId, tile }, first ? `${C.lander.firstName} founded` : 'Settlement founded')
    this.foundTarget = null
    this.scene.foundPreview = null
    this.scene.cam.view.activeUnit = null
    if (!ok) { this.scene.beaching = false; this.scene.updateOverlay(this.state); this.scene.requestDraw(); this.renderSheet(); return Promise.resolve(false) }
    const st = this.state.settlements.find(x => x.owner === 0 && x.tile === shore)
    this.scene.cam.view.selectedTile = shore
    this.paintRoute()
    if (!lander || !st) { if (st) this.open({ kind: 'settlement', id: st.id }); this.afterSelect(); return Promise.resolve(true) }
    return new Promise(resolve => {
      this.scene.animateBeaching(this.state, from, shore, () => {
        this.open({ kind: 'settlement', id: st.id })
        this.afterSelect()
        resolve(true)
      })
    })
  }

  // ---- state changes -----------------------------------------------------------------------------
  /** Apply an action. Throws are swallowed into a toast; nothing happened. Returns success. */
  dispatch(a: Action, undoLabel?: string): boolean {
    // a move still being drawn is drawn to its end before anything else happens
    this.scene.endRunningMove()
    const undoable = undoLabel !== undefined && a.t !== 'endTurn'
    let snapshot: GameState | null = null
    if (undoable) snapshot = structuredClone(this.state)
    const known = undoable ? this.state.world.tiles.reduce((n, t) => n + (t.explored ? 1 : 0), 0) : 0
    try {
      applyAction(this.state, a)
    } catch (e) {
      this.toast((e as Error).message)
      return false
    }
    // ground once seen stays seen: an action that showed new ground cannot be undone, or a move,
    // a look and an undo would be a free scout
    const revealed = undoable && this.state.world.tiles.reduce((n, t) => n + (t.explored ? 1 : 0), 0) > known
    if (snapshot && !revealed) {
      this.undoStack.push({ snapshot, label: undoLabel! })
      if (this.undoStack.length > 8) this.undoStack.shift()
      this.toast(undoLabel!, () => this.undo())
    } else if (revealed) {
      // and nothing before it can be undone either, or undoing that would take the new ground with it
      this.undoStack = []
      this.toast(undoLabel!)
    }
    if (a.t === 'consign') { if (this.state.telemetry.firstConsignment === this.state.turn) Telemetry.firstConsignment(this.state.turn) }
    if (a.t === 'found') {
      if (this.state.telemetry.founded === this.state.turn && this.state.settlements.filter(x => x.owner === 0).length === 1) Telemetry.founded(this.state.turn)
      if (this.state.telemetry.secondSettlement === this.state.turn) Telemetry.secondSettlement(this.state.turn)
    }
    this.route = null
    this.scene.rebuild(this.state, 'dynamic')
    this.refresh()
    return true
  }

  undo() {
    const u = this.undoStack.pop()
    if (!u) return
    this.scene.finishMove()
    this.releaseUi()
    // keep the play RNG moving so an undo never replays the same dice
    const play = this.state.rng.play
    this.state = u.snapshot
    this.state.rng.play = play
    this.route = null
    this.pick = null
    this.foundTarget = null
    this.scene.foundPreview = null
    this.scene.beaching = false
    this.scene.rebuild(this.state, 'dynamic')
    this.refresh()
    this.toast('Undone')
  }

  endTurn() {
    if (this.state.declaration?.won || this.state.declaration?.lost) return
    const q = this.queue
    const seconds = (performance.now() - this.turnStartedAt) / 1000
    const before = this.state.turn
    // the player's units with somewhere to go keep going in the turn, and are drawn going: where
    // each stood and the path it meant to take, so the tiles it went through can be drawn after
    this.scene.endRunningMove()
    const going = this.state.units.filter(u => u.owner === 0 && (u.path.length > 0 || (u.order !== null && u.order.kind !== 'garrison' && u.order.kind !== 'reserve' && u.order.kind !== 'screen')))
      .map(u => ({ id: u.id, tile: u.tile, path: [...u.path], lander: u.kind === 'lander' }))
    if (going.length) { this.scene.prepareMove(this.state, going.map(g => g.id)); this.holdUi(this.scene.cam.view.activeUnit) }
    this.dispatch({ t: 'endTurn' })
    if (this.state.turn === before) { this.scene.cancelMove(); this.releaseUi(); return }
    if (going.length) {
      const trails = going.map(g => {
        const u = this.state.units.find(x => x.id === g.id)
        return { id: g.id, trail: u && u.tile !== g.tile ? trailOf(this.state, g.tile, g.path, u.tile, u) : [] }
      }).filter(t => t.trail.length > 1)
      const lander = going.find(g => g.lander && trails.some(t => t.id === g.id))
      const follow = lander?.id ?? (trails.some(t => t.id === this.scene.cam.view.activeUnit) ? this.scene.cam.view.activeUnit : null)
      this.scene.animateMoves(this.state, trails, follow, this.holdPoint(), () => { this.releaseUi(); this.afterSelect() })
    }
    this.undoStack = []
    Telemetry.turnEnded(this.state.turn, q.shown.length + q.folded.length, seconds)
    this.turnStartedAt = performance.now()
    this.scene.advanceClouds()
    this.scene.applySeason(this.state)
    this.scene.requestDraw()
    this.save()
    // a sheet on a thing that no longer exists closes
    if (this.sheet.kind === 'unit' && !this.state.units.some(u => u.id === (this.sheet as { id: number }).id)) this.sheet = { kind: 'queue' }
    if (this.foundTarget !== null) { this.scene.foundPreview = { tile: this.foundTarget, legal: foundingProblem(this.state, this.foundTarget) === null }; this.scene.updateOverlay(this.state) }
    this.refresh()
    if (this.state.declaration?.won) this.showEnd(true)
    else if (this.state.declaration?.lost) this.showEnd(false)
    else if (this.state.turn >= this.state.settings.turns) this.showEnd(null)
  }

  save() {
    Save.writeLocal(this.state)
    Save.writeLastSettings(this.state.settings)
  }

  newGame(partial: Partial<Settings>) {
    this.scene.finishMove()
    this.releaseUi()
    const seed = randomSeed(playRng(Date.now()))
    const settings: Partial<Settings> = { ...partial, audio: this.state.settings.audio, firstGame: false }
    const s = createGame(seed, settings, Date.now())
    Save.clearLocal()
    this.state = s
    this.undoStack = []
    this.route = null
    this.pick = null
    this.sheetHistory = []
    this.scene.cam.view.selectedTile = null
    this.scene.cam.view.activeUnit = null
    this.scene.rebuild(this.state, 'full')
    this.beginArrival()
  }

  async importSave(file: File) {
    try {
      const save = await Save.importFromFile(file)
      const s = Save.fromSave(save, Date.now())
      this.scene.finishMove()
      this.releaseUi()
      this.state = s
      this.undoStack = []
      this.route = null
      this.pick = null
      this.scene.cam.view.selectedTile = null
      this.scene.cam.view.activeUnit = null
      this.scene.rebuild(this.state, 'full')
      this.scene.cam.centreOn(this.homeTile(), C.feel.zoom.working)
      this.sheet = { kind: 'queue' }
      this.queueExpanded = false
      this.save()
      this.refresh()
      this.toast('Game imported')
    } catch (e) {
      // in plain words: an old version's save, or a file that is not a save at all
      console.warn('Could not import', e)
      this.toast(e instanceof Save.SaveVersionError ? e.plain : 'That file could not be opened. It may not be a Fairholm save.')
    }
  }

  // ---- input routing ---------------------------------------------------------------------------
  tap(px: number, py: number) {
    const s = this.state
    const v = this.scene.cam.view
    const p = pick(s, this.scene.cam, px, py, this.scene.unitPositions, this.picturesForPicking(), TAP_MIN_PX)
    this.aimNotice = null
    // planning a circuit or a patrol: every tap on the map is a stop, and nothing else happens
    if (this.authoring) { this.authoringTap(p.tile, p.settlement); return }
    // any other tap puts a plotted route away first
    const hadRoute = this.route !== null
    if (hadRoute) this.clearRoute(false)
    const selected = v.activeUnit !== null ? s.units.find(x => x.id === v.activeUnit) : undefined
    if (p.unit !== null) {
      const u = s.units.find(x => x.id === p.unit)!
      if (u.owner === 0) { this.tapOwnUnit(u, selected); return }
      // another's unit: a look at its tile
      this.lookAt(u.tile)
      return
    }
    if (p.settlement !== null) {
      const st = s.settlements.find(x => x.id === p.settlement)!
      if (st.owner !== 0) { this.lookAt(st.tile); return }
      this.deselect(false)
      v.selectedTile = st.tile
      this.open({ kind: 'settlement', id: st.id })
      this.afterSelect()
      return
    }
    if (p.predecessor !== null) {
      // their sheet is short, and a unit chosen beside them stays chosen, so it can trade or learn
      const pr = s.predecessors[p.predecessor]
      if (!selected) { this.deselect(false); v.selectedTile = pr.tile }
      this.open({ kind: 'predecessor', id: pr.id })
      this.afterSelect()
      return
    }
    // no picture under the finger, and no mark: the tile. A unit of the player's standing on it is
    // tapped as if on its picture, so the water under the lander's hull is the lander too
    const standing = p.tile !== null ? s.units.find(x => x.tile === p.tile && x.owner === 0 && this.scene.unitPositions.has(x.id)) : undefined
    if (standing) { this.tapOwnUnit(standing, selected); return }
    // empty map. With a route showing, the tap only puts it away and the unit stays chosen, ready
    // for another hold; with a unit or a passenger chosen, it lets go
    if (hadRoute && selected) { this.renderQueueBar(); this.renderSheet(); this.afterSelect(); return }
    if (selected || this.passenger) { this.deselect(); return }
    // a tile: its card, or, tapped again, away with it
    if (p.tile !== null) { this.lookAt(this.focusTile === p.tile ? null : p.tile); return }
    // a tap below working zoom on nothing: everything away, the map the whole screen again
    this.deselect(false)
    this.closeSheet()
    this.afterSelect()
  }

  /** A tap on a unit of the player's: the chosen unit again, or the stack it stands in, lets it
   *  go; a stack with nothing chosen opens the chooser, feel brief section 3; anything else is
   *  chosen. */
  private tapOwnUnit(u: Unit, selected: Unit | undefined) {
    const v = this.scene.cam.view
    const stack = this.state.units.filter(x => x.tile === u.tile && x.owner === 0)
    if (selected && (selected.id === u.id || (stack.length > 1 && selected.tile === u.tile))) { this.deselect(); return }
    if (stack.length > 1 && !selected) {
      this.passenger = null
      this.focusTile = null
      v.selectedTile = u.tile
      this.open({ kind: 'stack', tile: u.tile })
      this.renderQueueBar()
      this.afterSelect()
      return
    }
    this.select(u.id)
  }

  /** The pictures as the scene last drew them, for a tap to be measured against. */
  private picturesForPicking() {
    const scene = this.scene
    return { units: scene.unitPictures, settlements: scene.settlementPictures, shown: scene.drawnClose, cover: scene.pictureCover.bind(scene) }
  }

  // ---- authoring a circuit or a patrol ---------------------------------------------------------
  /** A route being planned for a unit, DECISIONS.md 161: while it is up, a tap on one of the
   *  player's settlements adds a stop to a haul circuit, a tap on any tile adds a point to a patrol,
   *  and holds plot nothing. Save sets the unit's order; nothing is written until then. */
  authoring: Authoring | null = null

  beginAuthoring(unitId: number, kind: 'haul' | 'patrol') {
    const u = this.state.units.find(x => x.id === unitId && x.owner === 0)
    if (!u) return
    const existing = u.order && u.order.kind === kind ? u.order : null
    this.authoring = {
      unit: unitId, kind,
      stops: existing && existing.kind === 'haul' ? existing.stops.map(st => ({ settlement: st.settlement, load: { ...st.load }, unload: { ...st.unload } })) : [],
      tiles: existing && existing.kind === 'patrol' ? [...existing.tiles] : [],
      risk: existing && existing.kind === 'haul' ? existing.risk : 'avoid',
    }
    this.closeSheet()
    this.select(unitId)
    this.paintCircuit()
    this.toast(kind === 'haul' ? 'Tap your settlements in the order the circuit should visit them.' : 'Tap the tiles the patrol should walk between.')
  }

  /** The stops as tiles, for the drawing. */
  private circuitTiles(): number[] {
    const a = this.authoring
    if (!a) return []
    return a.kind === 'haul' ? a.stops.map(st => this.state.settlements[st.settlement]?.tile).filter((x): x is number => x !== undefined) : a.tiles
  }

  paintCircuit() {
    this.routeLayer.showCircuit(this.state, this.authoring ? this.circuitTiles() : null)
    this.scene.requestDraw()
  }

  /** A tap while authoring: a stop added, or an existing one taken away again. */
  private authoringTap(tile: number | null, settlement: number | null) {
    const a = this.authoring!
    if (a.kind === 'haul') {
      const st = settlement !== null ? this.state.settlements[settlement] : tile !== null ? this.state.settlements.find(x => x.tile === tile) : undefined
      if (!st || st.owner !== 0) { this.toast('A haul circuit stops only at your own settlements.'); return }
      const i = a.stops.findIndex(x => x.settlement === st.id)
      if (i >= 0 && i === a.stops.length - 1) a.stops.splice(i, 1)
      else if (i >= 0) { this.toast(`${st.name} is already stop ${i + 1}. Tap the last stop to take it off.`); return }
      else a.stops.push({ settlement: st.id, load: {}, unload: {} })
    } else {
      if (tile === null) return
      const i = a.tiles.indexOf(tile)
      if (i >= 0 && i === a.tiles.length - 1) a.tiles.splice(i, 1)
      else if (i >= 0) { this.toast('That is already on the patrol. Tap the last point to take it off.'); return }
      else a.tiles.push(tile)
    }
    this.paintCircuit()
    this.renderQueueBar()
    this.renderSheet()
  }

  /** Save: the order is set on the unit and begins next turn, however many moves it has now. */
  saveAuthoring(): boolean {
    const a = this.authoring
    if (!a) return false
    const u = this.state.units.find(x => x.id === a.unit)
    if (!u) { this.cancelAuthoring(); return false }
    const order: UnitOrder | null = a.kind === 'haul'
      ? (a.stops.length >= 2 ? { kind: 'haul', stops: a.stops, next: 0, risk: a.risk } : null)
      : (a.tiles.length >= 2 ? { kind: 'patrol', tiles: a.tiles, next: 0 } : null)
    if (!order) { this.toast(a.kind === 'haul' ? 'A circuit needs two stops at least.' : 'A patrol needs two points at least.'); return false }
    const ok = this.dispatch({ t: 'setUnitOrder', unit: u.id, order }, a.kind === 'haul' ? 'Haul circuit set' : 'Patrol set')
    if (!ok) return false
    this.authoring = null
    this.paintCircuit()
    this.renderQueueBar()
    this.renderSheet()
    return true
  }

  cancelAuthoring() {
    if (!this.authoring) return
    this.authoring = null
    this.paintCircuit()
    if (this.sheet.kind === 'authoring') this.closeSheet()
    this.renderQueueBar()
    this.renderSheet()
  }

  /** Choose a unit of the player's: its card takes the queue bar's place, its ring and outline go
   *  on the map, and the camera moves only if the unit would be covered. Any sheet slides away. */
  select(id: number) {
    const u = this.state.units.find(x => x.id === id)
    if (!u) return
    const v = this.scene.cam.view
    this.endAim()
    this.aimNotice = null
    this.route = null
    this.passenger = null
    this.focusTile = null
    v.activeUnit = id
    v.selectedTile = u.tile
    if (this.sheetShowing() && !isFullScreenSheet(this.sheet)) this.closeSheet()
    this.aimFounding()
    this.renderQueueBar()
    this.afterSelect()
    this.keepInView(u.tile)
  }

  /** More, from the card: the full detail, with what it is about kept on the map above it. */
  openMore(spec: SheetSpec, tile: number) {
    this.open(spec)
    this.keepInView(tile)
  }

  /** Choose the lander's next one off, from its detail: the sheet goes away, the passenger's card
   *  comes up, and a hold on the shore beside the lander plots their step ashore. */
  choosePassenger(landerId: number, aboard: number | null = null) {
    const lander = this.state.units.find(x => x.id === landerId && x.kind === 'lander')
    if (!lander || !lander.aboard.length) return
    this.closeSheet()
    this.select(landerId)
    this.passenger = { lander: landerId, aboard }
    this.renderQueueBar()
    this.afterSelect()
  }

  /** Send a passenger ashore from the lander onto a shore tile beside it: the one chosen, or the
   *  next one off. The one who steps off is chosen in their place. The passenger shortcut: with the
   *  lander chosen, a hold on the shore offers this on the card beside Found here. */
  sendAshore(landerId: number, tile: number, aboard: number | null = null): boolean {
    const before = new Set(this.state.units.map(x => x.id))
    this.route = null
    this.passenger = null
    const a: Action = aboard === null ? { t: 'disembark', unit: landerId, tile } : { t: 'disembark', unit: landerId, tile, aboard }
    if (!this.dispatch(a, 'Went ashore')) { this.renderQueueBar(); this.afterSelect(); return false }
    const off = this.state.units.find(x => !before.has(x.id) && x.tile === tile)
    if (off) this.select(off.id)
    else { this.renderQueueBar(); this.afterSelect() }
    return true
  }

  /** Let the chosen unit, passenger or tile go, and give the queue bar back. */
  deselect(render = true) {
    const v = this.scene.cam.view
    this.endAim()
    this.aimNotice = null
    if (this.authoring) { this.authoring = null; this.paintCircuit() }
    v.activeUnit = null
    v.selectedTile = null
    this.route = null
    this.passenger = null
    this.focusTile = null
    if (this.foundTarget !== null) { this.foundTarget = null; this.scene.foundPreview = null; this.scene.updateOverlay(this.state) }
    if (render) {
      if (this.sheet.kind === 'unit' || this.sheet.kind === 'tile' || this.sheet.kind === 'stack') this.closeSheet()
      this.renderQueueBar()
      this.afterSelect()
    }
  }

  /** Look at a tile: a small card, not a sheet, in the queue bar's place. Null puts it away. */
  lookAt(tile: number | null) {
    this.deselect(false)
    this.focusTile = tile
    this.scene.cam.view.selectedTile = tile
    if (this.sheetShowing() && !isFullScreenSheet(this.sheet)) this.closeSheet()
    this.renderQueueBar()
    this.afterSelect()
    if (tile !== null) this.keepInView(tile)
  }

  /** The lander beside land looks at the best shore it could found on, so the card can offer to
   *  found there; a hold on another shore beside it moves the look there. */
  private aimFounding() {
    const s = this.state
    const v = this.scene.cam.view
    const u = v.activeUnit !== null ? s.units.find(x => x.id === v.activeUnit) : undefined
    const w = s.world.width, h = s.world.height
    // anything but the lander keeps only a look at founding where it stands, asked for from its detail
    if (!u || u.kind !== 'lander') { if (this.foundTarget !== null && this.foundTarget !== u?.tile) { this.foundTarget = null; this.scene.foundPreview = null; this.scene.updateOverlay(s) } return }
    const shore = neighbours8(w, h, u.tile).filter(n => isLand(s.world.tiles[n]) && s.world.tiles[n].explored)
    if (this.foundTarget !== null && shore.includes(this.foundTarget)) return
    const legal = shore.filter(n => foundingProblem(s, n) === null).sort((a, b) => siteScore(s, b) - siteScore(s, a))
    const t = legal[0] ?? null
    if (t === this.foundTarget) return
    this.foundTarget = t
    this.scene.foundPreview = t === null ? null : { tile: t, legal: true }
    this.scene.updateOverlay(s)
    this.scene.requestDraw()
  }

  private afterSelect() {
    this.scene.updateRings(this.state)
    this.paintRoute()
    this.scene.requestDraw()
  }

  /** Draw the plotted route, or take it away. */
  paintRoute() {
    const r = this.route
    const u = r ? this.state.units.find(x => x.id === r.unit) : undefined
    // the shore beside the lander is marked by the founding ring, not crossed out
    const drawn = r && u && (r.ok || r.shore === null) ? r : null
    this.routeLayer.show(this.state, drawn, u ? u.tile : -1)
  }

  /** Plot where a unit of the player's would go if sent to a tile, and show it: the route on the map
   *  with where each turn ends, and a line on the card, or why it cannot go. Nothing moves. */
  plot(u: Unit, tile: number) {
    this.scene.endRunningMove()
    const r = planRoute(this.state, u, tile)
    this.route = r
    // the selection stays on the unit; the route's own end marks the tile held
    this.scene.cam.view.selectedTile = u.tile
    this.scene.cam.view.activeUnit = u.id
    // the lander holding the shore beside it: the founding control looks at that shore instead
    if (!r.ok && r.shore !== null) this.aimAt(r.shore)
    else if (this.foundTarget !== null && u.kind === 'lander') this.aimFounding()
    this.renderQueueBar()
    this.renderSheet()
    this.afterSelect()
    // while the finger aims, the camera stays where the finger left it: moving the map under a
    // finger would move the aim
    if (!this.aim) this.keepRouteInView()
  }

  /** The founding look on one shore, without moving the camera: it is beside the lander, which is in
   *  view. */
  private aimAt(tile: number) {
    this.foundTarget = tile
    this.scene.foundPreview = { tile, legal: foundingProblem(this.state, tile) === null }
    this.scene.updateOverlay(this.state)
  }

  /** A passenger's step ashore, plotted: only onto known ground beside the lander that is not a
   *  mountain, which is where the disembark action will put them. The last one aboard may go too,
   *  and the card says what that costs: the lander cannot found until someone is back aboard. */
  private plotAshore(tile: number) {
    const s = this.state, w = s.world.width, h = s.world.height
    const p = this.passenger
    const lander = p ? s.units.find(x => x.id === p.lander && x.kind === 'lander') : undefined
    if (!p || !lander) { this.passenger = null; this.renderQueueBar(); return }
    const t = s.world.tiles[tile]
    const no = (words: string): UiRoute => ({ ok: false, unit: lander.id, end: tile, problem: 'noWay', words, shore: null })
    this.route = tile === lander.tile ? no('Hold the shore beside the lander to send them ashore.')
      : !neighbours8(w, h, lander.tile).includes(tile) ? no('From the lander they can step only onto the shore beside it.')
      : t.terrain === 'water' || !t.explored ? no('Hold the shore beside the lander: there is no ground there to stand on.')
      : t.terrain === 'mountain' ? no('Not onto a mountain. Hold other ground beside the lander.')
      : { ok: true, ashore: true, aboard: p.aboard, unit: lander.id, end: tile, kind: 'board', path: [], unseen: [], turnEnds: [], arrives: 1, odds: null, declares: null, target: null, startsNextTurn: false }
    this.renderQueueBar()
    this.afterSelect()
  }

  /** Put the plotted route away. */
  clearRoute(render = true) {
    const r = this.route
    this.route = null
    // a shore the route pointed the founding control at goes back to the lander's own choice
    if (r && !r.ok && r.shore !== null) this.aimFounding()
    this.paintRoute()
    if (render) { this.renderQueueBar(); this.renderSheet(); this.scene.requestDraw() }
  }

  /** The release: the route shown, as the move, the attack or the boarding it is. A walk that ends
   *  beside the target takes the last step only if there is movement left this turn; otherwise the
   *  unit waits beside it, and the last step is the player's to hold and let go again. */
  async commitRoute(): Promise<boolean> {
    const r = this.route
    if (!r || !r.ok) return false
    const u = this.state.units.find(x => x.id === r.unit)
    if (!u) { this.clearRoute(); return false }
    this.route = null
    // a passenger's step ashore: the one chosen stands on that shore, and is the one chosen now
    if ('ashore' in r) return this.sendAshore(u.id, r.end, r.aboard)
    if (r.kind === 'move') return this.moveTo(u.id, r.end)
    if (r.path.length && !(await this.moveTo(u.id, r.path[r.path.length - 1]))) return false
    const w = this.state.world.width, h = this.state.world.height
    const nu = this.state.units.find(x => x.id === u.id)
    if (!nu || !neighbours8(w, h, nu.tile).includes(r.end)) return true
    if (r.kind === 'attack') {
      if (nu.moves <= 0) { this.toast('Beside them, with no moves left. The attack waits for next turn.'); return true }
      this.commitAttack(nu.id, r.end)
      return true
    }
    const lander = this.state.units.find(x => x.tile === r.end && x.owner === 0 && x.kind === 'lander')
    if (lander) this.dispatch({ t: 'embark', unit: nu.id, lander: lander.id }, 'Came aboard')
    this.afterSelect()
    return true
  }

  /** The map left free between the top strip and whatever covers the bottom (the card, the queue
   *  bar or a sheet), or beside a sheet on a phone held sideways, in pixels. */
  private freeArea(): { left: number; top: number; right: number; bottom: number } {
    const W = this.root.clientWidth, H = this.root.clientHeight
    const top = this.hud.getBoundingClientRect().height
    const sheet = this.sheetShowing() && !isFullScreenSheet(this.sheet)
    if (this.root.classList.contains('landscape') && sheet) return { left: 0, top, right: W - this.sheetEl.offsetWidth, bottom: H - this.queuebar.offsetHeight }
    const cover = Math.max(this.queuebar.offsetHeight, sheet ? this.sheetEl.offsetHeight : 0)
    return { left: 0, top, right: W, bottom: H - cover }
  }

  /** Keep a tile on the map rather than under the card or a sheet, moving the camera only if it must. */
  private keepInView(tile: number) {
    const w = this.state.world.width
    const [sx, sy] = this.scene.cam.worldToScreen((tile % w) + 0.5, Math.floor(tile / w) + 0.5)
    const f = this.freeArea()
    const m = C.feel.routeEndHitPx
    if (sx < f.left + m || sx > f.right - m || sy < f.top + m || sy > f.bottom - m) this.showAboveSheet(tile)
  }

  /** Keep the selected unit and the whole of a plotted route on the free map: nothing moves if it is
   *  all there already; otherwise the camera centres it, or, where it is too long for the screen,
   *  brings its end into view. */
  private keepRouteInView() {
    const r = this.route
    const u = r ? this.state.units.find(x => x.id === r.unit) : undefined
    if (!r || !u) return
    const w = this.state.world.width
    const tiles = [u.tile, ...(r.ok ? r.path : []), r.end]
    const pts = tiles.map(t => this.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5))
    const f = this.freeArea()
    const m = C.feel.routeEndHitPx
    const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]))
    const y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]))
    if (x0 >= f.left + m && x1 <= f.right - m && y0 >= f.top + m && y1 <= f.bottom - m) return
    const zoom = this.scene.cam.view.zoom
    if (x1 - x0 > f.right - f.left - 2 * m || y1 - y0 > f.bottom - f.top - 2 * m) { this.keepInView(r.end); return }
    // the route's middle to the free map's middle
    const [mx, mz] = this.scene.cam.screenToWorld((x0 + x1) / 2, (y0 + y1) / 2)
    const cx = (f.left + f.right) / 2, cy = (f.top + f.bottom) / 2
    this.scene.glideToPoint(mx + (this.canvas.clientWidth / 2 - cx) / zoom, mz + (this.canvas.clientHeight / 2 - cy) / zoom, zoom)
  }

  doubleTap(px: number, py: number) {
    const z = this.scene.cam.view.zoom
    const target = z >= C.feel.zoom.working * 0.8 ? C.feel.zoom.overview : C.feel.zoom.working
    const t = tileUnderPoint(this.state, this.scene.cam, px, py)
    if (t !== null) this.scene.glideTo(t, target)
    else this.scene.cam.setZoomAt(px, py, target)
    this.scene.requestDraw()
  }

  // ---- the movement gesture: hold aims, release moves ------------------------------------------
  /** What the finger is aiming while a hold is engaged, DECISIONS.md 163: the unit, the tile under
   *  the finger, where the finger is, the attack whose odds have been showing and since when, and
   *  the frame loop that scrolls the map when the finger holds near its edge. Null between
   *  gestures. */
  private aim: { unit: number; tile: number | null; px: number; py: number; attackOn: number | null; attackSince: number; raf: number | null } | null = null
  /** A word for the card after a release that moved nothing, such as an attack let go too soon. */
  aimNotice: string | null = null

  /** The hold has engaged. With one of the player's units chosen, the route to the tile under the
   *  finger shows and moves nothing; the finger re-aims it; letting go moves. It works at any zoom
   *  where the route can be read, below the one where ordinary taps reach tiles, because the route
   *  shows where the finger is before anything is committed. With nothing chosen, a hold is a tap.
   *  Returns whether a route is now being aimed. */
  hold(px: number, py: number): boolean {
    const s = this.state
    const v = this.scene.cam.view
    const u = v.activeUnit !== null ? s.units.find(x => x.id === v.activeUnit) : undefined
    this.aimNotice = null
    // while a circuit is being planned a hold plots nothing: taps add stops
    if (this.authoring) { this.toast(this.authoring.kind === 'haul' ? 'Tap a settlement to add a stop. Save when the circuit is complete.' : 'Tap a tile to add a point. Save when the patrol is complete.'); return false }
    if (u && u.owner === 0 && v.zoom >= C.feel.routeHoldFloor) {
      this.scene.endRunningMove()
      this.aim = { unit: u.id, tile: null, px, py, attackOn: null, attackSince: 0, raf: null }
      // the moment the hold engages, felt as well as seen, where the device can
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') { try { navigator.vibrate(C.feel.holdVibrateMs) } catch { /* not everywhere */ } }
      // the renderer draws continuously while the finger is down, as it does for any gesture
      this.scene.setGesture(true)
      this.aimAtPoint(px, py)
      this.edgeScroll()
      return true
    }
    this.tap(px, py)
    return false
  }

  /** The tile the finger is over, as a hold reads it: a finger on another unit's picture is on the
   *  tile that unit stands on, so the lander held by a colonist is boarding even where its hull
   *  hangs over the next tile, and a militia holding an enemy's picture is the attack. */
  private tileUnderFinger(px: number, py: number, u: Unit): number | null {
    const s = this.state
    const held = pick(s, this.scene.cam, px, py, this.scene.unitPositions, this.picturesForPicking(), 0, false).unit
    const other = held !== null && held !== u.id ? s.units.find(x => x.id === held) : undefined
    return other ? other.tile : tileUnderPoint(s, this.scene.cam, px, py)
  }

  /** Aim at where the finger is: plot the route there when the tile under it has changed, and keep
   *  track of how long an attack's odds have been on the screen. */
  private aimAtPoint(px: number, py: number) {
    const a = this.aim
    if (!a) return
    a.px = px; a.py = py
    const u = this.state.units.find(x => x.id === a.unit)
    if (!u) { this.cancelAim(); return }
    const t = this.tileUnderFinger(px, py, u)
    if (t === null || t === a.tile) return
    a.tile = t
    // a passenger chosen: the hold aims their step ashore rather than the lander's course
    if (this.passenger && this.passenger.lander === u.id) this.plotAshore(t)
    else this.plot(u, t)
    const r = this.route
    if (r && r.ok && r.kind === 'attack') {
      if (a.attackOn !== r.end) { a.attackOn = r.end; a.attackSince = performance.now() }
    } else a.attackOn = null
  }

  /** The finger moved while aiming. */
  aimMove(px: number, py: number) {
    if (!this.aim) return
    this.aimAtPoint(px, py)
  }

  /** While the finger holds near an edge of the visible map, the map scrolls that way and the aim
   *  follows what comes under the finger, so a destination off the screen is reached in one
   *  gesture. The card and the top strip are not edges: a finger over them scrolls nothing. */
  private edgeScroll() {
    const a = this.aim
    if (!a) return
    const f = this.freeArea()
    const band = C.feel.edgeScrollPx, speed = C.feel.edgeScrollSpeed
    const inside = a.px >= f.left && a.px <= f.right && a.py >= f.top && a.py <= f.bottom
    let dx = 0, dy = 0
    if (inside) {
      if (a.px < f.left + band) dx = (f.left + band - a.px) / band
      else if (a.px > f.right - band) dx = -(a.px - (f.right - band)) / band
      if (a.py < f.top + band) dy = (f.top + band - a.py) / band
      else if (a.py > f.bottom - band) dy = -(a.py - (f.bottom - band)) / band
    }
    if (dx !== 0 || dy !== 0) {
      this.scene.cam.panPixels(dx * speed, dy * speed)
      this.scene.requestDraw()
      // what is under the finger has changed, though the finger has not moved
      const u = this.state.units.find(x => x.id === a.unit)
      if (u) { const t = this.tileUnderFinger(a.px, a.py, u); if (t !== null && t !== a.tile) this.aimAtPoint(a.px, a.py) }
    }
    a.raf = requestAnimationFrame(() => this.edgeScroll())
  }

  private endAim() {
    const a = this.aim
    if (!a) return
    if (a.raf !== null) cancelAnimationFrame(a.raf)
    this.aim = null
    this.scene.setGesture(false)
  }

  /** The aim abandoned: a second finger, or the pointer lost. Nothing moves and nothing is kept. */
  cancelAim() {
    if (!this.aim) return
    this.endAim()
    this.route = null
    this.aimFounding()
    this.paintRoute()
    this.renderQueueBar()
    this.renderSheet()
    this.afterSelect()
  }

  /** Whether a point on the screen is over the interface rather than the map: the top strip, the
   *  card or the queue bar, a sheet, the audio strip. A release there cancels. */
  private overInterface(px: number, py: number): boolean {
    const r = this.canvas.getBoundingClientRect()
    const x = r.left + px, y = r.top + py
    const covers = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom }
    if (covers(this.hud) || covers(this.queuebar)) return true
    if (this.sheetShowing() && covers(this.sheetEl)) return true
    if (this.audioStrip.classList.contains('open') && covers(this.audioStrip)) return true
    return false
  }

  /** Letting go. The route shown at this moment is what happens, unless the release is a cancel:
   *  over the interface, on the unit's own tile, on a tile that cannot be reached (the card keeps
   *  saying why), or on an enemy whose odds have not been on the screen for the attack dwell (the
   *  card says to hold a moment longer). */
  release(px: number, py: number) {
    const a = this.aim
    if (!a) return
    this.aimAtPoint(px, py)
    const r = this.route
    const u = this.state.units.find(x => x.id === a.unit)
    const held = a.attackOn !== null ? performance.now() - a.attackSince : 0
    this.endAim()
    const cancel = (notice: string | null, keepRoute: boolean) => {
      if (!keepRoute) this.route = null
      this.aimNotice = notice
      this.aimFounding()
      this.paintRoute()
      this.renderQueueBar()
      this.renderSheet()
      this.afterSelect()
    }
    if (!u) { cancel(null, false); return }
    if (this.overInterface(px, py)) { cancel(null, false); return }
    const t = this.tileUnderFinger(px, py, u)
    if (t === null || t === u.tile) { cancel(null, false); return }
    if (!r || !r.ok) { cancel(null, true); return }
    if (r.kind === 'attack' && held < C.feel.attackDwellMs) { cancel('Hold a moment longer to attack.', false); return }
    void this.commitRoute()
  }

  /** Move a unit of the player's toward a tile: as far as it can this turn, along the path planned
   *  on what is known, stopping where unseen land turns out to be in the way. Called by a route
   *  being committed, never by a gesture directly. The move
   *  is drawn travelling, the fog lifting along the way, the camera following; it resolves when
   *  the drawing is done, with whether the unit moved at all. */
  moveTo(unitId: number, tile: number): Promise<boolean> {
    const u = this.state.units.find(x => x.id === unitId)
    if (!u) return Promise.resolve(false)
    const planned = findPath(this.state, u, u.tile, tile)
    if (!planned || !planned.length) { this.toast('No way through'); return Promise.resolve(false) }
    const start = u.tile
    this.scene.prepareMove(this.state, [unitId])
    this.holdUi(unitId)
    // a unit with no moves left is given the way to go next turn, and the toast says so
    const ok = this.dispatch({ t: 'moveUnit', unit: unitId, path: planned }, u.moves > 0 ? `${unitLabel(u.kind)} moved` : `${unitLabel(u.kind)} will go next turn`)
    const nu = this.state.units.find(x => x.id === unitId)
    // the unit stays chosen through its move, and its card catches up when the drawing is done
    if (!ok || !nu || nu.tile === start) { this.scene.cancelMove(); this.releaseUi(); if (ok && nu) { this.scene.cam.view.activeUnit = unitId; this.renderQueueBar(); this.afterSelect() } return Promise.resolve(ok) }
    this.scene.cam.view.selectedTile = nu.tile
    this.scene.cam.view.activeUnit = unitId
    this.afterSelect()
    const trail = trailOf(this.state, start, planned, nu.tile, nu)
    return new Promise(resolve => {
      this.scene.animateMoves(this.state, [{ id: unitId, trail }], unitId, this.holdPoint(), () => {
        this.releaseUi()
        this.afterSelect()
        const at = this.state.units.find(x => x.id === unitId)
        if (at && this.scene.cam.view.activeUnit === unitId) this.keepInView(at.tile)
        resolve(true)
      })
    })
  }

  /** Where on the screen, in pixels from the map's top left, the thing being looked at should sit:
   *  the middle of the map left above the sheet, or beside it on a phone held sideways, or null for
   *  the screen's middle when the sheet is put away. Measured where the sheet will be once it has
   *  slid in, not where it is part way through sliding. */
  holdPoint(): [number, number] | null {
    if (isFullScreenSheet(this.sheet) && this.sheetShowing()) return null
    const f = this.freeArea()
    if (f.right - f.left < 80 || f.bottom - f.top < 40) return null
    return [(f.left + f.right) / 2, (f.top + f.bottom) / 2]
  }

  /** Tell the camera how much of the screen the sheet and the queue bar cover, so it can carry the
   *  map's edge up to them rather than leave what is being looked at behind them. */
  private updateInset() {
    const cam = this.scene.cam
    // at sea before the first landing, the lander may sit in the middle of the picture even near
    // the map's edge; after it, the map covers the screen as always
    cam.overhang = this.state.settlements.some(x => x.owner === 0) ? 0 : C.feel.openingOverhang
    const bar = this.queuebar.offsetHeight
    this.root.style.setProperty('--bar-cover', bar + 'px')
    const showing = this.sheetShowing() && !isFullScreenSheet(this.sheet)
    if (!showing) { cam.inset = { right: 0, bottom: bar }; return }
    if (this.root.classList.contains('landscape')) cam.inset = { right: this.sheetEl.offsetWidth, bottom: 0 }
    else cam.inset = { right: 0, bottom: Math.max(bar, this.sheetEl.offsetHeight) }
  }

  commitAttack(unitId: number, tile: number) {
    const u = this.state.units.find(x => x.id === unitId)
    if (!u) return
    this.dispatch({ t: 'attack', unit: unitId, tile }, `${unitLabel(u.kind)} attacked`)
    this.afterSelect()
  }

  /** The ring that fills under the finger from the first frame of a hold. Nothing is plotted until
   *  it is full, so a hold let go early, or turned into a pan, leaves everything as it was. */
  holdRing(px: number, py: number, k: number) {
    if (k < 0) { this.ring.style.display = 'none'; return }
    const r = this.canvas.getBoundingClientRect()
    this.ring.style.display = 'block'
    this.ring.style.left = (r.left + px) + 'px'
    this.ring.style.top = (r.top + py) + 'px'
    this.ring.style.setProperty('--k', String(k))
  }

  // ---- sheets ----------------------------------------------------------------------------------
  open(spec: SheetSpec) {
    if (spec.kind === 'queue') this.queueExpanded = true
    if (JSON.stringify(spec) === JSON.stringify(this.sheet)) { this.renderSheet(); return }
    if (this.sheet.kind !== 'queue') this.sheetHistory.push(this.sheet)
    if (this.sheetHistory.length > 12) this.sheetHistory.shift()
    if (spec.kind !== 'settlement' || (this.sheet.kind === 'settlement' && this.sheet.id !== spec.id)) this.pick = null
    this.sheet = spec
    if (spec.kind === 'glossary') Telemetry.glossaryTap()
    if (spec.kind === 'fold') Telemetry.foldOpened(this.state.turn)
    this.renderSheet()
  }

  /** The sheet's back arrow: the sheet it was opened from, or, with none, the queue's list if that
   *  is where it came from, else the map again with whatever is chosen still chosen. */
  back() {
    const prev = this.sheetHistory.pop()
    if (!prev && !this.queueExpanded) { this.closeSheet(); return }
    this.sheet = prev ?? { kind: 'queue' }
    this.renderSheet()
  }

  /** Put every sheet away and give the map the whole screen back. What is chosen stays chosen, and
   *  its card comes back; the founding look stays on the lander's shore while the lander is chosen. */
  closeSheet() {
    this.sheet = { kind: 'queue' }
    this.sheetHistory = []
    this.queueExpanded = false
    this.pick = null
    const v = this.scene.cam.view
    const lander = v.activeUnit !== null && this.state.units.some(u => u.id === v.activeUnit && u.kind === 'lander')
    if (lander) { this.aimFounding(); this.scene.requestDraw() }
    else if (this.foundTarget !== null) { this.foundTarget = null; this.scene.foundPreview = null; this.scene.updateOverlay(this.state); this.scene.requestDraw() }
    this.renderSheet()
  }

  /** Whether the sheet is showing at all. At rest it is not, and the map is the whole screen. */
  private sheetShowing(): boolean {
    return this.sheet.kind !== 'queue' || this.queueExpanded
  }

  focus(tile: number) {
    this.scene.cam.view.selectedTile = tile
    const z = this.scene.cam.view.zoom
    this.scene.glideTo(tile, Math.max(z, C.feel.zoom.working))
    this.afterSelect()
  }

  /** Open the thing a queue item points at. */
  openItem(it: QueueItem) {
    // a unit's item chooses the unit: the queue goes away, its card comes up, the camera goes to it
    const unit = it.unit !== undefined ? this.state.units.find(u => u.id === it.unit && u.owner === 0) : undefined
    if (unit) { this.closeSheet(); this.select(unit.id); this.focus(unit.tile); return }
    if (it.tile !== undefined) this.focus(it.tile)
    else if (it.settlement !== undefined) this.focus(this.state.settlements[it.settlement].tile)
    switch (it.opens) {
      case 'settlement': if (it.settlement !== undefined) this.open({ kind: 'settlement', id: it.settlement }); return
      case 'market': this.open({ kind: 'market', settlement: it.settlement ?? 0 }); return
      case 'demand': this.open({ kind: 'demand' }); return
      case 'signatories': this.open({ kind: 'signatories' }); return
      case 'predecessor': this.open({ kind: 'predecessor', id: it.tile !== undefined ? (this.state.predecessors.find(p => p.tile === it.tile)?.id ?? 0) : 0 }); return
      case 'declaration': this.open({ kind: 'declaration' }); return
      case 'orders': if (it.settlement !== undefined) this.open({ kind: 'orders', settlement: it.settlement }); return
      default: if (it.settlement !== undefined) this.open({ kind: 'settlement', id: it.settlement })
    }
  }

  // ---- the settlement screen ---------------------------------------------------------------------
  /** Previous or next settlement, from the header's arrows or a swipe across the ring. */
  gotoSettlement(step: number) {
    if (this.sheet.kind !== 'settlement') return
    const own = ownSettlements(this.state)
    if (own.length < 2) return
    const at = own.findIndex(x => x.id === (this.sheet as { id: number }).id)
    const to = own[(at + step + own.length) % own.length]
    this.pick = null
    this.sheet = { kind: 'settlement', id: to.id }
    this.focus(to.tile)
    this.renderSheet()
  }

  /** Hold a colonist, so every place they would be useful lights up. Tapping them again lets go. */
  pickColonist(st: Settlement, colonist: number | null) {
    this.pick = colonist === null || (this.pick && this.pick.settlement === st.id && this.pick.colonist === colonist)
      ? null
      : { settlement: st.id, colonist }
    this.renderSheet()
  }

  /** A tap on a ring cell. With someone held, it places them; otherwise it asks who should work it. */
  settlementTapTile(st: Settlement, cell: RingCell) {
    if (cell.tile === null) return
    if (this.pick && this.pick.settlement === st.id) {
      const good = cell.best?.good
      if (!cell.available || !good) { this.toast(cell.reason ?? 'Not workable.'); return }
      // somewhere someone already works: ask rather than fail, so the swap is one more tap
      if (cell.worker && cell.worker.index !== this.pick.colonist) { this.open({ kind: 'assignTile', settlement: st.id, tile: cell.tile }); return }
      this.dispatch({ t: 'assignWorker', settlement: st.id, colonist: this.pick.colonist, job: { kind: 'tile', tile: cell.tile, good } }, `Set to ${good}`)
      this.pick = null
      this.renderSheet()
      return
    }
    if (cell.centre) { this.toast('The settlement works its own ground for nothing.'); return }
    if (!cell.available && !cell.worker) { this.toast(cell.reason ?? 'Nothing to work here.'); return }
    this.open({ kind: 'assignTile', settlement: st.id, tile: cell.tile })
  }

  /** A tap on a building slot. Unbuilt slots go into the build order instead. */
  settlementTapSlot(st: Settlement, slot: BuildingSlot) {
    if (!slot.built) {
      const b = slot.option
      if (!b) return
      if (slot.gate) { this.toast(slot.gate); return }
      if (b.imported) this.dispatch({ t: 'buyImported', settlement: st.id, line: b.line }, 'Imported machine bought')
      else this.dispatch({ t: 'setBuildOrder', settlement: st.id, queue: [...st.buildQueue, { line: b.line, tier: b.tier }] }, `${slot.name} queued`)
      return
    }
    if (slot.capacity === 0) { this.toast(`${slot.name}: ${slot.conversion}.`); return }
    if (this.pick && this.pick.settlement === st.id) {
      if (slot.workers.length >= slot.capacity) { this.open({ kind: 'assignBuilding', settlement: st.id, line: slot.line }); return }
      this.dispatch({ t: 'assignWorker', settlement: st.id, colonist: this.pick.colonist, job: { kind: 'building', line: slot.line } }, `Set to ${slot.name}`)
      this.pick = null
      this.renderSheet()
      return
    }
    this.open({ kind: 'assignBuilding', settlement: st.id, line: slot.line })
  }

  /** Move one colonist to a tile or a building, swapping with whoever is there. */
  assign(settlement: number, colonist: number, job: { kind: 'tile'; tile: number; good: import('../sim/state').TileGood } | { kind: 'building'; line: BuildingLine } | { kind: 'idle' }, label: string, swapWith?: number) {
    const st = this.state.settlements[settlement]
    if (!st) return
    if (swapWith !== undefined && swapWith !== colonist) {
      const theirs = st.colonists[colonist]?.job
      const mine = st.colonists[swapWith]?.job
      if (theirs && mine) {
        // move the sitting worker out of the way first, so the tile is free when the other arrives
        const snapshot = structuredClone(this.state)
        try {
          applyAction(this.state, { t: 'assignWorker', settlement, colonist: swapWith, job: { kind: 'idle' } })
          applyAction(this.state, { t: 'assignWorker', settlement, colonist, job })
          applyAction(this.state, { t: 'assignWorker', settlement, colonist: swapWith, job: theirs })
        } catch (e) {
          this.state = snapshot
          this.toast((e as Error).message)
          return
        }
        this.undoStack.push({ snapshot, label })
        if (this.undoStack.length > 8) this.undoStack.shift()
        this.toast(label, () => this.undo())
        this.scene.rebuild(this.state, 'dynamic')
        this.refresh()
        this.back()
        return
      }
    }
    if (this.dispatch({ t: 'assignWorker', settlement, colonist, job }, label)) this.back()
  }

  // ---- rendering -------------------------------------------------------------------------------
  refresh() {
    // a route belongs to the state it was plotted on; a state that has moved on has dropped it
    if (this.route && !this.state.units.some(u => u.id === this.route!.unit)) this.route = null
    // a unit that is gone, founded or lost, is no longer chosen; nor is a passenger with no one aboard
    const v = this.scene.cam.view
    if (v.activeUnit !== null && !this.state.units.some(u => u.id === v.activeUnit && u.owner === 0)) { v.activeUnit = null; this.passenger = null; this.scene.updateRings(this.state) }
    if (this.passenger && !this.state.units.some(u => u.id === this.passenger!.lander && u.aboard.length > 0)) this.passenger = null
    if (this.heldFor === null) this.aimFounding()
    this.paintRoute()
    this.queue = deriveQueue(this.state, SYSTEMS)
    this.stacks.rebuild(this.state)
    this.renderHud()
    this.renderQueueBar()
    this.renderSheet()
    this.renderAudio()
  }

  renderHud() {
    const s = this.state
    clear(this.hud)
    const ch = s.charters[0]
    this.hud.append(
      h('div', { class: 'intent', onClick: () => this.open({ kind: 'intent' }) }, s.intent),
      h('div', { class: 'status' },
        h('button', { class: 'menu', type: 'button', 'aria-label': 'menu', onClick: () => this.open({ kind: 'menu' }) }, '⋯'),
        h('span', { class: 'term', onClick: () => this.open({ kind: 'glossary', key: 'turn' }) }, `Turn ${s.turn}`),
        h('span', { class: 'when muted' }, `year ${year(s.turn)}, ${SEASON_NAMES[season(s.turn)]}`),
        h('span', { class: 'spacer' }),
        h('span', { class: 'purse' },
          h('span', { class: 'term', onClick: () => this.open({ kind: 'glossary', key: 'gold' }) }, `${fmt(ch.gold)} gold`),
          h('span', { class: 'term', onClick: () => this.open({ kind: 'glossary', key: 'word' }) }, `${fmt(ch.word)} Word`),
        ),
      ),
    )
  }

  /** The bar along the bottom. At rest it is the queue: one line carrying its top item and a count,
   *  and the turn. While a unit, a passenger or a tile is chosen and no sheet is up, the slim card
   *  takes its place, with End turn where it always is. Layout brief section 1. */
  renderQueueBar() {
    if (this.heldFor !== null) return
    const s = this.state
    clear(this.queuebar)
    const q = this.queue
    const idle = q.shown.concat(q.folded).filter(g => g.type === 3 || g.type === 4).reduce((a, g) => a + g.items.length, 0)
    const label = idle > 0 ? `End turn, ${idle} will idle` : 'End turn'
    const ended = s.declaration?.won || s.declaration?.lost || s.turn >= s.settings.turns
    const turn = ended ? button('Over', () => this.showEnd(s.declaration?.won ? true : s.declaration?.lost ? false : null), 'primary end') : button(label, () => this.endTurn(), 'primary end')
    const card = this.sheetShowing() ? null : this.currentCard()
    this.queuebar.classList.toggle('carded', card !== null)
    if (card) {
      // one row when there is nothing to do but look, a second for the actions when there is; End
      // turn is at the bottom right either way, where it is in the queue bar
      const one = card.actions.length === 0
      append(this.queuebar, [
        h('div', { class: 'uc-head' },
          h('div', { class: 'uc-text' },
            h('div', { class: 'uc-title' }, h('span', { class: 't' }, card.title), card.tag ? (card.tagAction ? h('button', { class: 'tag act', type: 'button', onClick: card.tagAction }, card.tag) : h('span', { class: 'tag' }, card.tag)) : null),
            h('div', { class: 'uc-line' + (card.warn ? ' warn' : '') }, card.line),
          ),
          card.more ? button('More', card.more, 'small ghost more') : null,
          one ? turn : null,
        ),
        one ? null : h('div', { class: 'uc-actions' + (card.actions.length >= 3 ? ' tight' : '') }, ...card.actions, h('span', { class: 'spacer' }), turn),
      ])
    } else {
      const total = q.shown.reduce((a, g) => a + g.items.length, 0) + q.folded.reduce((a, g) => a + g.items.length, 0)
      const top = q.shown[0]
      const typeClass = top ? ['', 'loss', 'company', 'stuck', 'idle', 'chance'][top.type] : ''
      this.queuebar.append(
        h('button', { class: 'top', type: 'button', onClick: () => { if (this.queueExpanded && this.sheet.kind === 'queue') this.closeSheet(); else this.open({ kind: 'queue' }) } },
          h('span', { class: 'mark ' + typeClass }),
          h('span', { class: 'what' + (top ? '' : ' quiet') }, top ? top.title : 'A quiet turn'),
          total > 1 ? h('span', { class: 'count' }, String(total)) : null,
        ),
        turn,
      )
    }
    this.updateInset()
  }

  /** The card for what is chosen, or null for the queue bar. */
  private currentCard(): Card | null {
    const s = this.state
    const v = this.scene.cam.view
    if (this.authoring) return authoringCard(this, s, this.authoring)
    const u = v.activeUnit !== null ? s.units.find(x => x.id === v.activeUnit && x.owner === 0) : undefined
    if (u && this.passenger && this.passenger.lander === u.id && u.aboard.length) return passengerCard(this, s, u)
    if (u) return unitCard(this, s, u)
    if (this.focusTile !== null) return tileCard(this, s, this.focusTile)
    return null
  }

  /** The unit whose move is being drawn, or minus one for a turn's moves with none in particular:
   *  until the drawing ends, its sheet and the queue go on showing what was true before the move,
   *  so neither tells of a coast the picture has not reached yet. Null when nothing is held. */
  private heldFor: number | null = null

  private holdUi(unit: number | null) {
    this.heldFor = unit ?? -1
    // the card's own controls wait for the drawing too; End turn does not
    this.queuebar.classList.add('held')
  }

  /** The move has been drawn: the sheet and the queue catch up with it. */
  private releaseUi() {
    if (this.heldFor === null) return
    this.heldFor = null
    this.sheetEl.classList.remove('held')
    this.queuebar.classList.remove('held')
    // the lander may have come in beside a shore: the founding look goes to it now, not before the
    // picture of the lander gets there
    this.aimFounding()
    this.renderSheet()
  }

  private sheetHeld(): boolean {
    if (this.heldFor === null || !this.sheetShowing()) return false
    return this.sheet.kind === 'queue' || (this.sheet.kind === 'unit' && this.sheet.id === this.heldFor)
  }

  renderSheet() {
    // held while a move is drawn, and not touchable either, so nothing in it acts twice
    if (this.sheetHeld()) { this.sheetEl.classList.add('held'); return }
    this.sheetEl.classList.remove('held')
    const showing = this.sheetShowing()
    const full = showing && isFullScreenSheet(this.sheet)
    this.sheetEl.classList.toggle('open', showing)
    this.sheetEl.classList.toggle('full', full)
    // every sheet over the map, a unit's full detail included, goes away with a tap on the map: the
    // map is reached again with that one tap, and the card the detail grew from comes back
    this.scrim.classList.toggle('show', showing && !full)
    clear(this.sheetBody)
    this.sheetBody.scrollTop = 0
    this.sheetEl.style.transform = ''
    if (showing) {
      if (this.sheet.kind === 'queue') this.sheetBody.append(this.renderQueue())
      else this.sheetBody.append(renderSheet(this, this.sheet))
    }
    // the bar is the card when nothing is up and the queue bar when a sheet is
    this.renderQueueBar()
    this.updateInset()
  }

  /** A swipe down on the grip puts the sheet away, per section 1 of the layout brief. */
  private attachSheetSwipe() {
    const grip = this.sheetEl.querySelector('.grip') as HTMLElement
    let y0 = 0, id: number | null = null
    grip.addEventListener('pointerdown', (e: PointerEvent) => {
      id = e.pointerId; y0 = e.clientY
      this.sheetEl.classList.add('dragging')
      try { grip.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    })
    grip.addEventListener('pointermove', (e: PointerEvent) => {
      if (id !== e.pointerId) return
      const dy = Math.max(0, e.clientY - y0)
      this.sheetEl.style.transform = `translateY(${dy}px)`
    })
    const end = (e: PointerEvent) => {
      if (id !== e.pointerId) return
      id = null
      this.sheetEl.classList.remove('dragging')
      this.sheetEl.style.transform = ''
      if (e.clientY - y0 >= SHEET_DISMISS_PX) this.closeSheet()
    }
    grip.addEventListener('pointerup', end)
    grip.addEventListener('pointercancel', end)
  }

  renderQueue(): HTMLElement {
    const q = this.queue
    const s = this.state
    const panel = h('div', { class: 'panel' })
    panel.append(h('div', { class: 'row' },
      h('span', { class: 'section-title' }, 'The queue'),
      h('span', { class: 'spacer', style: { flex: '1' } }),
      button('Dispatch', () => this.open({ kind: 'dispatch' }), 'small ghost'),
      button('Close', () => this.closeSheet(), 'small ghost'),
    ))
    if (q.crisis) panel.append(h('div', { class: 'crisis' }, 'More losses than fit. Work from the top.'))
    if (q.shown.length === 0) {
      panel.append(h('div', { class: 'quiet' }, h('div', { class: 'card-title' }, 'A quiet turn'), h('div', { class: 'card-body' }, 'Nothing needs you. End the turn when you are ready.')))
    }
    for (const g of q.shown) panel.append(this.renderGroup(g))
    if (q.folded.length) {
      const n = q.folded.reduce((a, g) => a + g.items.length, 0)
      panel.append(h('div', { class: 'fold tappable', onClick: () => this.open({ kind: 'fold' }) }, `${plural(n, 'more thing')} folded beneath`))
    }
    // the explain sentence for anything shown the first time is marked as read now
    for (const g of q.shown) if (g.explain && !s.charters[0].explained[g.group]) {
      try { applyAction(s, { t: 'markExplained', key: g.group }) } catch { /* ignore */ }
    }
    return panel
  }

  renderGroup(g: QueueGroup): HTMLElement {
    const typeClass = ['', 'loss', 'company', 'stuck', 'idle', 'chance'][g.type]
    const single = g.items.length === 1 ? g.items[0] : null
    const card = h('div', { class: 'card ' + typeClass })
    card.append(h('div', { class: 'card-title' }, g.title))
    card.append(h('div', { class: 'card-body' }, this.withTerms(g.body)))
    if (g.explain) card.append(h('div', { class: 'explain' }, g.explain))
    const actions = h('div', { class: 'card-actions' })
    if (single) {
      for (const c of single.choices) actions.append(button(c.label, () => { this.resolved(() => this.dispatch(c.action as Action, c.label)) }, 'small'))
      actions.append(button(single.opens || single.settlement !== undefined || single.unit !== undefined || single.tile !== undefined ? 'Open' : 'Dismiss', () => {
        if (single.opens || single.settlement !== undefined || single.unit !== undefined || single.tile !== undefined) this.openItem(single)
        else this.resolved(() => this.dispatch({ t: 'dismiss', key: single.key }))
      }, 'small ghost'))
    } else {
      actions.append(button(`Open ${g.items.length}`, () => this.open({ kind: 'group', group: g.group }), 'small ghost'))
    }
    card.append(actions)
    return card
  }

  /** Resolving or dismissing collapses the queue back to its bar, so the map comes straight back. */
  private resolved(act: () => void) {
    act()
    if (this.sheet.kind === 'queue') { this.queueExpanded = false; this.renderSheet(); this.renderQueueBar() }
  }

  /** Wrap known glossary terms in tappable spans. */
  withTerms(text: string): (HTMLElement | string)[] {
    const out: (HTMLElement | string)[] = []
    const re = /\b([A-Za-z][a-z]+)\b/g
    let last = 0, m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const word = m[1]
      const key = word.toLowerCase()
      const t = term(key)
      if (t) {
        out.push(text.slice(last, m.index))
        out.push(h('span', { class: 'term', onClick: (e: Event) => { e.stopPropagation(); this.open({ kind: 'glossary', key }) } }, word))
        last = m.index + word.length
      }
    }
    out.push(text.slice(last))
    return out
  }

  renderAudio() {
    clear(this.audioStrip)
    const a = this.music.state
    const icon = h('button', { class: 'speaker' + (a.on && !a.muted ? '' : ' off'), type: 'button', 'aria-label': 'music', onClick: () => { this.music.unlock(); this.audioStrip.classList.toggle('open') } }, a.on && !a.muted ? '♪' : '♪̸')
    const strip = h('div', { class: 'strip' },
      button(a.on ? 'Pause' : 'Play', () => this.music.toggleOn(), 'small'),
      button('Next', () => this.music.skip(), 'small'),
      button(a.muted ? 'Unmute' : 'Mute', () => this.music.toggleMute(), 'small'),
      h('input', { type: 'range', min: 0, max: 100, value: Math.round(a.volume * 100), onInput: (e: Event) => this.music.setVolume(Number((e.target as HTMLInputElement).value) / 100) }),
      h('span', { class: 'muted track' }, this.music.trackName),
    )
    this.audioStrip.append(icon, strip)
  }

  toast(text: string, undo?: () => void) {
    clear(this.toastEl)
    this.toastEl.append(h('span', {}, text))
    if (undo) this.toastEl.append(button('Undo', () => { undo(); }, 'small'))
    this.toastEl.classList.add('show')
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), undo ? 5000 : 3000)
  }

  // ---- screens --------------------------------------------------------------------------------
  showReturnScreen() {
    const s = this.state
    const last = s.dispatch.filter(d => d.turn === s.turn).slice(-3)
    const three = this.queue.shown.slice(0, 3)
    const box = h('div', { class: 'screen' },
      h('h1', {}, 'Fairholm'),
      h('p', { class: 'muted' }, `Turn ${s.turn}, year ${year(s.turn)}, ${SEASON_NAMES[season(s.turn)]}.`),
      h('p', { class: 'lead' }, s.intent),
      last.length ? h('div', {}, h('div', { class: 'card-title' }, 'What moved'), last.map(d => h('div', { class: 'line' }, d.text))) : null,
      three.length ? h('div', {}, h('div', { class: 'card-title' }, 'Three things'), three.map(g => h('div', { class: 'line' }, g.title))) : h('p', {}, 'A quiet turn waits.'),
      row(button('Continue', () => this.hideScreen(), 'primary'), button('Start again', () => { this.hideScreen(); this.open({ kind: 'newgame' }) }, 'ghost')),
    )
    this.showScreen(box)
  }

  showEnd(won: boolean | null) {
    const s = this.state
    const title = won === true ? 'The charter is torn up' : won === false ? 'The charter holds' : 'The end of the charter'
    const body = won === true ? 'The recall fleet is spent. Fairholm answers to no one across the sea.'
      : won === false ? 'The Company retook the Landing. Fairholm is a Company holding again.'
      : `${s.settings.turns} turns are done. ${s.declaration?.declared ? 'The war was not finished.' : 'The charter was never torn up.'}`
    const box = h('div', { class: 'screen' },
      h('h1', {}, title),
      h('p', { class: 'lead' }, body),
      h('p', { class: 'muted' }, `${plural(s.settlements.filter(x => x.owner === 0).length, 'settlement')}, ${s.charters[0].signatories.length} signatories, ${Math.round(s.charters[0].grievanceTotal)} grievance gathered.`),
      row(button('Keep looking', () => this.hideScreen(), 'ghost'), button('Start again', () => { this.hideScreen(); this.open({ kind: 'newgame' }) }, 'primary')),
    )
    this.showScreen(box)
  }

  showScreen(el: HTMLElement) {
    clear(this.overlayEl)
    this.overlayEl.append(el)
    this.overlayEl.classList.add('show')
    this.input.enabled = false
  }
  hideScreen() {
    this.overlayEl.classList.remove('show')
    clear(this.overlayEl)
    this.input.enabled = true
    this.refresh()
  }
}

/** The tiles a unit went through in a move, from where it stood: the planned path up to where it
 *  stopped. Where it stopped is not on the plan (it was planned again in the turn), the way it would
 *  go now from where it stood to where it is stands in for it. */
function trailOf(s: GameState, start: number, planned: number[], end: number, u: import('../sim/state').Unit): number[] {
  const k = planned.indexOf(end)
  if (k >= 0) return [start, ...planned.slice(0, k + 1)]
  const again = findPath(s, { ...u, tile: start }, start, end)
  return again && again.length ? [start, ...again] : [start, end]
}
