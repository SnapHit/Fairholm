// The camera: true top-down, orthographic, no tilt. Art direction brief section 2. Zoom is
// continuous by pinch, anchored on the centroid, with momentum on release and rubber-banding at
// the limits. Feel brief section 2. The camera lives in ViewState, never in GameState.

import * as THREE from 'three'
import { C } from '../sim/constants'

export interface ViewState {
  cx: number            // world x at screen centre
  cz: number            // world z at screen centre
  zoom: number          // CSS pixels per tile
  selectedTile: number | null
  activeUnit: number | null
  hoverTile: number | null
  overlay: 'none' | 'yields' | 'territory' | 'threat' | 'routes'
}

export class MapCamera {
  camera: THREE.OrthographicCamera
  view: ViewState
  width = 1
  height = 1
  mapW = 1
  mapH = 1
  vx = 0
  vz = 0
  vzoom = 0
  fitZoom = 8
  private anchorPx: [number, number] | null = null

  constructor(mapW: number, mapH: number) {
    this.mapW = mapW
    this.mapH = mapH
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    this.camera.position.set(mapW / 2, 20, mapH / 2)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(mapW / 2, 0, mapH / 2)
    this.view = { cx: mapW / 2, cz: mapH / 2, zoom: C.feel.zoom.working, selectedTile: null, activeUnit: null, hoverTile: null, overlay: 'none' }
  }

  setMap(mapW: number, mapH: number) {
    this.mapW = mapW; this.mapH = mapH
    this.resize(this.width, this.height)
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.fitZoom = Math.max(C.feel.zoom.min, Math.min(this.width / this.mapW, this.height / this.mapH) * 0.96)
    this.apply()
  }

  minZoom(): number { return Math.min(this.fitZoom, C.feel.zoom.min) }
  maxZoom(): number { return C.feel.zoom.max }

  /** Push the camera into the renderer. */
  apply() {
    const v = this.view
    const hw = this.width / v.zoom / 2, hh = this.height / v.zoom / 2
    this.camera.left = -hw; this.camera.right = hw; this.camera.top = hh; this.camera.bottom = -hh
    this.camera.position.set(v.cx, 20, v.cz)
    this.camera.lookAt(v.cx, 0, v.cz)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }

  screenToWorld(px: number, py: number): [number, number] {
    const v = this.view
    return [v.cx + (px - this.width / 2) / v.zoom, v.cz + (py - this.height / 2) / v.zoom]
  }

  worldToScreen(wx: number, wz: number): [number, number] {
    const v = this.view
    return [(wx - v.cx) * v.zoom + this.width / 2, (wz - v.cz) * v.zoom + this.height / 2]
  }

  panPixels(dx: number, dy: number) {
    this.view.cx -= dx / this.view.zoom
    this.view.cz -= dy / this.view.zoom
    this.softClamp(C.feel.rubberBand)
    this.apply()
  }

  /** Zoom so that the world point under (px, py) stays under (px, py). Continuous. */
  zoomAt(px: number, py: number, factor: number) {
    const [wx, wz] = this.screenToWorld(px, py)
    let z = this.view.zoom * factor
    const lo = this.minZoom(), hi = this.maxZoom()
    // rubber-band beyond the limits during the gesture, settle back on release
    if (z < lo) z = lo - (lo - z) * 0.5
    if (z > hi) z = hi + (z - hi) * 0.5
    z = Math.max(lo * 0.6, Math.min(hi * 1.4, z))
    this.view.zoom = z
    this.view.cx = wx - (px - this.width / 2) / z
    this.view.cz = wz - (py - this.height / 2) / z
    this.softClamp(C.feel.rubberBand)
    this.apply()
  }

  setZoomAt(px: number, py: number, zoom: number) {
    this.zoomAt(px, py, zoom / this.view.zoom)
  }

  /** Keep the map on screen with a soft edge. */
  private softClamp(band: number) {
    const v = this.view
    const hw = this.width / v.zoom / 2, hh = this.height / v.zoom / 2
    const minX = Math.min(hw, this.mapW / 2), maxX = Math.max(this.mapW - hw, this.mapW / 2)
    const minZ = Math.min(hh, this.mapH / 2), maxZ = Math.max(this.mapH - hh, this.mapH / 2)
    const slack = 1.5
    if (v.cx < minX - slack) v.cx = minX - slack + (v.cx - (minX - slack)) * band
    if (v.cx > maxX + slack) v.cx = maxX + slack + (v.cx - (maxX + slack)) * band
    if (v.cz < minZ - slack) v.cz = minZ - slack + (v.cz - (minZ - slack)) * band
    if (v.cz > maxZ + slack) v.cz = maxZ + slack + (v.cz - (maxZ + slack)) * band
  }

  /** Animate momentum and spring back from the limits. Returns true while still moving. */
  tick(): boolean {
    const v = this.view
    let moving = false
    if (Math.abs(this.vx) > C.feel.momentumStop || Math.abs(this.vz) > C.feel.momentumStop) {
      v.cx += this.vx / v.zoom
      v.cz += this.vz / v.zoom
      this.vx *= C.feel.momentumDecay
      this.vz *= C.feel.momentumDecay
      moving = true
    } else { this.vx = 0; this.vz = 0 }
    if (Math.abs(this.vzoom) > 0.001 && this.anchorPx) {
      this.zoomAt(this.anchorPx[0], this.anchorPx[1], 1 + this.vzoom)
      this.vzoom *= C.feel.momentumDecay
      moving = true
    } else this.vzoom = 0
    // spring back to the zoom limits and the map edges
    const lo = this.minZoom(), hi = this.maxZoom()
    if (v.zoom < lo) { v.zoom += (lo - v.zoom) * 0.25; moving = true; if (Math.abs(lo - v.zoom) < 0.01) v.zoom = lo }
    if (v.zoom > hi) { v.zoom += (hi - v.zoom) * 0.25; moving = true; if (Math.abs(hi - v.zoom) < 0.01) v.zoom = hi }
    const hw = this.width / v.zoom / 2, hh = this.height / v.zoom / 2
    const minX = Math.min(hw, this.mapW / 2), maxX = Math.max(this.mapW - hw, this.mapW / 2)
    const minZ = Math.min(hh, this.mapH / 2), maxZ = Math.max(this.mapH - hh, this.mapH / 2)
    const spring = (val: number, lo2: number, hi2: number) => {
      if (val < lo2) { moving = true; return val + (lo2 - val) * 0.22 }
      if (val > hi2) { moving = true; return val + (hi2 - val) * 0.22 }
      return val
    }
    v.cx = spring(v.cx, minX, maxX)
    v.cz = spring(v.cz, minZ, maxZ)
    this.apply()
    return moving
  }

  release(vx: number, vz: number, vzoom: number, anchor: [number, number] | null) {
    this.vx = vx; this.vz = vz; this.vzoom = vzoom; this.anchorPx = anchor ?? [this.width / 2, this.height / 2]
  }

  stop() { this.vx = 0; this.vz = 0; this.vzoom = 0 }

  /** Centre on a tile, optionally at a zoom. */
  centreOn(tile: number, zoom?: number) {
    this.view.cx = (tile % this.mapW) + 0.5
    this.view.cz = Math.floor(tile / this.mapW) + 0.5
    if (zoom) this.view.zoom = zoom
    this.softClamp(0)
    this.apply()
  }

  /** Smoothly move toward a target. Returns true while moving. */
  glideTarget: { cx: number; cz: number; zoom: number } | null = null
  glideTo(tile: number, zoom: number) {
    this.glideTarget = { cx: (tile % this.mapW) + 0.5, cz: Math.floor(tile / this.mapW) + 0.5, zoom }
  }
  glideTick(): boolean {
    const g = this.glideTarget
    if (!g) return false
    const v = this.view
    v.cx += (g.cx - v.cx) * 0.18
    v.cz += (g.cz - v.cz) * 0.18
    v.zoom += (g.zoom - v.zoom) * 0.18
    const done = Math.abs(g.cx - v.cx) < 0.01 && Math.abs(g.cz - v.cz) < 0.01 && Math.abs(g.zoom - v.zoom) < 0.05
    if (done) { v.cx = g.cx; v.cz = g.cz; v.zoom = g.zoom; this.glideTarget = null }
    this.apply()
    return !done
  }
}
