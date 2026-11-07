// The one file that holds the look. Every colour, space, radius, size, weight, border and duration
// the interface uses is declared here and nowhere else. The stylesheet reads them as custom
// properties and the few numbers the gesture code needs are exported as named values, so the two
// never drift apart. Changing the whole appearance of Fairholm means editing this file only.
//
// Art direction brief section 9 for the palette the map already uses; settlement screen brief
// section 6 for "no chrome, no borders, no frames"; feel brief section 4 for the hold.

import { GRID, hexRgb } from '../render/look'

// ---- numbers the interface code needs by name ---------------------------------------------------
// These are the same values the custom properties below are built from, so there is one source.

/** Tap and hold before a move or an attack commits. Feel brief section 4 said 250 ms; two beats
 *  longer stops it firing by accident without making the player wait in the dark, because the ring
 *  fills under the finger from the first frame. Tune here. */
export const HOLD_MS = 450

/** A horizontal drag on the ring this far, with little vertical movement, changes settlement. */
export const SWIPE_PX = 56
export const SWIPE_SLOP_PX = 40

/** Dragging a sheet down this far by its handle dismisses it. */
export const SHEET_DISMISS_PX = 72

/** Nothing the player must hit is ever smaller than this. Feel brief section 5. */
export const TAP_MIN_PX = 44

/** The route under the finger (src/ui/route.ts). Its end is a ring the size of the tile and never
 *  smaller than this radius, so it reads from under a thumb; each turn's end is a numbered disc of
 *  this radius; an attack's odds sit in a pill this tall above the end. */
export const ROUTE_END_TILE = 0.42
export const ROUTE_END_MIN_PX = 15
export const ROUTE_TURN_PX = 11
export const ROUTE_ODDS_H_PX = 22

/** The opening's five lines, onboarding brief section 2: one fades in every two seconds or so, each
 *  over this long, and the first tap anywhere takes them all away over the same time. */
export const OPENING_LINE_MS = 2000
export const OPENING_FADE_MS = 900

/** Version 2's ring cell and building slot. The settlement screen no longer uses them (version 3
 *  sizes its ring from the space it has); the founding preview's ring and the full screens still
 *  measure by them. */
export const RING_CELL_PX = 88
export const SLOT_W_PX = 56

/** How many ring pictures are kept drawn, so that going to the next settlement and back draws
 *  nothing. Each is a canvas of up to about two megabytes at the picture's largest. */
export const RING_PICTURES_KEPT = 4

/** The town, settlement screen brief section 2: how many pixels of the settlement sheet the street's
 *  height stands for, so every building is drawn at one scale (the tallest, the hall, is 214 of them
 *  from the ground to its ridge), and where in that height the ground line is, as a share of it. */
export const STREET_SHEET_PX = 240
export const STREET_GROUND = 0.9

/** The goods on the settlement screen: a store this full, or about to be, is drawn warm. */
export const STORE_WARM = 0.8

/** A figure sent somewhere settles in over this long, settlement screen brief section 3: under two
 *  hundred milliseconds, once, and then nothing on the screen moves. */
export const SETTLE_MS = 160

/** A colour from the map's look as a CSS colour at some opacity. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex).map(v => Math.round(v * 255))
  return `rgba(${r},${g},${b},${alpha})`
}

// ---- the tokens ---------------------------------------------------------------------------------

export const TOKENS: Record<string, string> = {
  // Surfaces. The map is the picture; everything over it is dark, warm and quiet.
  '--surface-base': '#17181a',
  '--surface-panel': '#22252a',
  '--surface-raised': '#2e3238',
  '--surface-sunk': '#1b1d21',
  '--surface-veil': 'rgba(23,24,26,0.72)',        // the top strip's gradient, over the map
  '--surface-bar': 'rgba(23,24,26,0.88)',         // the queue bar, over the map
  '--surface-scrim': 'rgba(23,24,26,0.35)',       // behind a sheet, tap to dismiss
  '--surface-screen': 'rgba(23,24,26,0.9)',       // a full screen over everything
  '--surface-tint': 'rgba(255,255,255,0.04)',     // the press state
  '--surface-water': '#123f44',                   // the canvas before the first frame

  // Ink
  '--ink': '#e9e2cc',
  '--ink-dim': '#b9b2a0',
  '--ink-faint': 'rgba(233,226,204,0.45)',
  '--ink-on-accent': '#2a1a0a',

  // Accent and meaning
  '--accent': '#ff9a3c',
  '--accent-soft': 'rgba(255,154,60,0.12)',
  '--teal': '#1e5f66',
  '--loss': '#d8553e',
  '--loss-soft': 'rgba(216,85,62,0.18)',
  '--company': '#c9a24a',
  '--stuck': '#8fa3b5',
  '--idle': '#7f8a6a',
  '--chance': '#6fb7a0',
  '--warn': '#e3a44a',
  '--danger-surface': '#6a2a22',
  '--danger-line': '#8a3a2e',

  // The plotted route over the map: a bone line on a dark halo so it reads on grass and sea alike,
  // dotted where nobody has seen the ground, the loss colour for an attack's last step
  '--route-line': '#e9e2cc',
  '--route-halo': 'rgba(23,24,26,0.6)',
  '--route-width': '4px',
  '--route-halo-width': '8px',
  '--route-guess-width': '3.5px',
  '--route-guess-dash': '1 7',
  '--route-strike-dash': '7 5',

  // Lines. Used sparingly: the settlement screen has none at all.
  '--line': '#3a3f46',
  '--line-soft': 'rgba(58,63,70,0.6)',
  '--line-hair': '1px',
  '--line-accent': '4px',
  '--ring-track': 'rgba(233,226,204,0.25)',

  // Space
  '--space-1': '2px',
  '--space-2': '4px',
  '--space-3': '6px',
  '--space-4': '8px',
  '--space-5': '10px',
  '--space-6': '12px',
  '--space-7': '16px',
  '--space-8': '20px',

  // Radius
  '--radius-sm': '6px',
  '--radius-md': '10px',
  '--radius-lg': '16px',
  '--radius-pill': '999px',
  /** The count on a stacked tile: a small pill, under the thumb's notice and over a figure's. */
  '--stack-badge': '1.125rem',

  // Type. In rem, so the whole interface follows the reader's own font size rather than ignoring
  // it. The numbers in brackets are what each comes to at the usual 16px root.
  '--font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--text-micro': '0.6875rem',   // 11
  '--text-tiny': '0.75rem',      // 12
  '--text-small': '0.8125rem',   // 13
  '--text-body': '0.9375rem',    // 15
  '--text-lead': '1rem',         // 16
  '--text-title': '1.0625rem',   // 17
  '--text-head': '1.125rem',     // 18
  '--text-display': '1.625rem',  // 26
  /** The opening's lines: the display face a size down, because at twenty-six a sentence wraps to
   *  three rows on a phone and five of them covered the picture they are meant to sit over. */
  '--text-opening': '1.375rem',  // 22
  '--weight-normal': '400',
  '--weight-medium': '600',
  '--weight-strong': '650',
  '--leading': '1.35',
  '--leading-tight': '1.1',
  '--tracking-caps': '0.06em',

  // Shadow and depth
  '--shadow-sheet': '0 -8px 28px rgba(0,0,0,0.45)',
  '--shadow-text': '0 1px 2px rgba(0,0,0,0.6)',

  // Sizes
  '--tap-min': `${TAP_MIN_PX}px`,
  '--control-h': '40px',
  '--control-h-small': '34px',
  '--control-h-tiny': '26px',
  '--speaker': '36px',
  '--hold-ring': '56px',
  '--hold-ring-hole': '22px',
  '--sheet-max-h': '72vh',
  '--bar-h': '56px',
  '--sheet-handle-h': '22px',
  '--strip-fade': '64px',

  // The settlement screen, version 3. The ring is a square between --ring-min and --ring-max, as
  // wide as the screen allows unless that would push the town or the goods off it; the town is at
  // least --town-min tall, its buildings standing in --lot-art-min to --lot-art-max of it.
  '--ring-cell': `${RING_CELL_PX}px`,
  '--slot-w': `${SLOT_W_PX}px`,
  '--st-gap': '6px',
  /** The settlement's name in the header shrinks with the header's width on a narrow screen. */
  '--name-cqw': '4.4cqw',
  '--ring-min': '216px',
  '--ring-max': '420px',
  '--lot-art-min': '68px',
  '--lot-art-max': '120px',
  '--lot-name-h': 'calc(var(--text-micro) * var(--leading) * 2)',
  '--town-min': 'calc(var(--lot-art-min) + var(--lot-name-h) + var(--space-4))',
  '--lot-ground-share': String(STREET_GROUND),
  /** How far the street's stagger lifts a building at most, the gap between buildings, how much of a
   *  building's height the ground shows behind, and over how much of that the ground fades in. */
  '--lot-stagger': '6px',
  '--street-gap': '10px',
  '--street-band': '0.3',
  '--street-fade': '45%',
  '--street-hold': '78%',
  /** A plot that could be built on: its width and height as shares of the street's height. */
  '--plot-w': '0.62',
  '--plot-h': '0.3',
  '--plot-line': 'rgba(233,226,204,0.4)',
  '--plot-fill': 'rgba(233,226,204,0.05)',
  /** A good on the shelf, and the bar for how full its store is: plain, warm, spoiling. */
  '--goods-h': '3.25rem',
  '--good-w': '3.5rem',
  '--fill-h': '4px',
  '--fill-track': 'rgba(233,226,204,0.14)',
  '--fill-plain': 'var(--ink-dim)',
  '--fill-warm': 'var(--warn)',
  '--fill-spoils': 'var(--loss)',
  '--cell-gap': '4px',
  '--ring-radius': '5px',
  '--worker-dot': '14px',
  '--furrow': 'rgba(0,0,0,0.14)',
  /** The ring over the map's picture: hairlines in the map's own grid colour, and the veil over a
   *  tile that cannot be worked. */
  '--ring-hairline': rgba(GRID.colour, 0.42),
  '--ring-veil': 'rgba(23,24,26,0.58)',
  /** A figure on a ring tile: its height as a share of the tile, and where its feet stand. */
  '--ring-figure': '46cqh',
  '--ring-feet-x': '40%',
  '--ring-feet-y': '87%',
  /** Under a figure's feet, and the chevrons of its standing: bone on a dark halo, in the chevron
   *  drawing's own units. */
  '--foot-shadow': 'rgba(0,0,0,0.42)',
  '--chev-halo': 'rgba(23,24,26,0.9)',
  '--chev-halo-w': '3.6',
  '--chev-ink-w': '1.7',
  /** The small pills that say what something makes, and the faint one for what it could. */
  '--pill-bg': 'rgba(23,24,26,0.82)',
  '--pill-faint-bg': 'rgba(23,24,26,0.55)',
  '--settle-ms': `${SETTLE_MS}ms`,

  // Motion
  '--hold-ms': `${HOLD_MS}ms`,
  '--slide-ms': '180ms',
  '--fade-ms': '200ms',
  '--opening-fade-ms': `${OPENING_FADE_MS}ms`,
  /** The lines of the opening sit this far down the screen, as a share of its height, and are
   *  this wide at most. They lie over the haze above the lander, never over a control. */
  '--opening-top': '14%',
  '--opening-width': '30rem',
  '--shadow-opening': '0 1px 2px rgba(0,0,0,0.7), 0 0 18px rgba(0,0,0,0.45)',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.3, 1)',

  // Safe areas, so nothing sits under a notch or a home bar
  '--safe-top': 'env(safe-area-inset-top, 0px)',
  '--safe-bottom': 'env(safe-area-inset-bottom, 0px)',
  '--safe-left': 'env(safe-area-inset-left, 0px)',
  '--safe-right': 'env(safe-area-inset-right, 0px)',

}

/** Write the tokens onto the document root. Called once, before anything renders. */
export function installTheme(root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(TOKENS)) root.style.setProperty(k, v)
}
