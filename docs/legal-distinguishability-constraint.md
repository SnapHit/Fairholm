# Legal distinguishability constraint

Version 2, written 21 August 2026. **Supersedes version 1 of the same date.** Self-contained. A new
conversation working from this needs no prior context.

**This is a guideline on the project, not a hard constraint.** It sits alongside the browser game
architecture brief and the Colonization mechanics brief. Where this document conflicts with a design
idea, the design idea wins.


---

## 1. The constraint in one sentence

**Take the systems, take the era, take none of the expression, and never let the product name the
original.**

The product is the game, its title, its domain, its metadata, its interface and its own marketing. A
separate editorial property is governed by section 8.6 instead, and the rules there are different.

---

## 2. What actually happened, and why it matters

A game called *1492 - Colonization of the New World* released on Steam on 25 April 2026 and its store
page was removed within days. The developers said Take-Two Interactive had sent a legal notice to
Valve about alleged IP concerns, and that they themselves were never contacted directly, so the matter
sat between Take-Two and the platform. Their position was that they had used only elements they
believed were in the public domain, and that Take-Two evidently disagreed. By mid-May they had renamed
the game to drop the word "Colonization" and had made interface changes, and the store page was still
down. Existing purchasers kept access.

Four things distinguished that project, and none of them were the mechanics:

1. The word "Colonization" in the title
2. A store description that opened by naming Sid Meier's Colonization as the timeless classic it was
   inspired by, and described itself as a faithful reimagining that preserved the original's depth
3. An interface close enough that changing it was part of the remediation
4. A paid product on a major storefront, where a takedown costs the complainant one email

**The enforcement mechanism was a platform, not a court.** Nobody had to prove anything. That is the
single most important fact in this document and it sets the standard everything else follows from.

Note what the failure actually was: **the product's own copy claimed descent.** That is a different
act from a third party writing about a category, which is section 8.6.

---

## 3. Control case one: FreeCol

FreeCol has existed since 2003. Its stated goal for version 1.0 was to be an almost exact clone, with
gameplay and rules the same as the original. It reached 1.0 twenty years in and shipped 1.2.0 in
October 2025. It has never been legally challenged.

It is **more** mechanically faithful than the game that got pulled. The differences are that it has
its own name, its own art, it is free, it is open source, and it does not sit on a storefront with a
legal department that would rather delist than argue.

**Conclusion: mechanical fidelity is not what draws fire.**

---

## 4. Control case two: the era is not owned

Commander: Conquest of the Americas, released in 2010, is an economic simulation of the 16th century
in which the player takes one of seven European nations and colonises North and South America, focused
on producing goods, shipping them to Europe and returning with settlers, with roughly thirty buildings
covering production and morale. It has native villages that supply raw materials when content and raid
when restless. It is still sold on Steam with DLC. Take-Two has never touched it.

Age of Empires III, Europa Universalis, Port Royale, Anno and Sid Meier's own Pirates! all occupy
overlapping ground. The Age of Sail, the Atlantic crossing, colonial production chains, rum, cigars,
furs, tobacco, taxes, viceroys and revolutions are history and are available to anyone.

**Conclusion: the historical setting is not the risk. The fingerprint is.**

---

## 5. What the law protects, in outline

- **Not protected:** game rules, systems, mechanics, procedures, methods of operation. This is
  explicit in US law and the position is materially similar in Australia, the UK and the EU. An
  economic model is a system
- **Protected:** art, text, music, code, and in some circumstances a distinctive overall look and feel
  where the specific expressive choices were copied
- **Trademark, separately:** names, titles and trade dress. This is the sharper weapon and the one
  actually used here

**Trademark law does not prohibit referring to a product by its name.** Both the US and Australia
allow referential use. In the US this is nominative fair use, from *New Kids on the Block v. News
America Publishing*: you may name a mark where the thing cannot readily be identified otherwise, use
no more of the mark than is necessary, and do nothing suggesting sponsorship or endorsement. In
Australia the same outcome arrives by a different route, because infringement requires use *as a trade
mark*, meaning as a badge of origin, and the Trade Marks Act 1995 provides express defences for good
faith descriptive use and for comparative advertising.

This is the doctrine every "games like X" page on the internet already relies on. It is ordinary. It is
also narrower than it looks, and it evaporates the moment the use implies association.

The practical point still stands for anything attached to the product: **the question is never "would
we win", it is "would this be flagged".**

---

## 6. The operative test

Before shipping any name, screen, string or asset **attached to the product**, apply this:

> **Would a junior lawyer doing a keyword sweep of new releases flag this in ten seconds?**

If yes, change it. Do not reason about whether the flag would survive scrutiny. The cost of being
wrong is the project disappearing, and the cost of being right is an argument nobody will pay to have.

A second, softer test for anything ambiguous:

> **Could this element have been arrived at independently by someone who had never played the 1994
> game?** If the honest answer is no, it came from them.

**Editorial content on a separate property is governed by a different test**, in section 8.6. Do not
apply the ten-second test there, because it would forbid ordinary, lawful writing.

---

## 7. Safe to take: the systems

These are the load-bearing mechanics identified in the mechanics brief. All are systems, all are
takeable, and all should be re-derived from first principles rather than transcribed.

- A market price that falls with cumulative volume sold and recovers when supply stops
- Raw materials refined into manufactured goods with a much higher price ceiling
- Population as the scarce resource, each unit assignable to exactly one job at a time
- A ratchet in which the distant authority's extraction rises over time while export prices fall
- Import prices that drift upward, pushing the player toward self-sufficiency
- Siege units that are consumable versus field units that are renewable
- A rebellion metric that gates the endgame and simultaneously arms the opponent
- A procedurally generated map whose shape decides which strategy is available
- Worker caps per building that force many settlements rather than one

---

## 8. Prohibited: the expression

### 8.1 Names and vocabulary

The invented terminology is the fingerprint. It is not history, it was coined for the 1994 game, and
it is instantly recognisable. **None of the following may appear anywhere in the product, the code,
the UI, the URL or any product-facing copy:**

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

Generic words remain available and should be used instead. Consignment, bulletin, petition, grievance,
muster, charter, dispatch, agent, hauler, works. None of these is owned by anyone.

**Note added 21 August 2026.** An earlier version of this list recommended a deliberately archaic
register, including factor, ropewalk, broadsheet and a transportee-to-freeholder labour ladder. That
was a fiction error rather than a legal one: the settlers come from a civilisation that crosses between
worlds and would not speak like Georgian colonists. The legal position is unchanged, since all those
words were and are unowned. See section 12 of the setting and fiction brief for the corrected register.

### 8.2 Interface and trade dress

**Corrected 23 August 2026, twice.** The earlier version forbade both a settlement screen with worked
tiles arranged in a ring and building slots shown with it. Both prohibitions were over-broad and both
are withdrawn, on different grounds.

**The ring is permitted, because it is geometry.** A settlement works its own tile plus the eight
around it, and a three by three grid is the only honest way to draw that. Section 5 states that
mechanics and methods of operation are not protected. Forbidding the ring would be like forbidding a
chess interface from drawing eight by eight.

**Buildings shown around the ring are permitted, on a weaker but sufficient ground.** A settlement has
tiles and buildings; both must be visible; putting them on one screen is obvious rather than inventive.
This is a closer call than the ring and it should be recorded as such.

### What remains forbidden

- **The original's specific composition and its proportions.** Not the idea of tiles and buildings
  together, but their particular arrangement, ordering and relative sizing
- **Its panel chrome, wooden dress, typeface pastiche and icon set**
- **Its goods bar treatment** along the bottom of the settlement screen
- No European port screen with a dock, a recruitment pool and a market list in that arrangement
- The art direction must be settled on its own terms per section 1 of the architecture brief, and the
  test is whether a screenshot placed beside the original reads as a different game at a glance

### The obligation this creates

Because two prohibitions have been withdrawn, **the difference has to be carried by the composition and
the style, and it has to be real rather than cosmetic.**

Portrait on a phone does much of the work automatically, since a landscape 320 by 200 composition
cannot survive being stacked into a narrow column. **That is helpful and it is not sufficient on its
own.** A recolour of their layout is still their layout.

**The distinction to hold on to: the mechanics are drawn honestly, the composition and the dress are
ours.**

**This subsection is now the part of this project that most warrants a solicitor's opinion**, and it is
worth taking before anything is published rather than after.

### 8.3 Constants and tables

Individual numbers are facts and are not protected. **A table of identical numbers is evidence.**

- Do not transcribe building costs, unit strengths, price bands, bell thresholds or equipment
  quantities from the 1994 data
- Derive constants from the target feel and the intended session length, then tune by playing
- Where a number happens to land on the same value, that is fine. Where a whole table does, rebuild it
- Specifically avoid the recognisable ones: 200 bells per colonist, 50 muskets, 50 horses, 100-unit
  cargo holds, three workers per building, the 100 / 200 / 300 warehouse ladder

### 8.4 Goods and chains

The four parallel two-step chains of sugar to rum, tobacco to cigars, cotton to cloth and furs to
coats are individually historical but collectively a signature. Break the pattern deliberately:

- Change the number of chains
- Vary the depth so they are not all uniform two-step conversions, which is also a design improvement
- Substitute at least one commodity for a different period-accurate one

### 8.5 The product's own copy, where the rule is absolute

**This is where the previous project was caught and it is the cheapest thing to get right.** Everything
in this subsection is a hard prohibition with no judgement involved.

The product means: the game itself, its title, its domain name, its repository name, its social
handles, its page titles, meta descriptions, keywords, structured data, in-game text, screenshots,
launch posts made in the project's own voice, and anything the developer says as the developer.

Within all of that:

- Never name Sid Meier, Colonization, MicroProse, Firaxis, 2K or Take-Two
- Never use "inspired by", "reimagining", "spiritual successor", "homage" or "tribute" in connection
  with any of the above
- No "if you liked X" framing, no comparison screenshots, no meta tags or keywords naming the original
- No domain name, repository name or social handle containing "col", "colony" or "colonization" as a
  wink
- No claim of association, endorsement, licence or continuity with anyone

Assume every public word here will be read by someone looking for a reason.

### 8.6 Editorial content on a separate property, where the rule is different

Version 1 of this document treated all public use of the original's name as prohibited. **That was too
absolute and it is corrected here.** Referential use is lawful and ordinary, and forbidding it would
close the only distribution channel where demand for this kind of game demonstrably exists. The RAWG,
gg.deals and CivFanatics pages that rank for these terms all operate on exactly this basis.

> **Commercial note added 21 August 2026, after the keyword research.** Everything below remains a
> correct statement of the law and of what is permitted. It is no longer a recommendation. The cluster
> this section was written to reach, "games like the original" and its variants, measures at roughly
> **forty searches a month worldwide**. Holding position one would earn about a dozen visits a month.
> The second legal risk surface this section opens therefore buys almost nothing, and the project can
> stay wholly inside the absolute prohibition in 8.5 at negligible cost. **Build the editorial property
> only if it is wanted for its own sake.** See the keyword research findings brief.

The distinction is between **the product claiming descent**, which is what got 1492 delisted, and **an
editorial property fairly covering a category**, which is what every recommendation site does.

Permitted, subject to every condition below:

- A separate domain, not the game's domain, with its own identity
- Genuinely editorial content that names many games, covers the category honestly, and would still be
  useful to a reader who never clicked through to this game
- Naming the original where naming it is necessary to write about the category at all
- Listing this game among others, positioned on merit, not top of every list

Conditions, all of which must hold:

1. **Separation.** The content property and the product are distinct sites on separate hosting. The
   product's own metadata stays clean per 8.5. Do not cross-contaminate by putting the original's name
   into the game's own keywords because an article ranks for it
2. **No implied association.** Nothing states or implies endorsement, licence, official status, sequel
   status or any relationship with the rights holders. "Inspired by" describing a category of games is
   ordinary language. "The official successor to" is a false association claim
3. **Only as much of the mark as is necessary.** Use the name in prose. Do not use their logo, their
   typeface, their box art or their interface chrome as decoration or as a header image
4. **Never place their screenshots beside this game's.** Even in a lawful editorial context this
   creates the single most useful exhibit anyone could want in a look and feel argument. This
   prohibition survives 8.6 unchanged
5. **Defensible claims only.** Every factual statement about the original should be true and
   verifiable. No disparagement, no invented history
6. **Fair positioning.** If this game tops a list it wrote about itself, the content is advertising
   wearing an editorial coat, and that is exactly the framing a complainant would use
7. **Disclose the interest.** A plain line noting the site's author made one of the games listed costs
   nothing and removes the deception argument entirely

The same logic extends to community spaces. Talking about the original in a forum where it is the
subject is ordinary participation. Turning up in that forum to promote a game as its successor is the
thing 8.5 forbids, and it also carries a social failure mode that no legal analysis addresses.

---

## 9. Where the risk actually concentrates

Self-hosting materially changes the shape of the risk and this was a deliberate project decision.

- There is no storefront to send a notice to. The complaint routes to a host, or to a domain
  registrar, or directly to the developer
- The DMCA covers copyright, not trademark, so the fastest available lever is narrower
- There is no revenue stream to point at as damages
- The trade-off is that self-hosting carries the whole distribution problem, which section 20 of the
  architecture brief already flags as the real question

**Consequence: the highest-risk artefact in this project is the product's public-facing copy, followed
by the art, followed by the vocabulary. The code and the economic model are the lowest risk.**

The editorial property in 8.6 is a second, separate risk surface. It is lower risk than the product,
because the conduct is lawful and commonplace, but it is not zero risk, because a complainant can
still send a notice to a host and force the argument. Keep it on separate hosting from the game so
that a complaint against one cannot take down the other.

---

## 10. The second risk, which is unrelated to Take-Two

There is a separate hazard that no amount of legal distance solves, and it is more likely to kill a
self-hosted browser game than a lawyer is.

A game released in 2026 in which the player is a European coloniser and indigenous peoples are a price
table, a training resource and a conquest target will be read that way, loudly, by the exact audiences
a self-hosted game depends on for word of mouth. The 1994 original was criticised on release for
omitting slavery entirely, and it reads considerably worse now.

This is a design problem, not a tone problem, because the native trade layer is one of the two best
systems in the original. The setting and fiction brief resolves it by replacing that layer with an
earlier wave of settlers rather than an indigenous people. **That decision is load-bearing for this
risk and should not be reopened casually.**

---

## 11. Review checkpoints

Apply the section 6 test at each of these, not at the end:

1. When the setting and fiction are chosen
2. When the vocabulary for resources, buildings and units is first written down
3. When the art direction is settled, per section 1 of the architecture brief
4. When the first playable build gets a URL
5. Before any public post announcing anything
6. **Before the editorial property publishes its first page**, against section 8.6 rather than section
   6, and ideally in the same solicitor's hour that reviews the product copy

---

## 12. If something here is wrong

Say so rather than working around it.

Three positions have now been corrected. Version 1 held that all public use of the original's name was
prohibited everywhere, which was wrong. Section 8.2 forbade the ring-of-tiles settlement layout, which
is the geometry of a mechanic rather than copied expression. Section 8.2 also forbade building slots
being shown with the ring, which was over-broad on the weaker ground that a settlement has both and
both must be visible.

**Two withdrawals in one document should be read as a warning rather than as a trend.** The prohibition
now rests entirely on composition and dress, which means those must be genuinely ours. Section 8.2
records the obligation that creates. It conflated the product's own claims with lawful referential
use by a separate editorial property, and as written it would have closed the only channel where
measurable demand for this kind of game actually exists.

The facts in sections 2 to 4 were verified on 21 August 2026 and the situation may have moved since.
In particular, whether *1492* returned to sale, and on what terms, would be useful evidence about how
far a rename and an interface change goes.

Section 8.6 is a judgement call written by people who are not lawyers. It is the one section here that
should be checked by someone who is.
