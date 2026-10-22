// The room: the pixling's own pane, which `/pixling room` opens. The band above the prompt is the
// terminal's and the desktop's alone; the room is drawn on every surface, so it is where VS Code
// and the phone see the pixling. Pure: the hooks read the values and hand them in with the
// surface's element table, so a tool can draw the very same tree outside a session.

import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  RasterProps,
  RenderElement,
  SvgProps,
  TextProps,
} from 'claude-code'

import type { PixlingsEffect, PixlingsMini } from '../../types'
import { BADGES, earnedBadges, localDate } from './badges.ts'
import type { Badge } from './badges.ts'
import { blank, renderFrame, renderSilhouette, stamp, TRANSPARENT } from './canvas.ts'
import type { Pixels } from './canvas.ts'
import { daysTogether, levelOf, xpBar } from './progress.ts'
import type { Pixling } from './progress.ts'
import { rasterOf, toSvg } from './raster.ts'
import { RARITY_COLOR, RARITY_STARS, SPECIES, speciesById } from './sprites.ts'
import type { Species } from './sprites.ts'
import { topTics } from './tics.ts'

/** The pane's id: what `$.ui.open({ id })` opens and the render hook matches. */
export const ROOM_ID = 'pixling-room'

/** The keys of the room's big sprite: what the frame clock names to repaint it on the terminal. */
export const ROOM_EGG_KEY = 'room-egg'
export const ROOM_SPRITE_KEY = 'room-pixling'

export type RoomTab = 'home' | 'garden' | 'badges'

export const ROOM_TABS: readonly { readonly tab: RoomTab; readonly label: string; readonly short: string; readonly hotkey: string }[] = [
  { tab: 'home', label: 'Home', short: 'Home', hotkey: 'h' },
  { tab: 'garden', label: 'Dex garden', short: 'Garden', hotkey: 'g' },
  { tab: 'badges', label: 'Badge shelf', short: 'Badges', hotkey: 'b' },
]

/** A stored tab this version knows, else home. */
export const tabOf = (value: unknown): RoomTab => ROOM_TABS.find(t => t.tab === value)?.tab ?? 'home'

/** The elements the room draws with: a Raster on the terminal, an Svg on every other surface. */
export type RoomKit = {
  readonly Box: ElementConstructor<BoxProps>
  readonly Text: ElementConstructor<TextProps>
  readonly Button: ElementConstructor<ButtonProps>
  readonly Raster?: ElementConstructor<RasterProps>
  readonly Svg?: ElementConstructor<SvgProps>
}

// The seat ------------------------------------------------------------------------------------

/** About how many CSS pixels a remote surface's code font gives a cell: how wide an Svg reads. */
const PX_PER_CELL = 8
/** The narrowest card that sits beside the sprite; narrower seats stack the two. */
const MIN_CARD = 26
const STAT_CELL = 18

/** Where the surface seated the pane, and what fits there. */
export type Seat = {
  /** Cells across the pane's body. */
  readonly columns: number
  /** The terminal draws a Raster, two pixels a cell; every other surface an Svg. */
  readonly isTerminal: boolean
  /** Svg pixels per sprite pixel. */
  readonly scale: number
  /** Cells the big sprite takes across. */
  readonly spriteColumns: number
  /** The card beside the sprite; under it when the seat is too narrow for both. */
  readonly isSideBySide: boolean
  /** Stat pairs per row. */
  readonly statColumns: number
  /** A phone or a slim side panel: short tab names, one badge a row. */
  readonly isNarrow: boolean
}

export const seatOf = (columns: number, isTerminal: boolean, frameWidth: number): Seat => {
  const cols = Math.max(1, Math.floor(columns))
  const besideScale = isTerminal ? 1 : cols >= 60 ? 6 : cols >= 44 ? 5 : 4
  const columnsAt = (scale: number): number => (isTerminal ? frameWidth : Math.ceil((frameWidth * scale) / PX_PER_CELL))
  const isSideBySide = cols >= columnsAt(besideScale) + 2 + MIN_CARD
  // Stacked, the sprite has a row of its own: on a remote surface it takes up to half of it.
  const scale = isSideBySide || isTerminal ? besideScale : Math.max(4, Math.min(8, Math.floor((cols * PX_PER_CELL) / 2 / frameWidth)))
  return {
    columns: cols,
    isTerminal,
    scale,
    spriteColumns: columnsAt(scale),
    isSideBySide,
    statColumns: Math.max(1, Math.min(3, Math.floor(cols / STAT_CELL))),
    isNarrow: cols < 44,
  }
}

// Pictures ------------------------------------------------------------------------------------

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

const speciesOf = (p: Pixling): Species => speciesById(p.species) ?? SPECIES[0]!

/** The pixels' opaque box: the sprite without the canvas around it, rows paired from the top. */
export const trim = (p: Pixels): Pixels => {
  let left = p.w
  let top = p.h
  let right = -1
  let bottom = -1
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if ((p.px[y * p.w + x] ?? TRANSPARENT) === TRANSPARENT) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) return p
  const w = right - left + 1
  // An even height, padded above, so the feet stay on the cell's bottom edge.
  const pad = (bottom - top + 1) % 2
  const h = bottom - top + 1 + pad
  const px = new Int32Array(w * h).fill(TRANSPARENT)
  for (let y = pad; y < h; y++) {
    for (let x = 0; x < w; x++) px[y * w + x] = p.px[(top + y - pad) * p.w + left + x] ?? TRANSPARENT
  }
  return { w, h, px }
}

const gardenFrames = new Map<string, Pixels>()

/** A species as the garden shows it: small and idle, or a silhouette until it has been found. */
export const gardenFrame = (s: Species, isFound: boolean): Pixels => {
  const key = `${s.id}|${isFound}`
  const known = gardenFrames.get(key)
  if (known) return known
  const frame = trim(isFound ? renderFrame({ species: s, isShiny: false, mood: 'idle', t: 0 }) : renderSilhouette(s))
  gardenFrames.set(key, frame)
  return frame
}

const picture = (kit: RoomKit, frame: Pixels, scale: number, key: string, alt: string): RenderElement => {
  if (kit.Raster) {
    const raster = rasterOf(frame)
    return kit.Raster({ key, columns: raster.columns, rows: raster.rows, cells: raster.cells })
  }
  if (kit.Svg) return kit.Svg({ source: toSvg(frame, scale), alt, width: frame.w * scale, height: frame.h * scale })
  return kit.Text({ children: alt })
}

// What it knows -------------------------------------------------------------------------------

/** The locked badge nearest to earned: the most of its way there, the first listed on a tie. */
export const nextBadge = (p: Pixling): { badge: Badge; have: number; need: number } | null => {
  let best: { badge: Badge; have: number; need: number } | null = null
  for (const badge of BADGES) {
    if (p.badges[badge.id] !== undefined) continue
    const [have, need] = badge.progress(p)
    if (!best || have / need > best.have / best.need) best = { badge, have, need }
  }
  return best
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/** The most of a persona drawn: an adopted Buddy's personality runs to 280 characters. */
export const PERSONA_MAX = 100

/** The stored persona as one line to draw, cut at `max` characters; null when there is none. */
export const personaLine = (persona: unknown, max = PERSONA_MAX): string | null => {
  if (typeof persona !== 'string') return null
  const line = persona.replace(/\s+/g, ' ').trim()
  if (!line) return null
  const chars = [...line]
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line
}

// The hover card -----------------------------------------------------------------------------

/** The band's hover card: who it is, the streak, the badges, the days together, what it heard. */
export type CardModel = {
  readonly persona: string
  readonly streak: { readonly days: number; readonly best: number }
  readonly days: number
  /** Earned badges, the oldest first. */
  readonly earned: readonly Badge[]
  readonly heard: string
}

export const cardModel = (p: Pixling, persona: string | null, at: number): CardModel => {
  const heard = topTics(p.tics, 2)
  return {
    persona: persona ?? `${p.name} the ${speciesOf(p).name}`,
    streak: { days: p.streak.days, best: p.streak.best },
    days: daysTogether(p, at),
    earned: earnedBadges(p),
    heard: heard.length > 0 ? `Heard: ${heard.map(t => `${t.label} ×${t.n}`).join(' · ')}` : 'Heard: nothing to roll its eyes at, yet',
  }
}

/** The widest the card opens: past the info rows, over the band's empty right. */
export const CARD_MAX = 72
/** Svg pixels per icon pixel on the surfaces that draw an Svg. */
const ICON_SCALE = 3
const STREAK_BADGE = BADGES.find(b => b.id === 'onFire')!

/**
 * An icon of the card as pixels, its blanks painted `fill`: the terminal shows its own background
 * through a blank cell, which would punch holes in the opaque card. The height rounds up to even,
 * since a cell holds two pixels and a lone top one leaves its bottom half blank.
 */
export const cardIcon = (b: Badge, fill: number): Pixels => {
  const w = Math.max(...b.icon.map(row => row.length))
  const p = blank(w, b.icon.length + (b.icon.length % 2))
  p.px.fill(fill)
  stamp(p, 0, 0, b.icon, b.colors)
  return p
}

/** How many badge icons the shelf holds in a card `width` cells across, borders and padding in. */
export const shelfFits = (width: number, textColumns: number): number => {
  const inner = width - 4
  const icon = Math.max(...BADGES.map(b => b.icon[0]?.length ?? 0)) + 1
  // The flame, its text, the gap before the shelf and the count after it; the last icon on the
  // shelf has no gap after it.
  const taken = icon + textColumns + 3 + 7
  return Math.max(0, Math.floor((inner - taken + 1) / icon))
}

/**
 * The card's rows: who it is; the streak by its flame beside the badges on their shelf, newest
 * last, with the count; and what it heard. The icons are the share card's own, so the two agree.
 */
export const drawCard = (kit: RoomKit, m: CardModel, width: number, fill: number, ink: string): RenderElement => {
  const { Box, Text } = kit
  const lines = [`${m.streak.days}-day streak`, `best ${m.streak.best}`, `${plural(m.days, 'day')} together`]
  const textColumns = Math.max(...lines.map(l => l.length))
  const fits = Math.min(m.earned.length, shelfFits(width, textColumns))
  // Not slice(-0), which is every badge.
  const shown = fits > 0 ? m.earned.slice(-fits) : []
  const icon = (b: Badge, key: string, alt = b.name) => picture(kit, cardIcon(b, fill), ICON_SCALE, key, alt)
  return Box({
    flexDirection: 'column',
    children: [
      Text({ color: ink, wrap: 'truncate-end', children: m.persona }),
      Box({
        flexDirection: 'row',
        children: [
          icon(STREAK_BADGE, 'card-flame', 'Streak'),
          Box({
            flexDirection: 'column',
            marginLeft: 1,
            width: textColumns,
            flexShrink: 0,
            children: [
              Text({ color: ink, bold: true, children: lines[0] }),
              Text({ dimColor: true, children: lines[1] }),
              Text({ dimColor: true, children: lines[2] }),
            ],
          }),
          Box({
            flexDirection: 'row',
            marginLeft: 3,
            columnGap: 1,
            children: shown.map(b => icon(b, `card-badge-${b.id}`)),
          }),
          Box({
            flexDirection: 'column',
            marginLeft: 1,
            flexShrink: 0,
            children: [
              Text({ color: ink, bold: true, children: `${m.earned.length}/${BADGES.length}` }),
              Text({ dimColor: true, children: 'badges' }),
            ],
          }),
        ],
      }),
      Text({ color: ink, wrap: 'truncate-end', children: m.heard }),
    ],
  })
}

/**
 * The hover card on one line, for the band folded to one: streak, badges, days, then who it is,
 * so a line the band cuts short keeps the numbers.
 */
export const briefLine = (p: Pixling, persona: string | null, at: number): string =>
  [
    `🔥 ${p.streak.days}-day streak`,
    `🏅 ${earnedBadges(p).length}/${BADGES.length}`,
    `${plural(daysTogether(p, at), 'day')} together`,
    persona,
  ]
    .filter(Boolean)
    .join(' · ')

/** "squish" and "contextSweat" as words. */
const words = (kind: string): string =>
  kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .toLowerCase()

/** The helpers at work and the effect playing, as lines: what the band shows as minis. */
export const squadLines = (squad: readonly PixlingsMini[], isPlanning: boolean, effect: PixlingsEffect): string[] => {
  const working = squad.filter(m => m.doneAt === null)
  const done = squad.length - working.length
  const lines: string[] = []
  if (squad.length > 0) {
    lines.push(`👥 ${plural(working.length, 'helper')} working${done > 0 ? ` · ${done} done` : ''}`)
    for (const m of squad) {
      const kind = speciesById(m.speciesId)?.name ?? 'pixling'
      lines.push(`   ${m.doneAt === null ? '…' : '✓'} ${m.label} (${kind})`)
    }
  }
  if (isPlanning) lines.push('🧢 Thinking cap on: plan mode')
  if (effect) lines.push(`✨ ${words(effect.kind)}`)
  return lines
}

// The room ------------------------------------------------------------------------------------

/** One piece of the vitals row, its tone already a color. */
export type RoomVital = { readonly text: string; readonly color: string | undefined; readonly isDim: boolean }

/** Everything the room draws, as the hooks read it for one drawing. */
export type RoomModel = {
  readonly at: number
  /** Null while the egg has not hatched. */
  readonly pixling: Pixling | null
  /** The pixling as it looks now (mood, gear); the egg, cracking, while it hatches. */
  readonly frame: Pixels
  readonly isHatching: boolean
  readonly tab: RoomTab
  /** What it is saying, or its nap; null when it is quiet. */
  readonly bubble: string | null
  readonly persona: string | null
  readonly vitals: readonly RoomVital[]
  readonly squad: readonly PixlingsMini[]
  readonly isPlanning: boolean
  readonly effect: PixlingsEffect
  /** Sent away (`/pixling off`): the room shows only where it went. */
  readonly isAway: boolean
  /** The pane holds the keyboard: the hotkeys work, so the room names them. */
  readonly isFocused: boolean
}

/** What the room's Buttons do. */
export type RoomActions = { readonly show: (tab: RoomTab) => void; readonly pet: () => void }

export const drawRoom = (kit: RoomKit, seat: Seat, m: RoomModel, act: RoomActions): RenderElement => {
  const p = m.pixling
  if (m.isAway) return away(kit, p)
  if (!p || m.isHatching) return egg(kit, seat, m, p)
  const body = m.tab === 'garden' ? garden(kit, seat, p) : m.tab === 'badges' ? shelf(kit, seat, p) : home(kit, seat, m, p, act)
  return kit.Box({
    flexDirection: 'column',
    width: seat.columns,
    children: [
      tabRow(kit, seat, m.tab, act),
      body,
      m.isFocused && seat.isTerminal
        ? kit.Text({ dimColor: true, children: `h home · g garden · b badges${m.tab === 'home' ? ' · p pet' : ''}` })
        : null,
    ],
  })
}

const away = (kit: RoomKit, p: Pixling | null): RenderElement =>
  kit.Box({
    key: 'room-away',
    flexDirection: 'column',
    children: [
      kit.Text({ children: `💤 ${p ? p.name : 'Your pixling'} is away.` }),
      kit.Text({ dimColor: true, wrap: 'wrap', children: 'Type /pixling on to bring it back.' }),
    ],
  })

const egg = (kit: RoomKit, seat: Seat, m: RoomModel, p: Pixling | null): RenderElement => {
  const isHatching = p !== null
  const note = kit.Box({
    flexDirection: 'column',
    flexShrink: 1,
    children: [
      kit.Text({ bold: true, children: isHatching ? 'Hatching…' : 'An egg, not hatched yet.' }),
      kit.Text({
        dimColor: true,
        wrap: 'wrap',
        children: isHatching ? 'Any second now.' : 'It hatches when a session starts where you can see it.',
      }),
    ],
  })
  return kit.Box({
    key: 'room-egg',
    flexDirection: seat.isSideBySide ? 'row' : 'column',
    alignItems: seat.isSideBySide ? 'center' : 'flex-start',
    columnGap: 2,
    children: [picture(kit, m.frame, seat.scale, ROOM_EGG_KEY, isHatching ? 'An egg, hatching' : 'An egg'), note],
  })
}

const tabRow = (kit: RoomKit, seat: Seat, tab: RoomTab, act: RoomActions): RenderElement =>
  kit.Box({
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 1,
    marginBottom: 1,
    children: ROOM_TABS.map(t =>
      kit.Button({
        key: `tab-${t.tab}`,
        label: seat.isNarrow ? t.short : t.label,
        hotkey: t.hotkey,
        ...(t.tab === tab ? { variant: 'primary' as const } : {}),
        onPress: () => act.show(t.tab),
      }),
    ),
  })

const home = (kit: RoomKit, seat: Seat, m: RoomModel, p: Pixling, act: RoomActions): RenderElement => {
  const { Box, Text, Button } = kit
  const s = speciesOf(p)
  const color = hex(RARITY_COLOR[s.rarity])
  const { level, into, need } = levelOf(p.xp)
  const cardWidth = seat.isSideBySide ? seat.columns - seat.spriteColumns - 2 : seat.columns
  const sprite = picture(kit, m.frame, seat.scale, ROOM_SPRITE_KEY, `${p.name} the ${s.name}`)
  const card = Box({
    flexDirection: 'column',
    flexShrink: 1,
    width: cardWidth,
    children: [
      m.bubble
        ? Box({
            borderStyle: 'round',
            borderColor: color,
            paddingX: 1,
            alignSelf: 'flex-start',
            children: [Text({ wrap: 'wrap', children: m.bubble })],
          })
        : null,
      Box({
        flexDirection: 'row',
        flexWrap: 'wrap',
        children: [Text({ bold: true, color, children: p.name }), Text({ dimColor: true, children: ` Lv ${level}` })],
      }),
      Text({ wrap: 'wrap', children: `${s.name} ${RARITY_STARS[s.rarity]} ${s.rarity}${p.isShiny ? ' · ✦ shiny' : ''}` }),
      Box({
        flexDirection: 'row',
        children: [
          Text({ color, children: xpBar(into, need, Math.max(6, Math.min(16, cardWidth - 14))) }),
          Text({ dimColor: true, children: ` ${into}/${need} xp` }),
        ],
      }),
      m.persona ? Text({ italic: true, wrap: 'wrap', children: m.persona }) : null,
      m.vitals.length > 0
        ? Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            children: m.vitals.map((v, i) =>
              Text({ ...(v.color ? { color: v.color } : {}), dimColor: v.isDim, children: `${i > 0 ? ' · ' : ''}${v.text}` }),
            ),
          })
        : null,
      Box({ marginTop: 1, children: [Button({ key: 'pet', label: '♥ Pet', hotkey: 'p', onPress: () => act.pet() })] }),
    ],
  })
  const top = seat.isSideBySide
    ? Box({ key: 'room-top', flexDirection: 'row', alignItems: 'flex-end', columnGap: 2, children: [sprite, card] })
    : Box({
        key: 'room-top',
        flexDirection: 'column',
        children: [Box({ flexDirection: 'row', justifyContent: 'center', width: seat.columns, children: [sprite] }), card],
      })

  const st = p.stats
  const pairs: readonly [string, number][] = [
    ['Tests passed', st.testsPassed],
    ['Bugs squashed', st.bugsSquashed],
    ['Commits', st.commits],
    ['PRs', st.prs],
    ['Pushes', st.pushes],
    ['Turns', st.turns],
    ['Naps', st.naps],
    ['Pets', st.pets],
    ['Close calls', st.risky],
  ]
  const cell = Math.floor(seat.columns / seat.statColumns)
  const rows: (readonly [string, number])[][] = []
  for (let i = 0; i < pairs.length; i += seat.statColumns) rows.push(pairs.slice(i, i + seat.statColumns))
  const heard = topTics(p.tics, 3)
  const days = daysTogether(p, m.at)
  const squad = squadLines(m.squad, m.isPlanning, m.effect)
  return Box({
    flexDirection: 'column',
    children: [
      top,
      Box({
        key: 'room-stats',
        flexDirection: 'column',
        marginTop: 1,
        children: rows.map(row =>
          Box({
            flexDirection: 'row',
            children: row.map(([label, n]) =>
              Box({ width: cell, children: [Text({ dimColor: true, children: `${label} ` }), Text({ bold: true, children: String(n) })] }),
            ),
          }),
        ),
      }),
      Text({
        wrap: 'wrap',
        children: `🔥 ${p.streak.days}-day streak (best ${p.streak.best}) · ${plural(days, 'day')} together · ${plural(st.sessions, 'session')}`,
      }),
      heard.length > 0
        ? Text({ dimColor: true, wrap: 'wrap', children: `Heard: ${heard.map(t => `${t.label} ×${t.n}`).join(' · ')}` })
        : null,
      squad.length > 0
        ? Box({ key: 'room-squad', flexDirection: 'column', marginTop: 1, children: squad.map(line => Text({ wrap: 'wrap', children: line })) })
        : null,
    ],
  })
}

const garden = (kit: RoomKit, seat: Seat, p: Pixling): RenderElement => {
  const { Box, Text } = kit
  const dex = new Set(p.dex)
  const cells = SPECIES.map(sp => ({ sp, isFound: dex.has(sp.id), isCurrent: sp.id === p.species }))
  const found = cells.filter(c => c.isFound).length
  const scale = 3
  const width = seat.isTerminal ? Math.max(...cells.map(c => gardenFrame(c.sp, c.isFound).w), 12) : 11
  const cellOf = (c: (typeof cells)[number]): RenderElement => {
    const frame = gardenFrame(c.sp, c.isFound)
    return Box({
      flexDirection: 'column',
      alignItems: 'center',
      width,
      children: [
        picture(kit, frame, scale, `garden-${c.sp.id}`, c.isFound ? c.sp.name : 'Undiscovered'),
        Text({
          wrap: 'truncate-end',
          bold: c.isCurrent,
          dimColor: !c.isFound,
          ...(c.isFound ? { color: hex(RARITY_COLOR[c.sp.rarity]) } : {}),
          children: c.isFound ? c.sp.name : '???',
        }),
        Text({ dimColor: true, children: RARITY_STARS[c.sp.rarity] }),
      ],
    })
  }
  const title = Text({ bold: true, children: `Dex garden · ${found}/${SPECIES.length} found` })
  if (!seat.isTerminal) {
    return Box({
      key: 'room-garden',
      flexDirection: 'column',
      children: [title, Box({ flexDirection: 'row', flexWrap: 'wrap', columnGap: 1, rowGap: 1, alignItems: 'flex-end', children: cells.map(cellOf) })],
    })
  }
  // The terminal lays the grid out by rows itself, as the dex card does.
  const perRow = Math.max(1, Math.floor((seat.columns + 2) / (width + 2)))
  const rows: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += perRow) rows.push(cells.slice(i, i + perRow))
  return Box({
    key: 'room-garden',
    flexDirection: 'column',
    children: [title, ...rows.map(row => Box({ flexDirection: 'row', columnGap: 2, alignItems: 'flex-end', children: row.map(cellOf) }))],
  })
}

const shelf = (kit: RoomKit, seat: Seat, p: Pixling): RenderElement => {
  const { Box, Text } = kit
  const earned = earnedBadges(p)
  const locked = BADGES.length - earned.length
  const next = nextBadge(p)
  const perRow = seat.isNarrow ? 1 : Math.max(1, Math.min(3, Math.floor(seat.columns / 30)))
  const cell = Math.floor(seat.columns / perRow)
  const rows: Badge[][] = []
  for (let i = 0; i < earned.length; i += perRow) rows.push(earned.slice(i, i + perRow))
  return Box({
    key: 'room-badges',
    flexDirection: 'column',
    children: [
      Text({ bold: true, children: `Badge shelf · ${earned.length}/${BADGES.length}` }),
      earned.length === 0
        ? Text({ dimColor: true, wrap: 'wrap', children: 'Nothing on the shelf yet. The first ones come quickly.' })
        : null,
      ...rows.map(row =>
        Box({
          flexDirection: 'row',
          children: row.map(b =>
            Box({
              width: cell,
              children: [
                Text({ children: `${b.emoji} ${b.name}` }),
                seat.isNarrow ? null : Text({ dimColor: true, children: ` ${localDate(p.badges[b.id] ?? 0)}` }),
              ],
            }),
          ),
        }),
      ),
      Box({
        marginTop: 1,
        children: [Text({ children: locked === 0 ? '🏆 Every badge is on the shelf.' : `🔒 ${locked} still locked` })],
      }),
      next
        ? Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            children: [
              Text({ children: `Next: ${next.badge.emoji} ${next.badge.name} ` }),
              Text({ color: '#ffc53d', children: xpBar(next.have, next.need, 10) }),
              Text({ dimColor: true, children: ` ${next.have}/${next.need}` }),
            ],
          })
        : null,
      next ? Text({ dimColor: true, wrap: 'wrap', children: next.badge.how }) : null,
    ],
  })
}
