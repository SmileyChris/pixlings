// The effort gate drawn: gate.ts's segments as Texts, the stops and the Auto slot as plain Buttons that look like
// text. One drawing for the band's row, its mini gate, and the room, on every surface.

import type { ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { GateSeg } from './gate.ts'
import type { Effort } from './judge.ts'

export type GateKit = { readonly Text: ElementConstructor<TextProps>; readonly Button: ElementConstructor<ButtonProps> }

/** What a press on the gate does; null before Auto has loaded, when a press does nothing. */
export type GateActions = { readonly pick: (level: Effort) => void; readonly toggle: () => void } | null

/** The level in use, Auto's slot while on, and the arrows of a shift in the accent colour; the rest dim. */
const isLit = (role: GateSeg['role']): boolean => role === 'active' || role === 'autoOn' || role === 'arrow'

const ink = (seg: GateSeg, color: string): TextProps => (isLit(seg.role) ? { color } : { dimColor: true })

/** The gate's segments as elements, in a row's order. A stop is keyed `effort-<level>`, the Auto slot `effort-auto`. */
export function gateElements(kit: GateKit, segs: readonly GateSeg[], color: string, act: GateActions): RenderElement[] {
  return segs.map((seg) => {
    const text = kit.Text({ ...ink(seg, color), children: seg.text })
    if (seg.level !== undefined) {
      const level = seg.level
      return kit.Button({ key: `effort-${level}`, label: `effort ${level}`, plain: true, onPress: () => act?.pick(level), children: [text] })
    }
    if (seg.role === 'auto' || seg.role === 'autoOn') {
      return kit.Button({ key: 'effort-auto', label: 'Auto effort', plain: true, onPress: () => act?.toggle(), children: [text] })
    }
    return text
  })
}
