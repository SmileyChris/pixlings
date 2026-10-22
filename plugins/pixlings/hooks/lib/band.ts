// The band's shape at each size: what draws the sprite (half blocks, a picture where the terminal
// draws one, or a face on one line), how many rows that takes, and what the column beside the
// sprite holds in those rows. The rows are chosen first; the column fits them and never grows them.

import { blank, TRANSPARENT } from './canvas.ts'
import type { Mood, Pixels } from './canvas.ts'
import { rowsFor } from './raster.ts'

/** The band setting's sizes, largest first. */
export type BandSize = 'full' | 'compact' | 'slim' | 'minimal'
export const BAND_SIZES: readonly BandSize[] = ['full', 'compact', 'slim', 'minimal']

export const isBandSize = (value: string): value is BandSize => (BAND_SIZES as readonly string[]).includes(value)

/**
 * What draws the sprite: half blocks as tall as the frame, a picture over a block of cells, or no
 * sprite and one line with a face.
 */
export type Form =
  | { readonly kind: 'cells'; readonly rows: number }
  | { readonly kind: 'image'; readonly columns: number; readonly rows: number }
  | { readonly kind: 'line'; readonly rows: 1 }

export const LINE: Form = { kind: 'line', rows: 1 }

/** The line's face for each mood, where a picture would be. */
export const FACES: Readonly<Record<Mood, string>> = {
  idle: '(•ᴗ•)',
  working: '(•_•)…',
  happy: '(^ᴗ^)',
  celebrate: '\\(^ᴗ^)/',
  sad: '(╥﹏╥)',
  alarmed: '(°ロ°)!',
  attention: '(•o•)!',
  sleep: '(-ᴗ-)zz',
  love: '(♡ᴗ♡)',
  dizzy: '(@_@)',
  walk: '(•ᴗ•)♪',
  unimpressed: '(¬_¬)',
}

/** A picture's rows at each size but full, which is always half blocks. */
const IMAGE_ROWS: Record<Exclude<BandSize, 'full'>, number> = { compact: 4, slim: 2, minimal: 1 }

/**
 * The cells a picture of the frame takes at `rows` rows. The engine never says a cell's pixels, so
 * a cell is taken to be twice as tall as it is wide, as most terminal fonts are.
 */
export const imageGrid = (frame: Pixels, rows: number): { columns: number; rows: number } => ({
  columns: Math.max(1, Math.ceil((2 * rows * frame.w) / frame.h)),
  rows,
})

/**
 * What a size draws with: a picture where the terminal draws one. Without, compact grows to the
 * half blocks of full, and slim shrinks to the line of minimal, a face where the picture would be.
 */
export const formFor = (size: BandSize, frame: Pixels, hasImages: boolean): Form => {
  if (size === 'full') return { kind: 'cells', rows: rowsFor(frame) }
  if (hasImages) return { kind: 'image', ...imageGrid(frame, IMAGE_ROWS[size]) }
  return size === 'compact' ? { kind: 'cells', rows: rowsFor(frame) } : LINE
}

/** The setting's form, or where it needs more than `maxRows`, the first smaller size's that fits. */
export const pickForm = (size: BandSize, frame: Pixels, hasImages: boolean, maxRows: number): Form => {
  for (const smaller of BAND_SIZES.slice(BAND_SIZES.indexOf(size))) {
    const form = formFor(smaller, frame, hasImages)
    if (form.rows <= maxRows) return form
  }
  return LINE
}

/**
 * Canvas pixels to one of the form's columns, where the pixling walks: 1 in half blocks, more in
 * a picture, whose pixels are smaller than a cell. 0 where it stays put: on the line, and in a
 * picture one row tall, which sits on the line.
 */
export const walkScale = (form: Form, canvasH: number): number =>
  form.kind === 'cells' ? 1 : form.kind === 'image' && form.rows > 1 ? canvasH / (2 * form.rows) : 0

/** Pixels a picture's row is drawn at: about a cell's, so the terminal scales it little. */
const PICTURE_ROW_PX = 24

/**
 * The frame as the picture for `grid`: padded with transparency to the grid's shape, centred, so
 * the engine, filling the cells, stretches nothing; and the whole-pixel scale to send it at.
 */
export const pictureOf = (frame: Pixels, grid: { columns: number; rows: number }): { pixels: Pixels; scale: number } => {
  const w = Math.max(frame.w, Math.round((frame.h * grid.columns) / (2 * grid.rows)))
  const pixels = blank(w, frame.h)
  const left = Math.floor((w - frame.w) / 2)
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) pixels.px[y * w + left + x] = frame.px[y * frame.w + x] ?? TRANSPARENT
  }
  return { pixels, scale: Math.max(1, Math.ceil((PICTURE_ROW_PX * grid.rows) / frame.h)) }
}

// The column beside the sprite --------------------------------------------------------------

/**
 * One piece of a row: the name (`isShort`: with the level only, else the species and stars too),
 * the XP bar (`block` beside a tall sprite, `half` a lighter one, `line` sharing the name's row),
 * the vitals `from` up to `to`, or a line of speech after a bar in the rarity color.
 */
export type Part =
  | { readonly kind: 'name'; readonly isShort: boolean }
  | { readonly kind: 'xp'; readonly bar: 'block' | 'half' | 'line'; readonly width: number }
  | { readonly kind: 'vitals'; readonly from: number; readonly to: number }
  | { readonly kind: 'quote'; readonly text: string }

/** A bordered bubble (its lines and two rows of border), or one row of parts. */
export type InfoBlock =
  | { readonly kind: 'bubble'; readonly lines: readonly string[] }
  | { readonly kind: 'row'; readonly parts: readonly Part[] }

export const blockRows = (b: InfoBlock): number => (b.kind === 'bubble' ? b.lines.length + 2 : 1)

/** A band this tall has the bubble and the solid bar; shorter ones draw lighter. */
const TALL_ROWS = 5
/** The bubble's border and padding, and the quote's space and bar. */
const BUBBLE_INSET = 4
export const QUOTE_INSET = 2

/** Greedy word wrap to `width` columns; a word longer than that is a line of its own. */
export const wrap = (text: string, width: number): string[] => {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (!word) continue
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

export const truncate = (text: string, width: number): string =>
  text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1)).trimEnd()}…`

/**
 * The rows a band of this form takes: quiet, the form's own. While it talks, up to `maxRows`,
 * half blocks take what the column needs whole; a picture, the speech's lines and the name and
 * XP's row above them, growing up only past its own rows.
 */
export const bandRows = (form: Form, column: { width: number; said: string | null; vitals: readonly string[] }, maxRows: number): number => {
  if (!column.said || form.kind === 'line') return form.rows
  const wants = form.kind === 'cells' ? columnRows(column) : wrap(column.said, column.width - QUOTE_INSET).length + 1
  return Math.min(maxRows, Math.max(form.rows, wants))
}

/** Speech on the one-line band: wrapped to `width`, at most `rows` lines, the last cut. */
export const lineSpeech = (text: string, width: number, rows: number): string[] =>
  firstLines(wrap(text, Math.max(1, width)), Math.max(1, rows), Math.max(1, width))
/** The first `n` of the lines, the rest folded into the last and cut to `width`. */
const firstLines = (lines: readonly string[], n: number, width: number): string[] =>
  lines.length <= n ? [...lines] : [...lines.slice(0, n - 1), truncate(lines.slice(n - 1).join(' '), width)]

/**
 * What the column holds in `rows` rows of `width` columns, top first; the band bottom-aligns it.
 *
 * Name and XP each take a row, and the vitals as many as they wrap to. In a tall band speech goes
 * above them in the bubble; in a short one, under them as lines with a bar on their right, from
 * the bottom row up. Where they don't fit, the vitals keep one row (as many as fit it), then the
 * name and XP share a row, then the vitals give way, then the name and XP too, so speech may take
 * every row. Past that it is cut: in a tall band, in the bubble above the name, XP and vitals; in
 * a short one, on every row. Nothing makes the column taller than `rows` (a band that grows to
 * its speech asks `bandRows` first).
 */
export const layoutInfo = (input: { rows: number; width: number; said: string | null; vitals: readonly string[] }): InfoBlock[] => {
  const { rows, width } = input
  const said = input.said ?? ''
  const isTall = rows >= TALL_ROWS
  const name: InfoBlock = { kind: 'row', parts: [{ kind: 'name', isShort: false }] }
  const xp: InfoBlock = { kind: 'row', parts: [{ kind: 'xp', bar: isTall ? 'block' : 'half', width: 12 }] }
  const shared: InfoBlock = { kind: 'row', parts: [{ kind: 'name', isShort: true }, { kind: 'xp', bar: 'line', width: 10 }] }
  const vitals: InfoBlock[] = packVitals(input.vitals, width).map(([from, to]) => ({ kind: 'row', parts: [{ kind: 'vitals', from, to }] }))
  const first = vitals.slice(0, 1)
  const stacks: InfoBlock[][] = vitals.length
    ? [[name, xp, ...vitals], [name, xp, ...first], [shared, ...first], [shared], []]
    : [[name, xp], [shared], []]
  if (!said) return stacks.find(s => s.length <= rows) ?? []

  const bubbled = wrap(said, width - BUBBLE_INSET)
  const quoted = wrap(said, width - QUOTE_INSET)
  const bubble = (n: number): InfoBlock => ({ kind: 'bubble', lines: firstLines(bubbled, n, width - BUBBLE_INSET) })
  const quotes = (n: number): InfoBlock[] =>
    firstLines(quoted, n, width - QUOTE_INSET).map(text => ({ kind: 'row', parts: [{ kind: 'quote', text }] }))

  // The speech whole, with as much beside it as fits.
  for (const stack of stacks) {
    const room = rows - stack.length
    // A tall band keeps its speech in the bubble, cut below if it must be.
    if (isTall && room >= bubbled.length + 2) return [bubble(bubbled.length), ...stack]
    if (!isTall && quoted.length <= room) return [...stack, ...quotes(quoted.length)]
  }
  // Cut to the room there is.
  const kept = isTall ? stacks.find(stack => rows - stack.length >= 3) : undefined
  return kept ? [bubble(rows - kept.length - 2), ...kept] : quotes(rows)
}

/** The rows the column takes to show all of it: what a band that grows to its speech is given. */
export const columnRows = (input: { width: number; said: string | null; vitals: readonly string[] }): number =>
  layoutInfo({ ...input, rows: Infinity }).reduce((n, b) => n + blockRows(b), 0)

/**
 * The vitals in rows of `width`, joined by ` · `, as `[from, to)` ranges: each row as many as fit
 * it, and at least one, which its row cuts.
 */
export const packVitals = (texts: readonly string[], width: number): [number, number][] => {
  const rows: [number, number][] = []
  let from = 0
  let used = 0
  texts.forEach((text, i) => {
    if (i > from && used + 3 + text.length > width) {
      rows.push([from, i])
      from = i
      used = 0
    }
    used += (i > from ? 3 : 0) + text.length
  })
  if (from < texts.length) rows.push([from, texts.length])
  return rows
}
