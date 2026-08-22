# Session, map and economy brief

Version 2, written 21 August 2026. **Supersedes version 1 of the same date.** Self-contained.
Companion to the browser game architecture brief, the Colonization mechanics brief, the legal
distinguishability constraint, the setting and fiction brief, and the interaction, session and
persistence brief.

**Purpose: settle the decisions that constrain each other, so nothing downstream is built against the
wrong numbers.** Every number is derived from a stated requirement and the derivation is shown, so it
can be argued with rather than inherited.

**What changed in version 2.** Map size becomes a player choice with turn count scaling to match.
Goods go from 14 to 18. Section 6 adds the buy-or-build decision that falls out of section 6 of the
setting brief.

**Note on constants.** Nothing here is a feel constant. Rates of acceleration, price movement, growth
and pacing cannot be chosen on paper and must be prototyped, played and retuned, per section 18 of the
architecture brief. Everything below is structure, which can be chosen on paper.

---

## 1. The invariant that governs the whole design

**Settlements are free. Queue items are not.**

> **The queue is push, the map is pull. The game pushes at most eight items in a turn, ranked, no
> matter how large the empire or the map. The player may pull as deep into the map as they like,
> voluntarily.**

A hard invariant in the systems, not an aspiration. A settlement operating inside its standing order
never appears in the queue. It surfaces only when the order cannot be met. Without this rule, an
uncapped empire on a massive map produces a thirty-tap turn by hour ten, which is the failure the
interaction brief forbids.

**Consequence: standing orders are the load-bearing mechanic of the late game, not a convenience.**
Build them alongside settlements, not afterwards.

---

## 2. Session and turn count

### Requirements

- A complete game runs 10 to 15 hours at the standard map size
- Sittings vary: 2 to 5 minutes, 10 to 15 minutes, and 30 to 60 minutes, all supported
- Long and explicitly resumable

### Derivation

The shortest sitting sets the ceiling on turn length. A 2 minute sitting must complete at least one
turn with something achieved, so **a turn must resolve in under a minute**. That pushes toward more
turns each asking less, which also suits a phone. Twelve hours at roughly 75 seconds a turn gives
about 480 turns.

### Settled

| | |
|---|---|
| One turn | one month |
| Standard game | **480 turns**, about 40 years |
| Quiet turn | 1 tap |
| Busy turn | 6 to 8 taps |
| Hard ceiling | 8 pushed queue items, at any empire or map size |

Forty years means the player arrives young and declares independence old. Twelve turns to the year
means the season changes every three turns, so the shader-driven season work in section 9 of the
architecture brief carries real weight rather than being decoration.

---

## 3. Map size, which the player chooses

Turn count scales with map size by default, because a massive map at 480 turns cannot be filled and
travel eats the game. The player may override the turn count independently.

| Size | Grid | Tiles | Default turns | Roughly |
|---|---|---|---|---|
| Small | 40 × 26 | 1,040 | 300 | 6 to 8 hours |
| Standard | 56 × 36 | 2,016 | 480 | 10 to 15 hours |
| Large | 72 × 48 | 3,456 | 660 | 18 to 22 hours |
| Massive | 92 × 60 | 5,520 | 900 | 28 to 35 hours |

Massive is deliberately larger than the 1994 game's roughly 3,900 tiles.

Derivation for standard: a settlement needs roughly twelve tiles of territory; an expansionist player
should reach thirty-odd settlements before the soft pressures make more pointless; the predecessors
need their own country; and a meaningful fraction of the map should be terrain nobody wants. That needs
800 to 1,000 workable land tiles, which is 56 × 36 at 40 to 50 per cent land.

**The landmass must not have a dominant axis.** Portrait and landscape have opposite aspect ratios and
a roughly square landmass reads acceptably in both. This resolves the orientation question for the map
itself.

Two things that scale with size and must be handled:

- **The fit-whole-map zoom becomes unreadable above Large.** At those sizes it becomes a schematic
  strategic view rather than a rendered one
- **Generation and validation time grows.** Acceptable on the new game screen, but it must not block
  the first paint

Save size does not scale meaningfully, because a save is seed plus deltas.

---

## 4. Zoom and tapping

A phone gives roughly 390 by 500 CSS pixels of map once the bottom third is interface.

| Level | Tile size | Portrait view | Purpose |
|---|---|---|---|
| Fit | varies with map size | whole map | orientation only. Schematic above Large |
| Overview | about 16px | 24 by 31 | reading the country, moving between settlements |
| Working | **44px** | 9 by 11 | the default. One settlement's neighbourhood plus surrounds |
| Detail | about 72px | 5 by 7 | precise assignment |

Zoom is continuous by pinch, with double tap snapping between overview and working.

**The rule that makes this safe: below 44 pixels a tile, tiles are not tappable.** At fit and overview
only settlement and unit markers respond, with hit areas larger than their tile. This removes the
mis-tap problem structurally rather than tuning around it.

---

## 5. Settlements and the three soft pressures

**There is no hard cap.** Three light pressures compound instead, and every one must have a visible
signal, or expansion quietly stops paying and the player concludes the game is broken.

1. **Administrative overhead.** Beyond a certain size a settlement needs a body keeping the ledger
   rather than working. It costs a colonist, not money, because colonists are the scarce resource
2. **The rebellion percentage.** The independence gate is a share of total population, so more
   settlements means more people to convert. This is the anti-snowball device
3. **Freight distance.** Distant settlements pay more in time or loss to get goods out, which is what
   makes geography decide strategy

All three are smooth curves the player can invest against, never cliffs.

---

## 6. Buy or build, which is the game in one repeated decision

From section 6 of the setting brief. The Company sells machines, and sells the spares and consumables
that keep them running at a price that climbs every year.

**So most significant construction offers two paths:**

| | Imported machine | Built locally |
|---|---|---|
| Speed | Fast. Available immediately | Slow. Needs Frame and Tooling |
| Cost | Gold now, plus a permanent consumables draw | Labour and materials only |
| Risk | Fails eventually with nothing local able to mend it | Maintainable forever |
| Effect on the ratchet | Deepens dependence | Reduces it |

This is the whole game compressed into one choice the player makes dozens of times, and it feeds the
rising-import-price ratchet directly. It is also what makes the visible industrial arc in the setting
brief a consequence of decisions rather than a scripted sequence.

The balance of this is unknown and must be found by playing. If buying is always right the game has no
tension; if it is never right the mechanic is decoration.

---

## 7. Goods and chains

**Eighteen goods.** This works only because of an interface rule:

> **A context displays only the goods it touches.** A settlement growing one crop and refining it shows
> four rows, not eighteen. The full market is a sheet the player visits deliberately. Roughly five
> goods visible in any one context.

### The principle behind the count

The 1994 game has sixteen goods but only about six distinct behaviours, because four of its chains are
structurally identical. Learn one and you have learned all four. **They exist for map variety, not for
depth.**

So: **add goods by adding parallel variants of behaviours that already exist, never by adding new
behaviours.** Parallel variants cost the player almost nothing to learn and buy map variety directly,
which is the replayability engine. New behaviours cost real cognitive load and there is a hard ceiling
on a phone.

Eighteen goods, eight distinct behaviours.

### The set

| Goods | Depth | Behaviour |
|---|---|---|
| Food | untraded | population growth |
| Timber | 1 | feeds Frame, the internal construction accumulator |
| Gold | 1 | extraction only, depletes, price collapses. **The trap** |
| Ore → Metal → **Tooling** | 3 | tooling builds, and replaces the chokepoint import |
| Metal → **Arms** | branch | the military terminal. Tradeable, and dangerous to sell |
| Crop A → Good A | 2 | export chain |
| Crop B → Good B | 2 | export chain, parallel |
| Crop C → Good C | 2 | export chain, parallel |
| Grown export → Essence, then Essence + Metal → Finished | 3, **convergent** | the money chain, highest ceiling |
| Horses | renewable | breed. Mount the field unit and pull the haulers |
| Instruments | import only | not makeable locally until very late. Price climbs every year |

**Frame is not one of the eighteen.** It is an internal construction accumulator produced from Timber
by a carpenter, consumed by building, and it can be neither shipped nor sold. Worked timber cut for a
specific building does not travel. This keeps the tradeable count at eighteen while giving construction
its own labour step.

**Metal branches**, feeding Tooling for construction and Arms for war. That is where the army competes
with the colony, and it is structurally distinct from the original's linear chain. See section 2 of the
military brief.

Three parallel export chains give the map three different answers to "what is this country for", which
is what makes the opening thirty turns worth reading.

**The convergent chain is deliberate and is a design improvement, not only a legal one.** Requiring two
different raw materials for the highest-value good forces settlements to depend on each other and ship
between themselves, which is a better puzzle than another straight line.

### Constraints on naming and substitution

- Per section 8.4 of the legal constraint, the depths vary (1, 2, 2, 2, 3, 3-convergent) and the count
  is not four uniform two-step chains
- **None of the three parallel chains may be cotton to cloth**, which is one of the original's four
  signature chains. Substitute something else period-plausible
- Seven or eight goods must be sellable to the predecessors, or the anti-repetition rule in their
  market is not interesting

Names are not chosen here. See the setting brief, section 13.

---

## 8. Map generation

The player chooses generation settings before starting. The set below is derived from what changes
strategy rather than copied, which is also safer under section 8.3.

| Setting | What it decides |
|---|---|
| **Map size** | Section 3. The most important one |
| Land shape | continent, coast and islands, or archipelago. Decides how central shipping is |
| Land area | expansion room and the practical settlement ceiling |
| Terrain roughness | ore and highland availability, and movement cost |
| Temperature | which chains are viable, and where |
| Moisture | as above, on the second axis |
| Resource abundance | the main difficulty dial |
| Predecessor density | how much of the second market exists |
| Crossing length | the tempo of every ratchet, and how viable the revolt is |

### Two consequences that must be built in, not discovered

**Shipping is permanent.** If the player can choose an archipelago, sea logistics is a real system in
every game. Naval *combat* can still be cut per the mechanics brief. Naval *hauling* cannot.

**The generator must validate and retry.** Nine settings produce more combinations than can be tested,
so: generate, check invariants, regenerate on failure. Minimum invariants:

- The landing site has food, timber and fresh water within reach
- At least two refining chains are viable somewhere reachable
- A minimum number of predecessor settlements are reachable
- No unique resource sits on an unreachable landmass
- Every topology and every size produces a playable opening
- **Anchorages are placed and reachable.** Not every coastal tile can take a landing. Anchorage count
  and spacing scale with map size and coastline length, every charter starts at one, and no settlement
  site of value is left with no defensible relationship to any of them. See section 9 of the military
  brief

### The compensation

Settings plus seed is a complete world in a handful of characters. That is the shareable link, and per
the persistence brief it is currently the only distribution mechanism in the project that strengthens
with play rather than requiring the game to be described in terms of something it cannot legally name.

---

## 9. Gold, and how the trap works

- **Each gold tile holds a hidden reserve**, set at generation, deterministic from the seed
- **It depletes quietly.** Never warned in advance, but a falling yield is observable to anyone
  watching. Unannounced, not invisible. That is the difference between a trap that teaches and one that
  feels cheap
- **The price also collapses on cumulative volume and does not recover.** Gold declines twice at once
- **Gold buys tempo, not compounding.** Passage, tooling, rushed construction, imported machines. All
  one-offs
- **Exhausted diggings persist on the map.** The player makes their own ruins, at near-zero rendering
  cost, and the country remembers what was done to it

---

## 10. Still open

- All names: the planet, the eighteen goods, the settlements, the units
- The headline grown export and what it becomes
- Art direction, which per section 1 of the architecture brief cannot be settled until somebody has
  said what makes it cheap
- Orientation model for the interface, though section 3 settles it for the map
- Every feel constant, which can only be found by playing

---

## 11. Corrections carried from earlier documents

- The Colonization mechanics brief states a 38 colony cap. Other community sources say 48. The number
  was never verified and should be treated as unreliable. It does not affect this design, which has no
  hard cap
- The 1994 game has **sixteen** goods, not the twenty to thirty sometimes assumed

---

## 12. If something here is wrong

Say so rather than working around it. The turn count, map sizes and zoom figures are derived from
stated requirements and a phone viewport, and each derivation is shown so the arithmetic can be
checked. The goods list is a structure, not a balance, and the balance will be wrong until it has been
played.
