// The effort gate in the band and the room: the row in `full` and `compact`, the mini gate in `slim` and `minimal`,
// nothing in `off`, and the stops and the Auto slot as Buttons that pick a level or turn Auto on and off.

import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'
import { ROOM_ID } from '../hooks/lib/room.ts'

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const USAGE = { input_tokens: 70, output_tokens: 22, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const COMPOSER = { kind: 'composer' } as const
const SURFACES = ['terminal', 'desktop'] as const

type Engine = Parameters<TestBody>[0]
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const BAND = {
  plugin: 'pixlings',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 110,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
  viewport: { columns: 110, rows: 60 },
} as const

const room = (surface: (typeof SURFACES)[number]) =>
  ({
    plugin: 'pixlings',
    surface,
    component: 'Pane',
    requestId: ROOM_ID,
    props: { title: 'Pixling', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    viewport: { columns: 100, rows: 60 },
  }) as const

const DUCK = {
  v: 1,
  species: 'duck',
  isShiny: false,
  name: 'Quackers',
  hatchedAt: Date.parse('2026-09-01T00:00:00Z'),
  xp: 120,
  hat: null,
  face: null,
  stats: {},
  dex: ['duck'],
  // Earned already, so no celebration holds the stage during a test.
  badges: { hello: 1 },
}

/** The engine beneath the pixling: a judge that answers in turn, a prompt box, toasts, and the model step. */
const host = (on: On, replies: Effort[] = []) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  mock.store(on, { pixling: DUCK })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  const asked: string[] = []
  const toasts: string[] = []
  const filled: string[] = []
  const reached: unknown[] = []
  const queue = [...replies]
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('model.complete', ($, e) => {
    asked.push(e.prompt)
    const next = queue.shift() ?? 'medium'
    return { value: { isAnswered: true, text: `{"model":"opus","effort":"${next}","why":"judged ${next}","sure":0.9}`, usage: USAGE } } as never
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    // The plugin's own call: the event's result itself.
    return { isFilled: true } as never
  })
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.StopFailure', () => ({}))
  on('classic.Notification', () => ({}))
  on('turn.step', async function* ($, e) {
    reached.push(e.effort)
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 20, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'test' },
    }
  })
  return { clock, asked, toasts, filled, reached }
}

/** The person types a prompt, and the main loop sends one request at the app's own `effort`. */
const ask = async ($: Engine, text: string, effort: Effort = 'medium'): Promise<void> => {
  await $.prompt.submit({ text, origin: COMPOSER } as never)
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort, messageCount: 3 } as never)
  for await (const _ of stream) {
    // drain
  }
  await stream.result
}

type Node = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }
const nodes = (tree: unknown): Node[] => {
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return [node, ...(node.children ?? []).flatMap(nodes)]
}
const strings = (node: Node): string[] => nodes(node).flatMap(n => (n.children ?? []).filter((c): c is string => typeof c === 'string'))
/** The innermost row Box that holds the gate's label (or, without it, its stops): the gate row as drawn. */
const gateRowOf = (tree: unknown): Node | undefined =>
  nodes(tree)
    .filter(n => n.type === 'Box' && nodes(n).some(m => m.type === 'Button' && (m.key ?? m.props?.['key']) === 'effort-high'))
    .at(-1)
/** Every Text's string, in the order drawn. */
const texts = async (ui: { findAll: (q: { type: 'Text' }) => Promise<readonly { text: string }[]> }): Promise<string[]> =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text)

describe('the effort gate in the band', () => {
  for (const band of ['full', 'compact'] as const) {
    test(`${band} shows the gate on a row of its own, and the vitals no longer end with the effort`, { options: { band, roam: false } }, async ($, on) => {
      const { clock } = host(on, ['high'])
      await $.session.start(START)
      await clock.advance(3000)
      await ask($, 'refactor the auth module')
      await clock.advance(1000)
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })
        await clock.advance(1000)
        await ui.redraw()
        expect(await ui.find({ type: 'Text', text: 'effort' }), surface).toBeDefined()
        expect(await ui.find({ type: 'Text', text: '●H' }), surface).toBeDefined()
        expect(await ui.find({ type: 'Button', key: 'effort-high' } as never), surface).toBeDefined()
        expect(await ui.find({ type: 'Button', key: 'effort-auto' } as never), surface).toBeDefined()
        const all = await texts(ui)
        expect(all.some(t => /opus 5\.5$/.test(t)), surface).toBe(true)
        expect(all.some(t => /· high$/.test(t)), surface).toBe(false)
        await ui.unmount()
      }
    })
  }

  test('beside the half blocks the gate gives Auto’s reason', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'auto: "judged high"' }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  for (const band of ['slim', 'minimal'] as const) {
    test(`${band} shows the mini gate: no knob, after the cache countdown`, { options: { band, roam: false } }, async ($, on) => {
      const { clock } = host(on, ['high'])
      await $.session.start(START)
      await clock.advance(3000)
      await ask($, 'refactor the auth module')
      // Its greeting over, so slim's second row shows the vitals rather than speech.
      await clock.advance(20_000)
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })
        await clock.advance(1000)
        await ui.redraw()
        const all = await texts(ui)
        expect(all.some(t => t.includes('●')), surface).toBe(false)
        expect(all.includes('effort'), surface).toBe(false)
        expect(all.some(t => /· high$/.test(t)), surface).toBe(false)
        for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
          expect(await ui.find({ type: 'Button', key: `effort-${level}` } as never), `${surface} ${level}`).toBeDefined()
        }
        expect(await ui.find({ type: 'Button', key: 'effort-auto' } as never), surface).toBeDefined()
        // The letters in order, the active one in the accent colour, then the Auto slot.
        const at = all.findIndex(t => /cache/.test(t))
        const letters = all.indexOf('L')
        expect(at, surface).toBeGreaterThanOrEqual(0)
        expect(letters, surface).toBeGreaterThan(at)
        expect(all.slice(letters, letters + 6), surface).toEqual(['L', 'M', 'H', 'X', 'M', ' A'])
        const lit = (await ui.findAll({ type: 'Text', text: 'H' })).at(0) as unknown as { props: Record<string, unknown> }
        expect(lit.props['color'], surface).toBeDefined()
        const dim = (await ui.findAll({ type: 'Text', text: 'L' })).at(0) as unknown as { props: Record<string, unknown> }
        expect(dim.props['dimColor'], surface).toBe(true)
        await ui.unmount()
      }
    })
  }

  test('off draws no band, and a prompt is still judged', { options: { band: 'off' } }, async ($, on) => {
    const { clock, asked, reached } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    expect(asked).toHaveLength(1)
    expect(reached).toEqual(['high'])
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'effort' }), surface).toBeUndefined()
      expect(await ui.find({ type: 'Button', key: 'effort-high' } as never), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('pressing a stop picks that level and types /effort; pressing A turns Auto back on', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock, filled, toasts, reached } = host(on, ['low'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'what is a monad')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect((await ui.find({ type: 'Text', text: 'A' }))?.props['dimColor'], surface).toBeFalsy()
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort-high' })
    await clock.advance(10)
    expect(filled).toEqual(['/effort high'])
    expect(toasts).toContain("Press Enter to send /effort high so the app's own control follows")
    for (const surface of SURFACES) {
      const shown = await $.ui.mount({ ...BAND, surface })
      expect(await shown.find({ type: 'Text', text: '●H' }), surface).toBeDefined()
      // Auto is off: its slot is dim, and no reason is given.
      expect((await shown.find({ type: 'Text', text: 'A' }))?.props['dimColor'], surface).toBe(true)
      expect(await shown.find({ type: 'Text', text: /^auto: / }), surface).toBeUndefined()
      await shown.unmount()
    }
    // The manual pick goes out with the next request.
    const stream = $.turn.step({ turnId: 't', index: 1, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3 } as never)
    for await (const _ of stream) {
      // drain
    }
    await stream.result
    expect(reached.at(-1)).toBe('high')

    await ui.redraw()
    await ui.press({ key: 'effort-auto' })
    await clock.advance(10)
    await ui.redraw()
    expect((await ui.find({ type: 'Text', text: 'A' }))?.props['dimColor']).toBeFalsy()
    await ui.unmount()
  })

  test('turning Auto off after it sent high shows the app’s own medium: the level the next request carries', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock, reached } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    // The app is at medium; Auto's high goes out.
    await ask($, 'refactor the auth module', 'medium')
    expect(reached).toEqual(['high'])
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: '●H' }), surface).toBeDefined()
      await ui.press({ key: 'effort-auto' })
      await clock.advance(10)
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: '●M' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '●H' }), surface).toBeUndefined()
      // Auto on again for the next surface: its pick is in force once more.
      await ui.press({ key: 'effort-auto' })
      await clock.advance(10)
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: '●H' }), surface).toBeDefined()
      await ui.unmount()
    }
    // What the gate said is what goes out.
    await ask($, 'go on', 'medium')
    expect(reached.at(-1)).toBe('high')
  })

  test('a thinking budget the gate cannot show stays in the vitals', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 32_000, messageCount: 3 } as never)
    for await (const _ of stream) {
      // drain
    }
    await stream.result
    await clock.advance(1000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = await texts(ui)
      expect(all.some(t => /opus 5\.5 · 32k$/.test(t)), surface).toBe(true)
      // The gate is there, with no level lit.
      expect(all, surface).toContain('effort')
      expect(all.some(t => t.startsWith('●')), surface).toBe(false)
      await ui.unmount()
    }
  })

  test('on desktop a press does the same', { options: { band: 'compact', roam: false } }, async ($, on) => {
    const { clock, filled } = host(on, ['low'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'what is a monad')
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await ui.press({ key: 'effort-xhigh' })
    await clock.advance(10)
    expect(filled).toEqual(['/effort xhigh'])
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: '●X' })).toBeDefined()
    await ui.unmount()
  })

  test('the mini gate is pressed the same way', { options: { band: 'minimal', roam: false } }, async ($, on) => {
    const { clock, filled } = host(on, ['low'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'what is a monad')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      await ui.press({ key: 'effort-max' })
      await clock.advance(10)
      await ui.unmount()
    }
    expect(filled).toEqual(['/effort max', '/effort max'])
  })

  test('before anything is known, the gate shows the app’s own effort', { options: { band: 'full', roam: false, autoEffort: true } }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    // A request with no prompt judged: the app's own effort, which Auto leaves alone.
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 3 } as never)
    for await (const _ of stream) {
      // drain
    }
    await stream.result
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: '●X' }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  test('Auto’s change of level draws arrows the way it moved, which fade', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high', 'low'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    await ask($, 'what is a monad')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: '●L' }), surface).toBeDefined()
      expect(await ui.findAll({ type: 'Text', text: ' ← ' }), surface).toHaveLength(2)
      await ui.unmount()
    }
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: ' ← ' }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('autoEffort off: no gate, and the vitals keep the effort', { options: { band: 'full', roam: false, autoEffort: false } }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    await clock.advance(1000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      await clock.advance(1000)
      await ui.redraw()
      expect(await ui.find({ type: 'Text', text: 'effort' }), surface).toBeUndefined()
      expect(await ui.find({ type: 'Button', key: 'effort-high' } as never), surface).toBeUndefined()
      expect((await texts(ui)).some(t => /opus 5\.5 · medium$/.test(t)), surface).toBe(true)
      await ui.unmount()
    }
  })

  test('autoEffort off in slim: no mini gate either', { options: { band: 'slim', roam: false, autoEffort: false } }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Button', key: 'effort-auto' } as never), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the gate fits 60 columns', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module, every file of it, and the tests that go with them')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 60 }, viewport: { columns: 60, rows: 60 }, surface })
      const row = gateRowOf(await ui.drawn())
      expect(row, surface).toBeDefined()
      const drawn = strings(row!).join('')
      // The column beside the 22-column sprite is 34 wide: the label and the stops fit, the reason does not.
      expect(drawn.length, surface).toBeLessThanOrEqual(60 - 22 - 4)
      expect(drawn, surface).toBe('effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A')
      await ui.unmount()
    }
  })

  test('autoscale fits the band with its gate: capped at 6 rows, compact is still picked and the gate shown', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    // 36 rows: a sixth is 6. Full's 9 rows do not fit; compact's picture (4) or bust (6) does.
    const viewport = { columns: 110, rows: 36 }
    const terminal = await $.ui.mount({ ...BAND, viewport, surface: 'terminal' })
    await clock.advance(1000)
    await terminal.redraw()
    const picture = (await terminal.findAll({ type: 'Image' } as never)).find(i => (i as { key?: string }).key?.startsWith('pixling-image-')) as
      | { props: Record<string, unknown> }
      | undefined
    expect(picture?.props).toMatchObject({ columns: 10, rows: 4 })
    expect(await terminal.find({ type: 'Text', text: 'effort' })).toBeDefined()
    await terminal.unmount()
    const desktop = await $.ui.mount({ ...BAND, viewport, surface: 'desktop' })
    // The bust: 12 pixel rows drawn at 4, not full's 18.
    expect((await desktop.find({ type: 'Svg' }))?.props['height']).toBe(48)
    expect(await desktop.find({ type: 'Text', text: 'effort' })).toBeDefined()
    await desktop.unmount()
  })

  test('autoscale: a talking picture grows a row for the gate, so its speech stays whole', { options: { band: 'compact', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    // A sixth of 36 rows is 6: room for two lines of speech under the shared name row, the vitals and the gate. Counted
    // without the gate, the picture would grow to 3 rows of speech and name and keep its own 4, and the speech be cut.
    // At 40 columns the column is 26 wide, so each of the three rename lines (picked at random) wraps to two lines.
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 }, viewport: { columns: 40, rows: 36 }, surface: 'terminal' })
    await clock.advance(1000)
    await $.command.run({ command: 'pixling', args: 'name Bartholomew Quackington the Third of Puddle Lane' } as never)
    await clock.advance(10)
    await ui.redraw()
    const all = await texts(ui)
    const spoken = all.filter((t, i) => all[i + 1] === ' │')
    expect(spoken).toHaveLength(2)
    expect(spoken.join(' ')).toContain('Bartholomew')
    expect(all.some(t => t.trimEnd().endsWith('…'))).toBe(false)
    // The gate row, its label left off at this width.
    expect(all).toContain('●H')
    expect(await ui.find({ type: 'Button', key: 'effort-auto' } as never)).toBeDefined()
    await ui.unmount()
  })
})

describe('the effort gate in the room', () => {
  test('the room shows the gate under its vitals, and its stops press the same', async ($, on) => {
    const { clock, filled } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    await clock.advance(1000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(room(surface))
      expect(await ui.find({ type: 'Text', text: 'effort' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '●H' }), surface).toBeDefined()
      expect((await texts(ui)).some(t => /· high$/.test(t)), surface).toBe(false)
      const all = await texts(ui)
      expect(all.indexOf('effort'), surface).toBeGreaterThan(all.findIndex(t => /opus 5\.5$/.test(t)))
      await ui.unmount()
    }
    const ui = await $.ui.mount(room('desktop'))
    await ui.press({ key: 'effort-low' })
    await clock.advance(10)
    expect(filled).toEqual(['/effort low'])
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: '●L' })).toBeDefined()
    await ui.unmount()
  })

  test('autoEffort off: no gate in the room', { options: { autoEffort: false } }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(room(surface))
      expect(await ui.find({ type: 'Button', key: 'effort-auto' } as never), surface).toBeUndefined()
      await ui.unmount()
    }
  })
})
