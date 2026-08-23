// The one file that holds the look. Every colour, space, radius, size, weight, border and duration
// the interface uses is declared here and nowhere else. The stylesheet reads them as custom
// properties and the few numbers the gesture code needs are exported as named values, so the two
// never drift apart. Changing the whole appearance of Fairholm means editing this file only.
//
// Art direction brief section 9 for the palette the map already uses; settlement screen brief
// section 6 for "no chrome, no borders, no frames"; feel brief section 4 for the hold.

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

/** Settlement screen brief section 2. The ring wants 88 and the flanks 56; the ring gives way
 *  first on a narrow screen because it has the most to give and stays furthest above the floor. */
export const RING_CELL_PX = 88
export const SLOT_W_PX = 56
export const SLOT_H_PX = 56

/** Below this width the flanking columns move below the ring rather than squeezing it. The brief's
 *  arithmetic (264 + 56 + 56 = 376 in 390) left nothing for gaps or padding, so the pivot is here.
 *  It is measured against the reader's own font size rather than a bare pixel count, because a
 *  larger font needs the wider stacked slots sooner. A media query cannot see the root font size,
 *  so App.layout works it out and sets the `narrow` class; the stylesheet keys off that. */
export const REFLOW_PX = 380
export const BASE_FONT_PX = 16

/** Whether the flanks should sit below the ring rather than beside it, at this width and this
 *  root font size. */
export function shouldReflow(width: number, rootFontPx: number): boolean {
  return width < REFLOW_PX * (Math.max(1, rootFontPx) / BASE_FONT_PX)
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
  '--weight-normal': '400',
  '--weight-medium': '600',
  '--weight-strong': '650',
  '--leading': '1.35',
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

  // The settlement screen's grid
  '--ring-cell': `${RING_CELL_PX}px`,
  '--slot-w': `${SLOT_W_PX}px`,
  '--slot-h': `${SLOT_H_PX}px`,
  '--cell-gap': '4px',
  '--ring-radius': '5px',
  '--worker-dot': '14px',
  '--furrow': 'rgba(0,0,0,0.14)',

  // Motion
  '--hold-ms': `${HOLD_MS}ms`,
  '--slide-ms': '180ms',
  '--fade-ms': '200ms',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.3, 1)',

  // Safe areas, so nothing sits under a notch or a home bar
  '--safe-top': 'env(safe-area-inset-top, 0px)',
  '--safe-bottom': 'env(safe-area-inset-bottom, 0px)',
  '--safe-left': 'env(safe-area-inset-left, 0px)',
  '--safe-right': 'env(safe-area-inset-right, 0px)',

  // Kept for the record: the width the layout reflows at, at the usual root font size. The
  // stylesheet does not read it, because the decision needs the font size as well as the width.
  '--reflow': `${REFLOW_PX}px`,
}

/** Write the tokens onto the document root. Called once, before anything renders. */
export function installTheme(root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(TOKENS)) root.style.setProperty(k, v)
}
