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
/** What the judge answers: a level (its reason "judged <level>"), a level with its own reason, or null for no answer. */
type Reply = Effort | { effort: Effort; why: string } | null

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

type HostOptions = {
  /** When the session starts; noon UTC unless given. */
  now?: number
  /** The commands the app lists. */
  commands?: { name: string; description: string; source: string; plugin?: string }[]
  /** Passes the plugin's redraws on to the kit, so a mounted drawing follows them as a surface's does. */
  isRedrawn?: boolean
}

/** The engine beneath the pixling: a judge that answers in turn (medium once the replies run out), a prompt box, toasts, and the model step. */
const host = (on: On, replies: Reply[] = [], o: HostOptions = {}) => {
  const clock = mock.clock(on, { now: o.now ?? Date.parse('2026-10-03T12:00:00Z') })
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
  on('command.list', () => ({ value: o.commands ?? [] }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('model.complete', ($, e) => {
    asked.push(e.prompt)
    const next = queue.length > 0 ? queue.shift()! : 'medium'
    if (next === null) return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } } as never
    const { effort, why } = typeof next === 'string' ? { effort: next, why: `judged ${next}` } : next
    return { value: { isAnswered: true, text: `{"model":"opus","effort":"${effort}","why":"${why}","sure":0.9}`, usage: USAGE } } as never
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  // The app's own /effort, as a plugin's `$.command.run` reaches it.
  on('command.run', { command: 'effort' }, ($, e) => {
    filled.push(`/effort ${e.args}`)
    return { text: '' } as never
  })
  on('prompt.fill', () => {
    throw new Error('the gate never types into the prompt box')
  })
  /** When, on the clock, each redraw the plugin asked for came. */
  const invalidated: number[] = []
  on('ui.invalidate', ($, e, next) => {
    invalidated.push(clock.now())
    return o.isRedrawn ? next(e) : ({ value: undefined } as never)
  })
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
  return { clock, asked, toasts, filled, reached, invalidated }
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

/** One main-loop request on `model` at the app's own `effort`, with no prompt before it. */
const request = async ($: Engine, model: string, effort: Effort | undefined, index = 0): Promise<void> => {
  const stream = $.turn.step({ turnId: 't', index, model, effort, messageCount: 3 } as never)
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
/** The strings drawn at rest: not those of a Box shown only under the pointer, as the hover card is. */
const restingStrings = (tree: unknown): string[] => {
  if (typeof tree === 'string') return [tree]
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return node.props?.['display'] === 'none' ? [] : (node.children ?? []).flatMap(restingStrings)
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
/** Whether the Auto slot is lit, as while Auto is on: its letter lit like a key, on the accent colour, not dim. */
const isAutoLit = async (ui: { find: (q: never) => Promise<{ children: unknown[] } | undefined> }): Promise<boolean> => {
  const slot = await ui.find({ type: 'Button', key: 'effort-auto' } as never)
  const letter = slot?.children.find((c): c is Node => typeof c === 'object' && c !== null)
  return typeof letter?.props?.['backgroundColor'] === 'string' && letter.props['dimColor'] !== true
}
/** The gate row's text as drawn, or undefined when there is none. */
const gateText = async (ui: { drawn: () => Promise<unknown> }): Promise<string | undefined> => {
  const row = gateRowOf(await ui.drawn())
  return row ? strings(row).join('') : undefined
}

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
      expect(await ui.find({ type: 'Text', text: '"judged high"' }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  test('a judged prompt redraws the gate from the state Auto writes, with no redraw asked for', { options: { band: 'full', roam: false } }, async ($, on) => {
    // Noon where the test runs, so no late-night line writes state of its own and redraws the band for it.
    const { clock } = host(on, [{ effort: 'xhigh', why: 'multi-file refactor' }], { now: new Date(2026, 9, 3, 12, 0, 0).getTime() })
    await $.session.start(START)
    await clock.advance(3000)
    await request($, 'claude-opus-5-5', 'medium')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await gateText(ui), surface).toBe('effort  L ─ ●M ─ H ─ X ─ Mx ┃ A')
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    // The host answers every `ui.invalidate` itself, so only the state's own redraw can show the verdict here.
    await $.prompt.submit({ text: 'refactor the auth module', origin: COMPOSER } as never)
    // Up from the app's medium: arrows, and the reason with them.
    expect(await gateText(ui)).toBe('effort  L ─ M → H → ●X ─ Mx ┃ A  "multi-file refactor"')
    await ui.unmount()
  })

  for (const main of ['claude-fable-5-1', 'claude-haiku-5-5'] as const) {
    test(`on ${main}, a model Auto does not steer, the gate says Auto is paused there, with A still lit`, { options: { band: 'full', roam: false } }, async ($, on) => {
      const { clock } = host(on, [{ effort: 'high', why: 'multi-file refactor' }])
      await $.session.start(START)
      await clock.advance(3000)
      // Judged on Opus; then the main loop moves to a model Auto leaves alone, at the app's own effort (Haiku takes none).
      await ask($, 'refactor the auth module')
      await request($, main, main === 'claude-haiku-5-5' ? undefined : 'high', 1)
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })
        expect(await isAutoLit(ui), surface).toBe(true)
        expect(await gateText(ui), surface).toMatch(/ ┃ A {2}"paused on this model"$/)
        expect(await ui.find({ type: 'Text', text: 'multi-file refactor' }), surface).toBeUndefined()
        await ui.unmount()
      }
    })
  }

  test('with Effortless installed the gate says Auto is paused for it, at the effort the requests carry', { options: { band: 'full', roam: false } }, async ($, on) => {
    const effortless = { name: 'effortless', description: 'effortless: settings', source: 'plugin', plugin: 'effortless' }
    const { clock, asked, toasts } = host(on, ['max'], { commands: [effortless] })
    await $.session.start(START)
    await clock.advance(3000)
    // Effortless sent this request at xhigh; Pixlings judges nothing and leaves it so.
    await ask($, 'refactor the auth module', 'xhigh')
    expect(asked).toEqual([])
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await isAutoLit(ui), surface).toBe(true)
      expect(await gateText(ui), surface).toBe('effort  L ─ M ─ H ─ ●X ─ Mx ┃ A  "paused: Effortless is installed"')
      await ui.unmount()
    }
    expect(toasts.filter(t => t.includes('Effortless'))).toEqual(["Pixlings' Auto effort is paused while Effortless is installed. Uninstall Effortless to use it here."])
  })

  test('after a reload the gate shows the level in force before the next request, its reason long gone', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on)
    // The engine's state outlives the module's reload: Auto on, and the level it chose before.
    const kept = new Map<string, unknown>([
      ['pixlings/effortAuto', true],
      ['pixlings/effortPick', { effort: 'high', why: 'multi-file refactor', by: 'haiku' }],
    ])
    on('state.get', ($, e) => ({ value: { value: kept.get(`${e.plugin}/${e.key}`), version: 1 } }) as never)
    on('state.set', ($, e) => {
      kept.set(`${e.plugin}/${e.key}`, e.value)
      return { value: { isSet: true, version: 2 } } as never
    })
    await $.session.start(START)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await gateText(ui), surface).toBe('effort  L ─ M ─ ●H ─ X ─ Mx ┃ A')
      await ui.unmount()
    }
  })

  test('after Haiku did not answer, pressing A lights it and gives no reason until Haiku judges again', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock, toasts } = host(on, [null])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    expect(toasts.some(t => t.includes("Haiku didn't answer"))).toBe(true)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await isAutoLit(ui)).toBe(false)
    await ui.press({ key: 'effort-auto' })
    await clock.advance(10)
    await ui.unmount()
    for (const surface of SURFACES) {
      const shown = await $.ui.mount({ ...BAND, surface })
      expect(await isAutoLit(shown), surface).toBe(true)
      expect(await shown.find({ type: 'Text', text: "Haiku didn't answer" }), surface).toBeUndefined()
      // Medium, the level Haiku's failure set, goes out until Haiku judges again.
      expect(await gateText(shown), surface).toBe('effort  L ─ ●M ─ H ─ X ─ Mx ┃ A')
      await shown.unmount()
    }
  })

  test('a level the person picked gives no reason once A is pressed again', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['low'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'what is a monad')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort-high' })
    await clock.advance(10)
    await ui.redraw()
    await ui.press({ key: 'effort-auto' })
    await clock.advance(10)
    await ui.unmount()
    for (const surface of SURFACES) {
      const shown = await $.ui.mount({ ...BAND, surface })
      expect(await isAutoLit(shown), surface).toBe(true)
      expect(await gateText(shown), surface).toBe('effort  L ─ M ─ ●H ─ X ─ Mx ┃ A')
      await shown.unmount()
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
        expect(all.slice(letters, letters + 7), surface).toEqual(['L', 'M', 'H', 'X', 'M', ' ', 'A'])
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

  test('pressing a stop picks that level and sends /effort with the next prompt; pressing A turns Auto back on', { options: { band: 'full', roam: false } }, async ($, on) => {
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
    // Nothing goes to the app on the click: it goes with the next thing the person sends.
    expect(filled).toEqual([])
    await $.prompt.submit({ text: 'go on', origin: COMPOSER } as never)
    await clock.advance(10)
    expect(filled).toEqual(['/effort high'])
    expect(toasts.some(t => t.includes('Press Enter'))).toBe(false)
    for (const surface of SURFACES) {
      const shown = await $.ui.mount({ ...BAND, surface })
      expect(await shown.find({ type: 'Text', text: '●H' }), surface).toBeDefined()
      // Auto is off: its slot is dim, and no reason is given.
      expect((await shown.find({ type: 'Text', text: 'A' }))?.props['dimColor'], surface).toBe(true)
      expect(await shown.find({ type: 'Text', text: /^"/ }), surface).toBeUndefined()
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
    expect(filled).toEqual([])
    await $.prompt.submit({ text: 'go on', origin: COMPOSER } as never)
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
    // Two clicks, one /effort, with the next prompt.
    expect(filled).toEqual([])
    await $.prompt.submit({ text: 'go on', origin: COMPOSER } as never)
    await clock.advance(10)
    expect(filled).toEqual(['/effort max'])
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
    await clock.advance(11_000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: ' ← ' }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the arrows fade on their own: the gate asks for a redraw as the shift ends', { options: { band: 'full', roam: false } }, async ($, on) => {
    // Noon where the test runs: no late-night line, whose mood ending would ask for a redraw of its own.
    const { clock, invalidated } = host(on, ['high', 'low'], { isRedrawn: true, now: new Date(2026, 9, 3, 12, 0, 0).getTime() })
    // The shift as Auto writes it to the state, which the kit beneath still keeps.
    const shifts: { until: number }[] = []
    on('state.set', ($, e, next) => {
      if (e.key === 'effortShift' && e.value) shifts.push(e.value as { until: number })
      return next(e)
    })
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    await ask($, 'what is a monad')
    // Each judgement draws a shift: the arrows are the last one's, high down to low.
    expect(shifts).toHaveLength(2)
    const until = shifts[1]!.until
    // The terminal blits its frames and redraws only when asked, so the gate's own timer is all that can fade them.
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.findAll({ type: 'Text', text: ' ← ' })).toHaveLength(2)
    const mountedAt = clock.now()
    await clock.set(until - 1000)
    // Nothing yet: no redraw asked for, and the arrows still show.
    expect(invalidated.filter(at => at > mountedAt)).toEqual([])
    expect(await ui.findAll({ type: 'Text', text: ' ← ' })).toHaveLength(2)
    await clock.set(until + 1000)
    // The gate's timer asked for a redraw as the shift ended, and the drawing followed it: no remount, and dashes
    // again. (The pixling's clock is synced to this one once a second, so just after the clock jumps it lags: a redraw
    // that lands before it reaches the end draws the arrows once more and asks again, till it does.)
    const fade = invalidated.filter(at => at > mountedAt)
    expect(fade.length).toBeGreaterThan(0)
    expect(Math.abs(fade[0]! - until)).toBeLessThan(1000)
    expect(await ui.findAll({ type: 'Text', text: ' ← ' })).toHaveLength(0)
    // The reason goes with the arrows.
    expect(await gateText(ui)).toBe('effort  ●L ─ M ─ H ─ X ─ Mx ┃ A')
    // And then it is done: no more redraws for it.
    const settled = invalidated.length
    await clock.advance(3000)
    expect(invalidated).toHaveLength(settled)
    await ui.unmount()
  })

  test('on desktop the arrows fade with no remount too', { options: { band: 'full', roam: false } }, async ($, on) => {
    // The desktop band's frame clock redraws it a few times a second anyway; this is what the person sees there.
    const { clock } = host(on, ['high', 'low'], { isRedrawn: true, now: new Date(2026, 9, 3, 12, 0, 0).getTime() })
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    await ask($, 'what is a monad')
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.findAll({ type: 'Text', text: ' ← ' })).toHaveLength(2)
    await clock.advance(11_500)
    expect(await ui.findAll({ type: 'Text', text: ' ← ' })).toHaveLength(0)
    expect(await gateText(ui)).toBe('effort  ●L ─ M ─ H ─ X ─ Mx ┃ A')
    await ui.unmount()
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
      expect(drawn, surface).toBe('effort  L ─ M ─ ●H ─ X ─ Mx ┃ A')
      await ui.unmount()
    }
  })

  test('a reason that does not fit whole is left off, never cut: the live width that showed "Rea…"', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    // The gate's row has the band's columns past the 22-column sprite, less 4: whole, its reason takes 46.
    const whole = 'effort  L ─ M ─ ●H ─ X ─ Mx ┃ A  "judged high"'
    for (const surface of SURFACES) {
      for (const [columns, drawn] of [[72, whole], [71, 'effort  L ─ M ─ ●H ─ X ─ Mx ┃ A']] as const) {
        const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns }, viewport: { columns, rows: 60 }, surface })
        const text = strings(gateRowOf(await ui.drawn())!).join('')
        expect(text, `${surface} ${columns}`).toBe(drawn)
        expect(text, `${surface} ${columns}`).not.toContain('…')
        await ui.unmount()
      }
    }
  })

  for (const band of ['full', 'compact'] as const) {
    test(`${band}: a wide band gives Auto’s reason whole, in the room the band has past the column`, { options: { band, roam: false } }, async ($, on) => {
      const { clock } = host(on, [{ effort: 'high', why: 'multi-file refactor' }])
      await $.session.start(START)
      await clock.advance(3000)
      await ask($, 'refactor the auth module')
      for (const surface of SURFACES) {
        // 110 columns: the column beside the 22-column sprite stops at 56, which leaves the reason 14; the band has 84.
        const ui = await $.ui.mount({ ...BAND, surface })
        expect(strings(gateRowOf(await ui.drawn())!).join(''), surface).toBe('effort  L ─ M ─ ●H ─ X ─ Mx ┃ A  "multi-file refactor"')
        await ui.unmount()
      }
    })
  }

  test('the gate row widens alone: the rows around it keep the column’s 56 columns and what they say', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, [{ effort: 'high', why: 'refactor across six files' }, { effort: 'high', why: 'refactor across six files' }])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    // Its speech over, so the column holds its rows alone; then a prompt judged again, so its reason shows.
    await clock.advance(20_000)
    await $.prompt.submit({ text: 'and the tests', origin: COMPOSER } as never)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const tree = await ui.drawn()
      const stats = nodes(tree).find(n => n.props?.['key'] === 'stats')!
      const column = nodes(tree).find(n => (n.children ?? []).includes(stats))!
      const gate = gateRowOf(column)!
      // The gate's row right under the card's scope, outside it, in the column's flow.
      expect(column.children!.indexOf(gate), surface).toBe(column.children!.indexOf(stats) + 1)
      // The rows in the scope's flow: the hover card is placed over them, outside it.
      const others = (stats.children as Node[]).filter(row => row.props?.['position'] !== 'absolute')
      expect(others.map(row => strings(row).join('')), surface).toEqual(['Quackers Lv 3 · Duck ★', '██░░░░░░░░░░ 21/113  ', '⏳ cache ~4:42 · 0% cached · opus 5.5'])
      // The columns each row is laid out in: its own width, else the scope's.
      expect(others.map(row => row.props?.['width'] ?? stats.props?.['width']), surface).toEqual([56, 56, 56])
      expect(strings(gate).join(''), surface).toBe('effort  L ─ M ─ ●H ─ X ─ Mx ┃ A  "refactor across six files"')
      // The column grows as far as that row's 60 columns, not to all the band has; the card's scope keeps the 56.
      expect(column.props?.['width'], surface).toBe(60)
      expect(gate.props?.['width'], surface).toBe(60)
      expect(stats.props?.['width'], surface).toBe(56)
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
    // Nothing drawn at rest is cut; the hover card's line, shown only under the pointer, may be.
    expect(restingStrings(await ui.drawn()).some(t => t.trimEnd().endsWith('…'))).toBe(false)
    // The gate row, its label left off at this width.
    expect(all).toContain('●H')
    expect(await ui.find({ type: 'Button', key: 'effort-auto' } as never)).toBeDefined()
    await ui.unmount()
  })
})

/** The Auto slot's letter, the Text inside the `effort-auto` Button. */
const autoLetter = async (ui: { find: (q: never) => Promise<{ children: unknown[] } | undefined> }): Promise<Node | undefined> => {
  const slot = await ui.find({ type: 'Button', key: 'effort-auto' } as never)
  return slot?.children.find((c): c is Node => typeof c === 'object' && c !== null)
}
/** The band's dark ink, the card's fill: what a lit key's letter is drawn in on the pixling's colour. */
const KEY_INK = '#1a1b26'

describe('the Auto slot lit like a key', () => {
  for (const [band, active] of [['full', '●L'], ['compact', '●L'], ['minimal', 'L']] as const) {
    test(`${band}: while Auto is on, A is drawn on the pixling's colour in dark ink; off, it is dim with no background`, { options: { band, roam: false } }, async ($, on) => {
      const { clock } = host(on, ['low'])
      await $.session.start(START)
      await clock.advance(3000)
      await ask($, 'what is a monad')
      await clock.advance(20_000)
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })
        const lit = (await ui.findAll({ type: 'Text', text: active })).find(t => typeof (t as unknown as Node).props?.['color'] === 'string') as unknown as Node
        const color = lit.props?.['color']
        expect(typeof color, surface).toBe('string')
        const letter = await autoLetter(ui)
        expect(strings(letter!).join(''), surface).toBe('A')
        expect(letter?.props?.['backgroundColor'], surface).toBe(color)
        expect(letter?.props?.['color'], surface).toBe(KEY_INK)
        expect(letter?.props?.['dimColor'], surface).toBeFalsy()
        await ui.unmount()
      }
      const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
      await ui.press({ key: 'effort-high' })
      await clock.advance(10)
      await ui.unmount()
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })
        const letter = await autoLetter(ui)
        expect(strings(letter!).join(''), surface).toBe('A')
        expect(letter?.props?.['backgroundColor'], surface).toBeUndefined()
        expect(letter?.props?.['dimColor'], surface).toBe(true)
        await ui.unmount()
      }
    })
  }

  test('the room lights A the same way', async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(room(surface))
      const color = ((await ui.find({ type: 'Text', text: '●H' })) as unknown as Node).props?.['color']
      const letter = await autoLetter(ui)
      expect(letter?.props?.['backgroundColor'], surface).toBe(color)
      expect(letter?.props?.['color'], surface).toBe(KEY_INK)
      await ui.unmount()
    }
  })
})

describe('the Auto slot under the pointer', () => {
  // The surface inverts a Button under the pointer: A's colours are given swapped there, so it reads as intended.
  test('under the pointer, a lit A stays lit, bold and underlined; a dim one lights to the full text colour, bold', { options: { band: 'full', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['low'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'what is a monad')
    await clock.advance(20_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const lit = await autoLetter(ui)
    const color = lit?.props?.['backgroundColor']
    // Given swapped, as the surface inverts it: the accent behind, the dark ink, by weight.
    expect(hoverOf(lit!)).toEqual({ color, backgroundColor: KEY_INK, bold: true, underline: true })
    // Heated by a keyed Box around the Button: a Text inside a Button cannot heat a hover itself.
    const slot = withAncestors(await ui.drawn()).find(({ node }) => node.type === 'Button' && keyOf(node) === 'effort-auto')!
    expect(slot.above.some(n => n.type === 'Box' && keyOf(n) === 'effort-auto-slot')).toBe(true)
    await ui.press({ key: 'effort-auto' })
    await clock.advance(10)
    await ui.redraw()
    const dim = await autoLetter(ui)
    expect(dim?.props?.['dimColor']).toBe(true)
    expect(hoverOf(dim!)).toEqual({ color: 'inverseText', backgroundColor: 'text', dimColor: false, bold: true })
    await ui.unmount()
  })
})

/** Each node of a drawing with its ancestors, the root first. */
const withAncestors = (tree: unknown, above: Node[] = []): { node: Node; above: Node[] }[] => {
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return [{ node, above }, ...(node.children ?? []).flatMap(c => withAncestors(c, [...above, node]))]
}
const keyOf = (n: Node): unknown => n.key ?? n.props?.['key']
const hoverOf = (n: Node): Record<string, unknown> | undefined =>
  ((n as { hover?: Record<string, unknown> }).hover ?? n.props?.['hover']) as Record<string, unknown> | undefined
/** A Box the pointer reveals over what is under it: placed absolute, drawn `display: none`, shown by its hover. */
const isOverlay = (n: Node): boolean =>
  n.type === 'Box' && n.props?.['position'] === 'absolute' && n.props?.['display'] === 'none' && hoverOf(n)?.['display'] === 'flex'
/** The overlays a pointer over a keyed Box reveals: those beneath it and not beneath a nested keyed Box. */
const overlaysOf = (scope: Node): Node[] =>
  (scope.children ?? []).flatMap(c => {
    if (!c || typeof c !== 'object') return []
    const n = c as Node
    if (isOverlay(n)) return [n]
    return n.type === 'Box' && typeof keyOf(n) === 'string' ? [] : overlaysOf(n)
  })
/**
 * Why a pointer on the gate's Button `key` would not reach it, or [] when it would: inside the `stats` card's scope,
 * inside a Box that a hover reveals or restyles, or in a hover scope that reveals an overlay.
 */
const occluders = (tree: unknown, key: string): string[] => {
  const found = withAncestors(tree).find(({ node }) => node.type === 'Button' && keyOf(node) === key)
  if (!found) return [`no ${key}`]
  const why: string[] = []
  if (found.above.some(n => keyOf(n) === 'stats')) why.push('inside the stats card scope')
  if (found.above.some(n => n.type === 'Box' && hoverOf(n) !== undefined)) why.push('inside a Box with a hover')
  const scope = found.above.findLast(n => n.type === 'Box' && typeof keyOf(n) === 'string')
  if (scope && overlaysOf(scope).length > 0) why.push(`in the hover scope ${String(keyOf(scope))}, which reveals an overlay`)
  return why
}

describe('the gate is out from under the stats card', () => {
  for (const band of ['full', 'compact', 'slim', 'minimal'] as const) {
    test(`${band}: no hover card or overlay lies over the gate's Buttons, so a click reaches them`, { options: { band, roam: false } }, async ($, on) => {
      const { clock } = host(on, ['high'])
      await $.session.start(START)
      await clock.advance(3000)
      await ask($, 'refactor the auth module')
      // Its greeting over, and the terminal's images known, so slim is its two-row picture with the mini gate.
      await clock.advance(20_000)
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })
        await clock.advance(1000)
        await ui.redraw()
        const tree = await ui.drawn()
        for (const key of ['effort-high', 'effort-auto']) expect(occluders(tree, key), `${surface} ${key}`).toEqual([])
        // The band still has its card, in the stats' scope.
        const stats = nodes(tree).find(n => keyOf(n) === 'stats')
        expect(stats && overlaysOf(stats).length, surface).toBe(band === 'minimal' || (band === 'slim' && surface === 'desktop') ? undefined : 1)
        await ui.unmount()
      }
    })
  }

  test('slim on a terminal that draws images is the picture, with the mini gate on a row of the column', { options: { band: 'slim', roam: false } }, async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    await clock.advance(20_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(1000)
    await ui.redraw()
    const picture = (await ui.findAll({ type: 'Image' } as never)).find(i => (i as { key?: string }).key?.startsWith('pixling-image-')) as { props: Record<string, unknown> } | undefined
    expect(picture?.props).toMatchObject({ rows: 2 })
    expect(nodes(await ui.drawn()).some(n => keyOf(n) === 'stats')).toBe(true)
    await ui.unmount()
  })

  test('the room has no overlay over its gate', async ($, on) => {
    const { clock } = host(on, ['high'])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(room(surface))
      const tree = await ui.drawn()
      for (const key of ['effort-high', 'effort-auto']) expect(occluders(tree, key), `${surface} ${key}`).toEqual([])
      await ui.unmount()
    }
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
    expect(filled).toEqual([])
    await $.prompt.submit({ text: 'go on', origin: COMPOSER } as never)
    await clock.advance(10)
    expect(filled).toEqual(['/effort low'])
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: '●L' })).toBeDefined()
    await ui.unmount()
  })

  test('the room gives Auto’s reason whole, in the width of its card', async ($, on) => {
    const { clock } = host(on, [{ effort: 'high', why: 'multi-file refactor' }])
    await $.session.start(START)
    await clock.advance(3000)
    await ask($, 'refactor the auth module')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(room(surface))
      expect(await ui.find({ type: 'Text', text: '"multi-file refactor"' }), surface).toBeDefined()
      await ui.unmount()
    }
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
