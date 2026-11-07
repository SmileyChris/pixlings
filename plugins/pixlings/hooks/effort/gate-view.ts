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
 * Auto slot lit like a key. `isAutoFocused`: the site's focus ring is on the Auto slot.
 */
export type GatePaint = { readonly color: string; readonly ink: string; readonly isAutoFocused?: boolean }

/** The scope the Auto slot's hover colours answer to, so they need no keyed Box around the gate. */
const AUTO_SCOPE = 'pixlings-effort-auto'

/** The level in use and the arrows of a shift in the accent colour; the rest dim. */
const paintOf = (seg: GateSeg, paint: GatePaint): TextProps =>
  seg.role === 'active' || seg.role === 'arrow' ? { color: paint.color } : { dimColor: true }

/**
 * Auto's slot: lit like a key while on, on the accent in dark ink; dim while off. The surface inverts a Button under
 * the pointer and under the focus ring, which would put out a lit A and light a dim one, so each look is also given
 * swapped (as the band's door does): under the pointer by `hover`, under the ring by drawing it swapped. Inverted, it
 * looks as it rests, whether on or off; under the pointer it is underlined, so it still answers.
 */
const autoPaintOf = (isOn: boolean, paint: GatePaint): TextProps => {
  const rest: TextProps = isOn ? { color: paint.ink, backgroundColor: paint.color } : { dimColor: true }
  // Off at rest is the dim ink on the terminal's own ground: swapped, `inverseText` stands in for that ground.
  const swapped = isOn ? { color: paint.color, backgroundColor: paint.ink } : { color: 'inverseText', backgroundColor: 'inactive', dimColor: false }
  return { ...(paint.isAutoFocused ? swapped : rest), hover: { scope: AUTO_SCOPE, ...swapped, underline: true } }
}

/** The gate's segments as elements, in a row's order. A stop is keyed `effort-<level>`, the Auto slot `effort-auto`. */
export function gateElements(kit: GateKit, segs: readonly GateSeg[], paint: GatePaint, act: GateActions): RenderElement[] {
  return segs.map((seg) => {
    const isAutoSlot = seg.role === 'auto' || seg.role === 'autoOn'
    const text = kit.Text({ ...(isAutoSlot ? autoPaintOf(seg.role === 'autoOn', paint) : paintOf(seg, paint)), children: seg.text })
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
