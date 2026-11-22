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
export const OPENING_LINE_MS = 3500
export const OPENING_FADE_MS = 900
/** Each opening line's own fade in, slow enough to arrive rather than appear. */
export const OPENING_LINE_FADE_MS = 1400
/** The first line comes this long after the frame, so it arrives over the picture rather than with it. */
export const OPENING_FIRST_MS = 400

/** The lander coming down under its parachute while the lines fade in (DECISIONS.md 204). It falls in
 *  stages, one as each line fades in, along an arc from high on the right to where the lander lies,
 *  shrinking as it falls away from the eye, and splashes down a beat after the last line is in. */
export const DESCENT = {
  /** Where it starts, as shares of the screen, and how wide: a share of the screen, at most so many pixels. */
  startX: 0.78, startY: 0.1, startW: 0.55, maxStartPx: 320,
  /** How far the arc bows out to the right of a straight fall, as a share of the screen's width. */
  bulge: 0.14,
  /** How far along the arc it has come as each line begins to fade in. */
  stages: [0, 0.16, 0.36, 0.58, 0.8],
  /** From the last line fully in to splashdown. */
  settleMs: 1400,
  /** The fade out into the lander on the water, and the lander's fade in on the water. */
  outMs: 1100, revealMs: 1400,
  /** In the picture: the middle of the capsule, which comes down onto the lander, as shares of its
   *  width and height; the share of its width the capsule takes; and the canopy, which it swings from. */
  anchorX: 0.33, anchorY: 0.8, capsule: 0.7, swingFrom: '66% 0%',
  /** The swing under the canopy, in degrees, dying away as it comes down; and how solid it is drawn. */
  swayDeg: 5, opacity: 0.95,
  /** The ring on the water at splashdown. */
  splashMs: 1600,
  /** Where on the screen the lander lies during the opening, as a share of its height: below the
   *  lines, so it comes down into clear water. */
  landerAtY: 0.7,
}

/** Version 2's ring cell and building slot. The settlement screen no longer uses them (version 3
 *  sizes its ring from the space it has); the founding preview's ring and the full screens still
 *  measure by them. */
/** Carrying a colonist on the settlement screen (decision 206): how far a finger moves on a figure
 *  before it is a carry rather than a tap, how near the street's edge it must come to scroll it, and
 *  how far the street scrolls each frame while it is held there, and how long after letting go a
 *  stray click is not taken for a tap; how much larger the carried figure is drawn, and how far its
 *  feet stand over the finger. */
export const CARRY = { startPx: 8, edgePx: 48, edgeStepPx: 9, clickGuardMs: 400, lift: 1.25, footPx: 14 }

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

/** Turns that run on by themselves (src/ui/turns.ts, DECISIONS.md 190). A quiet turn, after the
 *  player has done something and nothing is left in the queue, ends after this long, which leaves
 *  time to touch the screen and keep the turn, or to undo what was just done. Between turns of a
 *  run, after the last move has been drawn, the map rests this long so each turn can be seen. */
export const AUTO_TURN_QUIET_MS = 2500
export const AUTO_TURN_PAUSE_MS = 800
/** The lines of the dispatch a run's summary shows before "and N more" (decision 196). */
export const RUN_SUMMARY_LINES = 4
/** How long it stays before it goes by itself (decision 205). */
export const RUN_SUMMARY_MS = 7000
/** The longest title the queue bar shows whole on a phone; a problem past it shows its short form
 *  and its settlement, or the short form alone (decision 196). */
export const BAR_TITLE_CHARS = 30

/** A tile's sheet leads with the place itself, small, drawn by the map's renderer: a box this many
 *  rem square, showing this many tiles across with the tile in the middle (build brief phase 3). */
export const PLACE_BOX_REM = 4.5
export const PLACE_TILES_SHOWN = 1.6

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
  /** What a turn adds, set against --loss for what it takes away: the palette's own green. */
  '--gain': 'var(--chance)',
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
  // A printer's serif, chosen at the table from five set in the game itself (DECISIONS.md 207):
  // Vollkorn (Friedrich Althausen) for everything read, and its small capitals in bold for titles,
  // names and the opening. Dark, bracketed and old in feel, and still easy to read small on a phone.
  // Self hosted, OFL. Its figures are old style by default; the interface sets them level.
  '--font': '"Vollkorn", Georgia, "Times New Roman", serif',
  '--font-display': '"Vollkorn SC", "Vollkorn", Georgia, "Times New Roman", serif',
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
  /** The title face's weight (Vollkorn SC is drawn bold) and the air between its small capitals. */
  '--weight-display': '700',
  '--display-tracking': '0.03em',
  '--weight-medium': '500',
  '--weight-strong': '700',
  '--leading': '1.35',
  '--leading-tight': '1.1',
  '--tracking-caps': '0.06em',

  // Shadow and depth
  '--shadow-sheet': '0 -8px 28px rgba(0,0,0,0.45)',
  '--shadow-text': '0 1px 2px rgba(0,0,0,0.6)',

  // Icons, art direction brief section 11a: one drawing at every size, standing on the panel with no
  // plate behind it. In rem, so they follow the reader's own font size: in a yield pill, in the top
  // strip, on the goods shelf, on a board or catalogue tile, and at the head of a sheet. In a sentence
  // in em, so an icon is as tall as the words beside it and a little more, and dropped below their
  // baseline by as much as each drawing leaves under its feet, so it stands on the line.
  '--ic-inline': '1.3em',
  '--ic-inline-drop': '-0.3em',
  '--ic-pill': '1.0625rem',      // 17
  '--ic-hud': '1.25rem',         // 20
  '--ic-shelf': '2.125rem',      // 34
  '--ic-tile': '2.5rem',         // 40
  '--ic-hero': '4rem',           // 64
  /** A faint pill's icon: what a tile could make, not what it makes. */
  '--ic-faint': '0.55',
  /** Over the map an icon carries the same shadow the words there do, so it reads on pale ground. */
  '--ic-over-map': 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.7))',

  // Sizes
  '--tap-min': `${TAP_MIN_PX}px`,
  '--control-h': '40px',
  '--control-h-small': '34px',
  '--control-h-tiny': '26px',
  '--speaker': '36px',
  '--hold-ring': '56px',
  // the ring on the water where a first time player is shown to hold (decision 203)
  '--coach-ring': '60px',
  '--coach-line': '3px',
  '--coach-gap': '8px',
  '--coach-glow': 'rgba(255,154,60,0.75)',
  '--coach-shade': 'rgba(0,0,0,0.35)',
  '--coach-ms': '1600ms',
  '--coach-small': '0.82',
  '--coach-big': '1.12',
  '--coach-nudge': '1.6',
  // the ring on the water where the lander comes down (decision 204)
  '--splash-ink': 'rgba(242,236,224,0.85)',
  '--splash-flat': '0.45',
  '--splash-grow': '2.2',
  '--splash-ms': '1600ms',
  '--hold-ring-hole': '22px',
  '--sheet-max-h': '72vh',
  '--runsum-max-h': '50vh',       // what the turns that ran on brought, at most half the screen
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
  /** A built building's nameplate (decision 206): a dark board with a warm rule along its top, so the
   *  name reads as a sign hung on the street rather than a caption. */
  /** The shadow under a colonist carried across the settlement screen. */
  '--shadow-carry': 'rgba(0,0,0,0.55)',
  '--plate-bg': 'rgba(23,24,26,0.86)',
  '--plate-line': 'rgba(233,226,204,0.22)',
  '--plate-rule': 'rgba(255,154,60,0.7)',
  /** The goods shelf, settlement screen brief section 2: each good's icon stands on one shared shelf
   *  (a soft band in the raised surface colour under the row, lit from above like the drawings), its
   *  stock under it in large figures with the change this turn beside them, and under those the bar
   *  for how full its store is, plain, warm or spoiling, with a tick where the surplus rule starts to
   *  sell. The row's height, a good's least width, the shelf's thickness, and how far an icon's feet
   *  sit into it. */
  '--goods-h': '4.375rem',
  '--good-w': '3.5rem',
  '--shelf-h': '0.5rem',
  '--shelf-sink': '0.3125rem',
  '--shelf-top': '#40464f',
  '--shelf-front': 'var(--surface-raised)',
  '--shelf-under': 'rgba(0,0,0,0.28)',
  '--stock-size': 'var(--text-lead)',
  '--fill-h': '4px',
  '--fill-track': 'rgba(233,226,204,0.14)',
  '--fill-plain': 'var(--ink-dim)',
  '--fill-warm': 'var(--warn)',
  '--fill-spoils': 'var(--loss)',
  /** The tick on a fullness bar where a rule acts: how wide, and how far it stands past the bar. */
  '--tick-w': '2px',
  '--tick-over': '3px',
  '--tick': 'var(--ink)',
  /** Meters in a sheet (src/ui/meters.ts): a wide bar; a price gauge's track, the marker at today's
   *  price and the dark edge that lifts it off the track, the gap shaded between the price and where
   *  it would stand with nothing sold, the fall a consignment would cause, hatched, the opening
   *  price's tick, and the width the floor and the ceiling take at the ends. */
  '--bar-wide-h': '8px',
  '--gauge-h': '6px',
  '--gauge-wide-h': '8px',
  '--gauge-knob': '12px',
  '--gauge-wide-knob': '16px',
  '--gauge-knob-edge': 'rgba(23,24,26,0.85)',
  '--gauge-now': 'var(--ink)',
  '--gauge-gap': 'rgba(216,85,62,0.85)',
  '--gauge-fall': 'repeating-linear-gradient(135deg, rgba(216,85,62,0.6) 0 3px, transparent 3px 6px)',
  '--gauge-open': 'var(--ink-dim)',
  '--gauge-end-w': '1.25rem',
  /** The market board: goods two across, three on a sheet at least BOARD_THREE_ACROSS_PX wide, each on
   *  a soft ground of its own and this far apart. */
  '--board-cols': '2',
  '--board-tile': 'rgba(233,226,204,0.045)',
  '--board-gap': '8px',
  /** A sheet led by a picture: the box the picture stands in at the sheet's head. */
  '--hero-box': '4rem',
  /** Pictures in sheets, build brief phase 3. Buildings stand in boxes this tall at one scale: on a
   *  catalogue card, under way, queued, and in a row of a list. People are drawn this tall: in a row
   *  of a list and on a tile of a grid of people. A unit is drawn at its own size against a person
   *  this tall: at the head of its sheet, on an equip card, and on the hulls sheet, where a trader
   *  stands three people to its masthead; and the hull's box. */
  '--card-pic-h': '4.5rem',
  '--underway-h': '5.5rem',
  '--queued-h': '3.5rem',
  '--row-building-h': '2.75rem',
  '--row-building-w': '3.75rem',
  '--row-figure-h': '2.75rem',
  '--tile-figure-h': '3rem',
  '--person-tile-w': '5rem',
  '--hero-person': '3.5rem',
  '--card-person': '2.75rem',
  '--hull-person': '1.6rem',
  '--hull-box-w': '6.5rem',
  '--hull-box-h': '5rem',
  '--qitem-w': '5.5rem',
  /** A person's box in a list, as a share of the figure's height, and where in it the feet stand; an
   *  equip card's box, in people, tall enough for an outrider. */
  '--person-box-w': '0.75',
  '--person-feet-x': '45%',
  '--person-feet-y': '96%',
  '--unit-card-box': '1.4',
  /** The actions at the end of a person's row take at most this share of it. */
  '--acts-max': '50%',
  /** The place itself at the head of a tile's sheet (PLACE_BOX_REM above), and how wide the
   *  numbers stand in a tally of what is made and held. */
  '--place-box': `${PLACE_BOX_REM}rem`,
  '--tally-num-w': '2.5rem',
  /** Something that cannot be had yet is drawn this faint, and says why on a tap. */
  '--gated': '0.45',
  /** A count of a few things as pips: their size, the gap between them, whole and hollow. */
  '--pip': '7px',
  '--pip-gap': '3px',
  '--pip-on': 'var(--ink)',
  '--pip-off': 'rgba(233,226,204,0.2)',
  /** Progress toward something being built or taught, and what a turn makes. */
  '--progress': 'var(--accent)',
  '--made': 'var(--gain)',
  /** Tallies of the whole charter, build brief phase 4: how many seals a row holds and how faint an
   *  unsigned one is; the relation track's width and its steps; the recall fleet's hulls, drawn
   *  against a person this tall and this far apart, and a wave's soldiers against a person this tall. */
  '--seals': '12',
  '--seal-faint': '0.28',
  '--relation-w': '9rem',
  '--relation-dot': '12px',
  '--fleet-person': '0.42rem',
  '--fleet-gap': '3px',
  '--wave-person': '1rem',
  /** The arrow between what goes into a building and what comes out: its width and its line. */
  '--into-w': '0.875rem',
  '--into-h': '0.625',
  '--into-stroke': '1.7',
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
  // a settler on the settlement screen is lifted off the ground and the buildings with a pale rim
  // and a pool of light at the feet, so brown clothes never sink into brown timber or soil
  '--figure-rim': 'rgba(255,244,224,0.95)',
  '--figure-rim-w': '1.2px',
  '--figure-pool': 'rgba(255,238,205,0.6)',
  '--chev-halo': 'rgba(23,24,26,0.9)',
  '--chev-halo-w': '3.6',
  '--chev-ink-w': '1.7',
  /** The shadow under a figure's feet, the chevrons beside them (a 10 by 16 drawing), how far a
   *  figure drops as it settles in, all as shares of the figure's height; and a frame's progress bar
   *  as a share of the frame's width. */
  '--foot-w': '0.5',
  '--foot-h': '0.14',
  '--chev-x': '0.2',
  '--chev-h': '0.34',
  '--chev-w': '0.2125',
  '--settle-drop': '0.22',
  '--progress-w': '0.7',
  /** The small pills that say what something makes, and the faint one for what it could. */
  '--pill-bg': 'rgba(23,24,26,0.82)',
  '--pill-faint-bg': 'rgba(23,24,26,0.55)',
  '--settle-ms': `${SETTLE_MS}ms`,

  // Motion
  '--hold-ms': `${HOLD_MS}ms`,
  /** The End turn button while turns run on: a bar along its foot fills toward the next turn. */
  '--run-bar-h': '4px',
  '--run-bar': 'rgba(23,24,26,0.55)',
  '--slide-ms': '180ms',
  '--fade-ms': '200ms',
  '--opening-fade-ms': `${OPENING_FADE_MS}ms`,
  '--opening-line-fade-ms': `${OPENING_LINE_FADE_MS}ms`,
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

/** The market board puts three goods across from a sheet this wide, and two below it (build brief
 *  phase 2). A width a container query asks about cannot be a custom property, so this one rule is
 *  written by installTheme rather than the stylesheet. */
export const BOARD_THREE_ACROSS_PX = 600

/** Write the tokens onto the document root, and the one rule that needs a number of its own. Called
 *  once, before anything renders. */
export function installTheme(root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(TOKENS)) root.style.setProperty(k, v)
  const doc = root.ownerDocument
  if (!doc.getElementById('theme-queries')) {
    const rule = doc.createElement('style')
    rule.id = 'theme-queries'
    rule.textContent = `@container sheet (min-width: ${BOARD_THREE_ACROSS_PX}px) { .board { --board-cols: 3; } }`
    doc.head.append(rule)
  }
}
