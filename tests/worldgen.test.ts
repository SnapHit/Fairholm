import { describe, it, expect } from 'vitest'
import { createGame, settingsFor } from '../src/sim/actions'
import { voyageBand, sailingDistance, isCoastal, isLand, isOpenSea, landingViable, dist, sightsLandSensibly, generateWorld } from '../src/sim/worldgen'
import { C } from '../src/sim/constants'

describe('worldgen', () => {
  it('puts four charters down in open sea within the voyage band across seeds and sizes', () => {
    const sizes = ['small', 'standard', 'large'] as const
    const shapes = ['continent', 'coast', 'archipelago'] as const
    const [lo, hi] = voyageBand()
    let worst = 0
    for (const size of sizes) for (const shape of shapes) for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      const s = createGame(`seed${i}`, { size, shape }, 1)
      worst = Math.max(worst, Date.now() - t0)
      const label = `${size} ${shape} seed${i}`
      expect(s.world.splashdowns.length, label).toBe(4)
      expect(s.charters.length).toBe(4)
      expect(s.flags.worldgenProblem, label).toBeUndefined()
      const { width: w, height: h, tiles } = s.world
      const d = sailingDistance(w, h, tiles, k => isLand(tiles[k]) && isCoastal(w, h, tiles, k) && landingViable(w, h, tiles, k))
      s.world.splashdowns.forEach((at, k) => {
        // the player's is always in the band; a rival may come down a tile nearer its coast where
        // a tight map leaves nothing else (decision 115)
        const give = k === 0 ? 0 : C.worldgen.rivalSplashdownGive
        expect(isOpenSea(w, h, tiles, at), label).toBe(true)
        expect(d[at], label).toBeGreaterThanOrEqual(lo - give)
        expect(d[at], label).toBeLessThanOrEqual(hi)
        // nobody else in sight at splashdown
        for (const p of s.predecessors) expect(dist(w, p.tile, at), label).toBeGreaterThan(C.lander.sight + 1)
        for (const other of s.world.splashdowns) if (other !== at) expect(dist(w, other, at), label).toBeGreaterThan(C.lander.sight + 1)
      })
      // the player sailing any sensible heading sights land within the first one or two moves; the
      // coast it is measured against is the generator's, which the state does not keep
      const world = generateWorld(`seed${i}`, settingsFor({ size, shape }))
      expect(world.splashdowns[0], label).toBe(s.world.splashdowns[0])
      expect(sightsLandSensibly(w, h, tiles, world.splashdowns[0], world.coasts[0]), label).toBe(true)
      // every charter has its lander at its splashdown and nothing ashore
      expect(s.units.filter(u => u.kind === 'lander').length).toBe(4)
      expect(s.settlements.length).toBe(0)
    }
    console.log('worst generation ms', worst)
  })
  it('makes a sound small world, with the player sighting land on every sensible heading, across sixty seeds', () => {
    // the tightest maps: small, and the archipelago most of all. Every one validates
    for (const shape of ['continent', 'coast', 'archipelago'] as const) for (let i = 0; i < 20; i++) {
      const world = generateWorld(`tight${i}`, settingsFor({ size: 'small', shape }))
      expect((world as typeof world & { problem?: string }).problem, `${shape} tight${i}`).toBeUndefined()
      expect(sightsLandSensibly(world.width, world.height, world.tiles, world.splashdowns[0], world.coasts[0]), `${shape} tight${i}`).toBe(true)
    }
  })
  it('is deterministic from the seed', () => {
    const a = createGame('same', { size: 'small' }, 1)
    const b = createGame('same', { size: 'small' }, 2)
    expect(a.world.tiles.map(t => t.terrain + (t.forest ?? '') + t.river + (t.prime ?? '')).join('')).toBe(b.world.tiles.map(t => t.terrain + (t.forest ?? '') + t.river + (t.prime ?? '')).join(''))
    expect(a.world.splashdowns).toEqual(b.world.splashdowns)
  })
})
