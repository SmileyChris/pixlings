import { describe, expect, test } from 'claude-code/testing'

import { CARD_BG, renderCard } from '../hooks/lib/card.ts'
import { CANVAS_W, layoutFor, mirror, renderFrame, SPRITE_X, TRANSPARENT } from '../hooks/lib/canvas.ts'
import type { Hat, Mood } from '../hooks/lib/canvas.ts'
import { hasGlyph } from '../hooks/lib/font.ts'
import { allLines, say, SPECIES_LINES } from '../hooks/lib/lines.ts'
import type { LineKey } from '../hooks/lib/lines.ts'
import { hatchPixling, roll, xpForLevel } from '../hooks/lib/progress.ts'
import { checkSpecies, SPECIES } from '../hooks/lib/sprites.ts'
import type { Species } from '../hooks/lib/sprites.ts'

/** Tests that run minutes or days of clock: about a second alone, slower when suites share the CPU. */
const LONG = 20_000

/** A better-mixed seeded generator than an LCG for a long run of rolls. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const MOODS: Mood[] = ['idle', 'working', 'happy', 'celebrate', 'sad', 'alarmed', 'attention', 'sleep', 'love', 'dizzy', 'walk', 'unimpressed']
const HATS: (Hat | null)[] = [null, 'sprout', 'shroom', 'party', 'crown', 'halo', 'wizard']
const NEW = ['capybara', 'turtle', 'snail', 'penguin', 'goose', 'rabbit']

/** The per-species hatch odds, in percent, that the README and the roll promise. */
const ODDS: Readonly<Record<string, number>> = {
  blip: 10,
  duck: 10,
  cat: 10,
  snail: 10,
  rabbit: 10,
  robot: 7,
  cactus: 7,
  capybara: 7,
  penguin: 7,
  owl: 14 / 3,
  axolotl: 14 / 3,
  turtle: 14 / 3,
  ghost: 3.25,
  goose: 3.25,
  dragon: 1.5,
}

const at = (s: Species, x: number, y: number): string => s.art[y]?.[x] ?? '.'
const isOpaque = (s: Species, x: number, y: number): boolean => at(s, x, y) !== '.'
const isInside = (s: Species, x: number, y: number): boolean => isOpaque(s, x, y) && at(s, x, y) !== 'K'

/** The species with a distinct color per palette key, so its body can be found in a frame. */
const SENTINEL = 0x010200
const probe = (s: Species): Species => {
  const colors = Object.fromEntries(Object.keys(s.palette).map((k, i) => [k, SENTINEL + i]))
  return { ...s, id: `${s.id}~probe`, palette: colors, shiny: colors }
}

/** Every key a body pixel may show: a wiggling row shows any of its frames. */
const keysAt = (s: Species, x: number, y: number): string[] => {
  const w = s.wiggle?.find(r => r.row === y)
  return w ? w.frames.map(f => f[x] ?? '.') : [at(s, x, y)]
}

describe('the new species', () => {
  test('fifteen clean species, the dragon the only legendary', () => {
    expect(SPECIES.length).toBe(15)
    expect(new Set(SPECIES.map(s => s.id)).size).toBe(15)
    for (const id of NEW) expect(SPECIES.some(s => s.id === id)).toBe(true)
    for (const s of SPECIES) {
      expect(checkSpecies(s)).toEqual([])
      expect(s.verbs.length).toBeGreaterThanOrEqual(3)
      expect(s.verbs.length).toBeLessThanOrEqual(5)
      expect(s.past.length).toBeGreaterThan(0)
      expect(s.blurb.length).toBeGreaterThan(20)
    }
    expect(SPECIES.filter(s => s.rarity === 'legendary').map(s => s.id)).toEqual(['dragon'])
  })

  test('every species × mood × hat × shiny × facing stays on the canvas', { timeoutMs: LONG }, () => {
    const problems: string[] = []
    for (const real of SPECIES) {
      const p = probe(real)
      for (const isFlipped of [false, true]) {
        const art = isFlipped ? mirror(p) : p
        const opaque: [number, number][] = []
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) if (keysAt(art, x, y).some(k => k !== '.')) opaque.push([x, y])
        }
        for (const hat of HATS) {
          const layout = layoutFor(real, hat)
          for (const mood of MOODS) {
            for (const isShiny of [false, true]) {
              for (const t of [0, 140, 333, 700, 2900]) {
                const where = `${real.id} ${mood} ${hat ?? 'bare'}${isShiny ? ' shiny' : ''}${isFlipped ? ' flipped' : ''} t=${t}`
                const f = renderFrame({ species: p, isShiny, mood, t, hat, isFlipped })
                if (f.w !== CANVAS_W || f.h !== layout.h) problems.push(`${where}: canvas ${f.w}×${f.h}`)
                // Find where the body was drawn: the offset at which every visible body pixel
                // shows the key the art has there.
                const seen: [number, number, string][] = []
                for (let y = 0; y < f.h; y++) {
                  for (let x = 0; x < f.w; x++) {
                    const key = Object.keys(art.palette)[(f.px[y * f.w + x] ?? TRANSPARENT) - SENTINEL]
                    if (key) seen.push([x, y, key])
                  }
                }
                const offsets: [number, number][] = []
                for (let dy = -6; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    const ox = SPRITE_X + dx
                    const oy = layout.y + dy
                    if (seen.every(([x, y, key]) => keysAt(art, x - ox, y - oy).includes(key))) offsets.push([ox, oy])
                  }
                }
                if (offsets.length !== 1) {
                  problems.push(`${where}: body found at ${offsets.length} offsets`)
                  continue
                }
                const [ox, oy] = offsets[0]!
                const bob = oy - layout.y
                for (const [x, y] of opaque) {
                  const cx = ox + x
                  const cy = oy + y
                  if (cx >= 0 && cx < f.w && cy >= 0 && cy < f.h) continue
                  // The one-pixel bob of canvas.ts dips the bottom row under the canvas edge.
                  if (bob === 1 && cy === f.h && cx >= 0 && cx < f.w) continue
                  problems.push(`${where}: body pixel ${cx},${cy} off the ${f.w}×${f.h} canvas`)
                }
              }
            }
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([])
  })

  test('faces sit on the body in every mood, facing either way', () => {
    const problems: string[] = []
    for (const s of SPECIES.flatMap(s => [s, mirror(s)])) {
      const [w, h] = s.eyeSize
      const need = (ok: boolean, what: string): void => {
        if (!ok) problems.push(`${s.id}: ${what}`)
      }
      s.eyes.forEach(([x, y], i) => {
        for (let dy = 0; dy < Math.max(h, 2); dy++) {
          for (let dx = 0; dx < Math.max(w, 2); dx++) need(isInside(s, x + dx, y + dy), `eye ${x + dx},${y + dy}`)
        }
        need(isOpaque(s, x - 1, y + 1) && isOpaque(s, x + w, y + 1), `happy eye at ${x},${y}`)
        const outer = i === 0 ? x : x + w - 1
        for (let drop = 0; drop < 3; drop++) need(isOpaque(s, outer, y + h + drop), `tear at ${outer},${y + h + drop}`)
      })
      if (s.mouth) {
        const [mx, my] = s.mouth
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) need(isInside(s, mx + dx, my + dy), `mouth ${mx + dx},${my + dy}`)
      }
      // A blush may overlap the outline by a pixel (the duck's does), but never the air.
      for (const [cx, cy] of s.cheeks) need(isOpaque(s, cx, cy) && isOpaque(s, cx + 1, cy), `cheek ${cx},${cy}`)
    }
    expect(problems).toEqual([])
  })

  test('a hat sits on the top of the head, not in the air or on the face', () => {
    const problems: string[] = []
    for (const s of SPECIES.flatMap(s => [s, mirror(s)])) {
      const [hx, hy] = s.head
      if (!isOpaque(s, hx, hy)) problems.push(`${s.id}: nothing under the hat at ${hx},${hy}`)
      // At most a tuft, antenna or leaf pokes up past the brim.
      for (let y = 0; y < hy - 1; y++) if (isOpaque(s, hx, y)) problems.push(`${s.id}: body at ${hx},${y} above the hat`)
    }
    expect(problems).toEqual([])
  })

  test('a seeded 100k roll matches the stated odds per species', () => {
    const n = 100_000
    const random = mulberry32(2026)
    const counts: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const r = roll(random)
      counts[r.species.id] = (counts[r.species.id] ?? 0) + 1
    }
    expect(Object.keys(ODDS).sort()).toEqual(SPECIES.map(s => s.id).sort())
    expect(Math.abs(Object.values(ODDS).reduce((a, b) => a + b, 0) - 100)).toBeLessThan(1e-9)
    for (const s of SPECIES) {
      const p = (ODDS[s.id] ?? 0) / 100
      const tolerance = Math.max(0.0025, 4 * Math.sqrt((p * (1 - p)) / n))
      const seen = (counts[s.id] ?? 0) / n
      if (Math.abs(seen - p) > tolerance) expect(`${s.id} ${(seen * 100).toFixed(2)}%`).toBe(`${s.id} ${(p * 100).toFixed(2)}%`)
    }
    // Every tier is rarer per species than the one below it.
    const perTier = ['common', 'uncommon', 'rare', 'epic', 'legendary'].map(r => ODDS[SPECIES.find(s => s.rarity === r)!.id]!)
    for (let i = 1; i < perTier.length; i++) expect(perTier[i]!).toBeLessThan(perTier[i - 1]!)
  })

  test('the share card fits every name, shiny at level 99', () => {
    const longest = [...SPECIES].sort((a, b) => b.name.length - a.name.length)[0]!
    expect(longest.name.length).toBeGreaterThanOrEqual(8)
    for (const s of SPECIES) {
      for (const ch of s.name) expect(hasGlyph(ch)).toBe(true)
      const px = { ...hatchPixling(mulberry32(1), 0), species: s.id, isShiny: true, name: 'Mochi', xp: xpForLevel(99) }
      const card = renderCard(px, 0)
      // "LV 99 · ✦ SHINY CAPYBARA" ends inside the right column, before the inner frame.
      for (let y = 36; y < 43; y++) {
        for (let x = 232; x < 236; x++) {
          if (card.px[y * card.w + x] !== CARD_BG) expect(`${s.id} kind line at ${x},${y}`).toBe('inside the column')
        }
      }
      // The gold "✦ SHINY" is printed in the right column.
      const column = Array.from({ length: 7 }, (_, i) => [...card.px.slice((36 + i) * card.w + 88, (36 + i) * card.w + 232)]).flat()
      expect(column.includes(0xffe14d)).toBe(true)
    }
  })

  test('species lines belong to a species, use slots the code fills, and are said', () => {
    const known = new Set(['name', 'n', 'dur', 'time', 'label', 'level', 'item', 'failed', 'passed', 'branch', 'pr', 'window'])
    const keys = new Set(allLines().map(l => l.key))
    const problems: string[] = []
    for (const [id, byKey] of Object.entries(SPECIES_LINES)) {
      if (!SPECIES.some(s => s.id === id)) problems.push(`${id}: no such species`)
      for (const [key, list] of Object.entries(byKey ?? {})) {
        if (!keys.has(key as LineKey)) problems.push(`${id}.${key}: no such event`)
        for (const text of list ?? []) {
          for (const m of text.matchAll(/\{(\w+)\}/g)) if (!known.has(m[1] ?? '')) problems.push(`${id}: ${text}`)
        }
      }
    }
    expect(problems).toEqual([])
    for (const id of NEW) {
      const own = Object.values(SPECIES_LINES[id] ?? {}).flatMap(list => list ?? [])
      expect(own.length).toBeGreaterThanOrEqual(5)
      const pets = SPECIES_LINES[id]?.pet ?? []
      const heard = new Set<string>()
      for (let i = 0; i < 40; i++) heard.add(say('pet', { name: 'Pip' }, id, () => i / 40))
      expect(pets.some(line => heard.has(line))).toBe(true)
    }
  })
})
