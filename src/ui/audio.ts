// Music. Feel brief section 6.
//
// The rules, in order of how easy they are to get wrong:
//
//  1. No audio is part of the initial payload. Nothing is requested until the player's first tap.
//  2. Track one begins on that first tap, which is the landing-site choice and also the gesture that
//     unlocks audio on every mobile platform. It is not waited for and not asked for twice.
//  3. It is streamed, never fetched: set src, call play, and the browser starts once a few seconds
//     have buffered. Track one is 4.2 MB and fetching it whole misses the five-second target on
//     every connection.
//  4. It fades in over about two seconds from silence, so it arrives rather than starts.
//  5. Then two, three, four, then back to one, forever, with a two-second cross-fade at every
//     boundary including the wrap.
//  6. The next track preloads from about the two-thirds mark on a second element. Never more than
//     one track in flight.
//  7. Anything that fails is silent and is retried at the next boundary or the next gesture. Audio
//     never blocks the game and nothing in this file throws.

import { C } from '../sim/constants'

export interface AudioSettings { on: boolean; muted: boolean; volume: number; track: number }

const TRACKS = C.feel.audio.tracks
const TICK_MS = 250

export class MusicPlayer {
  private a: HTMLAudioElement | null = null
  private b: HTMLAudioElement | null = null
  private current: HTMLAudioElement | null = null
  private next: HTMLAudioElement | null = null
  private index = 0
  private unlocked = false
  private watch: number | null = null
  private crossfading = false
  private settings: AudioSettings
  private pausedByVisibility = false
  /** Set only when the player pressed pause. A silent failure never sets this. */
  private held = false
  private fadeGen = new WeakMap<HTMLAudioElement, number>()
  private retryAt = 0
  onChange: ((s: AudioSettings) => void) | null = null

  constructor(settings: AudioSettings) {
    this.settings = { ...settings }
    this.index = Math.max(0, Math.min(TRACKS.length - 1, settings.track | 0))
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.hidden) {
          if (this.current && !this.current.paused) { this.current.pause(); this.pausedByVisibility = true }
        } else if (this.pausedByVisibility) { this.pausedByVisibility = false; this.resume() }
      } catch { /* silent */ }
    })
  }

  get state(): AudioSettings { return { ...this.settings, track: this.index } }
  get playing(): boolean { return !!this.current && !this.current.paused && this.settings.on }
  get trackName(): string { return TRACKS[this.index].replace(/^\d+-/, '').replace(/\.mp3$/, '').replace(/-/g, ' ') }
  /** How far into the current track, in seconds. Zero when nothing is playing. */
  get position(): number { try { return this.current ? this.current.currentTime : 0 } catch { return 0 } }

  // ---- starting ---------------------------------------------------------------------------------

  /** Called on the player's first gesture, and harmlessly on every gesture after it. The first call
   *  starts track one; later calls rescue a play that the browser refused the first time. */
  unlock() {
    try {
      if (!this.a) { this.a = this.element(); this.b = this.element() }
      if (!this.unlocked) {
        this.unlocked = true
        this.startWatch()
        if (this.settings.on) this.play(this.index, C.feel.audio.fadeInMs)
        return
      }
      if (this.settings.on && !this.held) this.resume()
    } catch { /* silent */ }
  }

  private element(): HTMLAudioElement {
    const el = new Audio()
    // nothing is requested until a src is set, which happens inside the first gesture
    el.preload = 'none'
    el.addEventListener('error', () => this.trouble(el))
    el.addEventListener('stalled', () => this.trouble(el))
    return el
  }

  private src(i: number): string { return `audio/${TRACKS[i]}` }

  private effectiveVolume(): number {
    if (this.settings.muted || !this.settings.on) return 0
    return Math.max(0, Math.min(1, this.settings.volume))
  }

  /** Put a track on the current element and stream it in. */
  private play(index: number, fadeMs: number) {
    try {
      if (!this.a || !this.b) return
      if (!this.current) { this.current = this.a; this.next = this.b }
      const el = this.current
      this.index = index
      if (!this.holds(el, index)) { el.preload = 'auto'; el.src = this.src(index) }
      el.volume = 0
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => { this.retryAt = now() + TICK_MS * 4 })
      this.fadeTo(el, this.effectiveVolume(), fadeMs)
      this.emit()
    } catch { /* silent */ }
  }

  private holds(el: HTMLAudioElement, index: number): boolean {
    try { return !!el.src && el.src.endsWith(TRACKS[index]) } catch { return false }
  }

  // ---- the loop ----------------------------------------------------------------------------------

  private startWatch() {
    if (this.watch !== null) return
    this.watch = window.setInterval(() => this.tick(), TICK_MS)
  }

  private nextIndex(i = this.index): number { return (i + 1) % TRACKS.length }

  private tick() {
    try {
      if (!this.settings.on || this.held || this.pausedByVisibility) return
      const cur = this.current
      if (!cur) { if (this.unlocked) this.play(this.index, C.feel.audio.fadeInMs); return }
      // a play that the browser refused, or a source that failed: try again, quietly
      if (cur.paused && !this.crossfading && now() >= this.retryAt) { this.retryAt = now() + TICK_MS * 8; this.resume() }
      const dur = cur.duration
      if (!isFinite(dur) || dur <= 0) return
      const t = cur.currentTime
      // one track in flight: the second element takes the next one from the two-thirds mark
      if (!this.crossfading && t / dur > C.feel.audio.preloadAt && this.next && !this.holds(this.next, this.nextIndex())) {
        this.next.preload = 'auto'
        this.next.src = this.src(this.nextIndex())
        try { this.next.load() } catch { /* silent */ }
      }
      // cross-fade into the next for the final two seconds, the wrap included
      if (!this.crossfading && dur - t <= C.feel.audio.crossfadeMs / 1000 + 0.05) this.advance(C.feel.audio.crossfadeMs)
      else if (!this.crossfading && cur.ended) this.advance(C.feel.audio.crossfadeMs / 8)
    } catch { /* silent */ }
  }

  /** Something went wrong with a source. Move on at the next boundary rather than sitting silent. */
  private trouble(el: HTMLAudioElement) {
    try {
      if (el !== this.current || this.crossfading || !this.settings.on) return
      this.advance(C.feel.audio.crossfadeMs / 8)
    } catch { /* silent */ }
  }

  private advance(ms: number) {
    if (!this.current || !this.next || this.crossfading) return
    this.crossfading = true
    const out = this.current, inn = this.next
    const to = this.nextIndex()
    try {
      if (!this.holds(inn, to)) { inn.preload = 'auto'; inn.src = this.src(to) }
      inn.volume = 0
      this.current = inn
      this.next = out
      this.index = to
      const p = inn.play()
      if (p && typeof p.catch === 'function') p.catch(() => { this.retryAt = now() + TICK_MS * 4 })
      this.fadeTo(inn, this.effectiveVolume(), ms)
      this.fadeTo(out, 0, ms, () => {
        try { out.pause(); out.removeAttribute('src'); out.load() } catch { /* silent */ }
        this.crossfading = false
      })
      this.emit()
    } catch { this.crossfading = false }
  }

  private fadeTo(el: HTMLAudioElement, target: number, ms: number, done?: () => void) {
    const gen = (this.fadeGen.get(el) ?? 0) + 1
    this.fadeGen.set(el, gen)
    let start = 0
    try { start = el.volume } catch { /* silent */ }
    const t0 = now()
    const step = () => {
      if (this.fadeGen.get(el) !== gen) return
      const k = ms <= 0 ? 1 : Math.min(1, (now() - t0) / ms)
      try { el.volume = Math.max(0, Math.min(1, start + (target - start) * k)) } catch { /* silent */ }
      if (k < 1) requestAnimationFrame(step)
      else if (done) done()
    }
    requestAnimationFrame(step)
  }

  private emit() { if (this.onChange) this.onChange(this.state) }

  private resume() {
    try {
      if (!this.settings.on || !this.unlocked || this.held) return
      if (!this.current || !this.current.src) { this.play(this.index, C.feel.audio.fadeInMs); return }
      const p = this.current.play()
      if (p && typeof p.catch === 'function') p.catch(() => { /* silent; tried again at the next tick */ })
    } catch { /* silent */ }
  }

  // ---- controls -----------------------------------------------------------------------------------
  toggleOn() {
    this.settings.on = !this.settings.on
    this.held = !this.settings.on
    if (this.settings.on) { if (this.unlocked) this.resume(); }
    else { try { this.current?.pause() } catch { /* silent */ } }
    this.emit()
  }
  setMuted(m: boolean) { this.settings.muted = m; this.applyVolume(); this.emit() }
  toggleMute() { this.setMuted(!this.settings.muted) }
  setVolume(v: number) { this.settings.volume = Math.max(0, Math.min(1, v)); this.applyVolume(); this.emit() }
  private applyVolume() {
    try { if (this.current && !this.crossfading) this.fadeTo(this.current, this.effectiveVolume(), 0) } catch { /* silent */ }
  }
  /** Next track, with a short cross-fade. Wraps. */
  skip() {
    if (this.unlocked && this.current) this.advance(C.feel.audio.crossfadeMs / 4)
    else { this.index = this.nextIndex(); this.emit() }
  }
}

function now(): number {
  try { return performance.now() } catch { return 0 }
}
