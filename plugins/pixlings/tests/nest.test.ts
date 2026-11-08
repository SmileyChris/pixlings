import { describe, expect, test } from 'claude-code/testing'

import { adopt } from '../hooks/lib/buddy.ts'
import { blend } from '../hooks/lib/names.ts'
import { hatchEgg, nestOf, partnerSpecies } from '../hooks/lib/nest.ts'
import { ancestorOf, hatchPixling, mergeSave, parentOf, revive, shinyEggOf, startLine, usedNames, xpForLevel } from '../hooks/lib/progress.ts'
import type { Ancestor, Pixling } from '../hooks/lib/progress.ts'
import { RARITY_ORDER, RARITY_WEIGHT } from '../hooks/lib/sprites.ts'

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

const T0 = Date.parse('2026-10-03T12:00:00Z')

const ancestor = (name: string, newer: string, isStart: boolean, at: number): Ancestor => ({
  name,
  species: 'cat',
  newer,
  isStart,
  hatchedAt: at,
  releasedAt: at + 1000,
})

describe('the line', () => {
  test('a first egg starts a line', () => {
    const p = hatchPixling(seeded(1), T0)
    expect(p.line).toEqual(startLine(p.name))
    expect(p.family).toEqual([])
    expect(p.egg).toBe(null)
    expect(parentOf(p)).toBe(null)
  })

  test('an old save starts a line and has no parent', () => {
    const p = revive({ v: 1, species: 'cat', name: 'Miso', eggSeed: 5 })!
    expect(p.line).toEqual(startLine('Miso'))
    expect(p.family).toEqual([])
    expect(p.egg).toBe(null)
    expect(parentOf(p)).toBe(null)
  })

  test('family history survives a reload', () => {
    const p: Pixling = {
      ...hatchPixling(seeded(2), T0),
      name: 'Taffles',
      line: { newer: 'Tango', side: 'start', isStart: false },
      family: [ancestor('Juniper', 'Juniper', true, T0 - 9000), ancestor('Juffles', 'Waffles', false, T0 - 5000)],
      egg: 1234,
    }
    const back = revive(JSON.parse(JSON.stringify(p)))!
    expect(back.family).toEqual(p.family)
    expect(back.line).toEqual(p.line)
    expect(back.egg).toBe(1234)
    expect(parentOf(back)?.name).toBe('Juffles')
    const broken = revive({ ...JSON.parse(JSON.stringify(p)), family: [{ name: 'Half' }, p.family[1], 7], line: { side: 'up' } })!
    expect(broken.family).toEqual([p.family[1]!])
    expect(broken.line).toEqual(startLine('Taffles'))
  })

  test("used names stop at the line's start", () => {
    const p: Pixling = {
      ...hatchPixling(seeded(3), T0),
      line: { newer: 'Tango', side: 'start', isStart: false },
      family: [ancestor('Juniper', 'Juniper', true, 1), ancestor('Juffles', 'Waffles', false, 2), ancestor('Bob', 'Bob', true, 3)],
    }
    expect(usedNames(p)).toEqual(['Tango', 'Bob'])
    expect(usedNames({ ...p, line: startLine('Zed') })).toEqual(['Zed'])
  })

  test('the released pixling becomes an ancestor', () => {
    const p: Pixling = { ...hatchPixling(seeded(4), T0), line: { newer: 'Pip', side: 'end', isStart: false } }
    expect(ancestorOf(p, T0 + 5)).toEqual({ name: p.name, species: p.species, newer: 'Pip', isStart: false, hatchedAt: T0, releasedAt: T0 + 5 })
  })

  test('a rename in one session survives a merge', () => {
    const base = hatchPixling(seeded(5), T0)
    const merged = mergeSave(base, base, { ...base, name: 'Bob', line: startLine('Bob') })
    expect(merged.line.newer).toBe('Bob')
  })

  test('adopting starts a line', () => {
    const p: Pixling = { ...hatchPixling(seeded(6), T0), family: [ancestor('Juniper', 'Juniper', true, 1)] }
    const adopted = adopt(p, { name: 'Sprout', personality: null, hatchedAt: null, species: 'cat', isShiny: false })
    expect(adopted.line).toEqual(startLine('Sprout'))
    expect(adopted.family).toEqual(p.family)
  })
})

/** A grown pixling, named `name`, at the start of its line. */
const grown = (name: string, hatchedAt = T0): Pixling => ({
  ...hatchPixling(seeded(9), hatchedAt),
  name,
  line: startLine(name),
  xp: xpForLevel(5),
})

/** A grown pixling that has laid its shiny egg, and the same one just before it did. */
const withShinyEgg = (): { before: Pixling; after: Pixling } => {
  let hatchedAt = T0
  while (shinyEggOf({ hatchedAt, xp: 100_000 }) === null) hatchedAt++
  const due = shinyEggOf({ hatchedAt, xp: 100_000 })!.xp
  const before = { ...grown('Juniper', hatchedAt), xp: due - 1 }
  return { before, after: { ...before, xp: due } }
}

describe('the nest', () => {
  test('a nest is fixed by its parent', () => {
    const p = grown('Juniper')
    const nest = nestOf(p)
    expect(nest.length).toBe(2)
    expect(nest.some(e => e.isShiny)).toBe(false)
    expect(nestOf(revive(JSON.parse(JSON.stringify(p)))!)).toEqual(nest)
    expect(nest[0]!.seed).not.toBe(nest[1]!.seed)
  })

  test('a shiny egg joins as a third', () => {
    const { before, after } = withShinyEgg()
    const nest = nestOf(after)
    expect(nest.length).toBe(3)
    expect(nest[2]!.isShiny).toBe(true)
    expect(nest[2]!.look.isShiny).toBe(true)
    expect(nest.slice(0, 2)).toEqual(nestOf(before))
  })

  test('only the shiny egg hatches shiny', () => {
    const { after } = withShinyEgg()
    const nest = nestOf(after)
    const plain = hatchEgg(after, nest[0]!, T0 + 10)
    const shiny = hatchEgg(after, nest[2]!, T0 + 10)
    expect(plain.isShiny).toBe(false)
    expect(shiny.isShiny).toBe(true)
    expect(plain.lifetime.shinyEggs).toBe(after.lifetime.shinyEggs + 1)
    expect(shiny.lifetime.shinyEggs).toBe(after.lifetime.shinyEggs + 1)
  })

  test('the child carries the newer half on the same side', () => {
    const p = grown('Juniper')
    const egg = nestOf(p)[0]!
    const c = hatchEgg(p, egg, T0 + 10)
    expect(c.name).toBe(egg.name)
    expect(c.name).toBe(blend('Juniper', c.line.newer))
    expect(c.line).toEqual({ newer: egg.partner, side: 'end', isStart: false })
    expect(c.egg).toBe(egg.seed)
    expect(parentOf(c)?.name).toBe('Juniper')
    expect(c.family.length).toBe(1)
    const g = hatchEgg({ ...c, xp: xpForLevel(5) }, nestOf({ ...c, xp: xpForLevel(5) })[1]!, T0 + 20)
    expect(g.name).toBe(blend(g.line.newer, c.line.newer))
    expect(g.line.side).toBe('start')
    expect(g.family.map(a => a.name)).toEqual(['Juniper', c.name])
  })

  test('a fresh roll never repeats the line', () => {
    let p = grown('Juniper')
    for (let gen = 0; gen < 40; gen++) {
      const used = usedNames(p)
      for (const egg of nestOf(p)) if (used.length < 49) expect(used.map(n => n.toLowerCase()), `gen ${gen}`).not.toContain(egg.partner.toLowerCase())
      p = { ...hatchEgg(p, nestOf(p)[0]!, T0 + (gen + 1) * 1000), xp: xpForLevel(5) }
    }
  })

  test('the old pixling is in the history, the unpicked eggs are not', () => {
    const p = { ...grown('Juniper'), dex: ['duck'] }
    const [picked, left] = nestOf(p)
    const c = hatchEgg(p, picked!, T0 + 77)
    expect(c.dex).toEqual([...new Set(['duck', picked!.species.id])])
    if (left!.species.id !== picked!.species.id && left!.species.id !== 'duck') expect(c.dex).not.toContain(left!.species.id)
    expect(c.family[0]).toEqual(ancestorOf(p, T0 + 77))
  })

  test("hatching from an egg keeps the person's things", () => {
    const p: Pixling = {
      ...grown('Juniper'),
      badges: { hello: 1 },
      streak: { last: '2026-10-02', days: 4, best: 9 },
      tics: { absolutelyRight: 7 },
      lifetime: { ...grown('x').lifetime, turns: 900, commits: 5 },
      stats: { ...grown('x').stats, turns: 500 },
    }
    const c = hatchEgg(p, nestOf(p)[0]!, T0 + 10)
    expect(c.badges).toEqual(p.badges)
    expect(c.streak).toEqual(p.streak)
    expect(c.tics).toEqual(p.tics)
    expect(c.lifetime).toEqual(p.lifetime)
    expect(c.stats.turns).toBe(0)
    expect(c.stats.sessions).toBe(1)
    expect(c.xp).toBe(0)
    expect(c.hatchedAt).toBe(T0 + 10)
  })

  test('a partner is always the same species', () => {
    expect(partnerSpecies('Tango')).toEqual(partnerSpecies('tango'))
    const kinds = new Set(['Mochi', 'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Pip', 'Sprocket', 'Tofu', 'Noodle', 'Waffles'].map(n => partnerSpecies(n).id))
    expect(kinds.size).toBeGreaterThan(1)
  })

  test('rarity holds its weights', () => {
    const counts: Record<string, number> = {}
    let total = 0
    for (let i = 0; i < 10_000; i++) {
      for (const egg of nestOf(grown('Juniper', T0 + i * 7))) {
        counts[egg.species.rarity] = (counts[egg.species.rarity] ?? 0) + 1
        total++
      }
    }
    for (const r of RARITY_ORDER) expect(Math.abs(((counts[r] ?? 0) / total) * 100 - RARITY_WEIGHT[r]), r).toBeLessThanOrEqual(1.5)
  })

  test('an old save lays a nest', () => {
    const old = revive({ v: 1, species: 'cat', name: 'Miso', eggSeed: 5, hatchedAt: T0, xp: xpForLevel(5) })!
    const nest = nestOf(old)
    expect(nest.length).toBe(2)
    for (const egg of nest) expect(egg.name.startsWith('Mi')).toBe(true)
  })
})

describe('what an egg gives away', () => {
  test('the look is its own roll: every mark comes in every pattern, and a species in many shells', () => {
    const patterns: Record<string, Set<string>> = {}
    const shells: Record<string, Set<string>> = {}
    for (let i = 0; i < 5000; i++) {
      for (const egg of nestOf(grown('Juniper', T0 + i * 7))) {
        ;(patterns[egg.look.mark] ??= new Set()).add(egg.look.pattern)
        ;(shells[egg.species.id] ??= new Set()).add(egg.look.shell)
      }
    }
    for (const [mark, seen] of Object.entries(patterns)) expect(seen.size, mark).toBe(5)
    for (const id of ['blip', 'duck', 'cat', 'snail', 'rabbit', 'chonk']) expect(shells[id]!.size, id).toBeGreaterThanOrEqual(4)
  })
})
