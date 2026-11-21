// The opening's lines, onboarding brief section 2 and setting brief section 7a. Five sentences fade
// in over the shot of the lander at splashdown, one at a time, about three and a half seconds apart, in the
// theme's display type, legible over the haze. They never block input and they are never a screen:
// the first tap anywhere takes them away and, through the app's own listener, starts the music.
// Nothing here reads or writes the state.

import { h } from './dom'
import { OPENING_LINE_MS, OPENING_FADE_MS, OPENING_LINE_FADE_MS, OPENING_FIRST_MS, DESCENT } from './theme'

/** The five lines, exactly as the setting brief has them. */
export const OPENING_LINES = [
  'The first ship took a hundred years to reach this world.',
  'Its people found Bloom, a flower that grows nowhere else.',
  'From it they made cores, and cores cut the crossing to eight months.',
  'Then they went silent, and the cores stopped coming.',
  'The Company spent its last cores to send you. You wake from stasis, at sea in your lander.',
]

export interface Opening {
  el: HTMLElement
  /** Take the lines away now, as the first tap does. Safe to call twice. */
  dismiss(): void
  /** Whether the lines are still over the map. */
  readonly showing: boolean
}

/** What the descent needs of the app: where the lander lies on the screen now, and how wide it is
 *  drawn there, in CSS pixels; and what to do when it has come down. */
export interface DescentHooks {
  target(): { x: number; y: number; w: number } | null
  landed(): void
}

/** The lander under its parachute, coming down behind the lines (DECISIONS.md 204). Returns what
 *  ends it at once, as a tap on the opening does. */
function startDescent(root: HTMLElement, hooks: DescentHooks): () => void {
  let landed = false
  const land = (at: { x: number; y: number; w: number } | null) => {
    if (landed) return
    landed = true
    hooks.landed()
    if (!at) return
    const ring = h('i', { class: 'splash', 'aria-hidden': 'true' })
    ring.style.left = `${at.x}px`
    ring.style.top = `${at.y}px`
    ring.style.setProperty('--splash-w', `${at.w}px`)
    root.append(ring)
    window.setTimeout(() => ring.remove(), DESCENT.splashMs + 100)
  }
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { land(null); return () => {} }
  const img = h('img', { id: 'descent', src: 'textures/descent.png', alt: '', 'aria-hidden': 'true' }) as HTMLImageElement
  img.style.transformOrigin = DESCENT.swingFrom
  root.append(img)
  const lineAt = (i: number) => OPENING_FIRST_MS + i * OPENING_LINE_MS
  const end = lineAt(DESCENT.stages.length - 1) + OPENING_LINE_FADE_MS + DESCENT.settleMs
  const keys = [...DESCENT.stages.map((u, i) => ({ t: lineAt(i), u })), { t: end, u: 1 }]
  const smooth = (x: number) => x * x * (3 - 2 * x)
  const start = performance.now()
  let raf = 0
  let gone = false
  const frame = () => {
    const t = performance.now() - start
    const W = window.innerWidth, H = window.innerHeight
    const to = hooks.target() ?? { x: W / 2, y: H * 0.6, w: W * 0.2 }
    let u = 1
    if (t < keys[0].t) u = 0
    else for (let k = 0; k < keys.length - 1; k++) {
      if (t >= keys[k].t && t < keys[k + 1].t) { u = keys[k].u + (keys[k + 1].u - keys[k].u) * smooth((t - keys[k].t) / (keys[k + 1].t - keys[k].t)); break }
    }
    // a quadratic arc from high on the right, bowing out further right, down onto the lander
    const sx = W * DESCENT.startX, sy = H * DESCENT.startY
    const cx = Math.max(sx, to.x) + W * DESCENT.bulge, cy = (sy + to.y) / 2
    const x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * to.x
    const y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * to.y
    // it shrinks as it falls away from the eye, by the same share each stage, to the lander's size
    const w0 = Math.min(W * DESCENT.startW, DESCENT.maxStartPx), w1 = to.w / DESCENT.capsule
    const w = w0 * Math.pow(w1 / w0, u)
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1.19
    const fadeIn = Math.min(1, Math.max(0, (t - keys[0].t) / OPENING_LINE_FADE_MS))
    const fadeOut = 1 - Math.min(1, Math.max(0, (t - (end - DESCENT.outMs)) / DESCENT.outMs))
    const sway = DESCENT.swayDeg * Math.sin((t / OPENING_LINE_MS) * Math.PI * 2) * (1 - u)
    img.style.width = `${w}px`
    img.style.transform = `translate(${x - w * DESCENT.anchorX}px, ${y - w * ratio * DESCENT.anchorY}px) rotate(${sway}deg)`
    img.style.opacity = String(fadeIn * fadeOut * DESCENT.opacity)
    if (t >= end - DESCENT.outMs / 2) land(to)
    if (t < end && !gone) raf = requestAnimationFrame(frame)
    else img.remove()
  }
  raf = requestAnimationFrame(frame)
  // a tap: it is down at once, and the picture of it goes with the lines
  return () => {
    if (gone) return
    gone = true
    cancelAnimationFrame(raf)
    img.classList.add('gone')
    window.setTimeout(() => img.remove(), OPENING_FADE_MS + 50)
    land(null)
  }
}

export function mountOpening(root: HTMLElement, onDismiss?: () => void, descent?: DescentHooks): Opening {
  const lines = OPENING_LINES.map(text => h('p', { class: 'line' }, text))
  const el = h('div', { id: 'opening', 'aria-live': 'polite' }, ...lines)
  root.append(el)
  const timers: number[] = []
  // the first line a beat after the frame, so it arrives over the picture rather than with it
  lines.forEach((line, i) => timers.push(window.setTimeout(() => line.classList.add('in'), OPENING_FIRST_MS + i * OPENING_LINE_MS)))
  const endDescent = descent ? startDescent(root, descent) : null
  let showing = true
  const dismiss = () => {
    if (!showing) return
    showing = false
    for (const t of timers) clearTimeout(t)
    el.classList.add('gone')
    endDescent?.()
    window.setTimeout(() => el.remove(), OPENING_FADE_MS + 50)
    document.removeEventListener('pointerdown', dismiss, true)
    onDismiss?.()
  }
  // the first tap anywhere: on the map, on the bar, on anything
  document.addEventListener('pointerdown', dismiss, { capture: true })
  return { el, dismiss, get showing() { return showing } }
}
