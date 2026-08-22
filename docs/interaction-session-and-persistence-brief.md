# Interaction, session and persistence brief

Written 21 August 2026. Self-contained. Companion to the browser game architecture brief, the
Colonization mechanics brief, the legal distinguishability constraint and the setting and fiction
brief.

**Purpose: record the decisions about how the game is played turn to turn, how long a game lasts, and
how it survives being put down.** Storage figures were read off live sources on the date written.
Where this document conflicts with the architecture brief, say so rather than working around it.

---

## 1. What is settled

- The game is **long and explicitly resumable**. The building and depth are the point, and that only
  works at length
- Turns are **queue driven**. The turn presents only what needs the player, and ends when the queue
  empties. Civilization and Total War already do this well and it does not need reinventing
- **Persistence is architectural, not a feature.** It constrains how everything else is written
- **Export and import of a save file ships early**, as the primary insurance
- **Server-side sync is optional, additive and deferred.** The game never depends on it
- Hosting stays static, self-hosted, on Cloudflare

---

## 2. Why tapping is not the hard part

Colonization's interface is spatial selection: pick a tile, drag a colonist onto it, hover to read a
yield. Phones are bad at that. But almost none of the actual decisions are spatial. Assigning a
worker is choosing one of about a dozen jobs. Choosing a build is picking from a list. Setting a
trade run is a destination and a cargo. Those are list selections, and phones are excellent at list
selection.

Useful convergence: section 8.2 of the legal constraint forbids reproducing the original's colony
screen. The thing that cannot be copied is the thing that should not be wanted.

### Three interaction rules

1. **Tap to inspect, a second action to commit.** There is no hover on a phone, so there is no other
   way to ask "what would this do" without doing it. The first tap is never destructive
2. **No drag and drop anywhere.** Imprecise, the finger covers the target, no hover state to guide
   it. Assignment happens by picking from a sheet
3. **Undo, not confirmation dialogs.** A confirm on every action doubles the tap count across
   hundreds of turns. One persistent undo is cheaper and feels better

### The real target is decisions per turn

By the late game the original has the player managing twenty colonies, school queues, wagon routes
and dozens of units, and most turns are bookkeeping. Tolerable with a mouse, fatal on a phone.

**Design target: a quiet turn is one tap, a busy turn is six to eight. If a turn ever needs twenty,
the design has failed, not the interface.** Standing orders absorb the routine, and a settlement
surfaces only when its standing order cannot be satisfied.

A queue of sheets is also far more robust across portrait and landscape than a map-centric layout,
which helps with section 10 of the architecture brief.

---

## 3. The storage reality, which is worse than expected

Read 21 August 2026, MDN last updated 5 January 2026.

**Safari deletes all script-created storage for an origin after seven days of browser use without
user interaction with that site.** It covers IndexedDB, localStorage, sessionStorage, media keys and
service worker registrations, and it deletes all of it at once rather than in parts. On iPhone this
applies to every browser, because they all run WebKit.

For a fifteen-hour resumable game this is the single largest technical threat in the project, larger
than anything in the renderer.

Mitigations, in order of what they buy:

1. **Home screen install.** Web apps added to the home screen are not part of Safari and keep their
   own counter of days of use, which resets on actual use. This is the real fix. It conflicts with
   the no-prompts rule in section 9 of the architecture brief, so the resolution is timing: never
   prompt on arrival, prompt once the player has something worth protecting, and frame it as
   protecting it
2. **Export and import.** Section 5
3. **`navigator.storage.persist()` on every launch.** Apple documents nothing about whether it
   defeats the seven-day timer and it appears to need re-requesting each time the app opens, though
   developers report it does protect data. Three lines, so do it, but do not rely on it
4. **Server sync.** Section 6

---

## 4. State architecture, which is expensive to reverse

This belongs in section 13 of the architecture brief as a decision to make before writing game code.

1. **All state lives in one plain-data object and the renderer is a function of it.** No game state
   in the scene graph, in closures, in the DOM, in animation state, or in a Map keyed by object
   identity. If it cannot be serialised at any instant, it is not state, it is a bug. Retrofitting
   this is the kind of rewrite that kills projects
2. **Save the seed and the deltas, not the world.** The map is generated from a seed and costs
   nothing to ship, so a save is the seed plus everything the player has changed. Saves stay in the
   low kilobytes, loading is regeneration rather than deserialisation, and a returning player is back
   in their game inside the same second promised for first load. The price is that the generator must
   be deterministic and **versioned**, because a generator change silently rewrites old worlds
3. **Two streams of randomness, and only one of them is saved.** This is the rule a build is most
   likely to get wrong, because a naive reading of item 2 makes everything reproducible.

   | | Source | Held in the save | Examples |
   |---|---|---|---|
   | **World randomness** | The world seed | Yes. Deterministic and versioned | Terrain, resources, anchorage placement, gold reserves, predecessor and rival placement |
   | **Play randomness** | A separate stream | **No.** Fresh on every load | Combat exchanges, recall fleet landing sites, price jitter, predecessor preferences rotating |

   World randomness must be strictly seeded, because that is what makes a shared seed a shared world and
   lets the map regenerate identically from a few characters. **Play randomness must not be**, so that
   reloading a save from before the declaration produces a genuinely different war. See section 10 of
   the military brief.

   Within both streams: one generator, never `Math.random` for anything that touches world generation,
   and no reliance on object key or Set iteration order anywhere.

   **Accepted consequence:** save-scumming becomes possible during play. That is consistent with
   section 6 below, where this project already accepts that it is single player and cheating does not
   matter.
4. **A schema version in the save from the first commit.** The state shape will change weekly for
   months. During development, invalidate. After launch, migrate. Without the version number there is
   no way to tell which case applies
5. **Write on every turn boundary and on `visibilitychange`.** Not `beforeunload`, which mobile
   ignores

**Note on build order.** Section 14 of the architecture brief puts persistence last and that remains
right for the *feature*. Do not build save and load before the core interaction is fun. But the
architecture above must be true from step one, because it is a constraint on how everything else is
written, not a feature to add.

---

## 5. Export and import, which ships first

Built in week one, not as a nicety. It forces the save format to become a real, debuggable, versioned
artefact from the start, and it is the only mitigation that works everywhere forever with no server.

- **Compress before encoding.** `CompressionStream` gzip plus base64 will typically turn a 200KB
  state into tens of KB
- **Use `navigator.share()` with a Blob**, so the player can drop the file into Files, AirDrop it or
  message it to themselves. A download link is the fallback, because downloading is awkward on iOS
- **The recovery code, if there ever is one, lives inside the file**, so export and cloud sync are one
  system rather than two

### Sharing a world is not sharing a save

Two different objects, both worth having.

- **A seed is a world.** A handful of characters, shareable as a link, and the recipient gets the same
  map at turn zero. This has genuine distribution value and connects to section 16 of the
  architecture brief, which is still the unanswered question
- **A save is a game in progress.** For moving between devices and for insurance

### The honest limit

Export protects the players who remember to export. Someone wiped by Safari who never tapped the
button has no file. It is necessary, not sufficient, which is why it sits alongside the home screen
prompt rather than replacing it.

---

## 6. Server-side sync, if and when

**Server-side save is not a server-authoritative game.** This is single player, so cheating does not
matter. The server never simulates a turn, never validates state, never arbitrates and never rolls
back. It is a blob store with a key. That removes the authority model, reconciliation, anti-cheat and
session management, which is most of what the phrase usually implies.

What gets built: put a blob under a key, get a blob by key, optionally delete.

### Identity is the actual complexity

Keying the save to a token in localStorage fails, because Safari deletes the token along with the
save and the cloud copy becomes unreachable. Two answers:

- **A recovery code shown to the player.** Six words or a short string. No accounts, no email, no
  passwords, no resets. It lives inside the exported file. This is the recommended primary
- **A server-set cookie.** Cookies set by the server are exempt from the eviction described in
  section 3, so the identifier can survive the purge. Treat as convenience, not guarantee, because
  Apple moves this ground

### Two things that get forgotten

- **An open write endpoint is a free anonymous file host and someone will find it.** Size cap, rate
  limit, reject anything that does not parse as a save, and a TTL so abandoned saves expire
- **Storing user data requires a privacy notice.** Staying anonymous, with no email and no accounts,
  keeps that to a paragraph rather than a compliance exercise. Another argument for the code over real
  accounts

---

## 7. Hosting: this does not break static files on Cloudflare

Figures read 21 August 2026, from Cloudflare's own pricing documentation and its February 2026 free
tier announcement.

Workers is serverless, so the deployment is static files plus one small JavaScript function. No
virtual machine, no container, no uptime to manage, one command to ship. Static assets are not billed
as requests and egress is free.

**Do not use KV for saves.** The free plan allows 100,000 reads a day but only 1,000 writes, and a
save system is write-heavy. A hundred players would exhaust it.

| Option | Free allowance | Notes |
|---|---|---|
| Workers | 100,000 requests/day, 10ms CPU per invocation | Static assets not counted |
| KV | 1GB, 100,000 reads/day, **1,000 writes/day** | Paid writes $5 per million. Wrong shape for saves |
| D1 | 5GB, 5M rows read/day, 100,000 rows written/day | Right if the saves ever need querying |
| R2 | 10GB, 1M class A ops/month, 10M class B ops/month | Natural fit for opaque blobs |

Rough scale check: a 5KB save, a thousand daily players syncing three times a session, is 3,000 writes
a day. That is three per cent of D1's free write allowance and about nine per cent of R2's monthly
one. Ten thousand players' saves is 50MB. Cost only becomes real at a scale that would be an
unambiguously good problem.

---

## 8. The rule that keeps the cost model honest

**The game must be completely playable with the network unplugged.** Cloud sync is a layer on top of
the local save, never a dependency. If the worker is down, if the player is on a plane, if a free tier
limit is hit, the game keeps working and syncs later.

The moment the game needs a server to run, the economics invert from the model in section 12 of the
architecture brief, where a traffic spike costs nothing. Everything above preserves that. A spike
costs some operations and nothing else.

---

## 9. Resuming is a design problem, not only a storage one

Returning to a fifteen-hour game after two weeks is where long games actually fail, and Civilization
is bad at it. The player comes back to a queue of demands with no memory of what they were trying to
do.

**The game must remember intent, not only state.** Something the player sets and the game holds: what
this settlement is for, what is being saved toward, what is being built to. Then the return screen is
not "here are eleven things waiting" but "you were building toward X, here is what moved while you
were away, here are the three things that need you."

That single screen is worth more than any amount of save reliability, and it should be designed, not
generated from a diff.

---

## 10. Still open

- Total turn count and the length of a typical session, which govern map size, number of goods and how
  much a turn may ask
- Whether there is a 3D map at all, and therefore whether this is a WebGL project or a DOM project
  with a rendered map view. See the note below
- Orientation model, per section 10 of the architecture brief
- The input abstraction, per section 13 item 6 of the architecture brief
- Where the first thousand players come from, per section 16, which remains the real question

---

## 11. A tension worth naming

The architecture brief was written for a real-time 3D game, with Slow Roads and PolyTrack as its
reference points, where the renderer is the game. The design has since landed on a turn-based economy
game with a queue-driven interface, where the renderer may be a stylised map view surrounded by
panels.

That materially changes the technology answer, possibly as far as whether WebGL is used at all. It is
the next decision to make, it is section 1 of the architecture brief (pick the renderer and the art
direction together, and let each argue for the other), and it is expensive to reverse.

---

## 12. If something here is wrong

Say so rather than working around it. The storage behaviour in section 3 and the figures in section 7
are current as of 21 August 2026 and both move. In particular, Apple's position on
`navigator.storage.persist()` and on home screen web apps is poorly documented and worth re-checking
before relying on either.
