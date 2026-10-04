// Input. Feel brief sections 2 to 4. Three gestures: pinch zooms, drag pans, tap selects (always
// safe). Movement is one gesture on top of them: press and hold the destination, and after the
// hold's length the route shows; slide to re-aim it; let go to move. Moving beyond a few pixels
// before the hold engages cancels it and becomes a pan; once it has engaged, moving re-aims and
// never pans. A second finger cancels the hold and becomes a pinch. A double tap snaps between
// overview and working zoom. Everything is pointer events on the canvas with touch-action none;
// the sheets over it are ordinary DOM.
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
  /** The hold has engaged under the finger. True when something is now being aimed, so the finger
   *  moving re-aims and letting go commits; false when the hold was taken as a tap and the rest of
   *  the gesture means nothing. */
  onHold(px: number, py: number): boolean
  /** The finger moved while aiming. */
  onAim(px: number, py: number): void
  /** The finger lifted while aiming: commit what is shown, or cancel, as the app decides. */
  onRelease(px: number, py: number): void
  /** The aim is abandoned: a second finger came down, or the pointer was lost. */
  onAimCancel(): void
  onHoldProgress(px: number, py: number, k: number): void   // k in 0..1, negative to hide
  onGesture(active: boolean): void
  onFirstInteraction(): void
}

interface P { id: number; x: number; y: number; sx: number; sy: number; t: number }

export class Input {
  private pointers = new Map<number, P>()
  private holdTimer: number | null = null
  private holdStart = 0
  /** The hold has engaged and the finger is aiming a route; the release commits. */
  private aiming = false
  /** The hold engaged but there was nothing to aim: the rest of the gesture means nothing. */
  private holdSpent = false
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
    canvas.addEventListener('pointercancel', this.cancel, { passive: false })
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
      this.panning = false; this.aiming = false; this.holdSpent = false
      this.vel = [0, 0]; this.zoomVel = 0
      this.cam.stop()
      this.cam.glideTarget = null
      this.armHold(x, y)
    } else if (this.pointers.size === 2) {
      // a second finger: whatever the first was doing is over, and the two pinch
      this.cancelHold()
      if (this.aiming) { this.aiming = false; this.h.onAimCancel() }
      this.holdSpent = false
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
    // the hold engages on a timer, not on a frame: a phone drawing slowly while the finger rests
    // still engages at the hold's length. The ring under the finger is drawn on frames
    const fire = () => {
      this.holdTimer = null
      const p = [...this.pointers.values()][0]
      if (!p || this.pointers.size !== 1 || this.panning) { this.h.onHoldProgress(x, y, -1); return }
      if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null }
      this.h.onHoldProgress(x, y, -1)
      if (this.h.onHold(p.x, p.y)) this.aiming = true
      else this.holdSpent = true
    }
    this.holdTimer = window.setTimeout(fire, HOLD_MS)
    const tick = () => {
      const p = [...this.pointers.values()][0]
      if (!p || this.pointers.size !== 1 || this.panning || this.holdTimer === null) { this.h.onHoldProgress(x, y, -1); return }
      const k = Math.min(1, (performance.now() - this.holdStart) / HOLD_MS)
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
      // aiming: the finger re-aims the route and never pans
      if (this.aiming) { p.x = x; p.y = y; this.h.onAim(x, y); return }
      if (this.holdSpent) { p.x = x; p.y = y; return }
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

  /** The pointer was taken away (the browser took the touch, the window lost it): an aim is
   *  abandoned rather than committed, and anything else ends as a release would. */
  private cancel = (e: PointerEvent) => {
    if (this.aiming && this.pointers.has(e.pointerId)) {
      this.aiming = false
      this.cancelHold()
      this.pointers.delete(e.pointerId)
      this.h.onAimCancel()
      return
    }
    this.up(e)
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
    // letting go while aiming is the commit, or the cancel, where the finger is
    if (this.aiming) { this.aiming = false; this.panning = false; this.h.onRelease(p.x, p.y); return }
    if (this.holdSpent) { this.holdSpent = false; this.panning = false; return }
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
