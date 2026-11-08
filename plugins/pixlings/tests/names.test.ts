import { describe, expect, test } from 'claude-code/testing'

import { blend, freshName, NAMES } from '../hooks/lib/names.ts'

describe('blended names', () => {
  test('blends the start of one with the end of another', () => {
    expect(blend('Mochi', 'Pixel')).toBe('Moxel')
    expect(blend('Hex', 'Waffles')).toBe('Heffles')
    expect(blend('Juniper', 'Waffles')).toBe('Juffles')
    expect(blend('Tango', 'Waffles')).toBe('Taffles')
    expect(blend('Tango', 'Turbo')).toBe('Tarbo')
  })

  test("the spec's chain", () => {
    // Each fresh roll joins on the other side from the one before.
    const rolls = ['Waffles', 'Tango', 'Turbo', 'Nibble', 'Pip', 'Loop', 'Noodle']
    let newer = 'Juniper'
    let side: 'start' | 'end' = 'start'
    const names: string[] = []
    for (const fresh of rolls) {
      names.push(side === 'start' ? blend(newer, fresh) : blend(fresh, newer))
      newer = fresh
      side = side === 'start' ? 'end' : 'start'
    }
    expect(names).toEqual(['Juffles', 'Taffles', 'Tarbo', 'Nirbo', 'Nipip', 'Loopip', 'Loodle'])
  })

  test('odd names still blend', () => {
    for (const a of ['Sir Fluff', 'R2-D2', 'Ωmega', 'X', 'Bcd']) {
      for (const b of ['Waffles', a]) {
        for (const name of [blend(a, b), blend(b, a)]) {
          expect(name.length, `${a} + ${b}`).toBeGreaterThan(0)
          expect(name.length).toBeLessThanOrEqual(24)
          expect(name, `${a} + ${b}`).toMatch(/^[\p{Lu}\p{N}]/u)
        }
      }
    }
    // The start of the first word, the end of the last.
    expect(blend('Sir Fluff', 'Waffles')).toBe('Siffles')
    expect(blend('Waffles', 'Sir Fluff')).toBe('Wafluff')
  })

  test("fresh names skip the line's", () => {
    const used = NAMES.slice(0, 49)
    for (let i = 0; i < 20; i++) expect(freshName(Math.random, used)).toBe(NAMES[49])
    expect(freshName(Math.random, used.map(n => n.toLowerCase()))).toBe(NAMES[49])
    for (let i = 0; i < 20; i++) expect(NAMES).toContain(freshName(Math.random, NAMES))
  })
})
