// What the v0.3 review found, each held by a test: SDK hosts that draw count as watched, a read
// another hook refused is not taken around, /pixling on and off reach later sessions, and the
// hooks that only observe pass what they see through untouched.

import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'
import { ticsIn } from '../hooks/lib/tics.ts'

const NOON = Date.parse('2026-10-03T12:00:00Z')

const ENGINE = { type: 'Box', props: {}, children: ['engine'] }

const DUCK = {
  v: 1,
  species: 'duck',
  isShiny: false,
  name: 'Quackers',
  hatchedAt: Date.parse('2026-09-01T00:00:00Z'),
  xp: 120,
  hat: null,
  face: null,
  stats: { pets: 3 },
  dex: ['duck'],
  badges: { hello: 1 },
}

const BAND = {
  plugin: 'pixlings',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 110, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  viewport: { columns: 110, rows: 40 },
} as const

const room = (surface: 'terminal' | 'desktop' | 'vscode' | 'mobile') =>
  ({
    plugin: 'pixlings',
    surface,
    component: 'Pane',
    requestId: 'pixling-room',
    props: { title: 'Pixling', isFocused: false, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    viewport: { columns: 60, rows: 40 },
  }) as const

type HostOptions = {
  stored?: Record<string, unknown>
  surfaces?: string[]
  read?: (path: string) => string
  stdout?: string
  truncated?: boolean
  /** What the turn beneath answers. */
  answer?: string
  /** The rate-limit windows `$.session.usage()` reports. */
  limits?: { kind: string; percentUsed: number; resetsAt?: string }[]
  /** Answers `$.session.id()`; a test can hold it to open a window mid-wake. */
  sessionId?: () => Promise<string>
}

/** The engine beneath the pixling: a store, the surfaces attached, the files and processes. */
const host = (on: On, o: HostOptions = {}) => {
  const clock = mock.clock(on, { now: NOON })
  const db = new Map<string, unknown>(Object.entries(o.stored ?? {}))
  on('store.get', ($, e) => ({ value: db.get(e.key) }) as never)
  on('store.set', ($, e) => {
    db.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  on('session.id', async () => ({ value: o.sessionId ? await o.sessionId() : 's1' }) as never)
  on('session.surfaces', () => ({ value: o.surfaces ?? [] }) as never)
  const ran: { argv: readonly string[] }[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv })
    return { value: { exitCode: 0, stdout: o.stdout ?? '', stderr: '', isStdoutTruncated: o.truncated === true, isStderrTruncated: false } }
  })
  on('fs.read', ($, e) => {
    if (!o.read) return { deny: `ENOENT: no such file or directory, open '${e.path}'` } as never
    return { value: o.read(e.path) } as never
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  const invalidated = { count: 0 }
  on('ui.invalidate', () => {
    invalidated.count += 1
    return { value: undefined } as never
  })
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ENGINE as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: o.answer ?? '' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: o.limits ?? [] } }) as never)
  on('classic.Notification', () => ({}))
  on('classic.StopFailure', () => ({}))
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  return { clock, db, ran, invalidated, submitted }
}

type Engine = Parameters<TestBody>[0]

/** One model step that writes a cache, so the vitals row has a countdown to show. */
const model = (on: On) => {
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 20, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 64_000, model: 'test' },
    }
  })
  return async ($: Engine): Promise<void> => {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
    for await (const _ of stream) {
      // drain
    }
    await stream.result
  }
}

/** How the desktop app and the VS Code extension start a session: the SDK, nothing drawn yet. */
const SDK = { cwd: '/repo', surface: null, isInteractive: false } as never

describe('an SDK host that draws is watched', () => {
  test('VS Code attaches when it first draws, and the first egg hatches there', async ($, on) => {
    const { clock, db } = host(on)
    await $.session.start(SDK)
    await clock.advance(3000)
    expect(db.has('pixling')).toBe(false)
    await $.session.attach({ surface: 'vscode', clientId: 'vscode:default' } as never)
    await clock.advance(10_000)
    const pane = await $.ui.mount(room('vscode'))
    const egg = await pane.find({ type: 'Text', text: 'An egg, not hatched yet.' })
    await pane.unmount()
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect({ egg: egg?.text ?? null, card: card.text, saved: db.has('pixling') }).toEqual({
      egg: null,
      card: expect.stringContaining('Personality'),
      saved: true,
    })
  })

  test('a desktop surface attached at the start keeps the band alive: vitals and frames', async ($, on) => {
    const { clock, invalidated } = host(on, { stored: { pixling: DUCK }, surfaces: ['desktop'] })
    const step = model(on)
    await $.session.start(SDK)
    await clock.advance(3000)
    await step($)
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const before = invalidated.count
    await clock.advance(3000)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
    await ui.unmount()
    expect({ hasCacheVital: /cache/.test(texts), redraws: invalidated.count - before > 0 }).toEqual({ hasCacheVital: true, redraws: true })
  })

  test('a -p run, where nothing ever draws, stays quiet: no egg, no frames, no sound', async ($, on) => {
    const { clock, db, ran, invalidated } = host(on)
    await $.session.start(SDK)
    await clock.advance(10_000)
    expect({ saved: db.has('pixling'), frames: invalidated.count, processes: ran.length }).toEqual({ saved: false, frames: 0, processes: 0 })
  })
})

/** A guard another plugin (or an administrator) installs: the config holds credentials. */
const GUARD = {
  name: 'credentials-guard',
  register: (on: On) => {
    on('fs.read', ($, e, next) => (/\.claude\.json$/.test(e.path) ? ({ deny: 'the Claude config holds credentials' } as never) : next(e)))
  },
}

describe('/pixling adopt and a refused read', () => {
  test('a read another hook refused stays refused: no host process reads it, nothing is adopted', { plugins: [GUARD] }, async ($, on) => {
    const config = JSON.stringify({ primaryApiKey: 'sk-ant-x', companion: { name: 'Pebblet', personality: 'hums', hatchedAt: 1_767_225_600 } })
    const { clock, db, ran } = host(on, { stored: { pixling: DUCK }, read: () => config, stdout: config })
    on('tool.call', ($, e) => {
      const input = e as unknown as { questions?: { question: string }[] }
      const answers = Object.fromEntries((input.questions ?? []).map(q => [q.question, 'Bring Pebblet back']))
      return { result: { questions: input.questions ?? [], answers }, text: 'answered' } as never
    })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    await clock.advance(1000)
    const readers = ran.filter(r => r.argv.join(' ').includes('PIXLING_IN') || r.argv.join(' ').includes('Get-Content') || r.argv[0] === 'cat')
    expect({ hostReads: readers.length, adopted: /Pebblet is back/.test(out.text ?? ''), name: (db.get('pixling') as { name: string }).name }).toEqual({
      hostReads: 0,
      adopted: false,
      name: 'Quackers',
    })
    expect(out.text).toContain('Could not read')
    expect(out.text).not.toContain('sk-ant-x')
  })
})

describe('/pixling on and off', () => {
  test('/pixling on reaches later sessions even when this one never saw it leave', async ($, on) => {
    const { clock, db } = host(on, { stored: { pixling: DUCK } })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    // Another terminal sent it away meanwhile: the store says away, this session still shows it.
    db.set('away', true)
    const out = await $.command.run({ command: 'pixling', args: 'on' } as never)
    expect({ reply: out.text, away: db.get('away') }).toEqual({ reply: expect.any(String), away: false })
  })

  test('/pixling off reaches later sessions even when this one already thought it away', async ($, on) => {
    const { clock, db } = host(on, { stored: { pixling: DUCK, away: true } })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    db.set('away', false)
    await $.command.run({ command: 'pixling', args: 'off' } as never)
    expect(db.get('away')).toBe(true)
  })
})

describe('the hooks that only watch pass what they see through untouched', () => {
  const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

  test('tool.call: the result beneath comes back as it was', async ($, on) => {
    const beneath = { result: { stdout: '3 passed', stderr: '' }, text: '3 passed in 0.12s' }
    on('tool.call', () => beneath as never)
    const { clock } = host(on, { stored: { pixling: DUCK } })
    await $.session.start(START)
    await clock.advance(3000)
    const got = (await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)) as typeof beneath
    expect({ result: got.result, text: got.text }).toEqual(beneath)
  })

  test('turn.complete: the answer beneath comes back as it was', async ($, on) => {
    const { clock } = host(on, { stored: { pixling: DUCK }, answer: 'the answer, untouched' })
    await $.session.start(START)
    await clock.advance(3000)
    const got = await $.turn.complete({ answer: 'the answer, untouched', durationMs: 90_000, isAborted: false, turnId: 't', reason: 'answer' })
    expect(got.text).toBe('the answer, untouched')
  })

  test('turn.step: the step beneath comes back as it was', async ($, on) => {
    const step = {
      answer: 'the answer, untouched',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 20, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 64_000, model: 'test' },
    }
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, ...step }
    })
    const { clock } = host(on, { stored: { pixling: DUCK } })
    await $.session.start(START)
    await clock.advance(3000)
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
    let chunk = await stream.next()
    while (!chunk.done) chunk = await stream.next()
    const got = chunk.value
    expect({ answer: got.answer, toolUses: got.toolUses, stopReason: got.stopReason, usage: got.usage }).toEqual(step)
  })

  test('session.compact: the summary beneath comes back as it was', async ($, on) => {
    const summary = [{ role: 'user' as const, text: 'Summary: the parser was refactored.', toolUses: [] }]
    on('session.compact', () => ({ messages: summary, tokensBefore: 90_000, tokensAfter: 20_000 }))
    const { clock } = host(on, { stored: { pixling: DUCK } })
    await $.session.start(START)
    await clock.advance(3000)
    const chat = [
      { role: 'user' as const, text: 'Refactor the parser.', toolUses: [] },
      { role: 'assistant' as const, text: 'Done: three files changed.', toolUses: [] },
    ]
    const compacting = $.session.compact({ trigger: 'manual', messages: chat } as never)
    await clock.advance(1000)
    const got = (await compacting) as { messages: typeof summary; tokensBefore: number; tokensAfter: number }
    expect({ messages: got.messages, tokensBefore: got.tokensBefore, tokensAfter: got.tokensAfter }).toEqual({ messages: summary, tokensBefore: 90_000, tokensAfter: 20_000 })
  })
})

describe('tics', () => {
  test('long runs of blanks are read in linear time, and the praise around them still counts', () => {
    const blanks = (s: string) => `Done.${s}Great question!\n${s}\nPerfect! It works.\n  Excellent.`
    for (const run of [' '.repeat(40_000), '\n'.repeat(40_000)]) {
      const started = performance.now()
      const found = ticsIn(blanks(run))
      const ms = performance.now() - started
      expect(ms).toBeLessThan(60)
      expect(found).toEqual(run.startsWith(' ') ? { perfect: 2 } : { greatQuestion: 1, perfect: 2 })
    }
    expect(ticsIn('Great question! And a good point to add logging.')).toEqual({ greatQuestion: 1 })
    expect(ticsIn('That works.  Good catch.')).toEqual({ greatQuestion: 1 })
  })
})

describe('waking from a nap', () => {
  test('a prompt that lands while it wakes up still cancels the continue', async ($, on) => {
    const resetsAt = NOON + 5 * 60_000
    // Once armed, the next session id read takes a minute of the test's clock: the moment
    // between "the nap is over" and "continue" that a prompt can fall into, held open.
    const slow = { isArmed: false }
    let clock: ReturnType<typeof host>['clock'] | null = null
    const engine = host(on, {
      stored: { pixling: DUCK },
      limits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(resetsAt).toISOString() }],
      sessionId: async () => {
        if (slow.isArmed && clock) {
          slow.isArmed = false
          await clock.sleep(60_000)
        }
        return 's1'
      },
    })
    clock = engine.clock
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(10)
    slow.isArmed = true
    await clock.set(resetsAt + 30_000)
    await $.prompt.submit({ text: 'I am back, hold on', origin: { kind: 'user' } } as never)
    await clock.advance(61_000)
    await clock.settle()
    expect(slow.isArmed).toBe(false)
    expect(engine.submitted.filter(t => /continue the task/.test(t))).toEqual([])
  })
})
