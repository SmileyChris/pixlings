import { describe, expect, test } from 'claude-code/testing'

import { award, BADGES, badgeTitle, howOf, progressOf, tierOf } from '../hooks/lib/badges.ts'
import type { Badge } from '../hooks/lib/badges.ts'
import { bump, gain, hatchPixling, mergeSave, nextEgg, rehatch, revive, shinyEggOf } from '../hooks/lib/progress.ts'
import type { Pixling } from '../hooks/lib/progress.ts'
import { nextTitle, shelfTitle } from '../hooks/lib/room.ts'

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

const T0 = Date.parse('2026-10-03T12:00:00Z')

const fresh = (): Pixling => hatchPixling(seeded(1), T0)
const badge = (id: string): Badge => BADGES.find(b => b.id === id)!
const withLifetime = (over: Partial<Pixling['lifetime']>): Pixling => {
  const p = fresh()
  return { ...p, lifetime: { ...p.lifetime, ...over } }
}

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

  test('a laid egg counts once toward Lucky, however many sessions saw it laid', () => {
    let hatchedAt = T0
    while (shinyEggOf({ hatchedAt, xp: 100_000 }) === null) hatchedAt++
    const due = shinyEggOf({ hatchedAt, xp: 100_000 })!.xp
    const base: Pixling = { ...fresh(), hatchedAt, xp: due - 10 }
    // Two sessions each squash a bug from the same base: both cross the step the egg comes at.
    const a = gain(base, 'bugSquashed').pixling
    const b = gain(base, 'bugSquashed').pixling
    const merged = mergeSave(mergeSave(base, base, a), base, b)
    expect(badge('lucky').count(merged)).toBe(1)
    expect(merged.lifetime.shinyEggs).toBe(0)
    // Hatched, the egg moves into the lifetime count, and the new egg has laid none.
    const egg = rehatch(merged, seeded(4), T0 + 1)
    expect(egg.lifetime.shinyEggs).toBe(1)
    expect(badge('lucky').count(egg)).toBe(1)
  })

  test('a hatch in a session counts the egg its session, not the person another', () => {
    const p = withLifetime({ sessions: 40 })
    const egg = nextEgg({ ...p, stats: { ...p.stats, sessions: 7 } }, T0 + 1)
    expect(egg.stats.sessions).toBe(1)
    expect(egg.lifetime.sessions).toBe(40)
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


describe('tiered badges', () => {
  test('the shelf holds eighteen, in order, with their steps', () => {
    expect(BADGES.map(b => b.id)).toEqual([
      'hello', 'exterminator', 'dangerous', 'nightOwl', 'survivor', 'shipper', 'liftoff', 'centurion', 'onFire',
      'lucky', 'absolutelyRight', 'bestFriends', 'greenThumb', 'collector', 'archmage', 'brainFreeze', 'heardItAll', 'regular',
    ])
    const steps = Object.fromEntries(BADGES.map(b => [b.id, b.steps]))
    expect(steps).toEqual({
      hello: [1], exterminator: [10, 50, 250], dangerous: [10, 50, 200], nightOwl: [25, 100, 500], survivor: [1],
      shipper: [50, 250, 1000], liftoff: [1], centurion: [100, 1000, 10000], onFire: [7, 30, 100], lucky: [1, 2, 4],
      absolutelyRight: [25, 100, 500], bestFriends: [100], greenThumb: [100, 500, 2500], collector: [5, 12, 18],
      archmage: [25, 50, 99], brainFreeze: [10, 50, 200], heardItAll: [50, 250, 1000], regular: [100, 500, 2000],
    })
    for (const b of BADGES) {
      expect(b.icon.length).toBe(7)
      for (const row of b.icon) {
        expect(row.length).toBe(7)
        for (const ch of row) expect(ch === '.' || b.colors[ch] !== undefined).toBe(true)
      }
    }
  })

  test('tiers are earned in turn', () => {
    const ext = badge('exterminator')
    let p = award(withLifetime({ bugsSquashed: 49 }), T0).pixling
    expect(tierOf(ext, p)).toBe(1)
    expect(progressOf(ext, p)).toEqual({ tier: 1, have: 49, need: 50 })
    p = { ...p, lifetime: { ...p.lifetime, bugsSquashed: 50 } }
    const r = award(p, T0 + 1)
    expect(r.earned.map(e => [e.badge.id, e.tier])).toEqual([['exterminator', 2]])
    expect(r.pixling.badges['exterminator:2']).toBe(T0 + 1)
    p = award({ ...r.pixling, lifetime: { ...r.pixling.lifetime, bugsSquashed: 250 } }, T0 + 2).pixling
    expect(tierOf(ext, p)).toBe(3)
    expect(progressOf(ext, p)).toBeNull()
  })

  test('a veteran earns every tier at once, one entry each', () => {
    const r = award(withLifetime({ turns: 12_000 }), T0)
    expect(r.earned.filter(e => e.badge.id === 'centurion').map(e => e.tier)).toEqual([3])
    expect(Object.keys(r.pixling.badges)).toEqual(expect.arrayContaining(['centurion', 'centurion:2', 'centurion:3']))
  })

  test('a badge from before tiers is tier 1', () => {
    const p = revive({ v: 1, species: 'cat', name: 'Miso', hatchedAt: T0, badges: { exterminator: 5 } })!
    expect(tierOf(badge('exterminator'), p)).toBe(1)
  })

  test('Heard It All, Lucky and Regular count what they say', () => {
    const p = { ...fresh(), tics: { absolutelyRight: 30, delve: 20 } }
    expect(tierOf(badge('heardItAll'), award(p, T0).pixling)).toBe(1)
    expect(tierOf(badge('lucky'), award(withLifetime({ shinyEggs: 2 }), T0).pixling)).toBe(2)
    expect(tierOf(badge('regular'), award(withLifetime({ sessions: 100 }), T0).pixling)).toBe(1)
  })

  test('copy', () => {
    expect(badge('centurion').how(10000)).toBe('Finish 10,000 turns')
    expect(badge('lucky').how(1)).toBe('Lay a shiny egg')
    expect(badge('lucky').how(4)).toBe('Lay 4 shiny eggs')
    expect(badgeTitle(badge('exterminator'), 2)).toBe('Exterminator · Silver')
    expect(badgeTitle(badge('hello'), 1)).toBe('Hello, World')
    // For the toast, after a comma: lowercase to start, names kept.
    expect(howOf(badge('heardItAll'), 1)).toBe("hear Claude's tics 50 times in all")
    expect(howOf(badge('centurion'), 3)).toBe('finish 10,000 turns')
  })
})

describe('the room names tiers by medal', () => {
  test('the shelf: a medal, no tier word', () => {
    expect(shelfTitle(badge('exterminator'), 1)).toBe('🐛 Exterminator 🥉')
    expect(shelfTitle(badge('dangerous'), 2)).toBe('💣 Living Dangerously 🥈')
    expect(shelfTitle(badge('liftoff'), 1)).toBe('🚀 Liftoff')
  })

  test('next: the medal it reaches for, none for a locked badge', () => {
    expect(nextTitle({ badge: badge('exterminator'), have: 20, need: 50, tier: 1 })).toBe('🐛 Exterminator 🥈')
    expect(nextTitle({ badge: badge('absolutelyRight'), have: 24, need: 25, tier: 0 })).toBe('🙄 Absolutely Right')
  })
})
