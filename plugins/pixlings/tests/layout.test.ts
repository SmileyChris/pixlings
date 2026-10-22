import { describe, expect, test } from 'claude-code/testing'

import { bandRows, blockRows, columnRows, formFor, lineSpeech, imageGrid, layoutInfo, packVitals, pickForm, pictureOf, walkScale, wrap } from '../hooks/lib/band.ts'
import type { InfoBlock } from '../hooks/lib/band.ts'
import { blank, CANVAS_H, CANVAS_W, TRANSPARENT } from '../hooks/lib/canvas.ts'
import { encodePng } from '../hooks/lib/png.ts'

const FRAME = blank()
const VITALS = ['⚡ cache live', '89% cached', 'ctx 38%']
/** A tall hat's frame: two rows more. */
const HATTED = blank(CANVAS_W, CANVAS_H + 2)

/** The column as words, a row each: what a test can read at a glance. */
const shape = (blocks: readonly InfoBlock[]): string[] =>
  blocks.flatMap(b =>
    b.kind === 'bubble'
      ? ['╭', ...b.lines.map(line => `│${line}`), '╰']
      : [
          b.parts
            .map(p => (p.kind === 'name' ? (p.isShort ? 'name' : 'name+species') : p.kind === 'xp' ? `xp:${p.bar}` : p.kind === 'quote' ? `"${p.text}"` : 'vitals'))
            .join(' '),
        ],
  )

const rowsOf = (blocks: readonly InfoBlock[]): number => blocks.reduce((n, b) => n + blockRows(b), 0)

describe('the band at each size', () => {
  test('full is half blocks as tall as the frame; a tall hat adds a row', () => {
    expect(formFor('full', FRAME, true)).toEqual({ kind: 'cells', rows: 9 })
    expect(formFor('full', HATTED, true)).toEqual({ kind: 'cells', rows: 10 })
  })

  test('where images draw, compact, slim and minimal are pictures of 4, 2 and 1 rows', () => {
    expect(formFor('compact', FRAME, true)).toEqual({ kind: 'image', columns: 10, rows: 4 })
    expect(formFor('slim', FRAME, true)).toEqual({ kind: 'image', columns: 5, rows: 2 })
    expect(formFor('minimal', FRAME, true)).toEqual({ kind: 'image', columns: 3, rows: 1 })
  })

  test('without images, compact grows to the half blocks and slim and minimal are the line', () => {
    expect(formFor('compact', FRAME, false)).toEqual({ kind: 'cells', rows: 9 })
    expect(formFor('slim', FRAME, false)).toEqual({ kind: 'line', rows: 1 })
    expect(formFor('minimal', FRAME, false)).toEqual({ kind: 'line', rows: 1 })
  })

  test('a tall hat keeps a picture its rows: it is drawn a little smaller', () => {
    expect(formFor('compact', HATTED, true)).toEqual({ kind: 'image', columns: 9, rows: 4 })
  })

  test('a wider frame (minis, a walk) takes more columns, never more rows', () => {
    expect(imageGrid(blank(CANVAS_W * 2, CANVAS_H), 4)).toEqual({ columns: 20, rows: 4 })
  })

  test('it walks a column a step: a pixel in half blocks, more in a picture; not on the line', () => {
    expect(walkScale(formFor('full', FRAME, true), CANVAS_H)).toBe(1)
    expect(walkScale(formFor('compact', FRAME, true), CANVAS_H)).toBe(2.25)
    expect(walkScale(formFor('slim', FRAME, true), CANVAS_H)).toBe(4.5)
    expect(walkScale(formFor('minimal', FRAME, true), CANVAS_H)).toBe(0)
    expect(walkScale(formFor('slim', FRAME, false), CANVAS_H)).toBe(0)
    // 30 columns of walking at compact's scale widen the picture by those 30 columns.
    expect(imageGrid(blank(CANVAS_W + Math.round(30 * 2.25), CANVAS_H), 4).columns).toBe(40)
  })

  test('short of rows, the band steps down through the sizes and never up', () => {
    expect(pickForm('full', FRAME, true, 20)).toEqual({ kind: 'cells', rows: 9 })
    expect(pickForm('full', FRAME, true, 8)).toEqual({ kind: 'image', columns: 10, rows: 4 })
    expect(pickForm('full', FRAME, true, 3)).toEqual({ kind: 'image', columns: 5, rows: 2 })
    expect(pickForm('full', FRAME, false, 8)).toEqual({ kind: 'line', rows: 1 })
    expect(pickForm('slim', FRAME, true, 20)).toEqual({ kind: 'image', columns: 5, rows: 2 })
    expect(pickForm('compact', FRAME, false, 8)).toEqual({ kind: 'line', rows: 1 })
    expect(pickForm('minimal', FRAME, true, 1)).toEqual({ kind: 'image', columns: 3, rows: 1 })
  })

  test("a picture is padded to its cells' shape, centred, and scaled up in whole pixels", () => {
    const frame = blank()
    frame.px[0] = 0xff0000
    const compact = pictureOf(frame, { columns: 10, rows: 4 })
    expect([compact.pixels.w, compact.pixels.h, compact.scale]).toEqual([23, CANVAS_H, 6])
    // 3×1 cells are 27 pixels wide at this height: 5 to spare, 2 of them on the left.
    const minimal = pictureOf(frame, { columns: 3, rows: 1 })
    expect([minimal.pixels.w, minimal.scale]).toEqual([27, 2])
    expect(minimal.pixels.px[0]).toBe(TRANSPARENT)
    expect(minimal.pixels.px.indexOf(0xff0000)).toBe(2)
  })

  test('a transparent PNG keeps its transparent pixels', () => {
    const png = encodePng(pictureOf(blank(), { columns: 5, rows: 2 }).pixels, 3, null)
    const text = String.fromCharCode(...png)
    expect(text).toContain('tRNS')
    expect(text.indexOf('tRNS')).toBeLessThan(text.indexOf('IDAT'))
  })
})

describe('the column beside the sprite', () => {
  const SHORT = 'Tests green. Nice one.'
  const LONG = 'The push went through and the branch is up on the remote. Go on, take the win, you earned it.'

  test('beside the half blocks: the bubble over the name, XP and vitals', () => {
    expect(shape(layoutInfo({ rows: 9, width: 40, said: SHORT, vitals: VITALS }))).toEqual([
      '╭', `│${SHORT}`, '╰', 'name+species', 'xp:block', 'vitals',
    ])
  })

  test('in four rows: a line of speech on the bottom row; longer speech takes the rows it needs, then all four', () => {
    expect(shape(layoutInfo({ rows: 4, width: 40, said: null, vitals: VITALS }))).toEqual(['name+species', 'xp:half', 'vitals'])
    expect(shape(layoutInfo({ rows: 4, width: 40, said: SHORT, vitals: VITALS }))).toEqual(['name+species', 'xp:half', 'vitals', `"${SHORT}"`])
    // Three lines: the vitals give way, and the name and XP share the top row.
    const three = shape(layoutInfo({ rows: 4, width: 40, said: LONG, vitals: VITALS }))
    expect(three[0]).toBe('name xp:line')
    expect(three.slice(1).every(row => row.startsWith('"'))).toBe(true)
    // Longer still: speech on every row, cut on the last.
    const all = shape(layoutInfo({ rows: 4, width: 40, said: `${LONG} ${LONG}`, vitals: VITALS }))
    expect(all).toHaveLength(4)
    expect(all.every(row => row.startsWith('"'))).toBe(true)
    expect(all[3]).toMatch(/…"$/)
  })

  test('in two rows: name and XP share a row over the vitals; speech takes the vitals row, then both', () => {
    expect(shape(layoutInfo({ rows: 2, width: 40, said: null, vitals: VITALS }))).toEqual(['name xp:line', 'vitals'])
    expect(shape(layoutInfo({ rows: 2, width: 40, said: SHORT, vitals: VITALS }))).toEqual(['name xp:line', `"${SHORT}"`])
    expect(shape(layoutInfo({ rows: 2, width: 40, said: LONG, vitals: VITALS }))).toHaveLength(2)
  })

  test('without vitals the name and XP keep their own rows', () => {
    expect(shape(layoutInfo({ rows: 4, width: 40, said: SHORT, vitals: [] }))).toEqual(['name+species', 'xp:half', `"${SHORT}"`])
  })

  test('speech never makes the column taller than its rows', () => {
    const said = `${LONG} ${LONG} ${LONG}`
    for (const rows of [1, 2, 3, 4, 5, 6, 9, 10]) {
      for (const width of [16, 30, 56]) {
        for (const hasVitals of [false, true]) {
          for (const s of [null, SHORT, LONG, said]) {
            expect(rowsOf(layoutInfo({ rows, width, said: s, vitals: hasVitals ? VITALS : [] }))).toBeLessThanOrEqual(rows)
          }
        }
      }
    }
  })

  test('half blocks grow to show all of it: columnRows is the column whole', () => {
    expect(columnRows({ width: 40, said: null, vitals: VITALS })).toBe(3)
    expect(columnRows({ width: 40, said: SHORT, vitals: VITALS })).toBe(6)
    const said = `${LONG} ${LONG} ${LONG}`
    const rows = columnRows({ width: 30, said, vitals: VITALS })
    expect(rows).toBeGreaterThan(9)
    const whole = shape(layoutInfo({ rows, width: 30, said, vitals: VITALS }))
    expect(whole.some(row => row.includes('…'))).toBe(false)
    expect(whole.slice(-4)).toEqual(['name+species', 'xp:block', 'vitals', 'vitals'])
  })

  test('quiet, a band keeps its rows; talking, a picture grows up only past its own', () => {
    const [slim, compact] = [formFor('slim', FRAME, true), formFor('compact', FRAME, true)]
    const column = (said: string | null) => ({ width: 40, said, vitals: VITALS })
    expect(bandRows(slim, column(null), 20)).toBe(2)
    // A line under the name and XP's row: the two rows it has.
    expect(bandRows(slim, column(SHORT), 20)).toBe(2)
    // Three lines and that row, as far as it may.
    expect(bandRows(slim, column(LONG), 20)).toBe(4)
    expect(bandRows(slim, column(LONG), 3)).toBe(3)
    expect(bandRows(compact, column(LONG), 20)).toBe(4)
    expect(bandRows(compact, column(`${LONG} ${LONG}`), 20)).toBe(7)
    // Half blocks take the column whole; the line is the line's own.
    expect(bandRows(formFor('full', FRAME, true), column(SHORT), 20)).toBe(9)
    expect(bandRows(formFor('slim', FRAME, false), column(LONG), 20)).toBe(1)
  })

  test('the one-line band wraps long speech under its start, as far as its rows, the last cut', () => {
    expect(lineSpeech(SHORT, 40, 20)).toEqual([SHORT])
    const whole = lineSpeech(LONG, 30, 20)
    expect(whole.length).toBeGreaterThan(1)
    expect(whole.join(' ')).toBe(LONG)
    for (const line of whole) expect(line.length).toBeLessThanOrEqual(30)
    const capped = lineSpeech(`${LONG} ${LONG}`, 30, 2)
    expect(capped).toHaveLength(2)
    expect(capped[1]).toMatch(/…$/)
  })

  test('long speech beside the half blocks is cut in the bubble, the name kept', () => {
    const blocks = layoutInfo({ rows: 9, width: 30, said: `${LONG} ${LONG} ${LONG}`, vitals: VITALS })
    expect(blocks[0]?.kind).toBe('bubble')
    const rows = shape(blocks)
    expect(rows.slice(rows.indexOf('╰') + 1)).toEqual(['name+species', 'xp:block', 'vitals', 'vitals'])
    expect(rows[rows.indexOf('╰') - 1]).toMatch(/…$/)
  })

  test('wrapped lines fit their width', () => {
    for (const line of wrap('The push went through and the branch is up on the remote.', 12)) expect(line.length).toBeLessThanOrEqual(12)
  })

  test('the vitals wrap to rows of the width, at least one to a row', () => {
    expect(packVitals(VITALS, 40)).toEqual([[0, 3]])
    expect(packVitals(VITALS, 25)).toEqual([[0, 2], [2, 3]])
    expect(packVitals(['⚡ cache live'], 5)).toEqual([[0, 1]])
    expect(packVitals([], 40)).toEqual([])
  })

  test('beside the half blocks the vitals take the rows they wrap to; short of rows, one', () => {
    expect(shape(layoutInfo({ rows: 9, width: 25, said: null, vitals: VITALS }))).toEqual(['name+species', 'xp:block', 'vitals', 'vitals'])
    expect(shape(layoutInfo({ rows: 3, width: 25, said: null, vitals: VITALS }))).toEqual(['name+species', 'xp:half', 'vitals'])
  })
})
