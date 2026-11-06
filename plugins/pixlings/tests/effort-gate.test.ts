// Tests for effort/gate.ts: what the effort gate shows, as segments the band colours and makes clickable.

import { describe, expect } from 'claude-code/testing'

import type { Effort } from '../hooks/effort/judge.ts'
import { EFFORTS } from '../hooks/effort/judge.ts'
import type { GateSeg } from '../hooks/effort/gate.ts'
import { gateRow, miniGate } from '../hooks/effort/gate.ts'
import { test } from './kit.ts'

const text = (segs: GateSeg[]): string => segs.map((s) => s.text).join('')
const NOW = 10_000
const view = (over: Partial<Parameters<typeof gateRow>[0]> = {}): Parameters<typeof gateRow>[0] => ({
  effort: 'high',
  isAuto: true,
  why: 'multi-file refactor',
  shift: null,
  now: NOW,
  ...over,
})

describe('gateRow: the full gate', () => {
  test('at rest on high with Auto on: label, five stops, the knob on H, the Auto slot and its reason', () => {
    expect(text(gateRow(view(), 80))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "multi-file refactor"')
  })

  test('the knob is on the active stop only: its seg is ● plus the label, role active, with its level', () => {
    for (const [i, level] of EFFORTS.entries()) {
      const segs = gateRow(view({ effort: level }), 80)
      const actives = segs.filter((s) => s.role === 'active')
      expect(actives.length).toBe(1)
      expect(actives[0]!.text).toBe('●' + ['L', 'M', 'H', 'X', 'Mx'][i]!)
      expect(actives[0]!.level).toBe(level)
      expect(text(segs).split('●').length - 1).toBe(1)
    }
  })

  test('the other stops are plain stops, each carrying its level so a click can pick it', () => {
    const stops = gateRow(view({ effort: 'high' }), 80).filter((s) => s.role === 'stop')
    expect(stops.map((s) => s.text)).toEqual(['L', 'M', 'X', 'Mx'])
    expect(stops.map((s) => s.level)).toEqual(['low', 'medium', 'xhigh', 'max'])
  })

  test('with no effort known yet every stop is a plain stop and there is no knob', () => {
    const segs = gateRow(view({ effort: undefined }), 80)
    expect(segs.filter((s) => s.role === 'stop').map((s) => s.text)).toEqual(['L', 'M', 'H', 'X', 'Mx'])
    expect(segs.some((s) => s.role === 'active')).toBe(false)
    expect(text(segs)).not.toContain('●')
  })

  test('the Auto slot follows isAuto: lit and followed by the reason when on, dim and alone when off', () => {
    const on = gateRow(view({ isAuto: true }), 80)
    expect(on.find((s) => s.text === 'A')?.role).toBe('autoOn')
    expect(on.find((s) => s.role === 'why')?.text).toBe('auto: "multi-file refactor"')

    const off = gateRow(view({ isAuto: false }), 80)
    expect(off.find((s) => s.text === 'A')?.role).toBe('auto')
    expect(off.some((s) => s.role === 'why')).toBe(false)
    expect(text(off)).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
  })

  test('Auto on with no reason yet draws no empty auto: ""', () => {
    expect(text(gateRow(view({ why: '' }), 80))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
    expect(text(gateRow(view({ why: '  \n ' }), 80))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
  })

  test('a reason is kept to one line: runs of whitespace and newlines become one space', () => {
    expect(text(gateRow(view({ why: ' two\n  lines ' }), 80))).toContain('auto: "two lines"')
  })
})

describe('gateRow: the shift arrows', () => {
  test('medium to xhigh, before it ends: the rails between become → and the knob is on X', () => {
    const segs = gateRow(view({ effort: 'xhigh', shift: { from: 'medium', to: 'xhigh', until: NOW + 1 } }), 80)
    expect(text(segs)).toContain('L ─ M → H → ●X ─ Mx')
    expect(segs.filter((s) => s.role === 'arrow').map((s) => s.text)).toEqual([' → ', ' → '])
    expect(segs.filter((s) => s.role === 'rail').length).toBe(2)
  })

  test('high to low, before it ends: the rails between become ← and the knob is on L', () => {
    const segs = gateRow(view({ effort: 'low', shift: { from: 'high', to: 'low', until: NOW + 1 } }), 80)
    expect(text(segs)).toContain('●L ← M ← H ─ X ─ Mx')
    expect(segs.filter((s) => s.role === 'arrow').map((s) => s.text)).toEqual([' ← ', ' ← '])
  })

  test('a shift of one step turns the one rail between the two stops', () => {
    const segs = gateRow(view({ effort: 'max', shift: { from: 'xhigh', to: 'max', until: NOW + 1 } }), 80)
    expect(text(segs)).toContain('L ─ M ─ H ─ X → ●Mx')
    expect(segs.filter((s) => s.role === 'arrow').length).toBe(1)
  })

  test('at and after `until` the rails are dashes again', () => {
    for (const now of [NOW, NOW + 1, NOW + 5_000]) {
      const segs = gateRow(view({ effort: 'xhigh', now, shift: { from: 'medium', to: 'xhigh', until: NOW } }), 80)
      expect(text(segs)).toContain('L ─ M ─ H ─ ●X ─ Mx')
      expect(segs.some((s) => s.role === 'arrow')).toBe(false)
    }
  })

  test('just before `until` the arrows are still there', () => {
    const segs = gateRow(view({ effort: 'xhigh', now: NOW - 1, shift: { from: 'medium', to: 'xhigh', until: NOW } }), 80)
    expect(segs.some((s) => s.role === 'arrow')).toBe(true)
  })

  test('no shift, no arrows', () => {
    expect(gateRow(view({ shift: null }), 80).some((s) => s.role === 'arrow')).toBe(false)
  })

  test('if the person picked another level during the shift, the arrows to the old target are not drawn', () => {
    // Auto moved medium to xhigh, then a click chose low inside the 2.5 s.
    const segs = gateRow(view({ effort: 'low', shift: { from: 'medium', to: 'xhigh', until: NOW + 1_000 } }), 80)
    expect(text(segs)).toContain('●L ─ M ─ H ─ X ─ Mx')
    expect(segs.some((s) => s.role === 'arrow')).toBe(false)
  })

  test('with no effort known there is nothing to point at, so no arrows', () => {
    const segs = gateRow(view({ effort: undefined, shift: { from: 'medium', to: 'xhigh', until: NOW + 1_000 } }), 80)
    expect(segs.some((s) => s.role === 'arrow')).toBe(false)
  })

  test('a shift naming a level the gate does not have draws no arrows', () => {
    const segs = gateRow(view({ effort: 'high', shift: { from: 'bogus', to: 'high', until: NOW + 1_000 } }), 80)
    expect(segs.some((s) => s.role === 'arrow')).toBe(false)
    expect(text(segs)).toContain('L ─ M ─ ●H ─ X ─ Mx')
  })

  test('the arrows keep the gate the same width as it has at rest, bar the knob moving', () => {
    const rest = text(gateRow(view({ effort: 'xhigh' }), 80))
    const moving = text(gateRow(view({ effort: 'xhigh', shift: { from: 'medium', to: 'xhigh', until: NOW + 1 } }), 80))
    expect(moving.length).toBe(rest.length)
  })
})

describe('gateRow: fitting the width', () => {
  const LONG = 'a very long reason that will never fit on one line of the band however wide it is'

  test('the gate fits 60 columns with a long reason: the reason is cut with …, the label stays', () => {
    const t = text(gateRow(view({ why: LONG }), 60))
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t.startsWith('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "a very long')).toBe(true)
    expect(t.endsWith('…"')).toBe(true)
    expect(t.length).toBe(60)
  })

  test('a reason that fits is shown whole, with no …', () => {
    const t = text(gateRow(view({ why: 'tiny' }), 60))
    expect(t).toContain('auto: "tiny"')
    expect(t).not.toContain('…')
  })

  test('a reason that just fits is not cut, one column less and it is', () => {
    const whole = text(gateRow(view(), 200))
    expect(text(gateRow(view(), whole.length))).toBe(whole)
    const cut = text(gateRow(view(), whole.length - 1))
    expect(cut.length).toBe(whole.length - 1)
    expect(cut.endsWith('multi-file refact…"')).toBe(true)
  })

  test('with no room to cut the reason to anything, the whole auto: part goes and the label stays', () => {
    // 32 columns hold label + stops + A; a reason needs 12 more to show one letter and a …
    expect(text(gateRow(view({ why: LONG }), 43))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
    expect(text(gateRow(view({ why: LONG }), 44))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "a…"')
  })

  test('a one-letter reason that fits whole is shown, though a cut one would not have fitted', () => {
    expect(text(gateRow(view({ why: 'x' }), 43))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "x"')
    expect(text(gateRow(view({ why: 'xy' }), 43))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
  })

  test('the cut never leaves half an emoji or a space before the …', () => {
    // 60 columns leave 18 for the reason: 17 characters, then the …
    // The emoji is two UTF-16 units at 16 and 17, so a cut after 17 would keep half of it.
    expect(text(gateRow(view({ why: 'sixteen letters!😀 and more' }), 60))).toContain('auto: "sixteen letters!…"')
    // The space is the 17th, so the cut would end "letters! …".
    expect(text(gateRow(view({ why: 'sixteen-letters! and more' }), 60))).toContain('auto: "sixteen-letters!…"')
  })

  test('at 30 columns the label goes, and the stops and A stay', () => {
    const segs = gateRow(view({ why: LONG }), 30)
    expect(text(segs)).toBe('L ─ M ─ ●H ─ X ─ Mx  ┃ A')
    expect(text(segs).length).toBeLessThanOrEqual(30)
    expect(segs.some((s) => s.role === 'label')).toBe(false)
  })

  test('the label goes only after the reason has, and the label fits at 32 but not 31', () => {
    expect(text(gateRow(view({ why: LONG }), 32))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
    expect(text(gateRow(view({ why: LONG }), 31))).toBe('L ─ M ─ ●H ─ X ─ Mx  ┃ A')
  })

  test('with Auto off the label goes at the same width', () => {
    expect(text(gateRow(view({ isAuto: false }), 32))).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
    expect(text(gateRow(view({ isAuto: false }), 31))).toBe('L ─ M ─ ●H ─ X ─ Mx  ┃ A')
  })

  test('at every width the text fits whenever the stops and A fit, and the stops and A always stay', () => {
    for (const effort of [...EFFORTS, undefined] as (Effort | undefined)[]) {
      for (const isAuto of [true, false]) {
        for (let width = 0; width <= 90; width++) {
          const segs = gateRow(view({ effort, isAuto, why: LONG }), width)
          const t = text(segs)
          const stopsAndA = text(gateRow(view({ effort, isAuto: false }), 0)).length
          if (stopsAndA <= width) expect(t.length).toBeLessThanOrEqual(width)
          expect(segs.filter((s) => s.role === 'stop' || s.role === 'active').length).toBe(5)
          expect(segs.some((s) => s.text === 'A')).toBe(true)
        }
      }
    }
  })

  test('arrows do not change what fits', () => {
    const shift = { from: 'low', to: 'max', until: NOW + 1 }
    for (let width = 24; width <= 90; width++) {
      expect(text(gateRow(view({ effort: 'max', shift, why: LONG }), width)).length).toBeLessThanOrEqual(width)
    }
  })

  test('no segment is empty, so nothing paints a blank for nothing', () => {
    for (const width of [20, 31, 32, 43, 44, 60, 200]) {
      for (const s of gateRow(view({ why: LONG }), width)) expect(s.text.length).toBeGreaterThan(0)
    }
  })
})

describe('miniGate: the gate for slim and minimal', () => {
  test('on max: L M H X M, the last M active, no knob, then A lit', () => {
    const segs = miniGate({ effort: 'max', isAuto: true })
    expect(segs.map((s) => s.text)).toEqual(['L', 'M', 'H', 'X', 'M', ' A'])
    expect(segs.map((s) => s.role)).toEqual(['stop', 'stop', 'stop', 'stop', 'active', 'autoOn'])
    expect(text(segs)).toBe('LMHXM A')
    expect(text(segs)).not.toContain('●')
  })

  test('the active letter is the level in use, and the others are plain stops carrying their levels', () => {
    for (const [i, level] of EFFORTS.entries()) {
      const segs = miniGate({ effort: level, isAuto: false })
      expect(segs.slice(0, 5).map((s) => s.role)).toEqual(
        EFFORTS.map((_, j) => (j === i ? 'active' : 'stop')),
      )
      expect(segs.slice(0, 5).map((s) => s.level)).toEqual(EFFORTS)
      expect(text(segs)).toBe('LMHXM A')
    }
  })

  test('the A follows isAuto: autoOn when on, auto when off', () => {
    expect(miniGate({ effort: 'high', isAuto: true }).at(-1)).toEqual({ text: ' A', role: 'autoOn' })
    expect(miniGate({ effort: 'high', isAuto: false }).at(-1)).toEqual({ text: ' A', role: 'auto' })
  })

  test('with no effort known yet every letter is a plain stop', () => {
    const segs = miniGate({ effort: undefined, isAuto: true })
    expect(segs.slice(0, 5).every((s) => s.role === 'stop')).toBe(true)
    expect(segs.some((s) => s.role === 'active')).toBe(false)
  })
})
