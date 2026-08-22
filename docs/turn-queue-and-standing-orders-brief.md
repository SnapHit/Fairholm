# Turn, queue and standing orders brief

Version 2, written 21 August 2026. **Supersedes version 1 of the same date.** Self-contained.
Companion to the session, map and economy brief, the interaction, session and persistence brief, and
the browser game architecture brief.

**Purpose: turn the eight-item ceiling from a promise into a mechanism.** Section 1 of the session,
map and economy brief asserts that the game pushes at most eight items per turn at any empire size on
any map size. This document specifies how that holds, because it is an architectural rule rather than
a feature and a build will not invent it.

**What changed in version 2.** The cap became a fold rather than a wall, after the objection that a
hard cap silently removes player agency. Version 1 was wrong about where agency actually leaks.
Sections 7 and 8 are rewritten and section 13 is new.

**Everything here is structure.** Whether a turn *feels* like it is asking the right things cannot be
decided on paper. Every number below is a starting value, not a finding.

---

## 1. Events are not decisions

Most of what interrupts the player in the 1994 game is not a decision. A building finished, a ship
docked, a colonist was born, a price moved. Those are events, and they only feel like decisions
because the game stops to announce them.

**Events go to the dispatch. Only decisions go to the queue.** This removes most late-game noise before
standing orders do any work at all.

---

## 2. Three surfaces, each push or pull, never both

| Surface | Direction | Contents |
|---|---|---|
| **The queue** | push | Decisions only. Eight shown by default, the rest folded |
| **The map** | pull | Everything. The player goes looking, voluntarily, as deep as they like |
| **The dispatch** | pull | Everything that happened, including anything resolved on the player's behalf, with undo |

---

## 3. Standing orders: four independent rules

A settlement holds four rules. If all four are set and satisfiable, it never appears in the queue.

| Rule | What it decides |
|---|---|
| **Purpose** | What this place is for. Sets the default job for arriving colonists and the default build priority |
| **Surplus** | A threshold and a destination. Consign to the Company, ship to a named settlement, hold, or offer to the predecessors |
| **Growth** | What happens to new colonists. Keep, send to a named settlement, or hold |
| **Build order** | An ordered list that advances by itself |

They are independent, so changing surplus handling does not disturb the build order.

**Every rule may be set to "ask me"**, which forces that settlement to surface for that category every
time. This is how a player keeps a capital under close control while forty outposts run themselves.

### Founding costs one tap

Setting four rules at the moment of founding is the worst possible ask: the player has just arrived and
knows nothing about the ground.

So founding is one tap. **The four rules are inferred from the surrounding terrain and take effect
immediately**, and a single "review orders" item appears in the queue a few turns later, once there is
information worth deciding on.

---

## 4. Units under standing orders

All unit types can hold them, which is necessary rather than luxurious at forty settlements.

| Type | Order shape |
|---|---|
| Haulage | A circuit of stops with load and unload rules at each |
| Improver | A work list of tiles and tasks |
| Scout | Explore, or go to a named place |
| Military | Garrison, screen a settlement, patrol between points, escort a unit, or hold as reserve |

### Automation never fights

**Any unit under a standing order that makes contact with a hostile, is attacked, or cannot execute its
order surfaces immediately and reverts to manual control.** No exceptions.

This is the rule that makes military standing orders safe enough to be worth having. Without it,
automation loses wars quietly, which is worse than no automation at all.

---

## 5. What can be a queue item

Five types, in priority order.

1. **Irreversible loss imminent.** Starvation, spoilage, a settlement about to fall, a unit about to be
   lost
2. **Global decision with a deadline.** A demand from the Company, a fleet sighted, independence
   becoming available
3. **A standing order that has become unsatisfiable.** The purpose is now impossible, an input has
   dried up, a unit is blocked
4. **Build order empty.** Settled as a genuine decision rather than an auto-continue
5. **Opportunity.** Something newly possible: a building unlocked, a specialist trainable, a predecessor
   settlement now wanting something you make

---

## 6. Grouping, which is what actually makes the ceiling hold

**Identical conditions across many settlements collapse into one item.**

Twelve settlements losing goods to spoilage is one queue item reading "twelve settlements are losing
goods", which opens a list that can be resolved in bulk or one at a time.

At forty settlements the common case is many instances of the same condition, not eight different
problems, so aggregation does far more work than prioritisation does. **Build grouping before
ranking.** Ranking without it will not hold on a massive map.

---

## 7. The cap is a fold, not a wall

**This is the correction that matters most in version 2.**

A hard cap that discards or defers what falls below it removes agency in three specific ways: the
ranking function makes judgements on the player's behalf silently, hundreds of times; overflowing
opportunities are never learned about at all; and systematic idling costs real tempo that the player
never chose.

So:

- **Eight items are shown by default**
- **Anything beyond that is folded, not filtered**, behind an honest indicator: "eight shown, four
  more"
- **One tap expands the fold**
- **The end-turn affordance states the consequence**, for example "end turn, four will idle"

The invariant survives unchanged, because it was always about what the game *pushes*, never about what
is reachable. The player who wants everything pays one tap. The player who does not pays nothing. And
the player is never resolving a turn blind.

---

## 8. Ranking, and what happens to folded items

Within the five types, order by magnitude first, then by how long the condition has persisted.

**Persistence adds an escalating rank boost, so nothing can be starved indefinitely.**

If a turn is ended with items still folded:

| Type | Behaviour |
|---|---|
| 1. Loss imminent | Never folds. Group instead. If loss items alone exceed eight, that is a crisis and the display should say so |
| 2. Global | Never folds. Always shown. Never auto-resolves |
| 3. Unsatisfiable order | Idles, keeps its order, returns next turn with a boost |
| 4. Build order empty | Idles, returns next turn with a boost |
| 5. Opportunity | Written to the dispatch and **returns once more before lapsing**, rather than vanishing silently |

Idling costs tempo and nothing irreversible, which is why it is the safe default for types 3 and 4.
Opportunities getting a second appearance is the fix for the information-loss problem in version 1.

---

## 9. Ending a turn early

The turn ends when the shown items are resolved. **An end-turn affordance is always available**, and
anything unresolved behaves per the table above and is written to the dispatch.

This preserves "a quiet turn is one tap" and lets a hurried player move through a turn in seconds
without the game arguing.

---

## 10. The queue is derived, not stored

**Recompute the queue each turn from world state. Do not maintain it as a mutable list.**

This keeps the state object as the single source of truth per section 15 of the architecture brief,
removes an entire class of save and migration bugs, and means the queue cannot drift out of sync with
the world. The only stored piece is the turn on which each condition began, which is what the
persistence boost reads.

---

## 11. The return screen

Per section 9 of the interaction brief, returning after two weeks is where long games fail.

The return screen is the same ranking function applied to a longer window: what you were building
toward, what moved while you were away, and the three things that need you. It reads from the dispatch
and the queue, and it is designed rather than generated from a diff.

---

## 12. The player-facing setting

Expose the cap, but as pace rather than as a number, because almost nobody knows what to do with
"maximum queue items".

Three options along the lines of a light turn, a normal turn, or everything at once, defaulting to the
middle. The underlying constant is the same one the developer tunes.

---

## 13. Instrument this from the first playable build

Eight is a starting value derived only from the estimate that a busy turn should stay inside a minute.
Nothing stronger. Two measurements settle it properly instead of by argument:

- **Queue length distribution per turn.** If the fold is opened routinely, eight is too low. If the
  queue rarely reaches eight, the cap is irrelevant and grouping is doing all the work, which is worth
  knowing
- **Wall-clock time per turn.** If a busy turn regularly exceeds a minute, eight is too high

Log both from the first prototype. They cost almost nothing and they replace the weakest assumption in
this document with a fact.

---

## 14. What must be found by playing

- The cap itself, per section 13
- Every ranking weight
- The persistence boost rate
- Whether "build order empty" is genuinely wanted as a decision at forty settlements, or becomes a
  chore. If it does, the fallback is a per-settlement toggle rather than a global change
- How much terrain inference at founding gets right, and whether the review prompt arrives too early or
  too late

---

## 15. If something here is wrong

Say so rather than working around it.

Version 2 corrects one position from version 1: that a hard cap was acceptable because the map remained
available by pull. That understated the cost, because it left the ranking function making silent
judgements and let opportunities lapse unseen. The fold plus the second appearance for opportunities
fixes both without weakening the thumb budget.

The riskiest remaining claim is that grouping plus ranking plus idling keeps the *default* view at
eight across nine hundred turns on a massive map. That has not been played. The cheap test is to
generate a large artificial late-game state in the prototype and count what the queue produces.
