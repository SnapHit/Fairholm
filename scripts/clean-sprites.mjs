// Prepares the early era settlement sprites for the map.
//
// The sheet in art/ was extracted from a generated image that stood on a checkerboard, and the
// extractor kept some of that checkerboard wherever a building's drop shadow darkened it enough to
// stop reading as background. Those squares are the one artefact in the sheet that reads as a bug
// rather than as art: a pale grid of neutral squares lying on the grass beside a building. They are
// also the one part that can be told apart from the drawing by colour alone, because everything the
// buildings are made of is warm and these are not.
//
// What this does not do is take the baked drop shadows out. They cannot be separated: they are
// opaque, they sit inside the same silhouette, and their colour overlaps the roofs. See DECISIONS.md.
//
// Each piece is then trimmed to what is left, given a ground anchor measured from the drawing rather
// than from the middle of the crop, and repacked.
//
// Run with: node scripts/clean-sprites.mjs
// The output is committed; this only needs running again if the sheet in art/ changes.

import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'art/settlement-early.png'
const SRC_MANIFEST = 'art/settlement-early.json'
const OUT = 'public/textures/settlement-early.png'
const OUT_TABLE = 'src/render/settlement-atlas.ts'

// A checkerboard square is neutral and pale. Nothing the buildings are made of is quite that neutral,
// but thatch comes close: at a saturation threshold of 0.235 the roofs start coming away in holes, so
// the test has to stay tight. That leaves the squares that a drop shadow has already darkened and
// warmed, which stay, inside a shadow that was staying anyway.
const NEUTRAL_SATURATION = 0.16
const NEUTRAL_FLOOR = 0.56
/** Rows from the top of a piece that are certainly building and not its shadow, for the anchor. */
const HEAD_FRACTION = 0.45
/** A hair off the foot, so the anchor sits in the ground rather than under it. */
const FOOT_LIFT = 0.01
const PAD = 4

// ---- png, only the two forms this file needs ------------------------------------------------------

function readPng(path) {
  const buf = readFileSync(path)
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]
      if (data[12] !== 0) throw new Error('interlaced png')
    } else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2)) throw new Error(`unsupported png: depth ${depth} colour ${ctype}`)
  const ch = ctype === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const lines = Buffer.alloc(h * stride)
  let q = 0
  for (let y = 0; y < h; y++) {
    const f = raw[q++]
    const row = raw.subarray(q, q + stride); q += stride
    const cur = lines.subarray(y * stride, y * stride + stride)
    const prev = y > 0 ? lines.subarray((y - 1) * stride, (y - 1) * stride + stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = row[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const g = a + b - c
        const pa = Math.abs(g - a), pb = Math.abs(g - b), pc = Math.abs(g - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
  }
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = lines[i * ch]
    rgba[i * 4 + 1] = lines[i * ch + 1]
    rgba[i * 4 + 2] = lines[i * ch + 2]
    rgba[i * 4 + 3] = ch === 4 ? lines[i * 4 + 3] : 255
  }
  return { w, h, rgba }
}

let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 255]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function writePng(path, w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

// ---- clean ------------------------------------------------------------------------------------------

const src = readPng(SRC)
const manifest = JSON.parse(readFileSync(SRC_MANIFEST, 'utf8'))

/** True where a pixel is background checkerboard rather than any part of the drawing. */
function isBackground(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const saturation = mx ? (mx - mn) / mx : 0
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return saturation < NEUTRAL_SATURATION && lum > NEUTRAL_FLOOR
}

const cleaned = []
for (const [name, p] of Object.entries(manifest.pieces)) {
  const alpha = new Uint8Array(p.w * p.h)
  const rgb = new Uint8Array(p.w * p.h * 3)
  let removed = 0
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = ((p.y + y) * src.w + (p.x + x)) * 4
    const j = y * p.w + x
    const r = src.rgba[i], g = src.rgba[i + 1], b = src.rgba[i + 2]
    rgb[j * 3] = r; rgb[j * 3 + 1] = g; rgb[j * 3 + 2] = b
    let a = src.rgba[i + 3]
    if (a > 0 && isBackground(r, g, b)) { a = 0; removed++ }
    alpha[j] = a
  }
  // a lone kept pixel in a cleared field is extraction noise, not drawing
  const thinned = Uint8Array.from(alpha)
  for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) {
    const j = y * p.w + x
    if (alpha[j] < 8) continue
    let n = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (alpha[j + dy * p.w + dx] >= 8) n++
    if (n <= 3) thinned[j] = 0
  }
  // trim to what is left
  let x0 = p.w, x1 = -1, y0 = p.h, y1 = -1
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (thinned[y * p.w + x] < 8) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const out = new Uint8Array(cw * ch * 4)
  let headSum = 0, headCount = 0
  const headRows = Math.max(1, Math.round(ch * HEAD_FRACTION))
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const j = (y + y0) * p.w + (x + x0)
    const k = (y * cw + x) * 4
    out[k] = rgb[j * 3]; out[k + 1] = rgb[j * 3 + 1]; out[k + 2] = rgb[j * 3 + 2]; out[k + 3] = thinned[j]
    if (thinned[j] >= 128 && y < headRows) { headSum += x; headCount++ }
  }
  // the anchor is where the building meets the ground. Its x comes from the top of the drawing,
  // which is roof and never shadow; the shadow lies to the lower right and would drag it across
  const anchorX = headCount ? headSum / headCount : cw / 2
  // the foot: the lowest drawn row in a narrow band under the anchor. Taking the bottom of the
  // whole piece would take the drop shadow with it, which reaches further down and to the right
  let foot = 0
  for (let y = 0; y < ch; y++) for (let x = Math.max(0, Math.round(anchorX) - 5); x < Math.min(cw, Math.round(anchorX) + 6); x++) {
    if (out[(y * cw + x) * 4 + 3] >= 128) { foot = y; break }
  }
  const anchorY = foot + 1 - ch * FOOT_LIFT
  cleaned.push({ name, w: cw, h: ch, rgba: out, anchorX, anchorY, removed })
  console.log(`${name.padEnd(10)} ${p.w}x${p.h} -> ${cw}x${ch}  cleared ${removed} background pixels  anchor ${anchorX.toFixed(0)},${anchorY.toFixed(0)}`)
}

// ---- repack -------------------------------------------------------------------------------------

cleaned.sort((a, b) => b.h - a.h)
const sheetW = 1024
let penX = PAD, penY = PAD, rowH = 0, sheetH = PAD
for (const c of cleaned) {
  if (penX + c.w + PAD > sheetW) { penX = PAD; penY += rowH + PAD; rowH = 0 }
  c.px = penX; c.py = penY
  penX += c.w + PAD
  rowH = Math.max(rowH, c.h)
  sheetH = Math.max(sheetH, penY + c.h + PAD)
}
const sheet = new Uint8Array(sheetW * sheetH * 4)
for (const c of cleaned) {
  // the piece, then its edge colours carried out into the gutter at zero alpha, so that a mipmap
  // taken across the join pulls in the building's own colour rather than black
  for (let y = -PAD; y < c.h + PAD; y++) for (let x = -PAD; x < c.w + PAD; x++) {
    const sx = Math.max(0, Math.min(c.w - 1, x)), sy = Math.max(0, Math.min(c.h - 1, y))
    const from = (sy * c.w + sx) * 4
    const tx = c.px + x, ty = c.py + y
    if (tx < 0 || ty < 0 || tx >= sheetW || ty >= sheetH) continue
    const to = (ty * sheetW + tx) * 4
    sheet[to] = c.rgba[from]; sheet[to + 1] = c.rgba[from + 1]; sheet[to + 2] = c.rgba[from + 2]
    sheet[to + 3] = x === sx && y === sy ? c.rgba[from + 3] : 0
  }
}
writePng(OUT, sheetW, sheetH, sheet)

// The piece table goes into the build rather than beside the texture, because the renderer needs the
// sizes to lay a settlement out before the image itself has arrived.
const rows = cleaned
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(c => `  { name: '${c.name}', x: ${c.px}, y: ${c.py}, w: ${c.w}, h: ${c.h},`
    + ` anchorX: ${c.anchorX.toFixed(1)}, anchorY: ${c.anchorY.toFixed(1)} },`)
  .join('\n')
writeFileSync(OUT_TABLE, `// Generated by scripts/clean-sprites.mjs from art/settlement-early.png. Do not edit by hand.
//
// Where each early era building sits in the sheet, and where on it the building meets the ground.
// Pixels, with the origin at the top left of the sheet.

export interface AtlasPiece {
  name: string
  x: number
  y: number
  w: number
  h: number
  anchorX: number
  anchorY: number
}

export const ATLAS_SIZE: [number, number] = [${sheetW}, ${sheetH}]

export const ATLAS_PIECES: AtlasPiece[] = [
${rows}
]
`)
console.log(`\n${OUT} ${sheetW}x${sheetH}, ${(readFileSync(OUT).length / 1024).toFixed(0)} kB`)
console.log(`${OUT_TABLE} ${cleaned.length} pieces`)
