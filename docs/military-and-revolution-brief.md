# Military and revolution brief

Version 7, written 21 August 2026. **Supersedes versions 1 to 6 of the same date.** Self-contained.
Companion to the colonists and labour brief, the rival charters brief, the session, map and economy
brief, the turn, queue and standing orders brief, the interaction, session and persistence brief and
the legal distinguishability constraint.

**Purpose: specify land combat, the armed force, and the war that ends the game.** Naval combat and
privateering are specified in section 8 of the rival charters brief and are not repeated here.

**Version history, kept because four of these were real errors.**

- **v2** corrected v1's folding of Arms into Tooling, and its replacement of annihilation with an
  endurance timer. That mistook a balance failure for a design failure
- **v3** added anchorages, a preparation window and the confiscation rule
- **v4** shortened the window to six turns, removed the stated landing target, added the determinism
  split
- **v5** made the mass muster the purpose of the window and set the visible approach at three turns
- **v6** added siege attrition and section 12 on foreign intervention
- **v7** fixes an unbounded defence. v6 allowed unlimited batteries behind a bastion at 30 defence
  each, which made a fortified settlement impregnable at any per-unit value. Sections 3, 7 and 11 are
  rewritten

**Method as before.** Structural rules taken because they are systems and safe under section 7. **Every
number derived from this game's own parameters, none transcribed**, per section 8.3. Working names
throughout; the naming pass comes later.

---

## 1. The principle: there is no military tech tree

**The economy is the military tech tree.** Equipment defines the unit, not a unit type. A colonist with
arms is a foot soldier. Give them horses and they are mounted. Take the horses away and they are foot
again. Take the arms and they are a colonist.

Military strength is therefore a direct function of industrial output and nothing else. No research, no
parallel progression, no separate resource.

---

## 2. Metal branches, and that is where the army competes with the colony

The industrial chain is not linear:

- **Ore → Metal**
- **Metal → Tooling**, which builds
- **Metal → Arms**, which fights

**Metal is the contested intermediate.** Every gun is a building you did not build, and the trade
happens one step upstream of the finished goods rather than by conflating them. This is also
structurally distinct from the original's linear ore to tools to muskets, which section 8.4 requires.

Three consequences worth noting:

1. **Arms are a tradeable good with their own market**, so selling weapons to the predecessors or to a
   rival is a real and dangerous trade
2. **Arms can be bought from the Company** at a price that climbs every year. A player who never built
   their own metalworks is buying the weapons for their own rebellion from the people they intend to
   rebel against, at a price those people set
3. **Horses breed**, which makes mounted troops the renewable arm, and they also pull haulers, so cavalry
   competes with haulage

---

## 3. The roster, kept short

| Unit | Made from | Attack | Defence | Moves |
|---|---|---|---|---|
| Colonist | — | — | 1 | 1 |
| Militia | colonist + 15 Arms | 3 | 3 | 1 |
| Outrider | militia + 10 Horses | 5 | 5 | 3 |
| Battery | 30 Arms | 10 vs settlements, 2 in open | **8** in a settlement, 2 in open | 1 |
| Improver | colonist + 10 Tooling | — | 1 | 1 |

**Batteries have separate attack and defence values**, because a gun crew assaulting a position and a
gun crew serving a fixed emplacement are not the same thing. This is what keeps a fortified settlement
expensive rather than impossible.

**Derivation of equipment costs:** arming a colonist should cost roughly four to five turns of one
armourer's output, which makes a force of thirty a genuine industrial undertaking rather than a
purchase.

Quality tiers apply to militia and outriders: **raw, hardened, sworn.** Each step adds 2. Sworn is only
reachable after the declaration, per section 8.

The Company's own troops sit above this: regulars at 8, horse at 10, siege train at 12 attacking and 3
in the open, which mirrors the player's batteries exactly.

---

## 4. Combat is best of three exchanges

**The original's single roll is the part that has aged worst and should not be reproduced.**

- A battle resolves as **three exchanges**, each won with probability A over A plus D, using effective
  strengths after all modifiers
- **Winning two of three wins the battle**

Four against two goes from 67 per cent in a single roll to 74 per cent over three. Six against two goes
from 75 to 84. The stronger force wins more reliably, upsets still happen, and nobody loses a veteran
force to a farmhand as often as they currently do.

**Mounted units may decline an engagement against foot**, because they have the movement to disengage.

---

## 5. Units degrade, they do not die

**Outrider → Militia → Colonist → captured.** Each defeat strips one layer of equipment. The horses and
the arms are lost, not the person.

**A Battery becomes a Damaged Battery, permanently.** It is never repaired. **This applies to the
Company's siege train exactly as it applies to the player's batteries.**

**Outriders are renewable and batteries are consumable.** A beaten outrider walks home and is
re-equipped from a breeding herd. A damaged battery is thirty Arms written off forever.

**Winners never degrade.** A battery that repels an assault is unharmed and repels the next one.

---

## 6. Batteries cut both ways

- **In open country a Battery is at 2.** It can lose to unarmed colonists and it should
- **The open penalty does not apply** when it attacks a settlement, or when it defends one
- It moves 1, so it cannot escape anything

Outriders do all the fighting in the open and absorb every loss, because their losses are refundable.
Batteries are spent only on walls, and kept behind your own.

**The Company's siege train obeys the same rule**, which is what makes section 11's sally work.

---

## 7. Fortification is capacity, not just a multiplier

**This is the correction in version 7.** A multiplier alone cannot balance an unlimited stack: at any
per-unit value, unlimited batteries is an unlimited wall. So fortification bounds the defence in three
ways at once.

| Works | Multiplier | Garrison capacity | Of which batteries |
|---|---|---|---|
| None | ×1 | 2 | 0 |
| Palisade | ×1.5 | 3 | 1 |
| Redoubt | ×2.25 | 5 | 2 |
| Bastion | ×3 | 8 | 3 |

**Capacity is enforced at all times.** Units beyond it cannot be stationed inside and must stand in the
open, where ambush applies and where they belong. This removes the degenerate strategy of hiding an
entire army behind one wall.

**Defenders are engaged one at a time, strongest first.** A settlement falls only when nothing armed
remains in it.

### What a bastion actually costs to take

| Attacker | Against a Battery at 24 | Wins about |
|---|---|---|
| Company regular, 8 | 8 against 24 | 16% |
| Company horse, 10 | 10 against 24 | 21% |
| Company siege train, 12 | 12 against 24 | 26% |

A full bastion is three batteries and five militia. **Taking it costs the Company something in the
order of a dozen units**, none of which it can replace. Against a finite fleet, three or four such
settlements is the whole expedition. That is the mauling, and it is now bounded rather than infinite.

### Why the muster works only behind walls

| Defender | Effective | Company regular at 8 wins |
|---|---|---|
| Raw militia, open ground | 3 | about 85% |
| Raw militia, palisade | 4.5 | about 70% |
| Raw militia, redoubt | 6.75 | about 57% |
| **Raw militia, bastion** | **9** | **about 45%** |
| Hardened militia, bastion | 15 | about 26% |

Only the bastion row sits on the right side of even. **The muster and the fortification programme are
one strategy.**

### Ambush

When attacking Company regulars in open country, the terrain's defensive bonus becomes a bonus for the
attacker instead. The settlers fight in the timber and the broken ground; the Company wants a clear
field and a firing line. This is what makes sallying viable, per section 11.

---

## 8. Promotion

Winning a battle gives a chance of promotion up the quality ladder.

- **Raw to hardened** happens throughout the game
- **Hardened to sworn** only after the declaration

Sworn is the reward for having veterans alive when you declare.

---

## 9. Anchorages, which make the coast readable

Not every coastal tile can take a landing. **The map generates a limited number of anchorages**, fixed
at generation and deterministic from the seed, visible once the coast is explored. A fleet can only put
troops ashore at an anchorage.

1. **Coastal geography becomes readable for defensibility from turn one.** A settlement covering one
   anchorage is defensible; one exposed to three is not
2. **Fortification becomes an optimisation rather than a guess.** You cannot cover them all
3. **Capture on landing applies to the landing tiles**, not the entire coast
4. **Blockades sit at anchorages too**

The player's own arrival uses an anchorage, as do the rival charters'. **Generator note:** anchorage
count and spacing scale with map size and coastline length.

---

## 10. The declaration, and the six turns that follow

### Nothing is confiscated by surprise

**The Company keeps only what it already holds:** goods consigned and not yet paid for, and payment in
transit. Your hulls, warehouses, buildings and goods are yours.

### The window is six turns, and the muster is what it is for

A bastion cannot be built in six months, so **fortification is a strategic decision made decades
earlier** and the window is for the fast things only.

- **Arming is immediate if the Arms are held.** The stockpile is the army
- **A mass muster produces raw militia only.** Quality is earned in battle, never bought
- **Every colonist armed is a colonist not producing**, while the blockade is already squeezing
- **Armed colonists still eat**, so granaries matter before the war
- **Demobilisation reverses it.** Strip the arms and they return to work
- **Garrison capacity caps what can be stationed inside**, so a large muster necessarily produces a
  field army as well as a garrison

### The preparation sheet

Fleet size and composition, how many colonists could be armed from Arms held, every anchorage with its
works and covering settlement, your shipping, and what you would forfeit by declaring this turn.

**It does not and cannot show where the fleet will land.**

### The fleet is always visible, always

Size and composition are shown at all times, and grow with accumulated grievance. The player watches
the force they are arming get larger and chooses their moment against a number they can see.

### Where it lands is genuinely unknown

**Each wave picks its anchorage at random, independently.** No weighting, no telegraph, no pattern.

### Three turns at sea, narrowing

**A fleet is visible for three turns before it lands**, for every wave.

- **Turn one.** Its heading rules out roughly half the coast
- **Turn two.** The plausible anchorages narrow to a handful
- **Turn three.** You can see which stretch of coast, not reliably which anchorage

This is exactly why outriders move 3 and militia move 1.

### The randomness must not be reproducible

| | Source | Persisted | Examples |
|---|---|---|---|
| **World randomness** | The world seed | Yes. Deterministic and versioned | Terrain, resources, anchorage placement, gold reserves |
| **Play randomness** | A stream that is not persisted | No. Fresh on every load | Combat exchanges, landing selection, price jitter |

A player reloading from before the declaration gets a **genuinely different war**. World randomness is
untouched, so a shared seed is still a shared world.

**Accepted consequence:** save-scumming becomes possible during the war, consistent with section 6 of
the persistence brief. **This rule also belongs in the persistence brief.**

---

## 11. The war itself

**You win by destroying the recall fleet.** Not by surviving a timer.

**The fleet is finite and never replenishes.** Every unit it loses is permanently gone from a pool the
player can watch shrinking.

### Why the Company does not simply send something better

**Added 21 August 2026, and it is the answer the design needed.** The Company crosses between worlds.
It could arm an expedition far beyond anything Fairholm can field.

**It is limited by tonnage, not by technology.** The crossing is marginal, per section 6 of the setting
brief, so what arrives is what is worth the freight: bodies, small arms, horses, and a siege train
assembled from what can be carried. Everything heavy stays home.

That is why the war is winnable by a colony that makes its own rope and iron, and it is a better reason
than any invented for the purpose. It also explains, without further argument, why the fleet cannot be
replaced once it is spent.

Four mechanisms keep it dangerous:

- **The fleet scales hard against grievance.** The single most important balance number in the game
- **It arrives in waves at independently chosen anchorages**, each preceded by three turns of approach
- **It blockades**, so the economy is strained throughout
- **Units on a landing tile when a wave arrives are captured.** Coastal batteries fire on adjacent
  hostile ships automatically

### Siege trains breach, so walls delay rather than prevent

**A Company siege train adjacent to a settlement accumulates breach progress each turn. At the
threshold, the fortification drops one tier.**

- Capacity drops with it, and **the excess garrison is pushed into the open**, which surfaces as a
  queue item. The walls breaking and your men finding themselves in a field is a dramatic beat, not a
  bookkeeping one
- Bastion becomes redoubt becomes palisade becomes nothing
- Rebuilding a tier during a siege is not possible, per the six-turn logic in section 10

This is what stops a fortified country being a permanent answer, and it is what real sieges did.

### The sally, and why it is the answer

A besieging siege train sits in the open at 3. **It is nearly helpless there**, exactly as the player's
batteries are.

So the loop is:

1. They land and besiege. Waiting now loses, because the works are being reduced
2. **You sally to kill the guns.** A sworn outrider at 9 against a siege train at 3 in the open wins
   roughly 84 per cent
3. So **they must screen the guns with regulars**, who defend at 8
4. So **you must get through the screen**, which needs good troops on good ground. A sworn outrider
   attacking regulars in broken country with ambush flipping the terrain bonus wins about 69 per cent;
   a raw one does not

**This is the artillery-and-cavalry doctrine from section 6 being played against you from the other
side**, and it turns the final war into a siege game rather than a wall.

### Why turtling does not win

- **The win condition is destruction, not survival**
- **The blockade strangles the economy** for as long as you wait
- **Breaching means the walls are a clock**, not a wall

**So the works stop you losing and the outriders win the war.** Sworn units only exist after declaring
and only from surviving veterans, so the army that finishes the fleet is the one you kept alive through
forty years of skirmishing.

---

## 12. Foreign intervention

The original brings a foreign power in on the player's side once enough bells are produced during the
war. The structure is taken because it creates a live wartime trade-off.

### The trigger

**Intervention is bought with grievance produced during the war.**

Every colonist in a meeting house is a colonist not holding a wall, and that decision recurs every turn
of the fighting. Progress toward intervention is **visible**, exactly like the fleet.

### Who intervenes, and why

A rival Company. **Not out of solidarity, but because a weakened competitor is worth more than a
principle**, which is the only motive consistent with the fiction.

- A rival **at war with the player will not**
- A rival **at peace may**
- A rival that **has itself declared** is the likeliest

### What they bring

**Ships first, troops second.** Breaking the blockade restores the economy that is actually strangling
the player.

### Why this is the right shape

The endgame becomes a three-way question: arm more people, produce more grievance to buy help, or push
out and kill the fleet yourself. All three compete for the same scarce colonists, which is the game's
central tension surviving into its final act.

---

## 13. Garrisons, standing orders and the queue

Military units hold standing orders per section 4 of the queue brief: garrison, screen, patrol, escort,
reserve. **Automation never fights**, so any unit that makes contact reverts to manual immediately.

- **Group by front, not by skirmish.** "Four settlements on the western coast are threatened" is one
  item that opens a list
- **A garrison under orders does not ask.** It defends. It surfaces only if it is losing, if the
  settlement is about to fall, or **if the works have been breached and the garrison is over capacity**
- **A fleet sighted at sea is one type 2 item**, repeating on each of the three approach turns because
  the information changes

---

## 14. Where this departs from the original, and why

1. **Metal branches into Tooling and Arms.** Section 2
2. **Batteries have separate attack and defence values.** Section 3
3. **Best of three exchanges rather than a single roll.** Section 4
4. **Fortification sets garrison capacity and battery slots, not only a multiplier.** Section 7. The
   original allows an unlimited stack, which is unbalanceable
5. **Siege trains breach the works over time.** Section 11
6. **Anchorages.** Section 9
7. **No surprise confiscation, and a six-turn window whose purpose is the muster.** Section 10
8. **Landings are randomly chosen per wave and not persisted in the save.** Section 10
9. **Three turns of visible, progressively narrowing approach.** Section 10
10. **The fleet is finite and visibly shrinking.** Section 11
11. **Different strength scale entirely.** Per section 8.3

---

## 15. What must be tuned by playing

- Every strength value and every equipment cost
- **Garrison capacities and battery slots per tier.** These now carry the whole balance of the siege
  and are more important than the multipliers
- **Breach rate.** Too fast and works are pointless; too slow and the sally loop never triggers
- The number of exchanges. Three is a starting value
- **The fleet growth curve, the six-turn window, the anchorage count, the three-turn approach and the
  breach rate, tuned jointly.** One balance problem wearing five hats
- Wave size and interval
- How much the approach narrows per turn
- **The grievance cost of intervention**, which decides whether it is a genuine option or decoration
- Whether promotion rates make veterans feel earned or inevitable

---

## 16. If something here is wrong

Say so rather than working around it.

Four positions have already been corrected across versions and should not be reintroduced: folding Arms
into Tooling, replacing annihilation with an endurance timer, telegraphing the landing site, and
allowing an unbounded stack of batteries behind a bastion.

The riskiest remaining claim is that the breach-and-sally loop in section 11 produces an interesting
siege rather than a chore. It is the newest mechanism here and the least examined. The cheap test is to
set up an artificial siege in the prototype and play it three times.

The second riskiest is the narrowing curve in section 10, which is the difference between random
landings feeling fair and feeling arbitrary.
