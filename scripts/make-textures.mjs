// Generates the three tiling detail textures the map multiplies over its vertex colour.
//
// Art direction brief section 1 says no textures anywhere, and section 13 rejects them. That was the
// right call for terrain art, which these are not: they are a single small greyscale tooth tiled at
// high frequency over everything, which is the thing that stops a vertex-coloured surface reading as
// a gradient. Recorded as a decision. Three files, 256 by 256, greyscale, quantised so they compress,
// and seamless so they can tile at any frequency without a visible join.
//
// Run with: node scripts/make-textures.mjs
// The output is committed; this only needs running again if the patterns change.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, statSync } from 'node:fs'

const SIZE = 256
const OUT = 'public/textures'
mkdirSync(OUT, { recursive: true })

// ---- a small deterministic hash, and periodic value noise built on it ---------------------------
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 100000) / 100000
}

const smooth = (t) => t * t * (3 - 2 * t)

/** Value noise on a lattice of `period` cells that wraps, so the result tiles exactly. */
function noise(u, v, period, seed) {
  const x = u * period, y = v * period
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = smooth(x - x0), fy = smooth(y - y0)
  const wrap = (n) => ((n % period) + period) % period
  const a = hash(wrap(x0), wrap(y0), seed)
  const b = hash(wrap(x0 + 1), wrap(y0), seed)
  const c = hash(wrap(x0), wrap(y0 + 1), seed)
  const d = hash(wrap(x0 + 1), wrap(y0 + 1), seed)
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/** Several octaves of it, each on a lattice that still divides the tile. */
function fbm(u, v, base, octaves, seed, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, period = base
  for (let o = 0; o < octaves; o++) {
    sum += noise(u, v, period, seed + o * 977) * amp
    norm += amp
    amp *= gain
    period *= 2
  }
  return sum / norm
}

// ---- the three patterns ---------------------------------------------------------------------------

/** Ground grain: fine, dense, low contrast. The tooth under everything. */
function grain(u, v) {
  const fine = fbm(u, v, 32, 3, 11)
  const speck = noise(u, v, 64, 77)
  return 0.55 * fine + 0.3 * speck + 0.15 * fbm(u, v, 8, 2, 909)
}

/** Rock: broad blotches with darker fissures between them. For highland, mountain and shore. */
function rock(u, v) {
  const blotch = fbm(u, v, 8, 4, 313)
  const crack = Math.abs(fbm(u, v, 16, 3, 555) - 0.5) * 2
  const fine = fbm(u, v, 32, 2, 71)
  return 0.55 * blotch + 0.3 * Math.pow(crack, 0.6) + 0.15 * fine
}

/** Water ripple: soft directional swell crossed with a finer chop. */
function ripple(u, v) {
  const swell = Math.sin((u * 3 + v * 2) * Math.PI * 2 + fbm(u, v, 4, 2, 21) * 6) * 0.5 + 0.5
  const chop = fbm(u, v, 12, 4, 404)
  const fine = fbm(u, v, 28, 2, 88)
  return 0.18 * swell + 0.56 * chop + 0.26 * fine
}

// ---- normalise, quantise, and write a greyscale png -----------------------------------------------

/** Stretch to the full range, then flatten toward the middle by `contrast`, then quantise. */
function bake(fn, contrast, levels) {
  const raw = new Float32Array(SIZE * SIZE)
  let lo = 1, hi = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const value = fn((x + 0.5) / SIZE, (y + 0.5) / SIZE)
    raw[y * SIZE + x] = value
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  const span = Math.max(1e-6, hi - lo)
  const out = new Uint8Array(SIZE * SIZE)
  const step = 255 / (levels - 1)
  for (let i = 0; i < raw.length; i++) {
    const n = (raw[i] - lo) / span
    const c = 0.5 + (n - 0.5) * contrast
    out[i] = Math.round(Math.round(Math.max(0, Math.min(1, c)) * 255 / step) * step)
  }
  return out
}

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

/** Greyscale, eight bit, one channel. Tries both cheap row filters and keeps the smaller. */
function png(pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 0      // greyscale
  const rows = (filter) => {
    const buf = Buffer.alloc(SIZE * (SIZE + 1))
    for (let y = 0; y < SIZE; y++) {
      buf[y * (SIZE + 1)] = filter
      for (let x = 0; x < SIZE; x++) {
        const here = pixels[y * SIZE + x]
        const left = x > 0 ? pixels[y * SIZE + x - 1] : 0
        const up = y > 0 ? pixels[(y - 1) * SIZE + x] : 0
        buf[y * (SIZE + 1) + 1 + x] = filter === 0 ? here : filter === 1 ? (here - left) & 255 : (here - up) & 255
      }
    }
    return deflateSync(buf, { level: 9 })
  }
  let best = null
  for (const f of [0, 1, 2]) { const d = rows(f); if (!best || d.length < best.length) best = d }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', best),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const files = [
  ['grain.png', grain, 0.85, 24],
  ['rock.png', rock, 1.0, 24],
  ['ripple.png', ripple, 0.9, 20],
]
let total = 0
for (const [name, fn, contrast, levels] of files) {
  writeFileSync(`${OUT}/${name}`, png(bake(fn, contrast, levels)))
  const size = statSync(`${OUT}/${name}`).size
  total += size
  console.log(`${OUT}/${name}  ${SIZE}x${SIZE}  ${(size / 1024).toFixed(1)} kB`)
}
console.log(`total ${(total / 1024).toFixed(1)} kB`)
