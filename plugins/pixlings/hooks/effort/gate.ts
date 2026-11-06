// What the effort gate shows, as segments. Pure: no `$`, no colours. The band gives each role its colour and makes
// the stops and the Auto slot clickable; this file decides only the text, the roles, and what fits.
//
//   effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "multi-file refactor"      full gate, in `full` and `compact`
//   LMHXM A                                                            mini gate, in `slim` and `minimal`

import { EFFORTS } from './judge.ts'
import type { Effort } from './judge.ts'

export type GateSeg = {
  text: string
  role: 'label' | 'stop' | 'active' | 'rail' | 'arrow' | 'sep' | 'auto' | 'autoOn' | 'why'
  /** The level a stop stands for, so a click on it can pick that level. */
  level?: Effort
}

/** What the gate knows: the level in use (undefined before anything is known), Auto's state and reason, any shift. */
type GateView = {
  effort: Effort | undefined
  isAuto: boolean
  why: string
  shift: { from: string; to: string; until: number } | null
  now: number
}

const STOP: Record<Effort, string> = { low: 'L', medium: 'M', high: 'H', xhigh: 'X', max: 'Mx' }
// The mini gate has one column a letter, so max is a second M.
const MINI_STOP: Record<Effort, string> = { low: 'L', medium: 'M', high: 'H', xhigh: 'X', max: 'M' }

const KNOB = '●'
const RAIL = ' ─ '
const UP = ' → '
const DOWN = ' ← '
const WHY_OPEN = 'auto: "'
const WHY_CLOSE = '"'
const GAP = '  '

/** The columns a row of segments takes. */
export const gateColumns = (segs: readonly GateSeg[]): number => segs.reduce((n, s) => n + s.text.length, 0)

/**
 * The rails that point the way the level just moved: from the old stop to the new one, while the shift lasts.
 * Only if the level in use is the one Auto moved to. If the person picked another level during the shift, the
 * arrows would point somewhere the knob is not, so the gate shows plain dashes.
 */
function arrowsOf(v: GateView): { lo: number; hi: number; glyph: string } | null {
  const shift = v.shift
  if (!shift || v.effort === undefined || v.now >= shift.until || shift.to !== v.effort) return null
  const from = EFFORTS.findIndex((e) => e === shift.from)
  const to = EFFORTS.indexOf(v.effort)
  if (from < 0 || from === to) return null
  return { lo: Math.min(from, to), hi: Math.max(from, to), glyph: to > from ? UP : DOWN }
}

/**
 * The full gate, fitted to `width` columns. Auto's reason is shown whole or not at all: when the whole
 * `auto: "<why>"` does not fit, it goes, never cut, as a cut reason says little. Then the `effort` label goes. The
 * five stops and the Auto slot always stay, even if they are wider than `width` on their own.
 */
export function gateRow(v: GateView, width: number): GateSeg[] {
  const arrows = arrowsOf(v)
  const stops: GateSeg[] = []
  EFFORTS.forEach((level, i) => {
    if (i > 0) {
      const turned = arrows !== null && i - 1 >= arrows.lo && i - 1 < arrows.hi
      stops.push(turned ? { text: arrows.glyph, role: 'arrow' } : { text: RAIL, role: 'rail' })
    }
    stops.push(level === v.effort ? { text: KNOB + STOP[level], role: 'active', level } : { text: STOP[level], role: 'stop', level })
  })
  const rest: GateSeg[] = [...stops, { text: GAP + '┃ ', role: 'sep' }, { text: 'A', role: v.isAuto ? 'autoOn' : 'auto' }]
  const label: GateSeg[] = [{ text: 'effort', role: 'label' }, { text: GAP, role: 'sep' }]

  const reason = v.isAuto ? v.why.replace(/\s+/g, ' ').trim() : ''
  if (reason) {
    const why: GateSeg[] = [{ text: GAP, role: 'sep' }, { text: WHY_OPEN + reason + WHY_CLOSE, role: 'why' }]
    const whole = [...label, ...rest, ...why]
    if (gateColumns(whole) <= width) return whole
  }
  return gateColumns(label) + gateColumns(rest) <= width ? [...label, ...rest] : rest
}

/** The gate for the narrow bands: one letter a level, no knob, and the Auto slot. The caller colours `active`. */
export function miniGate(v: { effort: Effort | undefined; isAuto: boolean }): GateSeg[] {
  return [
    ...EFFORTS.map((level): GateSeg => ({ text: MINI_STOP[level], role: level === v.effort ? 'active' : 'stop', level })),
    // The space its own, so a lit A lights its letter alone.
    { text: ' ', role: 'sep' },
    { text: 'A', role: v.isAuto ? 'autoOn' : 'auto' },
  ]
}
