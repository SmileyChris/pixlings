import { describe, expect, test } from 'claude-code/testing'

import { BADGES, tierKey } from '../hooks/lib/badges.ts'
import type { Badge } from '../hooks/lib/badges.ts'
import { TRANSPARENT } from '../hooks/lib/canvas.ts'
import { CARD_W, renderCard, shareText } from '../hooks/lib/card.ts'
import { hatchPixling } from '../hooks/lib/progress.ts'
import type { Pixling } from '../hooks/lib/progress.ts'
import { toCells } from '../hooks/lib/raster.ts'
import { cardIcon, drawCard, shelfFits } from '../hooks/lib/room.ts'
import type { CardModel, RoomKit } from '../hooks/lib/room.ts'

const FILL = 0x1a1b26
/** The share card's background and panel, where the same icons stand. */
const SHARE = [0x12131c, 0x1d1f2e]
const FULL = 0x2588
const DEFAULT_COLOR = 0x01000000

type Node = { type: string; props: Record<string, unknown> }

/** An element table that keeps what it is given, so the tree can be read back. */
const kit = (surface: 'terminal' | 'desktop'): RoomKit => {
  const make = (type: string) => ((props: Record<string, unknown>) => ({ type, props })) as never
  return surface === 'terminal'
    ? { Box: make('Box'), Text: make('Text'), Button: make('Button'), Raster: make('Raster') }
    : { Box: make('Box'), Text: make('Text'), Button: make('Button'), Svg: make('Svg') }
}

const nodes = (tree: unknown): Node[] => {
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return [node, ...[node.props?.['children']].flat().flatMap(nodes)]
}

const text = (tree: unknown): string =>
  nodes(tree)
    .filter(n => n.type === 'Text')
    .map(n => [n.props['children']].flat().join(''))
    .join('\n')

const byId = (id: string): Badge => BADGES.find(b => b.id === id)!

const model = (earned: string[]): CardModel => ({
  persona: 'Cheers for every green test.',
  streak: { days: 3, best: 3 },
  days: 2,
  earned: earned.map(byId),
  heard: 'Heard: "You\'re absolutely right" ×7',
})

/** WCAG contrast of two colors. */
const contrast = (a: number, b: number): number => {
  const lum = (c: number): number => {
    const f = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f((c >> 16) & 255) + 0.7152 * f((c >> 8) & 255) + 0.0722 * f(c & 255)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('the hover card icons', () => {
  test('every badge icon is filled to the card: no blank pixel, an even height, no cell open to the terminal', () => {
    for (const b of BADGES) {
      const p = cardIcon(b, FILL)
      expect(p.h % 2, b.id).toBe(0)
      expect([...p.px].includes(TRANSPARENT), b.id).toBe(false)
      const holes = toCells(p).filter(([cp, , bg]) => cp !== FULL && bg === DEFAULT_COLOR)
      expect(holes.length, b.id).toBe(0)
    }
  })

  test('the outline of every icon stands out from the card and the share card', () => {
    for (const b of BADGES) {
      for (const [ch, color] of Object.entries(b.colors)) {
        // Only a color beside a blank pixel meets the background.
        const isEdge = b.icon.some((row, y) =>
          [...row].some((c, x) => c === ch && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (b.icon[y + dy!]?.[x + dx!] ?? '.') === '.')),
        )
        if (!isEdge) continue
        for (const bg of [FILL, ...SHARE]) expect(contrast(color, bg), `${b.id} ${ch} on #${bg.toString(16)}`).toBeGreaterThanOrEqual(1.6)
      }
    }
  })

  test('the shelf holds what fits: four in a wide card, two in a narrower one, none in a slim one', () => {
    expect(shelfFits(72, 16)).toBe(4)
    expect(shelfFits(56, 16)).toBe(2)
    expect(shelfFits(40, 15)).toBe(0)
  })

  test('a terminal card draws the flame and the newest badges as Rasters, and no emoji', () => {
    const tree = drawCard(kit('terminal'), model(['hello', 'dangerous', 'exterminator', 'greenThumb', 'liftoff']), 72, FILL, '#c0caf5')
    const keys = nodes(tree).filter(n => n.type === 'Raster').map(n => n.props['key'])
    expect(keys).toEqual(['card-flame', 'card-badge-dangerous', 'card-badge-exterminator', 'card-badge-greenThumb', 'card-badge-liftoff'])
    const words = text(tree)
    expect(words).toContain('3-day streak')
    expect(words).toContain('best 3')
    expect(words).toContain('2 days together')
    expect(words).toContain('5/18')
    expect(/\p{Extended_Pictographic}/u.test(words)).toBe(false)
  })

  test('with no room for the shelf it shows no badge at all, only the count', () => {
    const tree = drawCard(kit('terminal'), model(['hello', 'dangerous']), 40, FILL, '#c0caf5')
    expect(nodes(tree).filter(n => n.type === 'Raster').map(n => n.props['key'])).toEqual(['card-flame'])
    expect(text(tree)).toContain('2/18')
  })

  test('the desktop draws the same icons as Svgs, each named for a reader', () => {
    const tree = drawCard(kit('desktop'), model(['hello', 'greenThumb']), 72, FILL, '#c0caf5')
    const svgs = nodes(tree).filter(n => n.type === 'Svg')
    expect(svgs.map(n => n.props['alt'])).toEqual(['Streak', 'Hello, World', 'Green Thumb'])
    expect(svgs.every(n => String(n.props['source']).startsWith('<svg'))).toBe(true)
  })
})

describe('the share card row', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
  const T0 = Date.parse('2026-10-03T12:00:00Z')
  const withTiers = (tiers: Record<string, number>): Pixling => {
    const badges: Record<string, number> = {}
    for (const b of BADGES) for (let t = 1; t <= (tiers[b.id] ?? 0); t++) badges[tierKey(b.id, t)] = T0
    return { ...hatchPixling(seeded(1), T0), badges }
  }
  const allGold = () => withTiers(Object.fromEntries(BADGES.map(b => [b.id, b.steps.length])))
  const at = (p: { w: number; px: Int32Array }, x: number, y: number) => p.px[y * p.w + x]

  test('eighteen icons fit the column, above the divider', () => {
    const card = renderCard(allGold(), T0)
    for (let y = 90; y <= 100; y++) {
      // Between the picture's panel and the inner frame at x 236.
      for (let x = 86; x < CARD_W - 4; x++) {
        const c = at(card, x, y)
        if (c === undefined || SHARE.includes(c)) continue
        expect(x >= 88 && x < 232 && y >= 91 && y < 100, `pixel at ${x},${y}`).toBe(true)
      }
    }
  })

  test('pips show the tier', () => {
    const card = renderCard(withTiers({ hello: 1, exterminator: 2 }), T0)
    const x = 88 + 8
    expect(at(card, x + 1, 99)).toBe(0xc0c8d4)
    expect(at(card, x + 3, 99)).toBe(0xc0c8d4)
    expect(at(card, x + 5, 99)).toBe(0x2c2f45)
    expect(SHARE).toContain(at(card, 89, 99))
  })

  test('the post counts badges, not tiers', () => {
    expect(shareText(allGold())).toContain('18/18 badges')
  })
})
