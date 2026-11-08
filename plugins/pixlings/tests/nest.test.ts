import { describe, expect, test } from 'claude-code/testing'

import { adopt } from '../hooks/lib/buddy.ts'
import { ancestorOf, hatchPixling, mergeSave, parentOf, revive, startLine, usedNames } from '../hooks/lib/progress.ts'
import type { Ancestor, Pixling } from '../hooks/lib/progress.ts'

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
