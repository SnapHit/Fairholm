# Onboarding and the first session

Written 21 August 2026. Self-contained. Companion to all existing briefs, and particularly the turn,
queue and standing orders brief, whose machinery this reuses almost entirely.

**Purpose: specify the first thirty seconds and the first hour.** Every other document in this project
describes a player who has already committed. This one decides whether they do.

**Why it matters more here than usual.** Self-hosted browser game, arriving cold from a listing page or
a shared link, on a phone, with no install, no account and no manual. One shot. The original solves
this with a printed manual and that option does not exist.

---

## 1. These are two different problems

They have different failure modes, different time scales and different solutions. Conflating them is
the usual mistake.

| | The hook | The teach |
|---|---|---|
| Duration | Thirty seconds | The first hour |
| Failure mode | They close the tab | They stop understanding and drift away |
| Solution | Something beautiful and one obvious choice | Progressive disclosure |
| Measured by | Bounce | Turn-number drop-off |

---

## 2. The hook: the first thirty seconds

### What must not happen

- No title screen that has to be dismissed before anything is visible
- No account, no cookie banner, no orientation prompt, no install prompt
- No settings screen blocking the way
- No lore, no text wall, no "would you like a tutorial?"

### What happens instead

**The game opens mid-arrival.** The camera is on a coastline that was generated from a seed while the
page loaded. You are already here.

**The specific image, settled 22 August 2026**, per section 7 of the setting brief:

- **Offshore, a lander is down and steaming.** A mark on the water and a plume
- **A boat has come off it and is making for the coast**, with a wake
- **Three candidate landing sites are offered**, each with one line of plain characterisation: good
  timber and poor ore, sheltered but thin ground, open country with a river
- **One tap chooses**, and the boat goes there

That single image explains the entire arrangement without a word of exposition: you came from
somewhere else, you arrived on the water, and where you go ashore is up to you. It is also cheap to
render, being a mark, a plume, a boat and a wake.

Four things that single interaction does:

1. It is beautiful immediately, which is the only argument the first ten seconds can make
2. The first decision is real and consequential, which is the promise the rest of the game keeps
3. It teaches the core interaction, which is tapping the map, and it is the gesture that unlocks audio
   and begins fetching the first track, per section 6 of the feel brief
4. **It plants the central idea in fifteen seconds**: this ground is not that ground, and that will
   decide what you can be

Generation settings live behind a *customise* affordance for anyone who wants them, and default
sensibly for everyone else. Returning players get their last settings.

---

## 3. The teach: the queue is already a tutorial engine

**This is the finding that makes the rest cheap.**

The game already pushes at most eight ranked decisions per turn and can push exactly one. In the
opening it pushes one per turn, and each one is the first instance of a system. That is progressive
disclosure with no new machinery: it needs a ranking tweak and an unlock schedule, nothing more.

**The systems also have a natural dependency order that matches the economic arc.** You cannot need a
market before you have goods, standing orders before you have two settlements, or grievance before you
are thinking about leaving. The game's own progression is the teaching order, already written.

---

## 4. The six mechanisms

### 4.1 The interface only ever shows what exists

**The single biggest lever in this document.** A good, a building or a mechanic that has not unlocked
does not appear anywhere: not greyed out, not in a list, not in a tooltip.

The market sheet has four rows in the first hour and eighteen in the sixth. **Nobody is ever confronted
with eighteen goods.** The same applies to buildings, unit types, standing order rules and the
generation settings.

### 4.2 Unlocks are triggered, not scheduled

Turn-based unlocks would fight the design, because the map is supposed to decide what you can be. So
**every unlock has a trigger, with a turn number only as a backstop** so a passive player does not
stall.

- A refinery unlocks when you hold enough of its crop to want one
- Standing orders unlock when you found a second settlement
- Grievance becomes visible when a settlement reaches a size where its temper matters
- The Company market unlocks when you have something worth freighting

A fast player gets everything sooner. A player whose map has no ore never meets metalworking until
they go and find some, which is correct.

### 4.3 One sentence, once

The first time a system appears, **the queue item carries a single line of explanation.** Not an
overlay, not a modal, not a sequence. One line, in the item that needs the decision anyway.

> *Your first consignment. The Company pays for what you ship, and pays less the more of it you send.*

Then never again. This is the cheapest possible teaching and it costs no new surface.

### 4.4 The dispatch is the manual

Everything that happens is logged with its reason. A player wondering why a price fell, why a
settlement stopped producing, or why the predecessors refused them can look it up.

That replaces a help system entirely, and the dispatch exists already.

### 4.6 The tutorial is a tone, not a mode

**There is no tutorial mode and there will not be one.** It is content to build and maintain, it delays
the real game, most players skip it, and on a phone an overlay eats the screen the game needs.

The queue already presents exactly one decision at a time, which is a guided sequence in everything but
wording. **So the tutorial is the wording of the first six queue items.**

> *Put someone to work on a tile near the landing.*

That is a tutorial step and a queue item at once, and it costs nothing to build. From the seventh item
the wording reverts to normal.

### 4.5 The first mistake is allowed to happen

**The dumping lesson only works if you dump.** The game must not prevent it, warn about it, or soften
it. Let the price fall, then make the consequence legible in the dispatch.

Every important lesson in this game is a felt one. Anything the player is told instead of shown is a
lesson they will not retain past the next screen.

---

## 5. The curriculum

Roughly, on a small map. Triggers, not turns; the turns are indicative.

| Phase | Goods visible | What is introduced |
|---|---|---|
| Arrival, ~turns 1 to 10 | 2 | Tapping the map, assigning a worker, the build order |
| First trade, ~10 to 25 | 3 | The Company market, freight time, consignment |
| First lesson, ~25 to 50 | 5 | **Dumping.** Then refining, and that raw caps low while refined does not |
| Expansion, ~50 to 90 | 8 | A second settlement, standing orders, the queue fold, haulage, horses |
| Pressure, ~90 to 140 | 12 | The first Company demand, embargo, the predecessors, grievance |
| The world, ~140 to 220 | 18 | Rivals, arms, signatories, buy or build |
| The end, 220 on | 18 | The fleet becomes visible, fortification starts to matter |

**The critical window is the first fifty turns**, roughly twenty to thirty minutes, because that is
where dumping is learned. Everything before it exists to get the player there still interested.

---

## 6. The five-minute loop

Before any of that, the opening must contain one complete satisfying loop, achievable in five minutes.

**Land, assign two colonists, watch food and timber accumulate, build the first thing, see the
settlement change.**

That requires early turns to be genuinely fast, five to ten seconds each, which the one-decision queue
already delivers. It also requires the settlement to visibly change when something is built, which the
industrial arc in section 6 of the setting brief provides for free.

---

## 7. Reference and recovery

**The gap that progressive disclosure leaves.** One sentence, once, has nowhere to go if the player
missed it, forgot it, or came back after a fortnight. The dispatch records what happened, not how
anything works. A player at turn two hundred who has forgotten what resolve is currently has no way to
find out.

Three things fill it, none of them a tutorial, and all of them cheap.

### 7.1 Every term is tappable

Any noun in the interface opens **two sentences and the current state of that thing.**

> *Resolve: the share of this settlement's people who would break with the Company. Rises with
> grievance. Currently 34 per cent.*

It is a data file, it costs no screen space until asked for, and it serves the cold player and the
forgetful one identically. **This is the single most valuable thing in this section** and it should be
built alongside the sheets rather than after them.

### 7.2 A "why" on anything that moved

The dispatch says what happened. A **why** affordance on a changed number says what caused it: the
price fell because a rival dumped, the settlement stopped producing because an input ran out, the
predecessors refused because the same good was offered twice.

This is the recovery mechanism the dispatch cannot provide, because a log is chronological and a cause
is not.

### 7.3 One "how to play" screen

In the menu, **never shown unprompted**. One screenful, not a manual: what you are trying to do, what a
turn is, and what the queue is. Anything longer will not be read.

### The honest limit

None of this helps a player who will not read anything at all. **The only defence against that is the
five-minute loop in section 6 being satisfying without comprehension.** You land, you tap, things grow.
That has to work on its own merits, and drop-off by turn number is what will show whether it does.

---

## 8. Three arrivals, three different treatments

| Arrival | Treatment |
|---|---|
| **New player** | Section 2. Three landing sites, no settings, gentlest defaults |
| **Returning player** | The return screen from section 9 of the interaction brief. Intent, what moved, three things needing them. **Never onboarding** |
| **Shared seed link** | That world, that landing. Skip the site choice, since the point is the specific map. Show whatever the sharer said about it |

Conflating the first two is the common failure and it insults returning players.

---

## 9. First-game defaults

- **Small map**, so a first game is 300 turns and six to eight hours and can actually be finished. A
  player who completes one is a player for good
- **Gentlest difficulty**, applied silently. No prompt, no menu, no announcement
- **Full settings offered from the second game onward**, when the vocabulary means something

---

## 10. The objective line

The failure specific to strategy games is not misunderstanding a mechanic. It is not knowing what you
are supposed to be doing.

**A single persistent line states the current objective**, from turn one. Early it is concrete: get
this settlement fed. Later it is the real one: you owe the Company for your passage, and you intend to
stop owing them.

The setting supplies this for nothing. It uses the same surface as the return screen's intent line, so
it costs no new interface.

---

## 11. Instrumentation, because this cannot be reasoned about

Onboarding is the one system where designer intuition is worthless and the data is cheap.

Measure, anonymously and with no accounts:

- **Drop-off by turn number.** The single most valuable number in the project
- Time to first consignment
- Time to second settlement
- Proportion reaching turns 30, 100 and 300
- Whether the queue fold is ever opened, and when

Anonymous counters only, so the privacy notice stays at a paragraph per section 6 of the persistence
brief.

---

## 12. What must be tuned by playing, and by watching

- **Whether twenty to thirty minutes to the dumping lesson is too long.** This is the biggest open risk
  in the document. It may need to arrive by turn fifteen
- The trigger thresholds for every unlock
- Whether three landing sites is the right number, or two, or five
- Whether the one-sentence explanations are read at all, which the drop-off curve will imply
- Whether the tappable glossary in section 7.1 is used, which is worth counting because it is cheap to
  instrument and it says a great deal about whether the teaching is landing
- Whether a small map is the right first game or whether it should be smaller still

---

## 13. If something here is wrong

Say so rather than working around it.

Section 7 was added after the fact, when the question was raised of what happens to a player who
stumbles across the game cold. The conclusion was that progressive disclosure handles the teaching but
leaves no reference layer, which is a real gap that a tutorial mode would have filled badly.

The riskiest claim is section 5's pacing. Twenty to thirty minutes before the first real strategic
lesson is a long hook for a browser game arriving cold from a listing page, and it is defended only by
the five-minute loop in section 6 holding attention until then. If the drop-off curve shows people
leaving around turn ten, the answer is to bring the first consignment and the first price fall much
earlier, even at the cost of realism about how fast a colony could actually produce anything.

The second riskiest is that one sentence, once, is enough teaching for systems as interlocking as the
market and standing orders. The fallback is not more sentences. It is the dispatch, which should be
made more prominent rather than made longer.
