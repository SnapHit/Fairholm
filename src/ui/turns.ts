// Turns that run on by themselves while nothing new needs the player. Asked for by the owner on
// 21 November 2026: a lighter sent twelve tiles, with the settlement's build order full, should sail
// on turn after turn without a tap each time, and stop when it arrives. DECISIONS.md 190.
//
// Two ways a run begins, and one rule for when it stops.
//
// - **A quiet turn ends itself.** After the player does something (a move, an assignment, an order)
//   and the queue holds nothing at all, the turn ends after a short wait shown on the button.
// - **An ended turn carries on.** After the player ends a turn, the next turns end by themselves too.
//
// A run stops as soon as the queue holds something the player has not yet seen: a unit arriving and
// awaiting orders, a build order running dry, a raider sighted. What was already in the queue when
// the player let the turn go is theirs to leave, so it does not stop a run, except the few things
// that grow worse each turn left alone (hunger, a threat closing, a wave at sea, a blockade, a
// raider off the coast, the Company's demand), which stop it every time. Any touch, key or wheel
// stops a run at once, and a sheet or a screen up, or a move being drawn, holds it until they are gone.
//
// The runner only ever presses End turn for the player, through the same path the button takes.

import type { DerivedQueue } from '../sim/state'
import { AUTO_TURN_QUIET_MS, AUTO_TURN_PAUSE_MS } from './theme'

/** The groups that stop a run every turn they stand, seen or not. */
const ALWAYS_STOPS = new Set(['hunger', 'threat', 'wave', 'blockade', 'sail', 'demand'])

/** What the runner needs of the app. */
export interface RunnerHost {
  queue: DerivedQueue
  /** Whether turns may run on at all: the setting, the game not over, not a rig driving the game. */
  allowed(): boolean
  /** Whether the screen is at rest: no sheet or screen up, no move being drawn, nothing being aimed. */
  atRest(): boolean
  /** End the turn as the button does, on the runner's behalf. */
  endTurnForRunner(): void
  /** Draw the bar again, so the button shows the run. */
  renderBar(): void
}

/** Every key the queue holds now. */
export function queueKeys(q: DerivedQueue): Set<string> {
  const keys = new Set<string>()
  for (const g of [...q.shown, ...q.folded]) for (const it of g.items) keys.add(it.key)
  return keys
}

/** Whether the queue holds something that stops a run: anything not in `seen`, or anything that
 *  grows worse each turn left alone. */
export function stopsRun(q: DerivedQueue, seen: Set<string>): boolean {
  for (const g of [...q.shown, ...q.folded]) {
    if (ALWAYS_STOPS.has(g.group)) return true
    for (const it of g.items) if (!seen.has(it.key)) return true
  }
  return false
}

export class TurnRunner {
  /** A run under way: the keys the player let stand. Null when no run is under way. */
  private seen: Set<string> | null = null
  /** A quiet turn may end itself: set by something the player did, cleared by any touch. */
  private quiet = false
  /** When the next end falls due, by performance.now(); null while waiting for rest. */
  private dueAt: number | null = null
  /** How long the current wait is, all told, so the button's bar can carry on where it was. */
  private waitMs = 0
  private timer: number | null = null
  /** The rigs and the smoke test drive the turns themselves; a check that wants a run says so. */
  allowInRigs = false

  constructor(private host: RunnerHost) {}

  /** Whether a run is armed, and if one is counting down, how long it has left, for the button. */
  get state(): { armed: boolean; leftMs: number | null; waitMs: number } {
    const armed = this.seen !== null || this.quiet
    return { armed, leftMs: armed && this.dueAt !== null ? Math.max(0, this.dueAt - performance.now()) : null, waitMs: this.waitMs }
  }

  /** The player did something: if the queue then holds nothing, the turn may end itself. */
  acted() {
    if (!this.host.allowed()) return
    if (this.seen !== null) return
    this.quiet = true
    this.dueAt = null
    this.ensureTicking()
  }

  /** The player ended a turn, with the queue as it stood when they did: the run carries on. */
  ended(seen: Set<string>) {
    if (!this.host.allowed()) { this.stop(); return }
    this.quiet = false
    this.seen = seen
    this.dueAt = null
    this.ensureTicking()
  }

  /** A touch, a key or a wheel: whatever was going to happen does not. Draws only when something
   *  was armed, so a tap on End turn is never redrawn out from under the finger. */
  interrupt() {
    if (this.seen === null && !this.quiet) return
    this.stop()
  }

  stop() {
    const was = this.seen !== null || this.quiet
    this.seen = null
    this.quiet = false
    this.dueAt = null
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null }
    if (was) this.host.renderBar()
  }

  private ensureTicking() {
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 100)
    this.tick()
  }

  private tick() {
    if (!this.host.allowed()) { this.stop(); return }
    if (!this.host.atRest()) {
      if (this.dueAt !== null) { this.dueAt = null; this.host.renderBar() }
      return
    }
    const q = this.host.queue
    if (this.seen !== null) {
      if (stopsRun(q, this.seen)) { this.stop(); return }
    } else if (this.quiet) {
      if (queueKeys(q).size > 0) { this.stop(); return }
    } else { this.stop(); return }
    const now = performance.now()
    if (this.dueAt === null) {
      this.waitMs = this.seen !== null ? AUTO_TURN_PAUSE_MS : AUTO_TURN_QUIET_MS
      this.dueAt = now + this.waitMs
      this.host.renderBar()
      return
    }
    if (now < this.dueAt) return
    // the turn ends: what stands in the queue now is what the run lets stand from here on
    this.seen = queueKeys(q)
    this.quiet = false
    this.dueAt = null
    this.host.endTurnForRunner()
  }
}
