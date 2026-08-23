// The renderer. Architecture brief section 5 and art direction brief section 9. Draws on demand:
// once after a state change or a settled camera, continuously only while a gesture, momentum,
// glide or the arrival animation is in flight. DPR drops while moving and refines when settled.
// Props cull hysteretically with zoom in two tiers and nothing is rebuilt during a gesture; a state
// change during a gesture is deferred until it ends. A lost WebGL context is survived by rebuilding.
//
// What is baked, and when, per architecture brief section 3:
//   world     terrain mesh, vertex colours, baked occlusion, props, the shadow map's base
//   season    vertex colours, prop colours, the light, the shadow map's base, the clear colour
//   turn      ribbons, settlements, units, and the shadow map's dynamic layer
//   frame     nothing but the draw itself and the drifting cloud
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
import { buildUnits, buildArrival, makeRing } from './units'
import { season } from '../sim/turn'
import { hex, tileColour, clearColour, type RGB } from './palette'
import { workableTiles, tileYield, tileOffers } from '../sim/labour'
import { seedNumber } from './seed'
import { makeLightUniforms, applyLook, type LightUniforms } from './shading'
import { ShadowBake, type Occluder } from './shadow'
import { detailTextures, type DetailTextures } from './textures'
import { settlementAtlas } from './sprites'
import { seasonLook, sunVector, PROPS, SHADOW } from './look'

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
  arrival: THREE.Group | null = null
  arrivalProgress = 0
  arrivalSite: number | null = null
  arrivalAnimating = false
  selRing: THREE.Mesh
  unitRing: THREE.Mesh
  /** One set of light uniforms, shared by every material on the map. */
  light: LightUniforms = makeLightUniforms()
  detail: DetailTextures
  /** The early era settlement sheet, shared by every settlement on the map. */
  atlas: THREE.IUniform
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
  private lastState: GameState | null = null
  private lastWorldKey = ''
  private contextLost = false
  private cloudTime = 0
  private lastFrame = 0
  overlayMode: 'none' | 'yields' | 'territory' | 'threat' = 'none'
  pathTiles: number[] | null = null
  onFrame: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false })
    this.renderer.setClearColor(new THREE.Color(...hex(C.art.palette.deepWater)))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.cam = new MapCamera(1, 1)
    this.detail = detailTextures(() => this.requestDraw())
    this.atlas = settlementAtlas(() => this.requestDraw())
    applyLook(this.light, seasonLook(1))
    this.selRing = makeRing(0xf4efe2, 0.52)
    this.unitRing = makeRing(0xffffff, 0.3)
    this.scene.add(this.selRing, this.unitRing)
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true }, false)
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

  private setClear(sn: number) {
    const c = clearColour(sn)
    this.renderer.setClearColor(new THREE.Color(c[0], c[1], c[2]))
  }

  private rebuildDynamic(s: GameState) {
    if (!this.terrain) return
    const h = this.terrain.heightAt
    const sn = this.lastSeason >= 0 ? this.lastSeason : season(s.turn)
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
    const sb = buildSettlements(s, h, this.light, this.atlas, sn)
    this.settlements = sb.group
    this.settlementClose = sb.close
    this.settlementFar = sb.far
    this.settlementClose.visible = this.propsVisible
    this.settlementFar.visible = !this.propsVisible
    this.scene.add(this.settlements)
    if (this.units) { this.scene.remove(this.units); disposeGroup(this.units) }
    const ub = buildUnits(s, h, this.light)
    this.units = ub.group
    this.unitPositions = ub.positions
    this.scene.add(this.units)
    if (s.turn === 0) this.showArrival(s)
    else if (this.arrival) { this.scene.remove(this.arrival); disposeGroup(this.arrival); this.arrival = null }
    // whatever moved this turn puts its shadow back on top of the baked base
    this.dynamicOccluders = [...sb.occluders, ...ub.occluders]
    if (this.shadow && !this.bakePending) this.shadow.stampDynamic(sunVector(seasonLook(sn)), this.dynamicOccluders)
    this.updateOverlay(s)
    this.updateRings(s)
  }

  private disposeWorld() {
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

  /** Arrival: the lander offshore, the boat. Progress animates after the site is chosen. */
  showArrival(s: GameState) {
    if (this.arrival) { this.scene.remove(this.arrival); disposeGroup(this.arrival) }
    this.arrival = buildArrival(s, this.arrivalSite, this.arrivalProgress, this.light)
    this.scene.add(this.arrival)
  }

  animateLanding(s: GameState, site: number, done: () => void) {
    this.arrivalSite = site
    this.arrivalAnimating = true
    const start = performance.now()
    const dur = 1400
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur)
      this.arrivalProgress = t * t * (3 - 2 * t)
      this.showArrival(s)
      this.draw(true)
      if (t < 1) requestAnimationFrame(step)
      else { this.arrivalAnimating = false; done() }
    }
    requestAnimationFrame(step)
  }

  /** Selection ring and unit ring follow ViewState. */
  updateRings(s: GameState) {
    const v = this.cam.view
    const w = s.world.width
    if (v.selectedTile !== null && this.terrain) {
      const x = (v.selectedTile % w) + 0.5, z = Math.floor(v.selectedTile / w) + 0.5
      this.selRing.position.set(x, this.terrain.heightAt(x, z) + 0.02, z)
      this.selRing.visible = true
    } else this.selRing.visible = false
    if (v.activeUnit !== null) {
      const p = this.unitPositions.get(v.activeUnit)
      if (p && this.terrain) {
        this.unitRing.position.set(p[0], this.terrain.heightAt(p[0], p[1]) + 0.06, p[1])
        this.unitRing.visible = true
      } else this.unitRing.visible = false
    } else this.unitRing.visible = false
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
    if (mode === 'territory') {
      for (let i = 0; i < s.world.tiles.length; i++) {
        const t = s.world.tiles[i]
        if (t.owner !== null && s.charters[t.owner]) setOverlayTile(tex, w, i, hex(s.charters[t.owner].colour), 0.28)
      }
      for (const p of s.predecessors) for (const t of p.territory) setOverlayTile(tex, w, t, [0.72, 0.6, 0.38], 0.22)
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
      for (const u of s.units) {
        if (u.owner === 0) continue
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
    // the three landing sites, before the landing
    if (s.turn === 0) for (const site of s.world.landingSites) setOverlayTile(tex, w, site, [0.97, 0.92, 0.78], 0.7)
    // a path preview for the active unit
    if (this.pathTiles && this.pathTiles.length) {
      this.pathTiles.forEach((t, i) => setOverlayTile(tex, w, t, [0.96, 0.93, 0.82], i === this.pathTiles!.length - 1 ? 0.75 : 0.42))
    }
    // unexplored tiles are dimmed when fog is on
    if (C.flags.fogOfWar) for (let i = 0; i < s.world.tiles.length; i++) if (!s.world.tiles[i].explored) setOverlayTile(tex, w, i, [0.05, 0.05, 0.08], 0.85)
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
    // a settlement below this zoom is one mark in owner colour and nothing else
    if (this.settlementClose) this.settlementClose.visible = this.propsVisible
    if (this.settlementFar) this.settlementFar.visible = !this.propsVisible
    // and the ground takes on the colour of the props it is no longer wearing
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
      const moving = this.gestureActive || settling || gliding || this.arrivalAnimating
      this.draw(true)
      if (moving) requestAnimationFrame(frame)
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

  /** Nudge the clouds a little between turns so a quiet turn still moves. */
  advanceClouds() { this.cloudTime += 0.35 }

  /** Warm the shaders so the first real frame is not the one that compiles them. */
  warm() { if (this.lastState) { this.renderer.compile(this.scene, this.cam.camera); this.draw(true) } }

  pixelsPerTile(): number { return this.cam.view.zoom }

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
