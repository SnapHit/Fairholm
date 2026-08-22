// Two randomness streams, build specification section 8 and persistence brief section 4.
//   rng.world  seeded from state.seed. Deterministic, versioned, saved.
//   rng.play   seeded from Date.now() on load. Never saved.
// Math.random appears nowhere in /sim. The generator is sfc32 over a cyrb128 hash of the seed
// string. State is a plain four-number array so it stays inside the serialisable state object.

import type { RngState } from './state'

function cyrb128(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

/** Create a stream from a seed string. */
export function seedRng(seed: string): RngState {
  const s = cyrb128(seed)
  // warm up so close seeds diverge
  for (let i = 0; i < 12; i++) next(s)
  return s
}

/** Create a play stream from the clock. Never saved. */
export function playRng(now: number): RngState {
  return seedRng('play:' + now.toString(36) + ':' + (now % 977).toString(36))
}

/** Advance the stream and return a float in [0, 1). sfc32. */
export function next(s: RngState): number {
  let a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0
  const t = (((a + b) | 0) + d) | 0
  d = (d + 1) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  c = (c + t) | 0
  s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0
  return (t >>> 0) / 4294967296
}

/** Integer in [lo, hi] inclusive. */
export function int(s: RngState, lo: number, hi: number): number {
  return lo + Math.floor(next(s) * (hi - lo + 1))
}

/** Float in [lo, hi). */
export function range(s: RngState, lo: number, hi: number): number {
  return lo + next(s) * (hi - lo)
}

export function chance(s: RngState, p: number): boolean {
  return next(s) < p
}

export function pick<T>(s: RngState, arr: readonly T[]): T {
  return arr[Math.floor(next(s) * arr.length)]
}

/** In-place Fisher-Yates, deterministic from the stream. */
export function shuffle<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(s) * (i + 1))
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}

/** Derive an independent sub-stream, used so one generator stage does not shift another. */
export function fork(s: RngState, label: string): RngState {
  return seedRng(label + ':' + next(s).toString(36) + ':' + next(s).toString(36))
}

/** A short human-typeable seed for a new world. Uses the play stream, since this is not world state. */
export function randomSeed(play: RngState): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 7; i++) out += alphabet[int(play, 0, alphabet.length - 1)]
  return out
}

/** Value noise in 2D, deterministic from a seed, for terrain. Returns [0, 1]. */
export function makeNoise(seed: string) {
  const s = seedRng('noise:' + seed)
  const size = 256
  const perm = new Array<number>(size)
  for (let i = 0; i < size; i++) perm[i] = i
  shuffle(s, perm)
  const grads = new Float64Array(size)
  for (let i = 0; i < size; i++) grads[i] = next(s)
  const at = (ix: number, iy: number) => grads[perm[(perm[ix & 255] + iy) & 255]]
  const fade = (t: number) => t * t * (3 - 2 * t)
  return function noise2(x: number, y: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const fx = fade(x - x0), fy = fade(y - y0)
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
  }
}

export function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let v = 0, amp = 0.5, f = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    v += noise(x * f, y * f) * amp
    norm += amp
    amp *= 0.5
    f *= 2.07
  }
  return v / norm
}
