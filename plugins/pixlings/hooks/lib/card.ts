// The share card: a trading card of the pixling, drawn at 240×135 and saved five times larger,
// 1200×675, the size a link preview shows whole.

import { BADGES } from './badges.ts'
import { blank, renderFrame, stamp, TRANSPARENT } from './canvas.ts'
import type { Pixels } from './canvas.ts'
import { print, printSpans, spansWidth, textWidth } from './font.ts'
import type { Span } from './font.ts'
import { daysTogether, gearOf, levelOf, metAt } from './progress.ts'
import type { Pixling } from './progress.ts'
import { RARITY_COLOR, RARITY_ORDER, speciesById } from './sprites.ts'
import { topTics } from './tics.ts'

export const CARD_W = 240
export const CARD_H = 135
export const CARD_SCALE = 5
export const CARD_BG = 0x12131c

const PANEL = 0x1d1f2e
const PANEL_LIGHT = 0x25283b
const INK = 0xe8ecf4
const DIM = 0x7a819c
const FAINT = 0x2c2f45
const GOLD = 0xffe14d

export const REPO = 'github.com/cglremrcn/pixlings'

const fill = (p: Pixels, x: number, y: number, w: number, h: number, color: number): void => {
  for (let yy = Math.max(0, y); yy < Math.min(p.h, y + h); yy++) {
    p.px.fill(color, yy * p.w + Math.max(0, x), yy * p.w + Math.min(p.w, x + w))
  }
}

const blitScaled = (p: Pixels, src: Pixels, x0: number, y0: number, scale: number): void => {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.px[y * src.w + x] ?? TRANSPARENT
      if (c !== TRANSPARENT) fill(p, x0 + x * scale, y0 + y * scale, scale, scale, c)
    }
  }
}

/** A frame in the rarity's color with its corners cut, the way pixel-art cards draw them. */
const frame = (p: Pixels, x: number, y: number, w: number, h: number, color: number, thick: number): void => {
  fill(p, x + thick, y, w - thick * 2, thick, color)
  fill(p, x + thick, y + h - thick, w - thick * 2, thick, color)
  fill(p, x, y + thick, thick, h - thick * 2, color)
  fill(p, x + w - thick, y + thick, thick, h - thick * 2, color)
}

/** 12,345: grouped by hand, as the mod's environment may have no Intl. */
const n = (value: number): string => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** "1 turn", "1,342 turns". */
const count = (value: number, noun: string): string => `${n(value)} ${noun}${value === 1 ? '' : 's'}`

type Stat = { label: Span; value: string }

/** The stat sheet beside the pixling: four rows, label left, value right. */
const statRows = (px: Pixling, now: number): Stat[] => {
  const s = px.stats
  const streak = px.streak.days
  return [
    { label: ['TURNS', DIM], value: n(s.turns) },
    { label: ['COMMITS', DIM], value: n(s.commits) },
    { label: ['BUGS SQUASHED', DIM], value: n(s.bugsSquashed) },
    streak >= 2
      ? { label: ['🔥 STREAK', 0xff8a3d], value: `${n(streak)} DAYS` }
      : { label: ['DAYS TOGETHER', DIM], value: n(daysTogether(px, now)) },
  ]
}

/** The line under the divider: the tic the model said most, or when they met. */
const quoteLine = (px: Pixling): Span[] => {
  const [top] = topTics(px.tics, 1)
  if (top && top.n > 0) {
    return [
      ['HEARD ', DIM],
      [top.label.toUpperCase(), INK],
      [` ×${n(top.n)}`, GOLD],
    ]
  }
  const d = new Date(metAt(px))
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [
    ['FRIENDS SINCE ', DIM],
    [date, INK],
  ]
}

/** The card at its drawn size, 240×135; `t` picks the animation frame of the pose. */
export const renderCard = (px: Pixling, now: number, t = 600): Pixels => {
  const species = speciesById(px.species)
  if (!species) throw new Error(`unknown species ${px.species}`)
  const accent = RARITY_COLOR[species.rarity]
  const p = blank(CARD_W, CARD_H)
  fill(p, 0, 0, CARD_W, CARD_H, CARD_BG)
  frame(p, 0, 0, CARD_W, CARD_H, accent, 2)
  frame(p, 3, 3, CARD_W - 6, CARD_H - 6, FAINT, 1)

  // Header: the name of the game, and the rarity in stars.
  print(p, 8, 7, 'PIXLINGS', accent)
  const stars = RARITY_ORDER.indexOf(species.rarity) + 1
  const rarity = species.rarity.toUpperCase()
  const rarityW = textWidth('★★★★★ ') + textWidth(rarity)
  let rx = CARD_W - 8 - rarityW
  for (let i = 0; i < 5; i++) rx = print(p, rx, 7, '★', i < stars ? accent : FAINT)
  print(p, rx + 6, 7, rarity, accent)

  // The pixling on a spotlit panel.
  const panel = { x: 8, y: 18, w: 72, h: 80 }
  fill(p, panel.x, panel.y, panel.w, panel.h, PANEL)
  const cx = panel.x + panel.w / 2
  const cy = panel.y + panel.h / 2 + 4
  for (let y = panel.y; y < panel.y + panel.h; y++) {
    for (let x = panel.x; x < panel.x + panel.w; x++) {
      const d = Math.hypot((x - cx) / 1.1, y - cy)
      if (d < 30 && (d < 24 || (x + y) % 2 === 0)) p.px[y * p.w + x] = PANEL_LIGHT
    }
  }
  frame(p, panel.x, panel.y, panel.w, panel.h, accent, 1)
  const gear = gearOf(px)
  const sprite = renderFrame({ species, isShiny: px.isShiny, mood: 'happy', t, hat: gear.hat, face: gear.face, neck: gear.neck })
  const scale = 3
  const sx = Math.round(panel.x + (panel.w - sprite.w * scale) / 2)
  const sy = panel.y + panel.h - 4 - sprite.h * scale
  blitScaled(p, sprite, sx, Math.max(panel.y + 1, sy), scale)
  if (px.isShiny) {
    const spark = ['..W..', '..Y..', 'WYWYW', '..Y..', '..W..']
    stamp(p, panel.x + 4, panel.y + 4, spark, { W: 0xffffff, Y: GOLD })
    stamp(p, panel.x + panel.w - 9, panel.y + 12, spark, { W: 0xffffff, Y: GOLD })
  }

  // The right column: name, level, experience, days and streak, stats, badges.
  const col = 88
  const width = CARD_W - 8 - col
  const name = px.name.toUpperCase()
  const nameScale = textWidth(name, 2) <= width ? 2 : 1
  print(p, col, nameScale === 2 ? 18 : 22, name, INK, nameScale)

  const { level, into, need } = levelOf(px.xp)
  const kind: Span[] = [
    [`LV ${level}`, accent],
    [' · ', FAINT],
    ...(px.isShiny ? ([['✦ SHINY ', GOLD]] as Span[]) : []),
    [species.name.toUpperCase(), DIM],
  ]
  printSpans(p, col, 36, kind)
  fill(p, col, 46, width, 4, FAINT)
  fill(p, col, 46, Math.max(1, Math.round((into / Math.max(1, need)) * width)), 4, accent)

  statRows(px, now).forEach(({ label, value }, i) => {
    const y = 55 + i * 9
    const end = printSpans(p, col, y, [label])
    const valueX = col + width - textWidth(value)
    print(p, valueX, y, value, INK)
    for (let x = end + 1; x < valueX - 3; x += 3) p.px[(y + 6) * p.w + x] = FAINT
  })

  BADGES.forEach((b, i) => {
    const isEarned = px.badges[b.id] !== undefined
    const colors = isEarned ? b.colors : Object.fromEntries(Object.keys(b.colors).map(k => [k, FAINT]))
    stamp(p, col + i * 9, 91, b.icon, colors)
  })

  // Divider, the quote and the footer.
  fill(p, 8, 101, CARD_W - 16, 1, FAINT)
  const quote = quoteLine(px)
  printSpans(p, Math.round((CARD_W - spansWidth(quote)) / 2), 106, quote)
  const repo = REPO.toUpperCase()
  print(p, Math.round((CARD_W - textWidth(repo)) / 2), 120, repo, DIM)
  return p
}

/** What to post with the card. */
export const shareText = (px: Pixling): string => {
  const species = speciesById(px.species)
  const { level } = levelOf(px.xp)
  const rarity = species ? species.rarity : 'common'
  const shiny = px.isShiny ? 'SHINY ' : ''
  const [top] = topTics(px.tics, 1)
  const heard = top ? ` Claude has said ${top.label} ${top.n}× in front of it.` : ''
  const badges = Object.keys(px.badges).length
  return (
    `Meet ${px.name}, my Lv ${level} ${shiny}${rarity} ${species?.name.toLowerCase() ?? 'pixling'} in Claude Code. ` +
    `${count(px.stats.turns, 'turn')}, ${count(px.stats.bugsSquashed, 'bug')} squashed, ${badges}/${BADGES.length} badges.${heard}` +
    ` Hatch yours: https://${REPO}`
  )
}
