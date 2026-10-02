// The plotted route, drawn over the map. Feel brief section 4: a hold plots, and the route shows
// before anything moves: the way itself, where each turn's movement runs out, stretches through
// ground nobody has seen drawn as a guess, and an attack's odds at its end. Where the tile cannot be
// reached there is no way to draw, only a mark on the tile held; the sheet says why.
//
// It is SVG over the map rather than something drawn in the scene, for the reason the stack counts
// are DOM (src/ui/stacks.ts): the map draws no text, and a line of a fixed width in pixels stays
// legible at the wide zooms a destination may be held at. It follows the camera from the
// renderer's frame hook. It is a preview the player summoned and puts away, not data laid on the
// map (art direction brief section 11).

import type { GameState } from '../sim/state'
import type { RoutePlan } from '../sim/route'
import type { Scene } from '../render/scene'
import { ROUTE_END_TILE, ROUTE_END_MIN_PX, ROUTE_TURN_PX, ROUTE_ODDS_H_PX } from './theme'

const SVG = 'http://www.w3.org/2000/svg'

export interface RouteLayer {
  /** After a plot, a commit or a clear: what to draw, from where the unit stands. */
  show(s: GameState, r: RoutePlan | null, from: number): void
  /** Every frame: where it is on the screen. */
  place(): void
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag)
  e.setAttribute('class', cls)
  return e
}

/** In words, the odds an attack wins: how many times in ten. */
export function oddsWords(p: number): string {
  if (p >= 0.995) return 'Certain'
  const k = Math.round(p * 10)
  return k <= 0 ? 'Under 1 in 10' : `${k} in 10`
}

export function mountRouteLayer(root: HTMLElement, scene: Scene): RouteLayer {
  const svg = el('svg', '')
  svg.setAttribute('id', 'route')
  svg.setAttribute('aria-hidden', 'true')
  root.append(svg)

  // what is drawn, in world terms: points are tile middles
  let points: [number, number][] = []        // the unit's tile, then every tile walked
  let unseen: boolean[] = []                  // per leg into point i + 1: through unseen ground
  let turnEnds: { at: [number, number]; n: number }[] = []
  let end: [number, number] | null = null
  let strike: [number, number] | null = null  // an attack's last step goes from the walk's end to here
  let kind: 'move' | 'attack' | 'board' | 'none' = 'none'
  let odds: string | null = null

  const halo = el('path', 'leg halo')
  const known = el('path', 'leg known')
  const guess = el('path', 'leg guess')
  const strikeHalo = el('path', 'leg halo')
  const strikeLeg = el('path', 'leg strike')
  const endRing = el('circle', 'end')
  const cross = el('path', 'cross')
  const marks = el('g', 'turns')
  const oddsTag = el('g', 'odds')
  const oddsBox = el('rect', '')
  oddsBox.setAttribute('y', String(-ROUTE_ODDS_H_PX / 2))
  oddsBox.setAttribute('height', String(ROUTE_ODDS_H_PX))
  oddsBox.setAttribute('rx', String(ROUTE_ODDS_H_PX / 2))
  const oddsText = el('text', '')
  oddsText.setAttribute('text-anchor', 'middle')
  oddsText.setAttribute('dominant-baseline', 'central')
  oddsTag.append(oddsBox, oddsText)
  svg.append(halo, strikeHalo, known, guess, strikeLeg, endRing, cross, marks, oddsTag)

  const show = (s: GameState, r: RoutePlan | null, from: number) => {
    const w = s.world.width
    const mid = (t: number): [number, number] => [(t % w) + 0.5, Math.floor(t / w) + 0.5]
    points = []; unseen = []; turnEnds = []; end = null; strike = null; odds = null; kind = 'none'
    while (marks.firstChild) marks.removeChild(marks.firstChild)
    if (!r || from < 0) { svg.style.display = 'none'; return }
    svg.style.display = ''
    end = mid(r.end)
    if (!r.ok) { svg.setAttribute('class', 'none'); place(); return }
    kind = r.kind
    points = [mid(from), ...r.path.map(mid)]
    unseen = r.unseen.slice()
    r.turnEnds.forEach((i, k) => { if (i >= 0) turnEnds.push({ at: mid(r.path[i]), n: k + 1 }) })
    if (r.kind !== 'move') strike = end
    if (r.kind === 'attack') odds = r.odds === null ? 'Odds unknown' : oddsWords(r.odds)
    svg.setAttribute('class', r.kind)
    for (const t of turnEnds) {
      const g = el('g', 'turn')
      const c = el('circle', '')
      c.setAttribute('r', String(ROUTE_TURN_PX))
      const tx = el('text', '')
      tx.setAttribute('text-anchor', 'middle')
      tx.setAttribute('dominant-baseline', 'central')
      tx.textContent = String(t.n)
      g.append(c, tx)
      marks.append(g)
    }
    place()
  }

  const place = () => {
    if (svg.style.display === 'none' || !end) return
    const cam = scene.cam
    svg.setAttribute('width', String(cam.width))
    svg.setAttribute('height', String(cam.height))
    const sc = (p: [number, number]) => cam.worldToScreen(p[0], p[1])
    const zoom = cam.view.zoom
    // the walk, in two runs: what the player has seen, solid, and what nobody has, a guess
    let dKnown = '', dGuess = '', dAll = ''
    const scr = points.map(sc)
    for (let i = 0; i + 1 < scr.length; i++) {
      const [ax, ay] = scr[i], [bx, by] = scr[i + 1]
      const seg = `M${ax.toFixed(1)},${ay.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}`
      dAll += seg
      if (unseen[i]) dGuess += seg; else dKnown += seg
    }
    halo.setAttribute('d', dAll)
    known.setAttribute('d', dKnown)
    guess.setAttribute('d', dGuess)
    const [ex, ey] = sc(end)
    if (strike && scr.length) {
      const [ax, ay] = scr[scr.length - 1]
      const d = `M${ax.toFixed(1)},${ay.toFixed(1)}L${ex.toFixed(1)},${ey.toFixed(1)}`
      strikeHalo.setAttribute('d', d)
      strikeLeg.setAttribute('d', d)
    } else { strikeHalo.setAttribute('d', ''); strikeLeg.setAttribute('d', '') }
    // the end: a ring the size of the tile, never smaller than a thumb, to say tap here to go
    const r = Math.max(zoom * ROUTE_END_TILE, ROUTE_END_MIN_PX)
    if (kind === 'none') {
      endRing.setAttribute('r', '0')
      const c = Math.max(zoom * ROUTE_END_TILE * 0.66, ROUTE_END_MIN_PX * 0.6)
      cross.setAttribute('d', `M${ex - c},${ey - c}L${ex + c},${ey + c}M${ex + c},${ey - c}L${ex - c},${ey + c}`)
    } else {
      cross.setAttribute('d', '')
      endRing.setAttribute('cx', ex.toFixed(1)); endRing.setAttribute('cy', ey.toFixed(1)); endRing.setAttribute('r', r.toFixed(1))
    }
    // where each turn runs out: a numbered mark on the tile
    turnEnds.forEach((t, i) => {
      const g = marks.childNodes[i] as SVGGElement | undefined
      if (!g) return
      const [x, y] = sc(t.at)
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`)
    })
    // an attack's odds, beside its end
    if (odds) {
      oddsText.textContent = odds
      oddsTag.style.display = ''
      const tw = Math.max(ROUTE_ODDS_H_PX * 2.2, odds.length * ROUTE_ODDS_H_PX * 0.33 + ROUTE_ODDS_H_PX * 0.7)
      oddsBox.setAttribute('x', String(-tw / 2)); oddsBox.setAttribute('width', String(tw))
      oddsTag.setAttribute('transform', `translate(${ex.toFixed(1)},${(ey - r - ROUTE_ODDS_H_PX * 0.75).toFixed(1)})`)
    } else oddsTag.style.display = 'none'
  }

  svg.style.display = 'none'
  return { show, place }
}
