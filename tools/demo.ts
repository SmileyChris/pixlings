// A mock of the band above a prompt, drawn with the plugin's own canvas and band layout code, at
// each of the band setting's sizes. Left and right switch species. It starts at full (half
// blocks, 9 rows). Up steps through compact, slim and minimal: where the terminal has kitty
// graphics (Kitty, Ghostty, WezTerm) a picture in 10×4, 5×2 and 3×1 cells, and the band 4, 2 and
// 1 rows; without them each size's fallback, as the plugin draws it. Down goes back. Space changes
// the mood. s cycles what the pixling is saying. w stops and starts its walk along the band's
// spare columns, as the plugin's walks: a column a step at every size but minimal. q or Ctrl+C quits. The keys and the state are
// shown as a comment in the main area, where the transcript would be. The terminal is asked
// whether it has kitty graphics and for its cell size. Each distinct frame is sent to the
// terminal once and shown again by ID after that.
// Usage: node tools/demo.ts [--shiny]

import { emitKeypressEvents } from 'node:readline'

import { BAND_SIZES, bandRows, FACES, formFor, QUOTE_INSET, layoutInfo, lineSpeech, walkScale } from '../plugins/pixlings/hooks/lib/band.ts'
import type { Form, InfoBlock, Part } from '../plugins/pixlings/hooks/lib/band.ts'
import { blank, CANVAS_H, CANVAS_W, renderFrame, samePixels, SPRITE_X } from '../plugins/pixlings/hooks/lib/canvas.ts'
import { isWalking, newWalker, roamRange, walk } from '../plugins/pixlings/hooks/lib/roam.ts'
import type { Walker } from '../plugins/pixlings/hooks/lib/roam.ts'
import type { Mood, Pixels } from '../plugins/pixlings/hooks/lib/canvas.ts'
import { xpBar } from '../plugins/pixlings/hooks/lib/progress.ts'
import { toCells } from '../plugins/pixlings/hooks/lib/raster.ts'
import type { Cell } from '../plugins/pixlings/hooks/lib/raster.ts'
import { RARITY_COLOR, RARITY_STARS, SPECIES } from '../plugins/pixlings/hooks/lib/sprites.ts'
import {
  DA1_REPLY, KITTY_QUERY_OK, kittyDeleteAll, kittyHide, kittyPlace, kittyQuery, kittyTransmit, rgbaBox,
} from './kitty.ts'

const FRAME_MS = 100
/** raster.ts's DEFAULT_COLOR (not exported): the terminal's own background. */
const DEFAULT_COLOR = 0x01000000
/** Distinct frames kept in the terminal before they're all dropped and sent again as needed. */
const CACHE_LIMIT = 256
const isShiny = process.argv.includes('--shiny')

/** A block of cells the kitty image is fitted into. */
type Grid = { readonly columns: number; readonly rows: number }

/** The size it starts at: full. */
const START_LEVEL = 0
/** Until the terminal reports its cell size, assume cells are 1:2. */
let cell = { width: 9, height: 18 }

/** What the band draws with at this size: the plugin's own choice, kitty standing in for its Image. */
const formNow = (frame: Pixels): Form => formFor(BAND_SIZES[level]!, frame, kitty === 'yes')

const formLabel = (form: Form): string =>
  form.kind === 'image' ? `kitty graphics · ${form.columns}×${form.rows} cells`
  : form.kind === 'cells' ? `half blocks · ${form.rows} rows`
  : 'one line with a face'

/** The moods space cycles through. */
const MOODS: readonly Mood[] = [
  'idle', 'working', 'happy', 'celebrate', 'sad', 'alarmed', 'attention', 'sleep', 'love', 'dizzy', 'walk', 'unimpressed',
]

/** What the mock pixling says; s cycles through these. */
const SPEECH = [
  '',
  'Tests green. Nice one.',
  'The push went through and the branch is up on the remote. Go on, take the win, you earned it.',
]
const NAME = 'Pip'
const LEVEL_NO = 7
const XP = { into: 61, need: 150 }
const VITALS = [
  { text: '⚡ cache live', color: 0x6fdc8c },
  { text: '89% cached' },
  { text: 'ctx 38%' },
  { text: '5h 22%' },
]
/** The keys, as shown in the main area. */
const KEYS: readonly (readonly [string, string])[] = [
  ['← →', 'species'],
  ['↑ ↓', 'resolution'],
  ['space', 'mood'],
  ['s', 'speech'],
  ['w', 'walk'],
  ['q', 'quit'],
]

let index = 0
let level = START_LEVEL
let mood = 0
let speech = 0
let t = 0
/** Whether it wanders the band's spare columns (it rests a few seconds between strolls); off, it walks home. */
let isRoaming = true
let walker: Walker | null = null
/** The scale the walker's pixels are in: it starts again at home when the size changes it. */
let walkerScale = -1
/** Whether the terminal has the kitty graphics protocol. Unknown until it answers `kittyQuery`. */
let kitty: 'unknown' | 'yes' | 'no' = 'unknown'

/** Text at a screen row, from a column (1-based), so a row the image shares is written beside it. */
type RowText = { readonly column: number; readonly text: string }
/** Where the kitty image goes: its top-left cell (1-based) and its grid. */
type ImageAt = { readonly row: number; readonly column: number; readonly grid: Grid }
type Screen = { readonly rows: Map<number, RowText>; readonly image: ImageAt | null }

/** What the terminal shows now: the layout key it was drawn for, its rows, the image's pixels and ID (0 for none). */
let shown: { key: string; rows: Map<number, RowText>; pixels: Pixels | null; id: number } = {
  key: '', rows: new Map(), pixels: null, id: 0,
}
/**
 * Frames the terminal already holds, by pixel hash, to the image ID they went up under. An animation
 * is a short cycle, so after one pass every frame is a placement, not a transmit. Dropped (with the
 * images) when the level or the cell size changes, since the image size changes with them.
 */
const cache = new Map<string, number>()
let nextId = 1

/** FNV-1a over the pixels, as the cache key. */
const hashPixels = (p: Pixels): string => {
  let h = 0x811c9dc5
  for (const px of p.px) {
    h ^= px
    h = Math.imul(h, 0x01000193)
  }
  return `${p.w}x${p.h}:${h >>> 0}`
}

/** Forgets every cached frame and deletes every image in the terminal (nothing to write if there are none). */
const dropCache = (): string => {
  const had = cache.size > 0
  cache.clear()
  nextId = 1
  return had ? kittyDeleteAll() : ''
}

// Text ------------------------------------------------------------------------------------------

const sgr = (color: number, layer: 38 | 48): string =>
  `\x1b[${layer};2;${(color >> 16) & 255};${(color >> 8) & 255};${color & 255}m`
const fg = (color: number, text: string): string => `${sgr(color, 38)}${text}\x1b[39m`
const dim = (text: string): string => `\x1b[2m${text}\x1b[22m`
const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`

const cellText = ([codePoint, fgColor, bg]: Cell): string => {
  const back = bg === DEFAULT_COLOR ? '\x1b[49m' : sgr(bg, 48)
  const ink = fgColor === DEFAULT_COLOR ? '\x1b[39m' : sgr(fgColor, 38)
  return back + ink + String.fromCodePoint(codePoint)
}

/** The frame as half-block rows of text. */
const halfBlockRows = (frame: Pixels): string[] => {
  const cells = toCells(frame)
  const rows: string[] = []
  for (let start = 0; start < cells.length; start += frame.w) {
    rows.push(cells.slice(start, start + frame.w).map(cellText).join('') + '\x1b[0m')
  }
  return rows
}

// Layouts ---------------------------------------------------------------------------------------

/**
 * The keys and the state, as a comment in the main area, where the transcript would be: a dim
 * block with the shape of a tool call.
 */
const commentRows = (rows: Map<number, RowText>, form: Form): void => {
  const species = SPECIES[index]!
  const fallback = kitty === 'no' && level > 0 ? '  ·  no kitty graphics in this terminal: its fallback' : ''
  const state = [
    `${species.name} · ${species.rarity}${isShiny ? ' · shiny' : ''} · ${index + 1} of ${SPECIES.length}`,
    `${BAND_SIZES[level]} · ${formLabel(form)}${fallback}`,
    MOODS[mood]!,
    '',
    isRoaming ? 'wandering' : 'at home',
  ]
  rows.set(1, { column: 1, text: `${fg(0x6fdc8c, '●')} ${bold('pixlings band mock')}` })
  KEYS.forEach(([key, what], i) => {
    const lead = i === 0 ? '  ⎿  ' : '     '
    const beside = state[i] ?? ''
    rows.set(2 + i, { column: 1, text: dim(`${lead}${key.padEnd(6)} ${what.padEnd(12)}${beside ? `  ${beside}` : ''}`) })
  })
}

/**
 * A mock of the band above the prompt at this size, as the plugin lays it out (`layoutInfo`): the
 * rows are the form's, and the column beside the sprite fits them. One row is the plugin's line:
 * the face or a 3×1 picture, the name and level, the first vital and what it's saying.
 */
const bandScreen = (frame: Pixels, form: Form): Screen => {
  const species = SPECIES[index]!
  const color = RARITY_COLOR[species.rarity]
  const columns = process.stdout.columns ?? 80
  const screenRows = process.stdout.rows ?? 24
  const spriteColumns = form.kind === 'image' ? form.columns : form.kind === 'cells' ? frame.w : 0
  const infoColumn = spriteColumns + 2
  const width = Math.max(16, Math.min(56, columns - spriteColumns - 4))
  const said = SPEECH[speech] ?? ''
  const isLine = form.kind === 'line' || form.rows === 1
  // The one-line band: what comes before the speech, and the speech wrapped under its start.
  const face = form.kind === 'line' ? `${FACES[MOODS[mood]!]} ` : ''
  const lead = form.kind === 'image' ? form.columns + 1 : face.length
  const before = lead + NAME.length + ` · Lv ${LEVEL_NO}`.length + (VITALS[0] ? VITALS[0].text.length + 2 : 0)
  const lineSaid = isLine && said ? lineSpeech(said, Math.max(8, columns - 1 - before - 2), screenRows - 4) : []
  // The band grows while it talks, as the plugin's does: half blocks to the column whole, a
  // picture from its bottom row up, the line under its start.
  const bandHeight = isLine
    ? Math.max(1, lineSaid.length)
    : bandRows(form, { width, said, vitals: VITALS.map(v => v.text) }, Infinity)
  const vitalText = (v: (typeof VITALS)[number]): string => (v.color ? fg(v.color, v.text) : dim(v.text))

  /** A row's part as the plugin's band draws it. */
  const partText = (part: Part): string => {
    if (part.kind === 'name') {
      const rest = part.isShort ? ` Lv ${LEVEL_NO}  ` : ` Lv ${LEVEL_NO} · ${species.name} ${RARITY_STARS[species.rarity]}`
      return `${bold(fg(color, NAME))}${dim(rest)}`
    }
    if (part.kind === 'xp') {
      const bar = xpBar(XP.into, XP.need, part.width)
      const glyph = part.bar === 'half' ? '▀' : part.bar === 'line' ? '━' : null
      const filled = bar.replace(/░/g, '').length
      const drawn = glyph ? `${fg(color, glyph.repeat(filled))}${dim(glyph.repeat(part.width - filled))}` : fg(color, bar)
      return `${drawn}${dim(` ${XP.into}/${XP.need}`)}`
    }
    if (part.kind === 'vitals') return VITALS.slice(part.from, part.to).map(vitalText).join(dim(' · '))
    return `${part.text.padEnd(width - QUOTE_INSET)} ${fg(color, '│')}`
  }
  const blockText = (block: InfoBlock): string[] =>
    block.kind === 'bubble'
      ? [
          fg(color, `╭${'─'.repeat(width - 2)}╮`),
          ...block.lines.map(line => `${fg(color, '│')} ${line.padEnd(width - 4)} ${fg(color, '│')}`),
          fg(color, `╰${'─'.repeat(width - 2)}╯`),
        ]
      : [block.parts.map(partText).join('')]

  let info: string[]
  if (isLine) {
    const first = VITALS[0] ? `  ${vitalText(VITALS[0])}` : ''
    const head = `${face ? fg(color, face) : ''}${bold(NAME)}${dim(` · Lv ${LEVEL_NO}`)}${first}`
    // Lines past the first sit under the first, after what comes before it.
    const indent = ' '.repeat(before - lead + face.length)
    info = [`${head}${lineSaid[0] ? `  ${lineSaid[0]}` : ''}`, ...lineSaid.slice(1).map(line => `${indent}  ${line}`)]
  } else {
    info = layoutInfo({ rows: bandHeight, width, said, vitals: VITALS.map(v => v.text) }).flatMap(blockText)
    info = [...Array.from({ length: Math.max(0, bandHeight - info.length) }, () => ''), ...info]
  }

  const rows = new Map<number, RowText>()
  commentRows(rows, form)
  const bandTop = screenRows - 3 - bandHeight
  const sprite = form.kind === 'cells' ? halfBlockRows(frame) : null
  // The sprite sits at the band's bottom, below rows the speech grew.
  const spriteTop = sprite ? bandHeight - sprite.length : 0
  const blankSprite = ' '.repeat(frame.w)
  for (let i = 0; i < bandHeight; i++) {
    const text = info[i] ?? ''
    if (sprite) rows.set(bandTop + i, { column: 1, text: `${i < spriteTop ? blankSprite : (sprite[i - spriteTop] ?? '')} ${text}` })
    else rows.set(bandTop + i, { column: form.kind === 'line' ? 1 : infoColumn, text })
  }
  const bar = '─'.repeat(Math.max(0, columns - 2))
  rows.set(screenRows - 3, { column: 1, text: dim(`╭${bar}╮`) })
  rows.set(screenRows - 2, { column: 1, text: `${dim('│')} ${fg(0x5aa9ff, '>')} \x1b[7m \x1b[27m${' '.repeat(Math.max(0, columns - 6))}${dim('│')}` })
  rows.set(screenRows - 1, { column: 1, text: dim(`╰${bar}╯`) })
  rows.set(screenRows, { column: 1, text: dim('  ? for shortcuts') })
  // A picture sits at the band's bottom, below rows the speech grew; on the line, on its first row.
  const image = form.kind === 'image' ? { row: isLine ? bandTop : bandTop + bandHeight - form.rows, column: 1, grid: form } : null
  return { rows, image }
}

// Drawing ---------------------------------------------------------------------------------------

/**
 * Shows the frame fitted to the image's grid at its cell, and gives the image ID it's shown under.
 * A frame the terminal already holds is only placed; a new one is sent first.
 */
const placeImage = (frame: Pixels, at: ImageAt): { out: string; id: number } => {
  let out = ''
  if (cache.size >= CACHE_LIMIT) out += dropCache()
  const key = hashPixels(frame)
  let id = cache.get(key)
  if (id === undefined) {
    id = nextId++
    cache.set(key, id)
    out += kittyTransmit(rgbaBox(frame, at.grid.columns * cell.width, at.grid.rows * cell.height), id)
  }
  out += `\x1b[${at.row};${at.column}H` + kittyPlace(id, at.grid.columns, at.grid.rows)
  return { out, id }
}

const rowText = (row: number, { column, text }: RowText): string => `\x1b[${row};${column}H${text}\x1b[K`

/**
 * The frame as the plugin's band draws it, walking: the canvas widened by the band's spare
 * columns in the form's pixels (`walkScale`), the sprite at the walker's place in it, a column a
 * step. It walks idle or working, as the plugin's does; another mood holds it still.
 */
const walkingFrame = (): Pixels => {
  const species = SPECIES[index]!
  const scale = walkScale(formNow(blank()), CANVAS_H)
  const range = Math.round(roamRange(process.stdout.columns ?? 80) * scale)
  const now = Date.now()
  if (!walker || scale !== walkerScale) walker = newWalker(range, now)
  walkerScale = scale
  const current = MOODS[mood]!
  const canWalk = current === 'idle' || current === 'working'
  walker = walk(walker, range, !canWalk ? 'stay' : isRoaming ? 'wander' : 'home', now, Math.random, Math.max(1, Math.round(scale)))
  const isStepping = canWalk && isWalking(walker)
  return renderFrame({
    species,
    isShiny,
    mood: isStepping ? 'walk' : current,
    t: isStepping ? now : t,
    width: CANVAS_W + range,
    x: SPRITE_X + Math.min(walker.x, range),
    isFlipped: isStepping && walker.isFlipped,
  })
}

const draw = (): void => {
  const frame = walkingFrame()
  const form = formNow(frame)
  const grid = form.kind === 'image' ? form : undefined
  const screen = bandScreen(frame, form)
  // Where the picture sits moves when the band grows to its speech: that is a new layout too.
  const key = `${level}:${form.kind}:${screen.image?.row ?? 0}:${process.stdout.columns}x${process.stdout.rows}`

  if (!grid || key !== shown.key) {
    // A new layout or a text-cell level: clear the screen and the images, and draw from scratch. The
    // cache goes before the image is looked up: the frames in it are the old level's size.
    const dropped = dropCache()
    const image = screen.image ? placeImage(frame, screen.image) : { out: '', id: 0 }
    const text = [...screen.rows].map(([row, line]) => rowText(row, line)).join('')
    process.stdout.write('\x1b[H\x1b[2J' + dropped + text + image.out)
    shown = { key, rows: screen.rows, pixels: grid ? frame : null, id: image.id }
    return
  }

  // Same layout as before: no clear. Rewrite only the rows that changed, and blank rows that went
  // (from their own column, so the image beside them is left alone). When the pixels change, show
  // the new frame (a placement, or a transmit the first time), then hide the old one, so there's no gap.
  let out = ''
  for (const [row, line] of screen.rows) {
    const was = shown.rows.get(row)
    if (!was || was.column !== line.column || was.text !== line.text) out += rowText(row, line)
  }
  for (const [row, was] of shown.rows) {
    if (!screen.rows.has(row)) out += rowText(row, { column: was.column, text: '' })
  }
  let id = shown.id
  if (screen.image && !samePixels(shown.pixels, frame)) {
    const image = placeImage(frame, screen.image)
    out += image.out
    if (image.id !== shown.id) out += kittyHide(shown.id)
    id = image.id
  }
  shown = { key, rows: screen.rows, pixels: screen.image ? frame : null, id }
  if (out) process.stdout.write(out)
}

/**
 * Asks the terminal two things and acts on the answers as they come in on stdin:
 * - whether it has kitty graphics (`kittyQuery`): an OK means yes; the DA1 reply alone means no, and
 *   the kitty levels go away;
 * - its cell size in pixels (CSI 16 t; the reply is CSI 6 ; height ; width t): the images are sent
 *   again at that size.
 */
const CELL_REPLY = /\x1b\[6;(\d+);(\d+)t/
const askTerminal = (): void => {
  process.stdin.on('data', (data: Buffer) => {
    const text = data.toString('latin1')
    let changed = false
    if (kitty === 'unknown') {
      if (text.includes(KITTY_QUERY_OK)) kitty = 'yes'
      else if (DA1_REPLY.test(text)) kitty = 'no'
      // Without kitty graphics each size draws its fallback.
      if (kitty === 'no') changed = true
    }
    const reply = CELL_REPLY.exec(text)
    if (reply) {
      const height = Number(reply[1])
      const width = Number(reply[2])
      if (width > 0 && height > 0 && (width !== cell.width || height !== cell.height)) {
        cell = { width, height }
        shown = { ...shown, key: '' } // the images are the wrong size now: redraw from scratch
        changed = true
      }
    }
    if (changed) draw()
  })
  process.stdout.write(kittyQuery() + '\x1b[16t')
}

const restore = (): void => {
  process.stdin.setRawMode(false)
  process.stdout.write(kittyDeleteAll() + '\x1b[0m\x1b[?25h\x1b[?1049l')
}

const onKey = (_text: string | undefined, key: { name?: string; ctrl?: boolean } | undefined): void => {
  if (!key) return
  if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
    restore()
    process.exit(0)
  }
  if (key.name === 'right') index = (index + 1) % SPECIES.length
  else if (key.name === 'left') index = (index - 1 + SPECIES.length) % SPECIES.length
  else if (key.name === 'up') level = Math.min(level + 1, BAND_SIZES.length - 1)
  else if (key.name === 'down') level = Math.max(level - 1, 0)
  else if (key.name === 'space') mood = (mood + 1) % MOODS.length
  else if (key.name === 's') speech = (speech + 1) % SPEECH.length
  else if (key.name === 'w') isRoaming = !isRoaming
  else return
  draw()
}

if (!process.stdin.isTTY) {
  console.error('tools/demo.ts needs an interactive terminal.')
  process.exit(1)
}

emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)
process.stdin.on('keypress', onKey)
process.stdin.resume()
process.stdout.on('resize', draw)
process.stdout.write('\x1b[?1049h\x1b[?25l')
askTerminal()
draw()
setInterval(() => {
  t += FRAME_MS
  draw()
}, FRAME_MS)
