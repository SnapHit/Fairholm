# Fairholm build specification

Written 21 August 2026. Self-contained. This is the handoff document. It assumes the fifteen design
briefs are available and does not repeat them.

**Purpose: describe how Fairholm is assembled, because nothing else does.** Section 18 of the
architecture brief warns that anything left undecided is decided arbitrarily by whoever writes the
code. This document exists to leave as little as possible undecided.

---

## 0. What version one is, and what that means

**Decided: attempt everything, including the full renderer, in one run.**

That will not finish everything well. A single generation run has a budget, and this design has fifteen
briefs behind it. So the honest job of this specification is not completeness. It is to make the build
**fail in predictable places**.

Three mechanisms do that, and they are non-negotiable:

1. **Every system sits behind a uniform interface with a working no-op.** A stubbed rival AI must not
   break the turn loop; it must produce no rivals and let the game run
2. **Feature flags, not deleted code.** A half-built system is switched off in the constants block, not
   removed
3. **A strict priority order for the run**, section 13, so that whatever gets dropped is the least
   important thing rather than a random one

**Expect the output to be uneven and expect nothing to be tuned.** Treat it as a skeleton to play and
retune, per section 18 of the architecture brief.

---

## 1. Toolchain

| Choice | Reason |
|---|---|
| **TypeScript** | The state object is large and every system reads it. A mistyped field is a silent balance bug, not a crash. Types are also the contract between the two agents that will write this code |
| **Vite** | Bundles three.js, gives hot reload for the tuning loop, and Cloudflare Pages builds it natively |
| **esbuild strips types without checking them** | **A type error can never block the build.** Checking is a separate command, `tsc --noEmit`. This is the specific arrangement that makes TypeScript safe for a generated one-shot build |
| **No UI framework** | The state object is already the single source of truth, so re-rendering a sheet from state is trivial. React would add 45KB, a mental model and a class of bugs for nothing at this scale |
| **Vitest** | Comes with Vite. A price model cannot be eyeballed |

Dependencies: `three`, and nothing else at runtime.

---

## 2. Repository layout

```
/src
  /sim          pure logic. No DOM, no three.js, no browser APIs
    state.ts          type definitions for all state
    constants.ts      THE single named constants block
    rng.ts            two streams, section 8
    worldgen.ts       generate, validate, retry
    actions.ts        the action union and applyAction
    turn.ts           the turn loop, section 6
    market.ts         prices, consignment, demands, embargoes
    settlement.ts     production, construction, storage, spoilage
    labour.ts         colonists, jobs, education, standing
    grievance.ts      grievance, resolve, signatories
    military.ts       units, combat, fortification, sieges
    fleet.ts          the declaration, waves, blockade
    rivals.ts         observable-depth simulation
    predecessors.ts   the second market
    naval.ts          hulls, raiding, interdiction
    orders.ts         standing orders and their execution
    queue.ts          derive, group, rank, fold
  /render       three.js only. Reads state, never writes it
    scene.ts  terrain.ts  props.ts  settlements.ts  units.ts
    water.ts  ribbons.ts  camera.ts  picking.ts  palette.ts
  /ui           DOM only. Reads state, dispatches actions
    queue.ts  sheets/  dispatch.ts  overlays.ts  hud.ts
  /io
    save.ts  share.ts  telemetry.ts
  main.ts       wiring only
```

**Dependency direction is one-way and enforced by review:**

`sim` depends on nothing. `render` and `ui` both depend on `sim`, read-only. Neither depends on the
other. `main` wires them together.

**If any file in `/sim` imports from `/render`, `/ui` or `window`, that is a bug.** The simulation must
be runnable headless, because that is what makes the tests and the artificial late-game stress test in
section 15 possible.

---

## 3. The state object

**One plain-data object. Serialisable at any instant.** No class instances, no Maps keyed by object
identity, no functions, no DOM references.

```ts
interface GameState {
  schemaVersion: number
  seed: string
  settings: Settings           // generation options and difficulty
  turn: number                 // 1 = first month after landing

  world: {
    width: number
    height: number
    tiles: Tile[]              // flat, index = y * width + x
    anchorages: number[]       // tile indices
    rivers: RiverSegment[]
  }

  charters: Charter[]          // index 0 is always the player
  settlements: Settlement[]
  units: Unit[]
  predecessors: PredecessorSettlement[]

  market: Market               // per-charter price tables
  company: {
    charge: number             // current percentage
    nextDemandTurn: number
    embargoed: GoodId[]
    fleetStrength: number      // visible at all times
    fleetPool: FleetUnit[] | null
  }

  declaration: {
    declared: boolean
    turnDeclared: number | null
    waves: Wave[]
    interventionProgress: number
  } | null

  dispatch: DispatchEntry[]    // capped ring buffer
  intent: string               // the persistent objective line
  flags: Record<string, boolean>
}
```

```ts
interface Tile {
  terrain: TerrainId
  forest: ForestId | null
  river: 0 | 1 | 2
  road: boolean
  improved: boolean
  prime: PrimeId | null
  goldReserve: number          // hidden, generated, depletes
  owner: number | null         // charter index
  worked: number | null        // settlement index
}
```

**Runtime state and save state are different shapes.** Section 9.

### Every mutation is an action

```ts
type Action =
  | { t: 'assignWorker'; settlement: number; colonist: number; job: Job }
  | { t: 'setBuildOrder'; settlement: number; queue: BuildId[] }
  | { t: 'setStandingOrder'; settlement: number; rule: RuleKind; value: unknown }
  | { t: 'consign'; settlement: number; good: GoodId; amount: number }
  | { t: 'moveUnit'; unit: number; path: number[] }
  | { t: 'answerDemand'; accept: boolean }
  | { t: 'declare' }
  // ...

function applyAction(s: GameState, a: Action): GameState
```

**Nothing writes to state except `applyAction`.** This buys undo, the dispatch log and determinism in
one move, and it is what makes the `/ui` layer's read-only rule enforceable.

---

## 4. The constants block

**`sim/constants.ts` holds every number from every brief and nothing else holds any.**

Grouped and commented with the brief and section each came from, so a tuning pass is an afternoon
rather than an archaeology exercise:

```ts
export const C = {
  session:    { turnsPerYear: 12, sizes: { ... } },
  labour:     { granaryThreshold: 160, eats: 2, wordPerValue: 10, ... },
  market:     { lotSize: 25, goods: { ... } },
  grievance:  { perPopulationForResolve: 250, declarationGate: 0.60, ... },
  military:   { exchanges: 3, fortMultipliers: [1, 1.5, 2.25, 3], ... },
  queue:      { shown: 8, ... },
  difficulty: { generous: { ... }, standard: { ... }, ... },
  flags:      { rivals: true, naval: true, predecessors: true, ... },
} as const
```

**`flags` is how a half-built system is switched off.** Per section 0.

---

## 5. Module contract

Every simulation system exports the same shape, so the turn loop is uniform and a stub is safe:

```ts
export interface System {
  id: string
  enabled(c: typeof C): boolean
  resolve(s: GameState, ctx: TurnContext): void   // may mutate the draft
  queueItems(s: GameState): QueueItem[]           // may return []
}
```

A stubbed system returns `false` from `enabled`, does nothing in `resolve`, and returns an empty array.
**The game runs.**

---

## 6. The turn loop

Order matters, and getting it wrong produces bugs that present as balance problems.

1. Advance turn counter and season
2. **Production.** Tiles, then buildings
3. **Consumption.** Food eaten, imported machines consume Instruments, buildings consume inputs
4. **Growth.** Granary thresholds, births
5. **Construction.** Frame and Tooling consumed, buildings advance
6. **Orders.** Haulers run routes, units execute standing orders
7. **Market.** Consignment office sells, prices recover, secular drift applied
8. **Word and passage.** Word accrues from consigned value, immigration checked
9. **Grievance.** Produced, resolve updated, signatory progress
10. **Rivals.** Expansion, market footprint, raiders dispatched
11. **Predecessors.** Alarm decays, preferences rotate
12. **Fleet.** Approach, landing, blockade, if declared
13. **Combat.** Everything that made contact this turn
14. **Spoilage.** Anything over storage capacity
15. **Queue.** Derived last, always, from the settled world

**Production before consumption**, so a settlement does not starve before this turn's harvest.
**Spoilage after everything that could add goods.**
**The queue is derived and never stored**, per section 10 of the queue brief.

---

## 7. The renderer contract

`render` is a pure function of state plus camera.

- **It never writes to `GameState`.** Selection, camera position and hover live in a separate
  `ViewState` that the simulation never reads
- **`rebuild(state)`** is called on turn boundaries and structural change. Terrain, ribbons, settlement
  kits and props are regenerated here, not per frame
- **`draw(view)`** is called on demand only: camera moved, state changed, animation running. **Idle
  draws nothing**, per section 3 of the architecture brief
- **Progressive refinement.** Cheap frame while moving, expensive frame when settled, per the same
  section
- Shadows and ambient occlusion are baked in `rebuild`, never in `draw`

---

## 8. Randomness

Two streams, per section 4 of the persistence brief.

```ts
rng.world   // seeded from state.seed. Deterministic, versioned, saved
rng.play    // seeded from Date.now() on load. Never saved
```

**`Math.random` appears nowhere in `/sim`.** World generation, terrain, resources, anchorage placement
and gold reserves use `rng.world`. Combat exchanges, fleet landing selection, price jitter and
predecessor preference rotation use `rng.play`.

`worldgenVersion` is a separate constant from `schemaVersion` and is stored in the save, because
changing the generator silently rewrites old worlds.

---

## 9. Save format

```ts
interface SaveState {
  schemaVersion: number
  worldgenVersion: number
  seed: string
  settings: Settings
  turn: number
  tileDeltas: Record<number, Partial<Tile>>   // only what the player changed
  charters, settlements, units, predecessors, market, company, declaration
  dispatch: DispatchEntry[]                    // capped
  intent: string
}
```

**The world is regenerated, not deserialised.** Loading runs `worldgen` from the seed, then applies
`tileDeltas`. Saves stay in the low kilobytes and a returning player is back inside the second promised
for first load.

- Write on every turn boundary and on `visibilitychange`. Never `beforeunload`
- `navigator.storage.persist()` on every launch
- Export via `CompressionStream` gzip then base64, shared through `navigator.share()` with a download
  fallback
- **Export and import ships in the first run**, not later. It makes the save format a real, debuggable
  artefact from day one

---

## 10. Instrumentation

Three briefs depend on numbers that are currently promises. These are cheap and go in early.

| Metric | Answers |
|---|---|
| Drop-off by turn number | The most valuable number in the project, per the onboarding brief |
| Queue length distribution per turn | Whether eight is right, per section 13 of the queue brief |
| Wall-clock seconds per turn | Whether a busy turn fits a minute |
| Turn of first consignment, second settlement | Onboarding pacing |
| Whether the fold is opened, and when | Whether the cap binds at all |

Anonymous counters only. No accounts, no identifiers, so the privacy notice stays at a paragraph.

---

## 11. Interface layer

DOM only, per section 11 of the architecture brief.

- **Tap to inspect, a second action to commit.** First tap never destructive
- **No drag and drop anywhere**
- **Undo, not confirmation dialogs**, backed by the action log
- Everything reachable lives in the bottom third
- Selection feedback appears above the touch point, never under the thumb
- **Below 44 pixels a tile, tiles are not tappable.** Only settlement and unit markers respond, with
  hit areas larger than their tile

---

## 12. What is deliberately stubbed in version one

Named here so they are stubs rather than omissions:

- **Audio.** A silent hook that the first tap unlocks, and nothing behind it
- **Rival diplomacy offers.** Relationship state changes through actions only; no offers arrive yet
- **Signatory effects beyond the first four.** All twelve appear; the later eight grant nothing until
  implemented
- **Massive map size.** Generated but unvalidated. Small, standard and large are the tested set
- **The predecessors' own name for themselves**, which is still open in the naming brief

---

## 13. Build order within the run

**If the run is truncated, this is the order in which things should already exist.**

1. `state.ts`, `constants.ts`, `rng.ts`, `actions.ts`
2. `worldgen.ts` with validate-and-retry
3. Renderer: terrain, camera, picking. **A map you can look at and tap**
4. Settlements, tiles, workers, production, consumption, growth
5. `turn.ts` and the end-turn cycle
6. `market.ts` and consignment
7. `queue.ts` with grouping, ranking and the fold
8. `save.ts` including export and import
9. `telemetry.ts`
10. Buildings and tiers, storage, spoilage
11. Standing orders
12. Renderer: settlement kit, props, ribbons, water, season
13. Grievance, resolve, signatories
14. Predecessors
15. Rivals
16. Military, fortification, sieges
17. Naval and raiding
18. The declaration, waves, blockade, intervention
19. Onboarding: landing sites, unlock triggers, one-sentence explanations
20. Overlays and polish

**Steps 1 to 9 are the floor.** A build that reaches step 9 is playable, saveable and measurable, which
is enough to learn from. Everything after is depth.

---

## 14. Tests

Small, in `/sim` only, because that is the part that can be tested headlessly.

- Price falls with cumulative volume and recovers when selling stops
- A single large consignment walks its own price down across lots
- Secular drift raises Tooling, Arms and Instruments over time
- A turn resolves identically twice from the same state with a fixed `rng.play` seed
- Save round-trips: generate, act, save, load, and the state matches
- **The artificial late-game stress test**: construct forty settlements and count what the queue
  produces. This is the check section 12 of the queue brief asks for and it is the single most valuable
  test here

---

## 15. Acceptance checks

Manual, in order, on a phone:

1. Loads and shows a coastline in about a second
2. Three landing sites offered; one tap starts the game
3. Tiles are tappable at working zoom and not at overview
4. A worker can be assigned and output appears next turn
5. A quiet turn is one tap
6. Something can be consigned and the price visibly falls when a lot is dumped
7. Save, reload, and the game resumes at the same turn
8. Export produces a file; import restores it
9. Portrait and landscape both work
10. The tab can be backgrounded and restored without losing the WebGL context

---

## 16. If something here is wrong

Say so rather than working around it.

The riskiest assumption is section 0: that a single run attempting everything will produce something
uneven but useful, rather than something broadly half-finished. The three mechanisms there are the
mitigation and they are the part to hold to hardest, because they are what makes the difference between
a skeleton that can be tuned and a pile that has to be restarted.

The second riskiest is the turn order in section 6. It is reasoned rather than tested, and ordering
bugs in an economy present as balance problems, which means they get tuned around instead of fixed.
When something feels wrong in the economy, check section 6 before touching a constant.
