# Fairholm

A turn-based colony and trade game that runs in a browser on a phone.

You come ashore with nothing on a generous coast, with a Company charter that paid your passage and
takes a charge on everything you send home. You work the land, refine what it gives, trade with the
people who were here first, watch three rival charters settle the same coast, and gather the
grievance that one day lets you tear the charter up. The Company then sends a finite fleet. When it
is spent, Fairholm answers to no one.

## Playing

Open the site on a phone. Tap one of three landing sites to go ashore. From then on the queue at the
bottom of the screen is everything that needs a decision; a quiet turn is one tap. Pinch to zoom,
drag to pan, tap to select, and tap-and-hold a tile to send the active unit there. Every noun is
tappable and opens a two-sentence explanation with the current state. Anything you do within a turn
can be undone from the toast.

The game saves itself at every turn and whenever the tab is hidden. Export and import from the menu
move a game between devices or browsers.

## Building

```
npm install
npm run dev        # local development
npm run build      # production build to /dist
npm run typecheck  # tsc --noEmit
npm test           # simulation tests
```

`/dist` deploys to Cloudflare Pages as a static site. The four music tracks in `/public/audio` are
streamed on first tap and are never part of the initial payload.

## Layout

`/src/sim` is the headless simulation, `/src/render` is three.js, `/src/ui` is plain DOM, `/src/io`
is saves and telemetry, and `main.ts` wires them. `CLAUDE.md` carries the rules that bind every
contribution; `DECISIONS.md` records every judgement call made during the build; `/docs` holds the
design briefs.

## Status

Version one, built in a single run and untuned. Every number is a starting value. Play it, then tune
`src/sim/constants.ts`.
