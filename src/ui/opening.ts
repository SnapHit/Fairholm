// The opening's lines, onboarding brief section 2 and setting brief section 7a. Five sentences fade
// in over the shot of the lander at splashdown, one at a time, about two seconds apart, in the
// theme's display type, legible over the haze. They never block input and they are never a screen:
// the first tap anywhere takes them away and, through the app's own listener, starts the music.
// Nothing here reads or writes the state.

import { h } from './dom'
import { OPENING_LINE_MS, OPENING_FADE_MS } from './theme'

/** The five lines, exactly as the setting brief has them. */
export const OPENING_LINES = [
  'The first ship took a hundred years to reach this world.',
  'Its people found Bloom, a flower that grows nowhere else.',
  'From it they made cores, and cores cut the crossing to eight months.',
  'Then they went silent, and the cores stopped coming.',
  'The Company has sent you to start again. No one is waiting.',
]

export interface Opening {
  el: HTMLElement
  /** Take the lines away now, as the first tap does. Safe to call twice. */
  dismiss(): void
  /** Whether the lines are still over the map. */
  readonly showing: boolean
}

export function mountOpening(root: HTMLElement): Opening {
  const lines = OPENING_LINES.map(text => h('p', { class: 'line' }, text))
  const el = h('div', { id: 'opening', 'aria-live': 'polite' }, ...lines)
  root.append(el)
  const timers: number[] = []
  // the first line a beat after the frame, so it arrives over the picture rather than with it
  lines.forEach((line, i) => timers.push(window.setTimeout(() => line.classList.add('in'), 400 + i * OPENING_LINE_MS)))
  let showing = true
  const dismiss = () => {
    if (!showing) return
    showing = false
    for (const t of timers) clearTimeout(t)
    el.classList.add('gone')
    window.setTimeout(() => el.remove(), OPENING_FADE_MS + 50)
    document.removeEventListener('pointerdown', dismiss, true)
  }
  // the first tap anywhere: on the map, on the bar, on anything
  document.addEventListener('pointerdown', dismiss, { capture: true })
  return { el, dismiss, get showing() { return showing } }
}
