import { describe, expect, test } from 'claude-code/testing'

import { renderHatch } from '../hooks/lib/canvas.ts'
import type { FrameInput } from '../hooks/lib/canvas.ts'
import { describeEgg, EGG_SHAPE, eggLookOf, eggPixels, SHELLS } from '../hooks/lib/eggs.ts'
import { RARITY_COLOR, SPECIES } from '../hooks/lib/sprites.ts'
import type { Rarity } from '../hooks/lib/sprites.ts'

const hsl = (c: number): { h: number; l: number } => {
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, l: (max + min) / 2 }
}

const isShell = (x: number, y: number): boolean => (EGG_SHAPE[y]?.[x] ?? '.') !== '.'
const nearShell = (x: number, y: number): boolean =>
  isShell(x, y) || isShell(x + 1, y) || isShell(x - 1, y) || isShell(x, y + 1) || isShell(x, y - 1)

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

describe('egg looks', () => {
  test('a seed always gives the same look', () => {
    expect(eggLookOf(42, 'rare', false)).toEqual(eggLookOf(42, 'rare', false))
    expect(eggPixels(eggLookOf(42, 'rare', false), 0)).toEqual(eggPixels(eggLookOf(42, 'rare', false), 0))
  })

  test('all 30 looks turn up', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 2000; seed++) {
      const look = eggLookOf(seed * 7919, 'common', false)
      seen.add(`${look.pattern}/${look.shell}`)
    }
    expect(seen.size).toBe(30)
  })

  test('the mark follows the rarity', () => {
    expect(eggLookOf(1, 'common', false).mark).toBe('plain')
    expect(eggLookOf(1, 'uncommon', false).mark).toBe('mossy')
    expect(eggLookOf(1, 'rare', false).mark).toBe('glowing')
    expect(eggLookOf(1, 'epic', false).mark).toBe('gilded')
    expect(eggLookOf(1, 'legendary', false).mark).toBe('gilded')
    for (const seed of [3, 99, 123456]) {
      expect(eggPixels(eggLookOf(seed, 'legendary', false), 0)).toEqual(eggPixels(eggLookOf(seed, 'epic', false), 0))
    }
  })

  test('marks stay inside the shell', () => {
    const stray: string[] = []
    for (const rarity of RARITIES) {
      for (const isShiny of [false, true]) {
        for (let seed = 1; seed <= 40; seed++) {
          for (const t of [0, 700, 1600]) {
            const px = eggPixels(eggLookOf(seed * 31, rarity, isShiny), t)
            if (px.length !== 256) stray.push(`${rarity} ${seed}: ${px.length} pixels`)
            px.forEach((c, i) => {
              if (c === null) return
              const [x, y] = [i % 16, Math.floor(i / 16)]
              if (!(isShiny ? nearShell(x, y) : isShell(x, y))) stray.push(`${rarity} ${isShiny} ${seed} ${t} at ${x},${y}`)
            })
          }
        }
      }
    }
    expect(stray).toEqual([])
  })

  test('the gilded outline keeps its lightness', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const look = eggLookOf(seed, 'epic', false)
      const shell = SHELLS[look.shell]
      const px = eggPixels(look, 0)
      for (let y = 0; y <= 4; y++) {
        for (let x = 0; x < 16; x++) {
          if (EGG_SHAPE[y]![x] !== 'K') continue
          const c = px[y * 16 + x]!
          expect(Math.abs(hsl(c).l - hsl(shell.K).l), `${look.shell} ${x},${y}`).toBeLessThanOrEqual(0.01)
          expect(hsl(c).h, `${look.shell} hue`).toBeGreaterThanOrEqual(30)
          expect(hsl(c).h).toBeLessThanOrEqual(50)
        }
      }
    }
  })

  test('plain eggs hold still, shiny and glowing ones move', () => {
    const plain = eggLookOf(5, 'common', false)
    expect(eggPixels(plain, 900)).toEqual(eggPixels(plain, 0))
    const moves = (look: ReturnType<typeof eggLookOf>): boolean => {
      const first = JSON.stringify(eggPixels(look, 0))
      for (let t = 100; t <= 6000; t += 100) if (JSON.stringify(eggPixels(look, t)) !== first) return true
      return false
    }
    expect(moves(eggLookOf(5, 'common', true))).toBe(true)
    expect(moves(eggLookOf(5, 'rare', false))).toBe(true)
  })

  test('the hatch draws the picked egg', () => {
    const input: FrameInput = { species: SPECIES[0]!, isShiny: false, mood: 'celebrate', t: 200 }
    let look = eggLookOf(1, 'epic', false)
    for (let seed = 2; look.shell !== 'rose'; seed++) look = eggLookOf(seed, 'epic', false)
    expect(renderHatch(input, RARITY_COLOR.epic, look).px).not.toEqual(renderHatch(input, RARITY_COLOR.epic).px)
    expect(renderHatch(input, RARITY_COLOR.epic, null).px).toEqual(renderHatch(input, RARITY_COLOR.epic).px)
  })

  test('an egg is described by its look alone', () => {
    const words = (rarity: Rarity, isShiny = false) => describeEgg(eggLookOf(8, rarity, isShiny))
    expect(words('common')).toMatch(/^An? (speckled|spotted|dappled|marbled|dusted) (cream|rose|sand|fog|peach|charcoal) egg$/)
    expect(words('uncommon')).toMatch(/ with a green vine$/)
    expect(words('rare')).toMatch(/ with glowing blue veins$/)
    expect(words('legendary')).toMatch(/ with a gold cap$/)
    expect(words('common', true)).toMatch(/egg, shimmering$/)
    for (const r of RARITIES) expect(words(r, true)).not.toMatch(/common|rare|epic|legendary|shiny|mossy|gilded/i)
  })
})
