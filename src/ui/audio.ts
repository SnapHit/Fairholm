// Music. Feel brief section 6. Four tracks in /public/audio, never in the initial payload,
// streamed by setting src and calling play on the first tap, which is also the audio unlock.
// Two audio elements: one playing, one preloading the next from the two-thirds mark. Two-second
// fade in, two-second crossfades including the wrap. Every failure is silent and retried at the
// next boundary. Nothing here throws and nothing here blocks the game.

import { C } from '../sim/constants'

export interface AudioSettings { on: boolean; muted: boolean; volume: number; track: number }

export class MusicPlayer {
  private a: HTMLAudioElement | null = null
  private b: HTMLAudioElement | null = null
  private current: HTMLAudioElement | null = null
  private next: HTMLAudioElement | null = null
  private index = 0
  private unlocked = false
  private fadeTimer: number | null = null
  private watch: number | null = null
  private crossfading = false
  private settings: AudioSettings
  private pausedByVisibility = false
  onChange: ((s: AudioSettings) => void) | null = null

  constructor(settings: AudioSettings) {
    this.settings = { ...settings }
    this.index = Math.max(0, Math.min(C.feel.audio.tracks.length - 1, settings.track | 0))
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.hidden) { if (this.current && !this.current.paused) { this.current.pause(); this.pausedByVisibility = true } }
        else if (this.pausedByVisibility) { this.pausedByVisibility = false; this.resume() }
      } catch { /* silent */ }
    })
  }

  get state(): AudioSettings { return { ...this.settings, track: this.index } }

  private make(): HTMLAudioElement {
    const el = new Audio()
    el.preload = 'none'
    el.crossOrigin = 'anonymous'
    return el
  }

  private src(i: number): string { return `audio/${C.feel.audio.tracks[i]}` }

  private effectiveVolume(): number { return this.settings.muted || !this.settings.on ? 0 : Math.max(0, Math.min(1, this.settings.volume)) }

  /** Called on the first user gesture. Starts playback if the player is on. */
  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    if (!this.a) { this.a = this.make(); this.b = this.make() }
    if (this.settings.on) this.start()
  }

  private start() {
    try {
      if (!this.a || !this.b) return
      this.current = this.a
      this.next = this.b
      this.current.src = this.src(this.index)
      this.current.volume = 0
      this.current.preload = 'auto'
      const p = this.current.play()
      if (p && typeof p.catch === 'function') p.catch(() => { /* silent; retried at the next boundary */ })
      this.fadeTo(this.current, this.effectiveVolume(), C.feel.audio.fadeInMs)
      this.startWatch()
    } catch { /* silent */ }
  }

  private startWatch() {
    if (this.watch !== null) return
    this.watch = window.setInterval(() => this.tick(), 250)
  }

  private tick() {
    try {
      const cur = this.current
      if (!cur || !this.settings.on) return
      const dur = cur.duration
      if (!isFinite(dur) || dur <= 0) return
      const t = cur.currentTime
      // preload the next at the two-thirds mark, at most one in flight
      if (t / dur > C.feel.audio.preloadAt && this.next && !this.next.src.endsWith(C.feel.audio.tracks[this.nextIndex()])) {
        this.next.preload = 'auto'
        this.next.src = this.src(this.nextIndex())
        this.next.load()
      }
      // crossfade into the next for the final two seconds, including the wrap
      if (!this.crossfading && dur - t <= C.feel.audio.crossfadeMs / 1000 + 0.05) this.advance(true)
      if (cur.ended && !this.crossfading) this.advance(false)
    } catch { /* silent */ }
  }

  private nextIndex(): number { return (this.index + 1) % C.feel.audio.tracks.length }

  private advance(crossfade: boolean) {
    if (!this.current || !this.next) return
    this.crossfading = true
    const out = this.current, inn = this.next
    this.index = this.nextIndex()
    try {
      if (!inn.src.endsWith(C.feel.audio.tracks[this.index])) { inn.preload = 'auto'; inn.src = this.src(this.index) }
      inn.volume = 0
      const p = inn.play()
      if (p && typeof p.catch === 'function') p.catch(() => { this.crossfading = false })
      const ms = crossfade ? C.feel.audio.crossfadeMs : 50
      this.fadeTo(inn, this.effectiveVolume(), ms)
      this.fadePair(out, ms, () => { try { out.pause(); out.removeAttribute('src'); out.load() } catch { /* silent */ } this.crossfading = false })
      this.current = inn
      this.next = out
      this.emit()
    } catch { this.crossfading = false }
  }

  private fadePair(el: HTMLAudioElement, ms: number, done: () => void) {
    const start = el.volume, t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      try { el.volume = start * (1 - k) } catch { /* silent */ }
      if (k < 1) requestAnimationFrame(step); else done()
    }
    requestAnimationFrame(step)
  }

  private fadeTo(el: HTMLAudioElement, target: number, ms: number) {
    const start = el.volume, t0 = performance.now()
    const step = () => {
      if (this.current !== el && this.next !== el) return
      const k = Math.min(1, (performance.now() - t0) / ms)
      try { el.volume = start + (target - start) * k } catch { /* silent */ }
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  private emit() { if (this.onChange) this.onChange(this.state) }

  private resume() {
    try {
      if (!this.settings.on || !this.unlocked) return
      if (!this.current) { this.start(); return }
      const p = this.current.play()
      if (p && typeof p.catch === 'function') p.catch(() => { /* silent */ })
    } catch { /* silent */ }
  }

  // ---- controls ------------------------------------------------------------------------------
  toggleOn() {
    this.settings.on = !this.settings.on
    if (this.settings.on) { if (this.unlocked) { if (this.current) this.resume(); else this.start() } }
    else { try { this.current?.pause() } catch { /* silent */ } }
    this.emit()
  }
  setMuted(m: boolean) { this.settings.muted = m; this.applyVolume(); this.emit() }
  toggleMute() { this.setMuted(!this.settings.muted) }
  setVolume(v: number) { this.settings.volume = Math.max(0, Math.min(1, v)); this.applyVolume(); this.emit() }
  private applyVolume() { try { if (this.current) this.current.volume = this.effectiveVolume() } catch { /* silent */ } }
  skip() { if (this.unlocked && this.current) this.advance(false); else { this.index = this.nextIndex(); this.emit() } }
  get playing(): boolean { return !!this.current && !this.current.paused && this.settings.on }
  get trackName(): string { return C.feel.audio.tracks[this.index].replace(/^\d+-/, '').replace(/\.mp3$/, '').replace(/-/g, ' ') }
}
