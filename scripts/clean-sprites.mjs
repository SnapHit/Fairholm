// Prepares the drawn pieces for the map: the early era settlement sheet, and the units sheet.
//
// Two jobs, one file, because they share the png reading and writing, the trimming and the packing,
// and because a sheet is a sheet: pieces on a power of two with edge extended gutters and a manifest
// that says where each piece is and where it meets the ground.
//
//   node scripts/clean-sprites.mjs              the units: art/units/*.png -> public/textures/units.png
//   node scripts/clean-sprites.mjs settlement   the buildings: art/settlement-early.png -> public/textures/settlement-early.png
//
// The settlement sheet in art/ was extracted from a generated image that stood on a checkerboard,
// and the extractor kept some of that checkerboard wherever a building's drop shadow darkened it
// enough to stop reading as background. Those squares are the one artefact in the sheet that reads
// as a bug rather than as art, and the one part that can be told apart from the drawing by colour
// alone, because everything the buildings are made of is warm and these are not. The settlement job
// clears them. What it does not do is take the baked drop shadows out: they cannot be separated.
// See DECISIONS.md.
//
// The unit pieces arrive already keyed and scaled by scripts/extract-sprites.py, one png each in
// art/units with a manifest beside them, every piece cut so that a standing person is 200 px tall.
// The units job measures each piece's ground anchor, packs them all, the colonist included, into one
// 1024 square sheet, and writes two contact sheets to art/units for a person to look at: every piece
// on mid grey at the sheet's own pixels, and again at the size it stands on a phone at working zoom.
//
// The output is committed; this only needs running again when the pieces change.

import { deflateSync, inflateSync, constants as zlibConstants } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

const SETTLEMENT = {
  src: 'art/settlement-early.png',
  manifest: 'art/settlement-early.json',
  out: 'public/textures/settlement-early.png',
  table: 'src/render/settlement-atlas.ts',
}
const UNITS = {
  dir: 'art/units',
  manifest: 'art/units/manifest.json',
  out: 'public/textures/units.png',
  outManifest: 'public/textures/units.json',
  contact: 'art/units/contact-1x.png',
  contactDisplay: 'art/units/contact-display.png',
  /** The sheet is this wide and as tall as the next power of two above what the pieces need. */
  width: 1024,
  /** What the sheet should stay under on the wire, in bytes. Reported, not enforced. */
  budget: 250 * 1024,
  /** A person on the display contact sheet, in device pixels: 0.52 tiles at 44 px a tile on a 2x phone. */
  displayPerson: 46,
}

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
/** Rows from the bottom of a unit that are its feet, wheels or keel, for the anchor. */
const FOOT_BAND = 0.08
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

/** Writes rgba as a png, choosing each row's filter by the usual sum of absolute differences, which
 *  is what takes a sheet of flat colour and soft edges down to the size it should be. */
function writePng(path, w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  const trial = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride))
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, y * stride + stride)
    const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : null
    let best = 0, bestSum = Infinity
    for (let f = 0; f < 5; f++) {
      const t = trial[f]
      let sum = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0
        const b = prev ? prev[x] : 0
        const c = prev && x >= 4 ? prev[x - 4] : 0
        let v = row[x]
        if (f === 1) v -= a
        else if (f === 2) v -= b
        else if (f === 3) v -= (a + b) >> 1
        else if (f === 4) {
          const g = a + b - c
          const pa = Math.abs(g - a), pb = Math.abs(g - b), pc = Math.abs(g - c)
          v -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        v &= 255
        t[x] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) { bestSum = sum; best = f }
    }
    raw[y * (stride + 1)] = best
    trial[best].copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9, strategy: zlibConstants.Z_FILTERED })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

// ---- shared: trim, pack, lay down -------------------------------------------------------------------

/** The box of a piece's drawn pixels. */
function bounds(w, h, alpha, threshold = 8) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[y * w + x] < threshold) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0, x1, y0, y1 }
}

/** Shelves, tallest first. Returns the height the sheet needs. */
function pack(pieces, sheetW) {
  pieces.sort((a, b) => b.h - a.h || b.w - a.w)
  let penX = PAD, penY = PAD, rowH = 0, sheetH = PAD
  for (const c of pieces) {
    if (penX + c.w + PAD > sheetW) { penX = PAD; penY += rowH + PAD; rowH = 0 }
    c.px = penX; c.py = penY
    penX += c.w + PAD
    rowH = Math.max(rowH, c.h)
    sheetH = Math.max(sheetH, penY + c.h + PAD)
  }
  return sheetH
}

/** The pieces onto the sheet, each with its edge colours carried out into the gutter at zero alpha,
 *  so that a mipmap taken across the join pulls in the drawing's own colour rather than black. */
function layDown(pieces, sheetW, sheetH) {
  const sheet = new Uint8Array(sheetW * sheetH * 4)
  for (const c of pieces) {
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
  return sheet
}

// ---- the settlement sheet -------------------------------------------------------------------------------

/** True where a pixel is background checkerboard rather than any part of the drawing. */
function isBackground(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const saturation = mx ? (mx - mn) / mx : 0
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return saturation < NEUTRAL_SATURATION && lum > NEUTRAL_FLOOR
}

function cleanSettlement() {
  const src = readPng(SETTLEMENT.src)
  const manifest = JSON.parse(readFileSync(SETTLEMENT.manifest, 'utf8'))
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
    const { x0, x1, y0, y1 } = bounds(p.w, p.h, thinned)
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

  const sheetW = 1024
  const sheetH = pack(cleaned, sheetW)
  writePng(SETTLEMENT.out, sheetW, sheetH, layDown(cleaned, sheetW, sheetH))

  // The piece table goes into the build rather than beside the texture, because the renderer needs the
  // sizes to lay a settlement out before the image itself has arrived. It is written in the shape the
  // artist's manifests take, so one lookup serves both.
  const rows = cleaned
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => `    ${c.name}: { x: ${c.px}, y: ${c.py}, w: ${c.w}, h: ${c.h},`
      + ` anchorX: ${c.anchorX.toFixed(1)}, anchorY: ${c.anchorY.toFixed(1)} },`)
    .join('\n')
  writeFileSync(SETTLEMENT.table, `// Generated by scripts/clean-sprites.mjs from art/settlement-early.png. Do not edit by hand.
//
// Where each early era building sits in the sheet, and where on it the building meets the ground.
// Pixels, with the origin at the top left of the sheet. The same shape as the manifests that ship
// beside the other sheets, so that billboards.ts reads them all the same way.

import type { AtlasManifest } from './billboards'

export const SETTLEMENT_ATLAS: AtlasManifest = {
  texture: 'settlement-early.png',
  size: [${sheetW}, ${sheetH}],
  pieces: {
${rows}
  },
}
`)
  console.log(`\n${SETTLEMENT.out} ${sheetW}x${sheetH}, ${(readFileSync(SETTLEMENT.out).length / 1024).toFixed(0)} kB`)
  console.log(`${SETTLEMENT.table} ${cleaned.length} pieces`)
}

// ---- the units sheet ----------------------------------------------------------------------------------

/** Area averaging, on premultiplied colour, which is near enough to what the gpu's mip chain does to
 *  a piece at working zoom to say whether it will survive it. */
function shrink(src, w, h, scale) {
  const ow = Math.max(1, Math.round(w * scale)), oh = Math.max(1, Math.round(h * scale))
  const out = new Uint8Array(ow * oh * 4)
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    const x0 = Math.floor(ox / scale), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((ox + 1) / scale)))
    const y0 = Math.floor(oy / scale), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((oy + 1) / scale)))
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      const al = src[i + 3] / 255
      r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al; n++
    }
    const o = (oy * ow + ox) * 4
    if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a }
    out[o + 3] = Math.round((a / n) * 255)
  }
  return { w: ow, h: oh, rgba: out }
}

/** A piece composited onto a grey ground at a given place, with a mark where its anchor is. */
function stamp(ground, gw, gh, piece, px, py, mark) {
  for (let y = 0; y < piece.h; y++) for (let x = 0; x < piece.w; x++) {
    const tx = px + x, ty = py + y
    if (tx < 0 || ty < 0 || tx >= gw || ty >= gh) continue
    const i = (y * piece.w + x) * 4, o = (ty * gw + tx) * 4
    const a = piece.rgba[i + 3] / 255
    for (let c = 0; c < 3; c++) ground[o + c] = Math.round(piece.rgba[i + c] * a + ground[o + c] * (1 - a))
  }
  if (mark) {
    const ax = Math.round(px + mark[0]), ay = Math.round(py + mark[1])
    for (let d = -3; d <= 3; d++) {
      for (const [tx, ty] of [[ax + d, ay], [ax, ay + d]]) {
        if (tx < 0 || ty < 0 || tx >= gw || ty >= gh) continue
        const o = (ty * gw + tx) * 4
        ground[o] = 230; ground[o + 1] = 40; ground[o + 2] = 40
      }
    }
  }
}

/** Every piece on mid grey, tallest first, with its anchor marked, wrapped into rows at about the
 *  width of a phone on its side so the sheet can be opened and looked at. */
function contactSheet(path, pieces, personPx, gap) {
  // at the sheet's own pixels when no person is given; otherwise every piece at the size it stands
  // beside the others on the map, a person this many pixels tall, whatever resolution it is stored at
  const scaled = pieces.map(p => {
    const scale = personPx ? personPx / p.personPx : 1
    return { ...p, scale, ...(scale === 1 ? {} : shrink(p.rgba, p.w, p.h, scale)) }
  })
  const maxW = Math.max(1200, Math.max(...scaled.map(p => p.w)) + gap * 2)
  const rows = [[]]
  let rowW = gap
  for (const p of scaled) {
    if (rowW + p.w + gap > maxW && rows[rows.length - 1].length) { rows.push([]); rowW = gap }
    rows[rows.length - 1].push(p); rowW += p.w + gap
  }
  const gw = Math.max(...rows.map(row => row.reduce((s, p) => s + p.w + gap, gap)))
  const gh = rows.reduce((s, row) => s + Math.max(...row.map(p => p.h)) + gap, gap)
  const ground = new Uint8Array(gw * gh * 4)
  for (let i = 0; i < gw * gh; i++) { ground[i * 4] = 128; ground[i * 4 + 1] = 128; ground[i * 4 + 2] = 128; ground[i * 4 + 3] = 255 }
  let y = gap
  for (const row of rows) {
    const rowH = Math.max(...row.map(p => p.h))
    let x = gap
    for (const p of row) {
      stamp(ground, gw, gh, p, x, y + rowH - p.h, [p.anchorX * p.scale, p.anchorY * p.scale])
      x += p.w + gap
    }
    y += rowH + gap
  }
  writePng(path, gw, gh, ground)
  return `${path} ${gw}x${gh}`
}

function packUnits() {
  const manifest = JSON.parse(readFileSync(UNITS.manifest, 'utf8'))
  const pieces = []
  for (const name of Object.keys(manifest).sort()) {
    const entry = manifest[name]
    const src = readPng(`${UNITS.dir}/${name}.png`)
    const alpha = new Uint8Array(src.w * src.h)
    for (let i = 0; i < src.w * src.h; i++) alpha[i] = src.rgba[i * 4 + 3]
    const { x0, x1, y0, y1 } = bounds(src.w, src.h, alpha)
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const rgba = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) rgba.set(src.rgba.subarray(((y + y0) * src.w + x0) * 4, ((y + y0) * src.w + x0 + w) * 4), y * w * 4)
    // the anchor: across, the middle of what stands on the ground, the feet or wheels or keel in
    // the bottom band of the piece, so a figure holding a pick out to one side still stands on its
    // own feet; down, the lowest solid row, which is where the drawing meets the ground. A hull has
    // its waterline as well, measured off the drawing by the extractor and carried through here
    const band = Math.max(1, Math.round(h * FOOT_BAND))
    let sum = 0, count = 0, foot = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] < 128) continue
      foot = y
      if (y >= h - band) { sum += x; count++ }
    }
    const anchorX = count ? sum / count : w / 2
    const anchorY = foot + 1
    const piece = { name, w, h, rgba, anchorX, anchorY, facing: entry.facing || 'front', personPx: entry.personPx || 200 }
    if (entry.waterline !== undefined) piece.waterline = entry.waterline - y0
    pieces.push(piece)
    const water = piece.waterline !== undefined ? `  waterline ${piece.waterline.toFixed(0)}` : ''
    console.log(`${name.padEnd(16)} ${src.w}x${src.h} -> ${w}x${h}  anchor ${anchorX.toFixed(0)},${anchorY.toFixed(0)}${water}  ${entry.people} people, faces ${piece.facing}`)
  }

  const sheetW = UNITS.width
  const needed = pack(pieces, sheetW)
  let sheetH = 1
  while (sheetH < needed) sheetH *= 2
  if (sheetH > sheetW) console.warn(`the pieces need ${needed} rows: the sheet is ${sheetW}x${sheetH}, not square`)
  writePng(UNITS.out, sheetW, sheetH, layDown(pieces, sheetW, sheetH))

  const out = {
    texture: 'units.png',
    size: [sheetW, sheetH],
    note: 'personPx is how tall a standing person is in that piece; ground anchor at the feet, wheels or keel; waterline where a hull sits in the water; profiles face left as drawn',
    pieces: {},
  }
  for (const p of pieces.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const entry = { x: p.px, y: p.py, w: p.w, h: p.h, anchorX: +p.anchorX.toFixed(1), anchorY: +p.anchorY.toFixed(1), personPx: p.personPx, facing: p.facing }
    if (p.waterline !== undefined) entry.waterline = +p.waterline.toFixed(1)
    out.pieces[p.name] = entry
  }
  writeFileSync(UNITS.outManifest, JSON.stringify(out, null, 1) + '\n')

  const bytes = readFileSync(UNITS.out).length
  const over = bytes > UNITS.budget ? `  OVER the ${(UNITS.budget / 1024).toFixed(0)} kB budget` : ''
  console.log(`\n${UNITS.out} ${sheetW}x${sheetH}, ${(bytes / 1024).toFixed(0)} kB${over}, ${needed} of ${sheetH} rows used`)
  console.log(`${UNITS.outManifest} ${pieces.length} pieces`)
  const order = pieces.slice().sort((a, b) => b.h - a.h || b.w - a.w)
  console.log(contactSheet(UNITS.contact, order, 0, 12) + '  (' + order.map(p => p.name).join(', ') + ')')
  console.log(contactSheet(UNITS.contactDisplay, order, UNITS.displayPerson, 6))
}

const job = process.argv[2] || 'units'
if (job === 'settlement') cleanSettlement()
else if (job === 'units') packUnits()
else throw new Error(`unknown job ${job}: settlement or units`)
