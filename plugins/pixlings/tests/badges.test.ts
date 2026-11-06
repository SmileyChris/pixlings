import { describe, expect, test } from 'claude-code/testing'

import { bump, gain, hatchPixling, mergeSave, rehatch, revive, shinyEggOf } from '../hooks/lib/progress.ts'
import type { Pixling } from '../hooks/lib/progress.ts'

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

const T0 = Date.parse('2026-10-03T12:00:00Z')

const fresh = (): Pixling => hatchPixling(seeded(1), T0)

describe('lifetime counts', () => {
  test('bump counts into lifetime', () => {
    const p = bump(fresh(), 'commits', 3)
    expect(p.stats.commits).toBe(3)
    expect(p.lifetime.commits).toBe(3)
    expect(bump(p, 'pets').lifetime).toEqual(p.lifetime)
  })

  test('a hatch keeps lifetime and resets stats', () => {
    const base = fresh()
    const p = { ...base, stats: { ...base.stats, turns: 500 }, lifetime: { ...base.lifetime, turns: 900 } }
    const egg = rehatch(p, seeded(3), T0 + 1)
    expect(egg.stats.turns).toBe(0)
    expect(egg.lifetime.turns).toBe(900)
  })

  test('laying a shiny egg counts', () => {
    let hatchedAt = T0
    while (shinyEggOf({ hatchedAt, xp: 100_000 }) === null) hatchedAt++
    const at = shinyEggOf({ hatchedAt, xp: 100_000 })!.xp
    let p: Pixling = { ...fresh(), hatchedAt, xp: at - 1 }
    let laid = false
    for (let i = 0; i < 10 && !laid; i++) {
      const r = gain(p, 'bugSquashed')
      p = r.pixling
      laid = r.isShinyEgg
    }
    expect(laid).toBe(true)
    expect(p.lifetime.shinyEggs).toBe(1)
  })

  test('an old save seeds lifetime', () => {
    const old = { v: 1, species: 'cat', name: 'Miso', hatchedAt: T0, stats: { turns: 40, commits: 7 } }
    const p = revive(old)!
    expect(p.lifetime.turns).toBe(40)
    expect(p.lifetime.commits).toBe(7)
    expect(p.lifetime.shinyEggs).toBe(0)
    expect(revive({ ...old, isShiny: true })!.lifetime.shinyEggs).toBe(1)
    expect(revive({ ...old, badges: { lucky: 5 } })!.lifetime.shinyEggs).toBe(1)
    const kept = revive({ ...old, lifetime: { turns: 2 } })!
    expect(kept.lifetime.turns).toBe(2)
    expect(kept.lifetime.commits).toBe(0)
  })

  test('two sessions add their lifetime gains', () => {
    const with_ = (p: Pixling, turns: number): Pixling => ({ ...p, lifetime: { ...p.lifetime, turns } })
    const base = with_(fresh(), 10)
    expect(mergeSave(with_(base, 15), base, with_(base, 12)).lifetime.turns).toBe(17)
    const hatched = { ...with_(base, 12), hatchedAt: T0 + 5 }
    expect(mergeSave(with_(base, 15), base, hatched).lifetime.turns).toBe(17)
  })
})
