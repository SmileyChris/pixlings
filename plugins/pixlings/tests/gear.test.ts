import { describe, expect, test } from 'claude-code/testing'

import { bustOf } from '../hooks/lib/band.ts'
import { CANVAS_H, CANVAS_W, layoutFor, mirror, renderFrame, SPRITE_X } from '../hooks/lib/canvas.ts'
import { drawGear, FACE_IDS, HAT_IDS, isHat, isNeck, NECK_IDS } from '../hooks/lib/gear.ts'
import type { GearId } from '../hooks/lib/gear.ts'
import { DROP_ODDS, dropsOf, gain, gearOf, hatchPixling, mergeSave, revive, UNLOCKS, xpForLevel } from '../hooks/lib/progress.ts'
import { SPECIES } from '../hooks/lib/sprites.ts'
import type { Species } from '../hooks/lib/sprites.ts'

const ALL: GearId[] = [...HAT_IDS, ...FACE_IDS, ...NECK_IDS]
const byId = (id: string): Species => SPECIES.find(s => s.id === id)!

const pixelsOf = (s: Species, id: GearId, isFlipped: boolean): [number, number, number][] => {
  const out: [number, number, number][] = []
  drawGear(s, id, isFlipped, (x, y, c) => out.push([x, y, c]))
  return out
}

describe('gear', () => {
  test('every species wears every piece inside its canvas, facing either way', () => {
    const problems: string[] = []
    for (const s of SPECIES) {
      for (const id of ALL) {
        const layout = layoutFor(s, isHat(id) ? id : null, isNeck(id) ? id : null)
        for (const isFlipped of [false, true]) {
          const px = pixelsOf(s, id, isFlipped)
          if (px.length === 0) problems.push(`${s.id} ${id}: draws nothing`)
          for (const [x, y] of px) {
            const cx = SPRITE_X + x
            // The halo bobs a row higher.
            const cy = layout.y + y - (id === 'halo' ? 1 : 0)
            if (cx < 0 || cx >= CANVAS_W || cy < 0 || cy >= layout.h) {
              problems.push(`${s.id} ${id}${isFlipped ? ' flipped' : ''}: ${cx},${cy} off ${CANVAS_W}×${layout.h}`)
              break
            }
          }
        }
      }
    }
    expect(problems).toEqual([])
  })

  test('neckwear hanging past the art grows the canvas two rows below; the bust leaves them off', () => {
    const blip = byId('blip')
    expect(layoutFor(blip, null, 'chain')).toEqual({ y: 2, h: CANVAS_H + 2 })
    expect(layoutFor(blip, null, 'bowtie')).toEqual({ y: 2, h: CANVAS_H })
    expect(layoutFor(blip, 'wizard', 'chain').h - layoutFor(blip, 'wizard', null).h).toBe(2)
    const plain = renderFrame({ species: blip, isShiny: false, mood: 'idle', t: 0 })
    const chained = renderFrame({ species: blip, isShiny: false, mood: 'idle', t: 0, neck: 'chain' })
    expect(chained.h).toBe(plain.h + 2)
    expect(chained.below).toBe(2)
    expect(bustOf(chained)).toEqual(bustOf(plain))
    // A hat that needs headroom keeps it in the bust, chain or not.
    const capybara = byId('capybara')
    const hatted = renderFrame({ species: capybara, isShiny: false, mood: 'idle', t: 0, hat: 'wizard', neck: 'chain' })
    expect(hatted.below).toBe(2)
    expect(bustOf(hatted)).toEqual(bustOf(renderFrame({ species: capybara, isShiny: false, mood: 'idle', t: 0, hat: 'wizard' })))
    expect(bustOf(hatted).top).toBe(0)
  })

  test('walking left, the monocle and eyepatch keep to their own eye, the medal its colors, hats their pattern', () => {
    const problems: string[] = []
    for (const s of SPECIES) {
      const m = mirror(s)
      const [ew] = s.eyeSize
      const encloses = (id: GearId, eyeX: number): void => {
        const xs = pixelsOf(s, id, true).map(([x]) => x)
        if (!(Math.min(...xs) <= eyeX && Math.max(...xs) >= eyeX + ew - 1)) problems.push(`${s.id} ${id}: off the eye at ${eyeX}`)
      }
      // The pixling's own left eye is the rightmost as seen, either way it faces.
      encloses('monocle', Math.max(...m.eyes.map(([x]) => x)))
      encloses('eyepatch', Math.min(...m.eyes.map(([x]) => x)))
      const medal = pixelsOf(s, 'medal', true)
      const meanX = (c: number): number => {
        const xs = medal.filter(([, , k]) => k === c).map(([x]) => x)
        return xs.reduce((a, b) => a + b, 0) / xs.length
      }
      if (!(meanX(0x4d7cff) < meanX(0xd8344a))) problems.push(`${s.id}: medal straps swapped walking left`)
      // The grad cap's tassel hangs at its right whichever way the pixling walks.
      for (const isFlipped of [false, true]) {
        const cap = pixelsOf(s, 'grad', isFlipped)
        const right = Math.max(...cap.map(([x]) => x))
        if (!cap.some(([x, , c]) => x === right && c === 0xffd23f)) problems.push(`${s.id}: no tassel at the right${isFlipped ? ' walking left' : ''}`)
      }
    }
    expect(problems).toEqual([])
  })

  test('hats slide to the mirrored spot unflipped; other gear mirrors', () => {
    const blip = byId('blip')
    const right = pixelsOf(blip, 'cowboy', false)
    const left = pixelsOf(blip, 'cowboy', true)
    const minX = (px: [number, number, number][]): number => Math.min(...px.map(([x]) => x))
    const maxX = (px: [number, number, number][]): number => Math.max(...px.map(([x]) => x))
    expect(minX(left)).toBe(15 - maxX(right))
    const shift = minX(left) - minX(right)
    expect(left.map(([x, y, c]) => `${x - shift},${y},${c}`).sort()).toEqual(right.map(([x, y, c]) => `${x},${y},${c}`).sort())
    const visor = pixelsOf(blip, 'visor', false)
    expect(pixelsOf(blip, 'visor', true).map(([x, y, c]) => `${15 - x},${y},${c}`).sort()).toEqual(visor.map(([x, y, c]) => `${x},${y},${c}`).sort())
  })

  test('shiny, the robot wears silver and the capybara gold', () => {
    const colorsOf = (id: string, isShiny: boolean): Set<number> => {
      const out = new Set<number>()
      drawGear(byId(id), 'chain', false, (_x, _y, c) => out.add(c), isShiny)
      return out
    }
    expect(colorsOf('robot', false).has(0xf2c14e)).toBe(true)
    expect(colorsOf('robot', true).has(0xe6e9f2)).toBe(true)
    expect(colorsOf('capybara', false).has(0xe6e9f2)).toBe(true)
    expect(colorsOf('capybara', true).has(0xf2c14e)).toBe(true)
    expect([...colorsOf('blip', true)]).toEqual([...colorsOf('blip', false)])
  })

  test('the monocle and the eyepatch stay on asleep; glasses that hide the eyes come off', () => {
    const blip = byId('blip')
    const frame = (face: 'monocle' | 'visor', mood: 'idle' | 'sleep') =>
      Array.from(renderFrame({ species: blip, isShiny: false, mood, t: 0, face }).px).join()
    const bare = (mood: 'idle' | 'sleep') => Array.from(renderFrame({ species: blip, isShiny: false, mood, t: 0 }).px).join()
    expect(frame('visor', 'sleep')).toBe(bare('sleep'))
    expect(frame('visor', 'idle')).not.toBe(bare('idle'))
    expect(frame('monocle', 'sleep')).not.toBe(bare('sleep'))
  })
})

describe('gear drops', () => {
  const HAT_LEVELS = new Set(UNLOCKS.map(u => u.level))
  const eggs = Array.from({ length: 400 }, (_, i) => ({ hatchedAt: 1_700_000_000_000 + i * 7_919_993, kept: [] }))

  test('a hat at its levels; face gear and neckwear drop between, each once, none before level 10, the chance doubling until one is sure', () => {
    expect(UNLOCKS.map(u => u.hat)).toEqual(['sprout', 'shroom', 'beanie', 'party', 'crown', 'chef', 'halo', 'wizard', 'cowboy', 'viking', 'tophat', 'grad'])
    const problems: string[] = []
    let by25 = 0
    let by50 = 0
    let by99 = 0
    for (const egg of eggs) {
      const drops = dropsOf(egg, 99)
      expect(dropsOf(egg, 99)).toEqual(drops)
      const ids = drops.map(u => u.face ?? u.neck)
      if (new Set(ids).size !== ids.length) problems.push(`${egg.hatchedAt}: a piece twice`)
      for (const u of drops) if (HAT_LEVELS.has(u.level)) problems.push(`${egg.hatchedAt}: a drop on hat level ${u.level}`)
      let dry = 0
      const at = new Set(drops.map(u => u.level))
      const last = drops[drops.length - 1]?.level ?? 0
      if ((drops[0]?.level ?? 99) < DROP_ODDS.from) problems.push(`${egg.hatchedAt}: a drop before level ${DROP_ODDS.from}`)
      for (let level = DROP_ODDS.from; level <= last; level++) {
        if (HAT_LEVELS.has(level)) continue
        dry = at.has(level) ? 0 : dry + 1
        // The chance doubles every doubleAfter empty levels, so it is sure after this many.
        const sure = Math.ceil(Math.log2(1 / DROP_ODDS.chance)) * DROP_ODDS.doubleAfter
        if (dry > sure) problems.push(`${egg.hatchedAt}: ${dry} dry levels at ${level}`)
      }
      by25 += dropsOf(egg, 25).length
      by50 += dropsOf(egg, 50).length
      by99 += ids.length
    }
    expect(problems.slice(0, 5)).toEqual([])
    // From level 10, a slow start: about two of the ten by the wizard hat at 25, about half by 50,
    // nearly all by 99 (an unlucky egg may still miss one); and every egg its own.
    expect(by25 / eggs.length).toBeGreaterThan(1.2)
    expect(by25 / eggs.length).toBeLessThan(2.4)
    expect(by50 / eggs.length).toBeGreaterThan(4.5)
    expect(by50 / eggs.length).toBeLessThan(6)
    expect(by99 / eggs.length).toBeGreaterThan(9.8)
    expect(new Set(eggs.map(e => dropsOf(e, 99).map(u => u.face ?? u.neck).join())).size).toBeGreaterThan(300)
  })

  test('drops lean toward the slot it has more of', () => {
    // Of the eggs whose first piece is a face, more get another face second than with no lean.
    const sameSecond = (odds: typeof DROP_ODDS): number =>
      eggs.filter(e => {
        const [a, b] = dropsOf(e, 99, odds)
        return a && b && !!a.face === !!b.face
      }).length / eggs.length
    const even = sameSecond({ ...DROP_ODDS, toward: 1 })
    const leaning = sameSecond(DROP_ODDS)
    expect(even).toBeGreaterThan(0.35)
    expect(even).toBeLessThan(0.55)
    expect(leaning).toBeGreaterThan(even + 0.15)
  })

  test('a level-up names what dropped, and it is worn', () => {
    const p = hatchPixling(() => 0.4, 1_700_000_000_000)
    const first = dropsOf(p, 99)[0]!
    const { pixling, levelUp } = gain({ ...p, xp: xpForLevel(first.level) - 1 }, 'turn')
    expect(levelUp?.unlocks.map(u => u.label)).toContain(first.label)
    const gear = gearOf(pixling)
    expect(first.face ? gear.face : gear.neck).toBe(first.face ?? first.neck)
    expect(gearOf({ ...pixling, face: 'none', neck: 'none' })).toEqual({ ...gear, face: null, neck: null })
  })

  test('an old save past level 6 keeps its sunglasses; a new one finds its own', () => {
    const old = revive({ v: 1, species: 'blip', name: 'Pip', hatchedAt: 5, xp: xpForLevel(7), hat: null, face: 'shades' })!
    expect(old.kept).toEqual(['shades'])
    expect(gearOf(old).face).toBe('shades')
    expect(revive({ v: 1, species: 'blip', name: 'Pip', hatchedAt: 5, xp: xpForLevel(3) })!.kept).toEqual([])
    const fresh = revive({ ...old, kept: [] })!
    expect(fresh.kept).toEqual([])
    expect(dropsOf(old, 99).some(u => u.face === 'shades')).toBe(false)
  })

  test('saving keeps a neck choice and every kept piece', () => {
    const base = { ...hatchPixling(() => 0.4, 1_700_000_000_000), kept: [] }
    const stored = { ...base, kept: ['shades' as const] }
    const ours = { ...base, neck: 'scarf' as const }
    const merged = mergeSave(stored, base, ours)
    expect(merged.neck).toBe('scarf')
    expect(merged.kept).toEqual(['shades'])
  })
})
