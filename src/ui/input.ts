// Input. Feel brief sections 2 to 4. Three gestures and one modifier: pinch zooms, drag pans,
// tap selects (always safe), tap-and-hold commits. Moving beyond a few pixels cancels the hold
// and becomes a pan. A double tap snaps between overview and working zoom. Everything is
// pointer events on the canvas with touch-action none; the sheets over it are ordinary DOM.
//
// The hold's length is HOLD_MS in src/ui/theme.ts, not a literal here, so it can be tuned in one
// place. The ring under the finger fills across the whole of it, from the first frame of contact,
// so the player is never waiting without knowing they are waiting.

import { C } from '../sim/constants'
import { HOLD_MS } from './theme'
import type { MapCamera } from '../render/camera'

export interface InputHandlers {
  onTap(px: number, py: number): void
  onDoubleTap(px: number, py: number): void
  onHold(px: number, py: number): void
  onHoldProgress(px: number, py: number, k: number): void   // k in 0..1, negative to hide
  onGesture(active: boolean): void
  onFirstInteraction(): void
}

interface P { id: number; x: number; y: number; sx: number; sy: number; t: number }

export class Input {
  private pointers = new Map<number, P>()
  private holdTimer: number | null = null
  private holdStart = 0
  private holdFired = false
  private panning = false
  private pinching = false
  private lastTap: { t: number; x: number; y: number } | null = null
  private lastCentroid: [number, number] | null = null
  private lastDist = 0
  private vel: [number, number] = [0, 0]
  private lastMoveT = 0
  private zoomVel = 0
  private raf: number | null = null
  private interacted = false
  enabled = true

  constructor(private canvas: HTMLCanvasElement, private cam: MapCamera, private h: InputHandlers) {
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', this.down, { passive: false })
    canvas.addEventListener('pointermove', this.move, { passive: false })
    canvas.addEventListener('pointerup', this.up, { passive: false })
    canvas.addEventListener('pointercancel', this.up, { passive: false })
    canvas.addEventListener('wheel', this.wheel, { passive: false })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return
    e.preventDefault()
    if (!this.interacted) { this.interacted = true; this.h.onFirstInteraction() }
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const [x, y] = this.local(e)
    this.pointers.set(e.pointerId, { id: e.pointerId, x, y, sx: x, sy: y, t: performance.now() })
    if (this.pointers.size === 1) {
      this.panning = false; this.holdFired = false
      this.vel = [0, 0]; this.zoomVel = 0
      this.cam.stop()
      this.cam.glideTarget = null
      this.armHold(x, y)
    } else if (this.pointers.size === 2) {
      this.cancelHold()
      this.pinching = true
      const [a, b] = [...this.pointers.values()]
      this.lastCentroid = [(a.x + b.x) / 2, (a.y + b.y) / 2]
      this.lastDist = Math.hypot(a.x - b.x, a.y - b.y)
      this.h.onGesture(true)
    }
  }

  private armHold(x: number, y: number) {
    this.cancelHold()
    this.holdStart = performance.now()
    const tick = () => {
      const p = [...this.pointers.values()][0]
      if (!p || this.pointers.size !== 1 || this.panning) { this.h.onHoldProgress(x, y, -1); return }
      const k = (performance.now() - this.holdStart) / HOLD_MS
      if (k >= 1) {
        this.holdFired = true
        this.h.onHoldProgress(x, y, -1)
        this.h.onHold(p.x, p.y)
        return
      }
      // feedback from the first frame of contact, feel brief section 4
      this.h.onHoldProgress(p.x, p.y, k)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private cancelHold() {
    if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null }
    if (this.holdTimer !== null) { clearTimeout(this.holdTimer); this.holdTimer = null }
    this.h.onHoldProgress(0, 0, -1)
  }

  private move = (e: PointerEvent) => {
    if (!this.enabled) return
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    e.preventDefault()
    const [x, y] = this.local(e)
    const now = performance.now()
    if (this.pointers.size === 1) {
      if (this.holdFired) { p.x = x; p.y = y; return }
      const moved = Math.hypot(x - p.sx, y - p.sy)
      if (!this.panning && moved > C.feel.holdCancelPx) {
        this.panning = true
        this.cancelHold()
        this.h.onGesture(true)
      }
      if (this.panning) {
        const dt = Math.max(1, now - this.lastMoveT)
        this.vel = [(x - p.x) / dt * 16, (y - p.y) / dt * 16]
        this.cam.panPixels(x - p.x, y - p.y)
      }
    } else if (this.pointers.size === 2 && this.pinching) {
      p.x = x; p.y = y
      const [a, b] = [...this.pointers.values()]
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.lastCentroid) this.cam.panPixels(cx - this.lastCentroid[0], cy - this.lastCentroid[1])
      if (this.lastDist > 0 && d > 0) {
        const f = d / this.lastDist
        this.cam.zoomAt(cx, cy, f)
        const dt = Math.max(1, now - this.lastMoveT)
        this.zoomVel = (f - 1) / dt * 16
      }
      this.lastCentroid = [cx, cy]
      this.lastDist = d
    }
    p.x = x; p.y = y
    this.lastMoveT = now
  }

  private up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    e.preventDefault()
    this.pointers.delete(e.pointerId)
    const now = performance.now()
    if (this.pinching) {
      if (this.pointers.size < 2) {
        this.pinching = false
        // the remaining finger continues as a pan, the gesture stays active
        const rest = [...this.pointers.values()][0]
        if (rest) { rest.sx = rest.x; rest.sy = rest.y; this.panning = true; this.lastCentroid = null }
        else this.finish(now, p, true)
      }
      return
    }
    if (this.pointers.size === 0) this.finish(now, p, false)
  }

  private finish(now: number, p: P, fromPinch: boolean) {
    this.cancelHold()
    if (this.holdFired) { this.holdFired = false; this.panning = false; return }
    if (this.panning || fromPinch) {
      this.panning = false
      const stale = now - this.lastMoveT > 60
      const anchor: [number, number] | null = this.lastCentroid
      this.cam.release(stale ? 0 : this.vel[0], stale ? 0 : this.vel[1], stale ? 0 : this.zoomVel * 0.6, anchor)
      this.h.onGesture(false)
      return
    }
    const dt = now - p.t
    const moved = Math.hypot(p.x - p.sx, p.y - p.sy)
    if (dt <= C.feel.tapMaxMs + 200 && moved <= C.feel.tapMaxPx + 4) {
      const lt = this.lastTap
      if (lt && now - lt.t < C.feel.doubleTapMs && Math.hypot(lt.x - p.x, lt.y - p.y) < 30) {
        this.lastTap = null
        this.h.onDoubleTap(p.x, p.y)
      } else {
        this.lastTap = { t: now, x: p.x, y: p.y }
        this.h.onTap(p.x, p.y)
      }
    }
  }

  private wheel = (e: WheelEvent) => {
    if (!this.enabled) return
    e.preventDefault()
    if (!this.interacted) { this.interacted = true; this.h.onFirstInteraction() }
    const r = this.canvas.getBoundingClientRect()
    const f = Math.exp(-e.deltaY * 0.0015)
    this.cam.zoomAt(e.clientX - r.left, e.clientY - r.top, f)
    this.h.onGesture(true)
    this.h.onGesture(false)
  }
}
