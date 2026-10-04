# Fairholm

A turn-based colony and trade game that runs in a browser on a phone. You arrive with nothing on a
generous coast, build from vulnerability to independence, and tear up the charter that paid your way.
Built with TypeScript, Vite and three.js; no UI framework; self-hosted on Cloudflare Pages.

## Four rules that override everything else

1. **The 1994 game is background only.** `docs/colonization-mechanics-brief.md` describes the
   source game so we know what to depart from. Never implement its numbers, names or mechanics.
   Every departure from that baseline is marked and justified in the briefs and in `DECISIONS.md`.
2. **Forbidden vocabulary, verbatim from the legal constraint, section 8.1.** None of the following
   may appear anywhere in the product, the code, the UI, the URL or any product-facing copy, and
   that includes variable names, comments, filenames and commit messages:
   - Liberty Bells
   - Founding Fathers, and the specific named list of them
   - Sons of Liberty
   - Royal Expeditionary Force
   - Tory sentiment or Rebel sentiment as mechanic labels
   - Custom House as a building name
   - Wagon Train as a unit name
   - Veteran Dragoons, Continental Army, Continental Cavalry as unit tiers
   - The ladder Petty Criminal, Indentured Servant, Free Colonist, Specialist
   - Colonization, in the title or anywhere in the product's marketing

   Also never name the original designer, publisher or rights holders, never use "inspired by" or
   "spiritual successor" framing, and never put the letters "col" in a domain, repository or handle.
   Use the unowned words instead: consignment, bulletin, grievance, muster, charter, dispatch, agent,
   hauler, works. Our ladder is debtor, contracted, free, master.
3. **Build order is fixed** (build specification section 13) and steps 1 to 9 are the floor:
   state and constants, worldgen, renderer basics, settlements, turn loop, market, queue, save with
   export and import, telemetry. Everything after is depth and is switched off rather than deleted.
4. **Every system sits behind the `System` interface** (`src/sim/turn.ts`) with a working no-op.
   An unfinished system is a flag set false in `C.flags` (`src/sim/constants.ts`); the game must
   still run with it off.

## Architecture that must not drift

- `/src/sim` imports nothing from `/render`, `/ui` or `window`. It runs headless and is tested that way.
- Nothing writes to `GameState` except `applyAction` in `src/sim/actions.ts`.
- Every number lives in the single block `C` in `src/sim/constants.ts`, grouped and commented with
  the brief and section it came from. Nothing else holds a number.
- Two RNG streams: `rng.world` (seeded from the seed, saved) and `rng.play` (seeded from
  `Date.now()`, never saved). `Math.random` appears nowhere in `/sim`.
- The queue is derived every turn and never stored. Only `settlement.conditions` is stored.
- The renderer draws on demand and continuously only during a gesture, momentum, a glide or the
  arrival animation. Idle draws nothing. It never rebuilds geometry during a gesture.
- Saves are seed plus deltas; the world is regenerated on load. `schemaVersion` and
  `worldgenVersion` are separate and both checked.
- TypeScript is stripped by esbuild; a type error never blocks a build. `npm run typecheck` checks.

## The three gestures

Pinch zooms (continuous, anchored on the centroid). Drag pans. Tap selects and inspects. Moving a
unit is one continuous gesture: press and hold the destination, and after the hold threshold the
route appears (turn markers, fog stretches, attack odds) with a short vibration where supported;
slide to re-aim and the route follows the finger live, scrolling the map when held near an edge;
let go to move along the route shown. A quick drag before the hold engages is still a pan; moving
14 px cancels it into one. **Tap selects; hold aims; release moves; nothing else commits a move.**
Releasing on the unit's own tile, over the card or the top strip, or on a tile that cannot be
reached moves nothing, and a second finger cancels into a pinch. An attack commits on release only
once its odds have been on screen for half a second. A release never founds: the card offers Found
here. This is the only way to move any unit, the lander included. No Go control, no tap on a route's
end, no drag and drop. No confirmation dialogs: undo instead. Below 44 px a tile, tiles are not
tappable; a destination hold still works down to the overview zoom, because it commits nothing until
the release.

## Repository layout

```
/src
  /sim      state, constants, rng, worldgen, actions, turn, market, settlement, labour,
            grievance, military, fleet, rivals, predecessors, naval, orders, queue, systems,
            autopilot (the voyage), policy (three machine players for whole games)
  /render   scene, terrain (with water), props, settlements, units, ribbons, camera, picking, palette
  /ui       app (store, hud, queue, landing, undo), sheets, input, audio, glossary, dom, style.css
  /io       save (with export and import), telemetry
  main.ts   wiring only
/public/audio   the four tracks, streamed, never in the initial payload
/tests          vitest, sim only
/scripts        smoke.mjs, a headless-browser run of the acceptance checks; the shot rigs;
                playthrough.ts, a whole game by the competent policy written to /reports
/reports        playthrough-small.txt, the dispatch of a whole small game, for reading
/docs           the seventeen design briefs (see docs/README.md)
```

## Commands

```
npm install
npm run dev          # Vite dev server
npm run build        # production build to /dist, deployable to Cloudflare Pages as a static site
npm run preview      # serve /dist
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run smoke        # headless acceptance checks (needs: npx playwright install chromium)
```

## Authority

The seventeen briefs in `/docs` are the design. When code and a brief disagree, the brief is right
unless `DECISIONS.md` records why not. When two briefs disagree, the build specification and the
naming brief's corrections win. If a brief is wrong, say so rather than working around it.

## Tuning

Nothing has been tuned by a person at the table. Every value in `C` is a starting point, tuned
once against three machine players (`src/sim/policy.ts`, `tests/pace.test.ts`, `DECISIONS.md` 158
and 162) so that every era of the game is reachable. Tune at the table, in `constants.ts`, one group
at a time, rerun the pace table before and after, and never settle in design what can only be
found by playing. When the economy feels wrong, check the turn order in `src/sim/systems.ts`
against build specification section 6 before touching a constant.

## Acceptance checks (build specification section 15)

1. Loads and shows a coastline in about a second
2. Opens at sea in fog with the five lines; the first tap dismisses them, and the lander can be sailed to a coast and beached to found
3. Tiles are tappable at working zoom and not at overview
4. A worker can be assigned and output appears next turn
5. A quiet turn is one tap
6. Something can be consigned and the price visibly falls when a lot is dumped
7. Save, reload, and the game resumes at the same turn
8. Export produces a file; import restores it
9. Portrait and landscape both work
10. The tab can be backgrounded and restored without losing the WebGL context

`npm run smoke` exercises all ten in a headless mobile Chromium; do it on a real phone as well.

## Deployments

Commit and push directly to main. Do not create a branch or open a pull request unless I explicitly ask for one.

## Writing conventions

Australian spelling. Sentence case in titles. No em or en dashes anywhere, in code comments or
copy; restructure the sentence instead. Everything the player reads is plain, warm and short.

See `DECISIONS.md` for every ambiguity resolved during the build and what was left out.
