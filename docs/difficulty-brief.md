# Difficulty brief

Written 21 August 2026. Self-contained. Companion to the setting and fiction brief, the rival charters
brief, the military and revolution brief, the colonists and labour brief and the onboarding brief, all
of which reference difficulty without ever defining it.

**Purpose: define difficulty as a system, because four documents already depend on it.** The unresolved
penalty threshold, rival expansion rate, whether rivals may declare independence, and the onboarding
brief's "gentlest difficulty applied silently" all point at something that does not yet exist.

---

## 1. Difficulty is the charter you signed

**The fiction supplies the entire design.** Section 4 of the setting brief establishes that the Company
financed the passage and that the debt is the tax. So difficulty is simply **how good a deal you got**.

Four levels, named for the terms rather than for the player:

- **Generous charter**
- **Standard charter**
- **Hard charter**
- **Punitive charter**

This is worth more than a naming convention. It means every number that changes has a stated reason
inside the world, so a harder game is not an opaque multiplier, it is a worse bargain. It also means
difficulty scales precisely the four ratchets in section 5 of the setting brief, which is exactly what
difficulty in this game should be scaling.

---

## 2. Difficulty changes the terms. It never changes the rules.

**The governing principle, and the one most worth defending.**

Changed by difficulty: the Company's charge and how fast it rises, how fast the recall fleet grows,
how quickly rivals expand, how easily the predecessors take offence, how much a settlement tolerates
before its unresolved population drags on production, how readily settlers come.

**Never changed by difficulty:**

- **Combat mathematics.** No hidden modifiers for the Company or for rivals at any level. Best of three
  exchanges, identical for everyone. Combat variance is already the mechanic most at risk of feeling
  unfair, and secret dice would make it indefensible
- **Map generation quality.** Every invariant in section 8 of the economy brief holds at every level. A
  punitive charter does not mean a worse map
- **The queue budget.** Eight items, always
- **The predecessors' rules.** Their preferences, their anti-repetition rule, their skills and their
  transaction cap are the same at every level. Only their patience changes

---

## 3. The bundle

Starting values, all tunable, all in the single named constants block.

| | Generous | Standard | Hard | Punitive |
|---|---|---|---|---|
| Starting colonists | 5 | 3 | 3 | 2 |
| Opening charge on consignments | 3% | 5% | 8% | 12% |
| Charge rise per accepted demand | +2 | +3 | +4 | +5 |
| Turns between demands | 50 | 40 | 32 | 25 |
| **Grievance to fleet multiplier** | **0.6×** | **1.0×** | **1.5×** | **2.2×** |
| Unresolved penalty threshold | 8 | 6 | 5 | 4 |
| Rival expansion rate | 0.7× | 1.0× | 1.3× | 1.6× |
| **Rivals may declare independence** | no | no | **yes** | **yes** |
| Predecessor alarm sensitivity | 0.7× | 1.0× | 1.3× | 1.6× |
| Word per unit of consigned value | 1 per 8 | 1 per 10 | 1 per 13 | 1 per 16 |
| Market price recovery rate | 1.3× | 1.0× | 0.8× | 0.6× |

**The fleet multiplier is the important row.** Section 15 of the military brief already identifies the
grievance-to-fleet curve as the single most important balance number in the game, and difficulty is
where it lives.

Every line has a reason in the fiction. A punitive charter means the Company advanced you less, charges
you more, demands more often, watches you more closely, and is quicker to send for you.

---

## 4. What is deliberately not in the bundle

**Resource abundance and map size are generation settings, not difficulty settings.** They already
exist in section 8 of the economy brief and they are chosen separately.

Keeping them apart matters. If abundance were also on the difficulty dial, two controls would fight
each other and neither would mean anything. As it stands the player can choose a sparse map on a
generous charter, or a rich one on a punitive charter, and those are genuinely different games rather
than two points on one line.

---

## 5. Changing it mid-game

**You may lower the difficulty at any time. Raising it requires a new game.**

This is the humane arrangement for a ten to fifteen hour game where someone may discover in hour four
that they have taken on too much. There is no score to protect, so nothing is cheapened by it.

Raising is disallowed for a mechanical reason rather than a moral one: the fleet scales on cumulative
grievance multiplied by the difficulty factor, and applying a higher factor retroactively to grievance
produced under easier terms produces either an exploit or an unfair spike, depending on which way it
is implemented. Not worth the complexity.

**Lowering is recorded in the dispatch and nowhere else.** No warning, no confirmation beyond the
usual, no commentary.

---

## 6. Onboarding

Per section 8 of the onboarding brief, a first game runs on a **generous charter, applied silently**.
No prompt, no menu, no announcement.

Full choice appears from the second game, when the vocabulary means something. A player who has
finished one game knows what a demand is and what the fleet looks like, and can choose accordingly.

---

## 7. What must be tuned by playing

- **The fleet multiplier row.** It carries most of the endgame difficulty and every value in it is a
  guess
- Whether four levels is the right number. Three may be enough; five is probably too many for a game
  with this much other configuration
- Whether the charge escalation at punitive is punishing or merely tedious, which is the difference
  between a hard game and an annoying one
- Whether rivals declaring independence at the top two levels is the interesting variable it looks
  like, or a source of runaway outcomes
- Whether starting with two colonists on a punitive charter is a real challenge or just a slow opening

---

## 8. If something here is wrong

Say so rather than working around it.

The weakest part is section 3, because it is eleven interacting multipliers set on paper, and the
interactions between them are where difficulty designs usually go wrong. In particular, a punitive
charter simultaneously slows immigration, raises the charge and accelerates the fleet, and those three
compound rather than add. It may prove far harder than intended and need flattening.

The second weakest is the claim in section 2 that combat is identical at every level. It is the right
principle and it should hold, but it means difficulty cannot be tuned in the one place players most
often expect it to be, so the other levers have to carry more.
