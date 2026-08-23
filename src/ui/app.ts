// The interface core. Interaction brief sections 2 to 6, onboarding brief throughout, and the
// settlement screen and layout brief section 1: the map fills the viewport at all times, with two
// thin strips over it. The queue is a compact bar carrying its top item and a count; tapping it
// expands the list and resolving or dismissing collapses it again. Sheets slide up over the map and
// go away by a tap outside them or a swipe down. There are no confirmation dialogs: anything within
// a turn can be undone.

import type { GameState, DerivedQueue, QueueGroup, QueueItem, Settings, Settlement, BuildingLine } from '../sim/state'
import { applyAction, createGame, siteDescriptions, type Action } from '../sim/actions'
import { deriveQueue, unitLabel } from '../sim/queue'
import { SYSTEMS } from '../sim/systems'
import { SEASON_NAMES, season, year } from '../sim/turn'
import { randomSeed, playRng } from '../sim/rng'
import { C } from '../sim/constants'
import { findPath } from '../sim/units'
import { Scene } from '../render/scene'
import { pick, tileUnderPoint } from '../render/picking'
import { Input } from './input'
import { MusicPlayer } from './audio'
import { h, clear, button, row, muted, fmt, plural } from './dom'
import { renderSheet, type SheetSpec } from './sheets'
import { ownSettlements, type RingCell, type BuildingSlot } from './selectors'
import { SHEET_DISMISS_PX, installTheme, shouldReflow } from './theme'
import * as Save from '../io/save'
import * as Telemetry from '../io/telemetry'
import { term } from './glossary'

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
  pathPreview: number[] | null = null
  /** The colonist being placed, while the player is choosing where they should work. */
  pick: { settlement: number; colonist: number } | null = null
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
  private landingBusy = false

  constructor(root: HTMLElement, state: GameState, resumed: boolean) {
    installTheme()
    this.root = root
    this.state = state
    this.canvas = h('canvas', { id: 'map' }) as HTMLCanvasElement
    this.hud = h('div', { id: 'hud' })
    this.scrim = h('div', { id: 'scrim', onClick: () => this.closeSheet() })
    this.sheetBody = h('div', { class: 'body' })
    this.sheetEl = h('div', { id: 'sheet' }, h('div', { class: 'grip' }), this.sheetBody)
    this.queuebar = h('div', { id: 'queuebar' })
    this.toastEl = h('div', { id: 'toast' })
    this.ring = h('div', { id: 'holdring' })
    this.overlayEl = h('div', { id: 'overlay' })
    this.audioStrip = h('div', { id: 'audio' })
    root.append(this.canvas, this.hud, this.audioStrip, this.scrim, this.sheetEl, this.queuebar, this.ring, this.toastEl, this.overlayEl)
    this.attachSheetSwipe()
    this.scene = new Scene(this.canvas)
    this.music = new MusicPlayer(state.settings.audio)
    this.music.onChange = (a) => { this.state.settings.audio = { ...this.state.settings.audio, ...a }; this.renderAudio() }
    this.input = new Input(this.canvas, this.scene.cam, {
      onTap: (x, y) => this.tap(x, y),
      onDoubleTap: (x, y) => this.doubleTap(x, y),
      onHold: (x, y) => this.hold(x, y),
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
    if (this.state.turn === 0) this.beginArrival()
    else {
      this.scene.cam.centreOn(this.state.settlements[0]?.tile ?? this.state.charters[0].landing, C.feel.zoom.working)
      this.refresh()
      if (resumed) this.showReturnScreen()
    }
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
  }

  // ---- arrival ----------------------------------------------------------------------------------
  beginArrival() {
    const sites = this.state.world.landingSites
    const first = sites[0]
    this.scene.cam.centreOn(first, C.feel.zoom.working * 0.75)
    this.scene.showArrival(this.state)
    this.scene.requestDraw()
    this.sheet = { kind: 'landing' }
    this.refresh()
  }

  land(site: number) {
    if (this.landingBusy || this.state.turn !== 0) return
    // the choice of a landing site is the player's first tap, and the gesture that starts the music
    this.music.unlock()
    this.landingBusy = true
    this.scene.glideTo(site, C.feel.zoom.working)
    this.scene.animateLanding(this.state, site, () => {
      try { applyAction(this.state, { t: 'land', site }) } catch (e) { this.landingBusy = false; this.toast(String((e as Error).message)); return }
      this.landingBusy = false
      Telemetry.newGame()
      this.sheet = { kind: 'queue' }
      this.queueExpanded = false
      this.scene.arrivalSite = null
      this.scene.rebuild(this.state, 'dynamic')
      this.turnStartedAt = performance.now()
      this.save()
      this.refresh()
      this.toast('Ashore. The bar below is everything that needs you.')
    })
  }

  // ---- state changes -----------------------------------------------------------------------------
  /** Apply an action. Throws are swallowed into a toast; nothing happened. Returns success. */
  dispatch(a: Action, undoLabel?: string): boolean {
    const undoable = undoLabel !== undefined && a.t !== 'endTurn' && a.t !== 'land'
    let snapshot: GameState | null = null
    if (undoable) snapshot = structuredClone(this.state)
    try {
      applyAction(this.state, a)
    } catch (e) {
      this.toast((e as Error).message)
      return false
    }
    if (snapshot) {
      this.undoStack.push({ snapshot, label: undoLabel! })
      if (this.undoStack.length > 8) this.undoStack.shift()
      this.toast(undoLabel!, () => this.undo())
    }
    if (a.t === 'consign') { if (this.state.telemetry.firstConsignment === this.state.turn) Telemetry.firstConsignment(this.state.turn) }
    if (a.t === 'found') { if (this.state.telemetry.secondSettlement === this.state.turn) Telemetry.secondSettlement(this.state.turn) }
    this.pathPreview = null
    this.scene.rebuild(this.state, 'dynamic')
    this.refresh()
    return true
  }

  undo() {
    const u = this.undoStack.pop()
    if (!u) return
    // keep the play RNG moving so an undo never replays the same dice
    const play = this.state.rng.play
    this.state = u.snapshot
    this.state.rng.play = play
    this.pathPreview = null
    this.pick = null
    this.scene.rebuild(this.state, 'dynamic')
    this.refresh()
    this.toast('Undone')
  }

  endTurn() {
    if (this.state.turn === 0) return
    if (this.state.declaration?.won || this.state.declaration?.lost) return
    const q = this.queue
    const seconds = (performance.now() - this.turnStartedAt) / 1000
    const before = this.state.turn
    this.dispatch({ t: 'endTurn' })
    if (this.state.turn === before) return
    this.undoStack = []
    Telemetry.turnEnded(this.state.turn, q.shown.length + q.folded.length, seconds)
    this.turnStartedAt = performance.now()
    this.scene.advanceClouds()
    this.scene.applySeason(this.state)
    this.scene.requestDraw()
    this.save()
    // a sheet on a thing that no longer exists closes
    if (this.sheet.kind === 'unit' && !this.state.units.some(u => u.id === (this.sheet as { id: number }).id)) this.sheet = { kind: 'queue' }
    this.refresh()
    if (this.state.declaration?.won) this.showEnd(true)
    else if (this.state.declaration?.lost) this.showEnd(false)
    else if (this.state.turn >= this.state.settings.turns) this.showEnd(null)
  }

  save() {
    if (this.state.turn === 0) return
    Save.writeLocal(this.state)
    Save.writeLastSettings(this.state.settings)
  }

  newGame(partial: Partial<Settings>) {
    const seed = randomSeed(playRng(Date.now()))
    const settings: Partial<Settings> = { ...partial, audio: this.state.settings.audio, firstGame: false }
    const s = createGame(seed, settings, Date.now())
    Save.clearLocal()
    this.state = s
    this.undoStack = []
    this.pick = null
    this.scene.cam.view.selectedTile = null
    this.scene.cam.view.activeUnit = null
    this.scene.arrivalProgress = 0
    this.scene.arrivalSite = null
    this.scene.rebuild(this.state, 'full')
    this.beginArrival()
  }

  async importSave(file: File) {
    try {
      const save = await Save.importFromFile(file)
      const s = Save.fromSave(save, Date.now())
      this.state = s
      this.undoStack = []
      this.pick = null
      this.scene.cam.view.selectedTile = null
      this.scene.cam.view.activeUnit = null
      this.scene.rebuild(this.state, 'full')
      this.scene.cam.centreOn(this.state.settlements[0]?.tile ?? this.state.charters[0].landing, C.feel.zoom.working)
      this.sheet = { kind: 'queue' }
      this.queueExpanded = false
      this.save()
      this.refresh()
      this.toast('Game imported')
    } catch (e) { this.toast('Could not import: ' + (e as Error).message) }
  }

  // ---- input routing ---------------------------------------------------------------------------
  tap(px: number, py: number) {
    const s = this.state
    if (s.turn === 0) {
      // landing: a tap on or near a site goes ashore there
      const t = tileUnderPoint(s, this.scene.cam, px, py)
      if (t === null) return
      const w = s.world.width
      let best: number | null = null, bd = 3
      for (const site of s.world.landingSites) {
        const d = Math.hypot((site % w) - (t % w), Math.floor(site / w) - Math.floor(t / w))
        if (d < bd) { bd = d; best = site }
      }
      if (best !== null) this.land(best)
      return
    }
    const p = pick(s, this.scene.cam, px, py, this.scene.unitPositions)
    const v = this.scene.cam.view
    if (p.unit !== null) {
      const u = s.units.find(x => x.id === p.unit)!
      if (u.owner === 0) {
        v.selectedTile = u.tile
        this.pathPreview = null
        const stack = s.units.filter(x => x.tile === u.tile && x.owner === 0)
        if (stack.length > 1 && v.activeUnit === null) this.open({ kind: 'stack', tile: u.tile })
        else { v.activeUnit = u.id; this.open({ kind: 'unit', id: u.id }) }
      } else {
        v.selectedTile = u.tile
        this.open({ kind: 'tile', tile: u.tile })
      }
      this.afterSelect()
      return
    }
    if (p.settlement !== null) {
      const st = s.settlements[p.settlement]
      v.selectedTile = st.tile
      if (v.activeUnit !== null) {
        // a unit bound for a settlement: preview the path rather than open the sheet
        if (this.previewPath(st.tile)) { this.open({ kind: 'unit', id: v.activeUnit }); this.afterSelect(); return }
      }
      v.activeUnit = null
      this.open(st.owner === 0 ? { kind: 'settlement', id: st.id } : { kind: 'tile', tile: st.tile })
      this.afterSelect()
      return
    }
    if (p.predecessor !== null) {
      const pr = s.predecessors[p.predecessor]
      v.selectedTile = pr.tile
      if (v.activeUnit !== null && this.previewPath(pr.tile)) { this.open({ kind: 'unit', id: v.activeUnit }); this.afterSelect(); return }
      v.activeUnit = null
      this.open({ kind: 'predecessor', id: pr.id })
      this.afterSelect()
      return
    }
    if (p.tile !== null) {
      v.selectedTile = p.tile
      if (v.activeUnit !== null) {
        if (this.previewPath(p.tile)) { this.open({ kind: 'unit', id: v.activeUnit }); this.afterSelect(); return }
        v.activeUnit = null
      }
      this.open({ kind: 'tile', tile: p.tile })
      this.afterSelect()
      return
    }
    // a tap below working zoom on nothing: deselect and let the map be the whole screen again
    v.selectedTile = null
    v.activeUnit = null
    this.pathPreview = null
    this.closeSheet()
    this.afterSelect()
  }

  private afterSelect() {
    this.scene.updateRings(this.state)
    this.paintPath()
    this.scene.requestDraw()
  }

  /** Compute a path preview for the active unit to a tile. Returns whether a path exists. */
  previewPath(tile: number): boolean {
    const v = this.scene.cam.view
    const u = this.state.units.find(x => x.id === v.activeUnit)
    if (!u || u.owner !== 0 || tile === u.tile) { this.pathPreview = null; return false }
    const path = findPath(this.state, u, u.tile, tile)
    this.pathPreview = path
    return !!path
  }

  paintPath() {
    this.scene.pathTiles = this.pathPreview
    this.scene.updateOverlay(this.state)
  }

  doubleTap(px: number, py: number) {
    const z = this.scene.cam.view.zoom
    const target = z >= C.feel.zoom.working * 0.8 ? C.feel.zoom.overview : C.feel.zoom.working
    const t = tileUnderPoint(this.state, this.scene.cam, px, py)
    if (t !== null) this.scene.glideTo(t, target)
    else this.scene.cam.setZoomAt(px, py, target)
    this.scene.requestDraw()
  }

  hold(px: number, py: number) {
    const s = this.state
    if (s.turn === 0) return
    const v = this.scene.cam.view
    const t = tileUnderPoint(s, this.scene.cam, px, py)
    if (t === null) return
    if (v.activeUnit !== null) {
      const u = s.units.find(x => x.id === v.activeUnit)
      if (u && u.owner === 0) {
        const enemy = s.units.find(x => x.tile === t && x.owner !== 0 && (x.owner === -1 || s.charters[x.owner]?.relation === 'war'))
        if (enemy) { this.commitAttack(u.id, t); return }
        if (this.previewPath(t)) { this.commitMove(u.id); return }
      }
    }
    // hold on a thing with nothing active: select it and open it, the same as a tap
    this.tap(px, py)
  }

  commitMove(unitId: number) {
    const u = this.state.units.find(x => x.id === unitId)
    if (!u) return
    const path = this.pathPreview ?? (this.scene.cam.view.selectedTile !== null ? findPath(this.state, u, u.tile, this.scene.cam.view.selectedTile) : null)
    if (!path) { this.toast('No way through'); return }
    const ok = this.dispatch({ t: 'moveUnit', unit: unitId, path }, `${unitLabel(u.kind)} moved`)
    if (ok) {
      const nu = this.state.units.find(x => x.id === unitId)
      if (nu) { this.scene.cam.view.selectedTile = nu.tile; this.open({ kind: 'unit', id: unitId }) }
      this.afterSelect()
    }
  }

  commitAttack(unitId: number, tile: number) {
    const u = this.state.units.find(x => x.id === unitId)
    if (!u) return
    this.dispatch({ t: 'attack', unit: unitId, tile }, `${unitLabel(u.kind)} attacked`)
    this.afterSelect()
  }

  private holdPreviewed = false
  holdRing(px: number, py: number, k: number) {
    if (k < 0) { this.ring.style.display = 'none'; this.holdPreviewed = false; return }
    // the target shows what will happen before the hold completes
    if (!this.holdPreviewed && this.scene.cam.view.activeUnit !== null && this.state.turn > 0) {
      this.holdPreviewed = true
      const t = tileUnderPoint(this.state, this.scene.cam, px, py)
      if (t !== null && this.previewPath(t)) { this.scene.cam.view.selectedTile = t; this.afterSelect(); if (this.sheet.kind === 'unit') this.renderSheet() }
    }
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

  back() {
    const prev = this.sheetHistory.pop()
    this.sheet = prev ?? { kind: 'queue' }
    if (this.sheet.kind === 'queue') { this.queueExpanded = true; this.scene.cam.view.activeUnit = null; this.pathPreview = null; this.afterSelect() }
    this.renderSheet()
  }

  /** Put everything away and give the map the whole screen back. */
  closeSheet() {
    this.sheet = { kind: 'queue' }
    this.sheetHistory = []
    this.queueExpanded = false
    this.pick = null
    this.renderSheet()
    this.renderQueueBar()
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
    if (it.tile !== undefined) this.focus(it.tile)
    else if (it.settlement !== undefined) this.focus(this.state.settlements[it.settlement].tile)
    else if (it.unit !== undefined) { const u = this.state.units.find(x => x.id === it.unit); if (u) this.focus(u.tile) }
    if (it.unit !== undefined && this.state.units.some(u => u.id === it.unit)) { this.scene.cam.view.activeUnit = it.unit; this.afterSelect(); this.open({ kind: 'unit', id: it.unit }); return }
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
      this.dispatch({ t: 'assignWorker', settlement: st.id, colonist: this.pick.colonist, job: { kind: 'tile', tile: cell.tile, good } }, 'Set to work')
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
      this.dispatch({ t: 'assignWorker', settlement: st.id, colonist: this.pick.colonist, job: { kind: 'building', line: slot.line } }, 'Set to work')
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
    this.queue = deriveQueue(this.state, SYSTEMS)
    this.renderHud()
    this.renderQueueBar()
    this.renderSheet()
    this.renderAudio()
  }

  renderHud() {
    const s = this.state
    clear(this.hud)
    if (s.turn === 0) {
      this.hud.append(h('div', { class: 'intent' }, 'Choose where to go ashore.'))
      return
    }
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

  /** The queue at rest: one line carrying its top item and a count, and the turn. */
  renderQueueBar() {
    const s = this.state
    clear(this.queuebar)
    this.queuebar.style.display = s.turn === 0 ? 'none' : ''
    if (s.turn === 0) return
    const q = this.queue
    const total = q.shown.reduce((a, g) => a + g.items.length, 0) + q.folded.reduce((a, g) => a + g.items.length, 0)
    const top = q.shown[0]
    const typeClass = top ? ['', 'loss', 'company', 'stuck', 'idle', 'chance'][top.type] : ''
    const idle = q.shown.concat(q.folded).filter(g => g.type === 3 || g.type === 4).reduce((a, g) => a + g.items.length, 0)
    const label = idle > 0 ? `End turn, ${idle} will idle` : 'End turn'
    const ended = s.declaration?.won || s.declaration?.lost || s.turn >= s.settings.turns
    this.queuebar.append(
      h('button', { class: 'top', type: 'button', onClick: () => { if (this.queueExpanded && this.sheet.kind === 'queue') this.closeSheet(); else this.open({ kind: 'queue' }) } },
        h('span', { class: 'mark ' + typeClass }),
        h('span', { class: 'what' + (top ? '' : ' quiet') }, top ? top.title : 'A quiet turn'),
        total > 1 ? h('span', { class: 'count' }, String(total)) : null,
      ),
      ended ? button('Over', () => this.showEnd(s.declaration?.won ? true : s.declaration?.lost ? false : null), 'primary') : button(label, () => this.endTurn(), 'primary'),
    )
  }

  renderSheet() {
    const showing = this.sheetShowing()
    const full = showing && isFullScreenSheet(this.sheet)
    this.sheetEl.classList.toggle('open', showing)
    this.sheetEl.classList.toggle('full', full)
    this.scrim.classList.toggle('show', showing && !full)
    clear(this.sheetBody)
    this.sheetBody.scrollTop = 0
    this.sheetEl.style.transform = ''
    if (!showing) return
    if (this.sheet.kind === 'landing') { this.sheetBody.append(this.renderLanding()); return }
    if (this.sheet.kind === 'queue') { this.sheetBody.append(this.renderQueue()); return }
    this.sheetBody.append(renderSheet(this, this.sheet))
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

  renderLanding(): HTMLElement {
    const sites = siteDescriptions(this.state)
    return h('div', { class: 'panel' },
      h('h2', {}, 'Where to go ashore'),
      h('p', { class: 'muted' }, 'Three places the boat can make. Tap one to land there.'),
      sites.map((site, i) => h('div', { class: 'card tappable', onClick: () => this.land(site.tile) },
        h('div', { class: 'card-title' }, ['The first cove', 'The second cove', 'The third cove'][i] ?? `Site ${i + 1}`),
        h('div', { class: 'card-body' }, site.text),
        h('div', { class: 'card-actions' }, button('Look', (ev?: unknown) => { (ev as Event)?.stopPropagation?.(); this.scene.glideTo(site.tile, C.feel.zoom.working) }, 'ghost'), button('Go ashore here', () => this.land(site.tile), 'primary')),
      )),
    )
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
      : won === false ? 'The Company retook the landing. Fairholm is a Company holding again.'
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
