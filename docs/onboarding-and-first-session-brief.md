# Onboarding and the first session

**Changed 4 October 2026, for movement again.** Hold to plot and then tap to go did not work on a
phone. Movement is one gesture: hold where you want to go, and let go to set off (feel brief section
4). The lander's queue item in section 4.6 and the sentences in sections 2 and 6 teach it that way.

**Changed 2 October 2026, for movement.** A hold now plots a course and moves nothing; a tap on the
course's end, or Go, sails it (feel brief section 4). The lander's queue item teaches the hold that
way, in section 4.6, and the sentences in sections 2 and 6 that said a hold sails, or named a compass
in the lander's sheet, say so instead.

**Changed 2 October 2026.** The voyage is quicker. The lander sails six tiles a turn and sees three,
land is in sight within the first move or two, and the turns before founding are spent comparing
ground along the coast. One hold sails a whole move, drawn travelling with the fog lifting and the
view following. Sections 2, 5, 6 and 12 say so.

**Changed 1 October 2026.** The three landing sites are gone, and so are anchorages. The game now opens
at sea, in fog, with nothing known: you sail until you sight land and choose your own ground, which is
the opening the original is loved for, and a settlement may be founded almost anywhere.

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

**The game opens at sea, in fog.** The page loads into fog at working zoom, centred on the lander
settling at splashdown. The world was generated from a seed while the page loaded, and none of it is
known yet. You are already here, and you do not know where here is.

**The specific image, settled 1 October 2026**, per section 7 of the setting brief:

- **The lander is settling at splashdown.** A mark on the water, a plume rising, a little open sea
  around it and haze beyond. Nothing else is shown because nothing else is known
- **Five lines fade in over that shot**, one at a time, about two seconds apart, in the theme's display
  type, legible over the haze. They never block input and they are never a separate screen
- **The first tap anywhere dismisses them and starts the music**
- **Then you sail until you sight land, and look for your ground.** The lander moves wherever boats can
  go, open water and major rivers, six tiles a turn, and sees three tiles around it. It comes down out
  of sight of land but near enough that sailing in any sensible direction sights land within the first
  move or two. Hold a destination and the course there shows, moving nothing; let go and the lander
  sails it, as far as it gets this turn, drawn travelling with the fog lifting along the way and the
  view following. A destination off the screen is reached by panning to it, or by holding
  at a wider zoom. A course through water nobody has seen stops at any coast it meets. Where you go ashore is up to you: beach the lander beside any
  land tile that is not mountain and not too close to someone else's settlement, and everyone aboard
  becomes the settlement

There is no landing-site chooser and nothing is offered. You find your ground by sailing to it.

The five lines, exactly:

> *The first ship took a hundred years to reach this world.*
>
> *Its people found Bloom, a flower that grows nowhere else.*
>
> *From it they made cores, and cores cut the crossing to eight months.*
>
> *Then they went silent, and the cores stopped coming.*
>
> *The Company has sent you to start again. No one is waiting.*

That shot and those five sentences are the whole of the exposition: you came from somewhere else, you
arrived on the water, you know nothing of what is here, and where you go ashore is up to you. It is
also cheap to render, being a mark, a plume, a little water and haze.

Four things that opening does:

1. It is beautiful immediately, which is the only argument the first ten seconds can make. Fog, a
   plume and a little water, with five quiet lines over them
2. The first decision is real and consequential, which is the promise the rest of the game keeps. It
   comes after the voyage rather than before it: you sail until land is sighted, you choose your own
   ground, and that ground decides what you can be
3. It teaches the core interaction, which is tapping the map. The first tap dismisses the lines, and it
   is the gesture that unlocks audio and begins fetching the first track, per section 6 of the feel
   brief. The taps after it move the lander
4. **It plants the central idea before land is in sight**: nothing is known until you go and look,
   and this ground is not that ground. What the fog gives up will decide what you can be

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

The first of them is the lander's, and it teaches the hold as showing a course and the release as
sailing it:

> *Tap the lander, then press and hold where you want to go. The course shows while you hold, and
> nothing moves yet; let go to sail.*

That is a tutorial step and a queue item at once, and it costs nothing to build. From the seventh item
the wording reverts to normal.

### 4.5 The first mistake is allowed to happen

**The dumping lesson only works if you dump.** The game must not prevent it, warn about it, or soften
it. Let the price fall, then make the consequence legible in the dispatch.

Every important lesson in this game is a felt one. Anything the player is told instead of shown is a
lesson they will not retain past the next screen.

---

## 5. The curriculum

Roughly, on a small map. Triggers, not turns; the turns are indicative, and they count from founding,
not from turn one. The few turns of sailing and choosing before the first settlement sit outside the
table.

| Phase | Goods visible | What is introduced |
|---|---|---|
| Arrival, ~turns 1 to 10 | 2 | Tapping the map, assigning a worker, the build order |
| First trade, ~10 to 25 | 3 | The Company market, freight time, consignment |
| First lesson, ~25 to 50 | 5 | **Dumping.** Then refining, and that raw caps low while refined does not |
| Expansion, ~50 to 90 | 8 | A second settlement, standing orders, the queue fold, haulage, horses |
| Pressure, ~90 to 140 | 12 | The first Company demand, embargo, the predecessors, grievance |
| The world, ~140 to 220 | 18 | Rivals, arms, signatories, buy or build |
| The end, 220 on | 18 | The fleet becomes visible, fortification starts to matter |

**The critical window is the first fifty turns after founding**, roughly twenty to thirty minutes,
because that is where dumping is learned. Everything before it exists to get the player there still
interested.

---

## 6. The five-minute loop

Before any of that, the opening must contain one complete satisfying loop, achievable in five minutes.

**Sail, sight land, choose, found, assign, build.** Sail through fog until the coast comes into view,
run along it comparing ground, beach the lander where you choose, assign two colonists, watch food and
timber accumulate, build the first thing, see the settlement change.

The five minutes count from founding, as the curriculum does. The voyage before it is quick, and it is
the first pleasure rather than a cost: land is in sight within a move or two, a move is a hold on a
destination and a release, and the fog lifting along the lander's way is its own
reward.

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
| **New player** | Section 2. The fog opening, no settings, gentlest defaults |
| **Returning player** | The return screen from section 9 of the interaction brief. Intent, what moved, three things needing them. **Never onboarding** |
| **Shared seed link** | That world, that splashdown. A shared seed gives the same world and the same splashdown; where you go ashore is still yours. Show whatever the sharer said about it |

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

**A single persistent line states the current objective**, from turn one. Early it is concrete: find
land, then get this settlement fed. Later it is the real one: you owe the Company for your passage, and
you intend to stop owing them.

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
- Whether the voyage is the right length. A lander that sails six tiles a turn and sees three, from a
  splashdown out of sight of land but within a move or two of it, is the starting point; whether that
  leaves the right few turns for comparing sites is what to watch
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
