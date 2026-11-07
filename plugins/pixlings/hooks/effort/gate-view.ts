// The effort gate drawn: gate.ts's segments as Texts, the stops and the Auto slot as plain Buttons that look like
// text. One drawing for the band's row, its mini gate, and the room, on every surface.

import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { GateSeg } from './gate.ts'
import type { Effort } from './judge.ts'

export type GateKit = {
  readonly Box: ElementConstructor<BoxProps>
  readonly Text: ElementConstructor<TextProps>
  readonly Button: ElementConstructor<ButtonProps>
}

/** What a press on the gate does; null before Auto has loaded, when a press does nothing. */
export type GateActions = { readonly pick: (level: Effort) => void; readonly toggle: () => void } | null

/**
 * The gate's colours: `color` the accent (the pixling's rarity colour), `ink` a dark ink that reads on it, for the
 * Auto slot lit like a key. `isAutoFocused`: the site's focus ring is on the Auto slot.
 */
export type GatePaint = { readonly color: string; readonly ink: string; readonly isAutoFocused?: boolean }

/** The level in use and the arrows of a shift in the accent colour; the rest dim. */
const paintOf = (seg: GateSeg, paint: GatePaint): TextProps =>
  seg.role === 'active' || seg.role === 'arrow' ? { color: paint.color } : { dimColor: true }

/**
 * Auto's slot: lit like a key while on, on the accent in dark ink; dim while off. The surface inverts a Button under
 * the pointer and under the focus ring, which would put out a lit A and light a dim one, so every look there is given
 * swapped (as the band's door does): under the pointer by `hover`, which the keyed Box around the Button heats, and
 * under the ring by drawing its resting look swapped. `inverseText` stands in, swapped, for the terminal's own
 * ground, which no colour names.
 */
const autoPaintOf = (isOn: boolean, paint: GatePaint): TextProps => {
  const rest: TextProps = isOn ? { color: paint.ink, backgroundColor: paint.color } : { dimColor: true }
  const restSwapped: TextProps = isOn ? { color: paint.color, backgroundColor: paint.ink } : { color: 'inverseText', backgroundColor: 'inactive', dimColor: false }
  // A pale accent (a common pixling's is near white) leaves a colour change unseen, so the pointer marks it by weight:
  // lit, it stays lit and turns bold and underlined; dim, it lights to the theme's full text colour, bold.
  const hover = isOn
    ? { color: paint.color, backgroundColor: paint.ink, bold: true, underline: true }
    : { color: 'inverseText', backgroundColor: 'text', dimColor: false, bold: true }
  return { ...(paint.isAutoFocused ? restSwapped : rest), hover }
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
      // Keyed, so the pointer on the slot heats its Text's `hover`: a Text inside a Button cannot heat a scope itself.
      const button = kit.Button({ key: 'effort-auto', label: 'Auto effort', plain: true, onPress: () => act?.toggle(), children: [text] })
      return kit.Box({ key: 'effort-auto-slot', flexShrink: 0, children: [button] })
    }
    return text
  })
}
