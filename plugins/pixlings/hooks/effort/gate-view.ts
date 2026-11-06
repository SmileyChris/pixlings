// The effort gate drawn: gate.ts's segments as Texts, the stops and the Auto slot as plain Buttons that look like
// text. One drawing for the band's row, its mini gate, and the room, on every surface.

import type { ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { GateSeg } from './gate.ts'
import type { Effort } from './judge.ts'

export type GateKit = { readonly Text: ElementConstructor<TextProps>; readonly Button: ElementConstructor<ButtonProps> }

/** What a press on the gate does; null before Auto has loaded, when a press does nothing. */
export type GateActions = { readonly pick: (level: Effort) => void; readonly toggle: () => void } | null

/**
 * The gate's colours: `color` the accent (the pixling's rarity colour), `ink` a dark ink that reads on it, for the
 * Auto slot lit like a key.
 */
export type GatePaint = { readonly color: string; readonly ink: string }

/** The level in use and the arrows of a shift in the accent colour; Auto's slot while on lit like a key, on the
 * accent in dark ink; the rest dim. */
const paintOf = (seg: GateSeg, paint: GatePaint): TextProps => {
  if (seg.role === 'autoOn') return { color: paint.ink, backgroundColor: paint.color }
  return seg.role === 'active' || seg.role === 'arrow' ? { color: paint.color } : { dimColor: true }
}

/** The gate's segments as elements, in a row's order. A stop is keyed `effort-<level>`, the Auto slot `effort-auto`. */
export function gateElements(kit: GateKit, segs: readonly GateSeg[], paint: GatePaint, act: GateActions): RenderElement[] {
  return segs.map((seg) => {
    const text = kit.Text({ ...paintOf(seg, paint), children: seg.text })
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
