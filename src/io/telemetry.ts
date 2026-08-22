// Instrumentation, build specification section 10 and onboarding brief section 11.
// Anonymous counters only. No accounts, no identifiers, no network: there is no endpoint in version
// one, so the counters live in localStorage and can be read from the menu. See DECISIONS.md.

export interface Telemetry {
  games: number
  maxTurn: number[]                 // per game, the highest turn reached. Drop-off by turn number
  queueLengths: Record<string, number>   // length -> count, per turn
  turnSeconds: number[]             // wall-clock seconds per turn, last 200
  firstConsignment: number[]        // turn of first consignment, per game
  secondSettlement: number[]
  foldOpened: number[]              // turn the fold was first opened, per game, or -1
  reached: { t30: number; t100: number; t300: number }
  glossary: number                  // taps on tappable terms
}

const KEY = 'fairholm.telemetry'
let cache: Telemetry | null = null

function blank(): Telemetry {
  return { games: 0, maxTurn: [], queueLengths: {}, turnSeconds: [], firstConsignment: [], secondSettlement: [], foldOpened: [], reached: { t30: 0, t100: 0, t300: 0 }, glossary: 0 }
}

export function read(): Telemetry {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? { ...blank(), ...JSON.parse(raw) } : blank()
  } catch { cache = blank() }
  return cache!
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}

export function newGame() {
  const t = read()
  t.games++
  t.maxTurn.push(0)
  t.firstConsignment.push(-1)
  t.secondSettlement.push(-1)
  t.foldOpened.push(-1)
  write()
}

export function turnEnded(turn: number, queueLength: number, seconds: number) {
  const t = read()
  const g = t.maxTurn.length - 1
  if (g >= 0) {
    if (turn > t.maxTurn[g]) t.maxTurn[g] = turn
    if (turn === 30) t.reached.t30++
    if (turn === 100) t.reached.t100++
    if (turn === 300) t.reached.t300++
  }
  const k = String(Math.min(queueLength, 20))
  t.queueLengths[k] = (t.queueLengths[k] ?? 0) + 1
  t.turnSeconds.push(Math.round(seconds * 10) / 10)
  if (t.turnSeconds.length > 200) t.turnSeconds.splice(0, t.turnSeconds.length - 200)
  write()
}

export function firstConsignment(turn: number) {
  const t = read(); const g = t.firstConsignment.length - 1
  if (g >= 0 && t.firstConsignment[g] < 0) { t.firstConsignment[g] = turn; write() }
}
export function secondSettlement(turn: number) {
  const t = read(); const g = t.secondSettlement.length - 1
  if (g >= 0 && t.secondSettlement[g] < 0) { t.secondSettlement[g] = turn; write() }
}
export function foldOpened(turn: number) {
  const t = read(); const g = t.foldOpened.length - 1
  if (g >= 0 && t.foldOpened[g] < 0) { t.foldOpened[g] = turn; write() }
}
export function glossaryTap() {
  const t = read(); t.glossary++; write()
}

export function summary(): string {
  const t = read()
  const avg = t.turnSeconds.length ? (t.turnSeconds.reduce((a, b) => a + b, 0) / t.turnSeconds.length).toFixed(1) : '0'
  const lens = Object.entries(t.queueLengths).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}:${v}`).join(' ')
  return [
    `Games started: ${t.games}`,
    `Highest turn per game: ${t.maxTurn.join(', ') || 'none'}`,
    `Reached turn 30 / 100 / 300: ${t.reached.t30} / ${t.reached.t100} / ${t.reached.t300}`,
    `Average seconds per turn: ${avg}`,
    `Queue length distribution: ${lens || 'none'}`,
    `Turn of first consignment: ${t.firstConsignment.join(', ') || 'none'}`,
    `Turn of second settlement: ${t.secondSettlement.join(', ') || 'none'}`,
    `Turn the fold was first opened: ${t.foldOpened.join(', ') || 'none'}`,
    `Glossary taps: ${t.glossary}`,
    'Counters are anonymous and never leave this device.',
  ].join('\n')
}
