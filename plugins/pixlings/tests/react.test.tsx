import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'
import { CANVAS_W, layoutFor, MINI_LEAVE_MS, MINI_POOF_MS, MINI_SLOT, miniTint, mirror, renderFrame, renderMini, SPRITE_X, squadWidth, TRANSPARENT } from '../hooks/lib/canvas.ts'
import type { Hat, MiniView, Mood, Pixels } from '../hooks/lib/canvas.ts'
import { SPECIES } from '../hooks/lib/sprites.ts'
import type { Species } from '../hooks/lib/sprites.ts'

const NOON = Date.parse('2026-10-04T12:00:00Z')
const MIN = 60_000
const DAY = 24 * 60 * MIN
/** Tests that run minutes of clock: about a second alone, slower when suites share the CPU. */
const LONG = 20_000

/** Stretches the 100 ms frame clock to a minute, so a test can sleep through minutes cheaply. */
const SLOW = {
  name: 'slow-frames',
  register: (on: On) => {
    on('clock.every', ($, e, next) => next({ ...e, ms: Math.max(e.ms, 60_000) }))
  },
}

// Colors only these reactions draw (lib/canvas.ts).
const PRESS = 0xdfe6f2
const BEAD = 0x4aa8ff
const CAP_RED = 0xff5a6e
const SPROUT = 0x8ee08a
const COUNT = 0x8b95a8
const PUFF = 0xb4bfd0
const TONGUE = 0xff6b81
const READ_ICON = 0x4d7cff

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

/** On a 110-column band the pixling has 30 columns to walk; the canvas is 22 wide. */
const WIDE = CANVAS_W + 30

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

/** Level 3 at 120 xp: it wears the sprout. Badges earned, so no celebration takes the stage. */
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
  badges: { hello: 1 },
}

type Ran = { argv: readonly string[] }
type Engine = Parameters<TestBody>[0]

/** The engine beneath the pixling: a store the test reads, limits and hook answers it moves. */
const host = (on: On, stored: Readonly<Record<string, unknown>> = { pixling: DUCK }) => {
  const clock = mock.clock(on, { now: NOON })
  const db = new Map<string, unknown>(Object.entries(stored))
  on('store.get', ($, e) => ({ value: db.get(e.key) }) as never)
  on('store.set', ($, e) => {
    db.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  on('session.id', () => ({ value: 's1' }) as never)
  const ran: Ran[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  /** What the person's own settings hooks beneath answer a model switch. */
  const beneath: { answer: Record<string, unknown> } = { answer: {} }
  on('classic.PreModelSwitch', () => beneath.answer as never)
  const limits: { windows: { kind: string; percentUsed: number }[] } = { windows: [] }
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: limits.windows } }) as never)
  return { clock, db, ran, limits, beneath }
}

/** The model beneath: each request the test raises takes the next queued cache counts. */
const model = (on: On) => {
  const queue: { read: number; written: number }[] = []
  on('turn.step', async function* ($, e) {
    const r = queue.shift() ?? { read: 0, written: 64_000 }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 20, output_tokens: 400, cache_read_input_tokens: r.read, cache_creation_input_tokens: r.written, model: 'claude-opus-5-5' },
    }
  })
  /** One main-thread request naming `name` and `effort`, answered with these cache counts. */
  return async ($: Engine, name = 'claude-opus-5-5', effort?: 'high' | 'xhigh', read = 0, written = 64_000): Promise<void> => {
    queue.push({ read, written })
    const stream = $.turn.step({ turnId: 't', index: 0, model: name, effort, messageCount: 3 })
    for await (const _ of stream) {
      // Drain the chunks; the result is what the pixling reads.
    }
    await stream.result
  }
}

const sounds = (ran: Ran[]): string[] =>
  ran.flatMap(r => {
    const m = r.argv.join(' ').match(/sounds\\([\w-]+)\.wav/)
    return m ? [m[1] ?? ''] : []
  })

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** RasterProps.cells back into u32 words: [codePoint, fg, bg] per cell. */
const words = (cells: string): number[] => {
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of cells) {
    if (ch === '=') break
    buffer = ((buffer << 6) | B64.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 255)
    }
  }
  const out: number[] = []
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    out.push(((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24)) >>> 0)
  }
  return out
}

/**
 * The band as a terminal draws it now: a fresh mount draws the frame of this moment. `has`
 * reads the Raster's colors, between two columns when given; `text` is every Text shown.
 */
const band = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const raster = await ui.find({ type: 'Raster' })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
  await ui.unmount()
  const columns = Number(raster?.props['columns'] ?? 0)
  const rows = Number(raster?.props['rows'] ?? 0)
  const cells = words(String(raster?.props['cells'] ?? ''))
  const has = (color: number, from = 0, to = columns): boolean => {
    for (let i = 0; i * 3 + 2 < cells.length; i++) {
      const x = i % columns
      if (x >= from && x < to && (cells[i * 3 + 1] === color || cells[i * 3 + 2] === color)) return true
    }
    return false
  }
  return { columns, rows, has, text }
}

const measure = (percent: number) => ({
  context: { window: 200_000, tokens: percent * 2000, percent },
  rateLimits: [],
  changed: ['context' as const],
})

const attachment = (type: 'plan_mode' | 'plan_mode_exit', agentId?: string) =>
  (type === 'plan_mode'
    ? { type, text: 'Plan mode is active.', origin: { kind: 'engine' }, detail: { reminder: 'full', planFilePath: '/p/plan.md', hasPlan: false }, agentId }
    : { type, text: 'You have exited plan mode.', origin: { kind: 'engine' }, detail: { planFilePath: '/p/plan.md', hasPlan: true }, agentId }) as never

const SWITCH = {
  from_model: 'claude-opus-5-5',
  to_model: 'claude-sonnet-5-5',
  requested_model: 'sonnet',
  source: 'command',
  context_tokens: 180_000,
  prompt_cache_warm: true,
  cache_ttl: '5m',
  estimated_cache_write_usd: 0.45,
  pricing: 'catalog',
} as const

/** A transcript to compact, and the one summary message core leaves of it. */
const chat = () => [
  { role: 'user' as const, text: 'Refactor the parser.', toolUses: [] },
  { role: 'assistant' as const, text: 'Done: three files changed.', toolUses: [] },
]
const summary = () => [{ role: 'user' as const, text: 'Summary: the parser was refactored.', toolUses: [] }]
/** Every line the end of a compaction may say (lib/lines.ts compacted, compactedPlain). */
const RELIEF = /→|squeezed|squished|breathe|roomy|much better|compacted/i

describe('compaction', () => {
  test('a main compaction squishes it under the press; it springs back and says what was freed', { timeoutMs: LONG }, async ($, on) => {
    const { clock, ran } = host(on)
    on('session.compact', async () => {
      await clock.sleep(5000)
      return { messages: summary(), tokensBefore: 152_000, tokensAfter: 31_000 }
    })
    await $.session.start(START)
    await clock.advance(3000)
    await $.session.measure(measure(91))
    await clock.advance(100)
    const rest = await band($)
    expect(rest.has(BEAD)).toBe(true)
    const compacting = $.session.compact({ trigger: 'auto', messages: chat() })
    await clock.advance(1000)
    const during = await band($)
    expect(during.has(PRESS)).toBe(true)
    expect(during.rows).toBe(rest.rows)
    expect(during.columns).toBe(rest.columns)
    await clock.advance(5000)
    await compacting
    await clock.advance(1100)
    const after = await band($)
    expect(after.has(PRESS)).toBe(false)
    expect(after.text).toMatch(/152k → 31k|121k tokens/)
    expect(sounds(ran)).toContain('push')
    // The fill is the new size over the window, not the 91% from before: no more sweat.
    expect(after.text).toMatch(/ctx 16%/)
    expect(after.has(BEAD)).toBe(false)
  })

  test("a subagent's or a fork's compaction, and a precompute, are not felt", async ($, on) => {
    const { clock, ran } = host(on)
    on('session.compact', async () => {
      await clock.sleep(2000)
      return { messages: summary(), tokensBefore: 90_000, tokensAfter: 20_000 }
    })
    await $.session.start(START)
    await clock.advance(3000)
    for (const input of [{ trigger: 'auto', agentId: 'agent-7' }, { trigger: 'precompute' }] as const) {
      const compacting = $.session.compact({ ...input, messages: chat() })
      await clock.advance(500)
      expect((await band($)).has(PRESS)).toBe(false)
      await clock.advance(2000)
      await compacting
    }
    await clock.advance(100)
    expect((await band($)).text).not.toMatch(RELIEF)
    expect(sounds(ran)).not.toContain('push')
  })

  test('a vetoed compaction lifts the press with nothing to say', async ($, on) => {
    const { clock, ran } = host(on)
    on('session.compact', async () => {
      await clock.sleep(1000)
      return { skip: 'A PreCompact hook blocked it.' }
    })
    await $.session.start(START)
    await clock.advance(3000)
    const compacting = $.session.compact({ trigger: 'manual', messages: chat() })
    await clock.advance(500)
    expect((await band($)).has(PRESS)).toBe(true)
    await clock.advance(1000)
    await compacting
    await clock.advance(100)
    const after = await band($)
    expect(after.has(PRESS)).toBe(false)
    expect(after.text).not.toMatch(RELIEF)
    expect(sounds(ran)).not.toContain('push')
  })
})

describe('context sweat', () => {
  test('at 85% a bead of sweat sits on it, with one line per crossing', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on)
    const line = /snug in here|\*sweats\*|compaction is coming/
    await $.session.start(START)
    await clock.advance(3000)
    await $.session.measure(measure(70))
    await clock.advance(100)
    expect((await band($)).has(BEAD)).toBe(false)
    await $.session.measure(measure(86))
    await clock.advance(100)
    const hot = await band($)
    expect(hot.has(BEAD)).toBe(true)
    expect(hot.text).toMatch(line)
    // Its bubble gone, a fuller context is the same crossing: no second line.
    await clock.advance(10_000)
    await $.session.measure(measure(93))
    await clock.advance(100)
    const hotter = await band($)
    expect(hotter.has(BEAD)).toBe(true)
    expect(hotter.text).not.toMatch(line)
    // Back under 80% and over 85% again: a new crossing.
    await $.session.measure(measure(60))
    await clock.advance(100)
    expect((await band($)).has(BEAD)).toBe(false)
    await $.session.measure(measure(88))
    await clock.advance(100)
    expect((await band($)).text).toMatch(line)
  })

  test('a /clear starts a new conversation: the old fill and its sweat go with the old one', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    await $.session.measure(measure(91))
    await clock.advance(100)
    expect((await band($)).has(BEAD)).toBe(true)
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    await clock.advance(100)
    const fresh = await band($)
    expect(fresh.has(BEAD)).toBe(false)
    expect(fresh.text).not.toContain('ctx 91%')
  })
})

describe('plan mode', () => {
  test('the plan-mode reminder puts the thinking cap on over the hat; the exit note takes it off', async ($, on) => {
    const { clock } = host(on)
    on('prompt.attachment', ($, e) => ({ text: e.text }))
    await $.session.start(START)
    await clock.advance(3000)
    const before = await band($)
    expect(before.has(SPROUT)).toBe(true)
    expect(before.has(CAP_RED)).toBe(false)
    await $.prompt.attachment(attachment('plan_mode'))
    await clock.advance(100)
    const planning = await band($)
    expect(planning.has(CAP_RED)).toBe(true)
    expect(planning.has(SPROUT)).toBe(false)
    expect(planning.rows).toBe(before.rows)
    expect(planning.text).toMatch(/[Tt]hinking cap|Plan mode|Planning/)
    // A subagent's own exit note is not the session leaving plan mode.
    await $.prompt.attachment(attachment('plan_mode_exit', 'agent-3'))
    await clock.advance(100)
    expect((await band($)).has(CAP_RED)).toBe(true)
    await $.prompt.attachment(attachment('plan_mode_exit'))
    await clock.advance(100)
    const after = await band($)
    expect(after.has(CAP_RED)).toBe(false)
    expect(after.has(SPROUT)).toBe(true)
  })

  test('the attachment hook only watches: what reaches the chain and what it answers pass untouched', async ($, on) => {
    host(on)
    const received: unknown[] = []
    const answered: unknown[] = []
    on('prompt.attachment', ($, e) => {
      received.push(JSON.parse(JSON.stringify(e)))
      const answer = { text: e.type === 'todo_reminder' ? null : `${e.text} (as the chain beneath has it)` }
      answered.push(answer)
      return answer
    })
    await $.session.start(START)
    const sent = [
      attachment('plan_mode'),
      attachment('plan_mode', 'agent-3'),
      { type: 'todo_reminder', text: 'Your todo list is empty.', origin: { kind: 'engine' } } as never,
      attachment('plan_mode_exit'),
    ]
    for (const input of sent) {
      const got = await $.prompt.attachment(input)
      // Without the plugin the result is what the chain beneath answered; with it, the same.
      expect(got).toEqual(answered.at(-1))
      expect(received.at(-1)).toEqual(JSON.parse(JSON.stringify(input)))
    }
    expect(received.length).toBe(sent.length)
  })
})

describe('the squad', () => {
  test('each subagent brings a mini in its color; four stand, the rest are counted, and the band grows only as it must', async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    const alone = await band($)
    expect(alone.columns).toBe(WIDE)
    await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
    await clock.advance(400)
    const one = await band($)
    // The strip comes out of the walking room first: the band is as wide as before.
    expect(one.columns).toBe(WIDE)
    expect(one.rows).toBe(alone.rows)
    expect(one.has(miniTint('Explore'), WIDE - MINI_SLOT)).toBe(true)
    expect(one.has(miniTint('Explore'), 0, WIDE - MINI_SLOT)).toBe(false)
    expect(one.text).toMatch(/Calling in a helper|Go, little Explore|Backup has arrived/)
    for (const id of ['a2', 'a3', 'a4', 'a5', 'a6']) await $.classic.SubagentStart({ agent_id: id, agent_type: 'general-purpose' })
    await clock.advance(400)
    const six = await band($)
    expect(six.columns).toBe(CANVAS_W + squadWidth(4, 2))
    expect(six.rows).toBe(alone.rows)
    expect(six.has(COUNT)).toBe(true)
  })

  test('a finished subagent jumps for joy, then goes about three seconds later', async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
    await clock.advance(2000)
    const strip = WIDE - MINI_SLOT
    expect((await band($)).has(TONGUE, strip)).toBe(false)
    await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'a1', agent_transcript_path: '', agent_type: 'Explore' })
    await clock.advance(100)
    const joy = await band($)
    expect(joy.has(TONGUE, strip)).toBe(true)
    expect(joy.text).toMatch(/High five|Nice work, Explore|Helper is back/)
    // The plugin reads this test clock again once a second, so the band's moments here are whole
    // seconds: the poof, from 2.4 s to 3 s, is checked on the canvas below.
    await clock.advance(1500)
    expect((await band($)).has(TONGUE, strip)).toBe(true)
    await clock.advance(1500)
    const gone = await band($)
    expect(gone.has(miniTint('Explore'))).toBe(false)
    expect(gone.has(TONGUE, strip)).toBe(false)
    // Not even its dust: the strip is the pixling's walking room again.
    expect(gone.has(PUFF)).toBe(false)
    expect(gone.columns).toBe(WIDE)
  })

  test("a subagent's tool shows over its mini, never over the pixling; its danger alarms and its tests count", async ($, on) => {
    const { clock, ran, db } = host(on)
    const passed = '==== 3 passed in 0.1s ===='
    on('tool.call', () => ({ result: { stdout: passed, stderr: '', interrupted: false }, text: passed }))
    await $.session.start(START)
    await clock.advance(3000)
    await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
    await clock.advance(400)
    const strip = WIDE - MINI_SLOT
    await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/a.ts', agentId: 'a1' } as never)
    await clock.advance(10)
    const theirs = await band($)
    expect(theirs.has(READ_ICON, strip)).toBe(true)
    expect(theirs.has(READ_ICON, 0, strip)).toBe(false)
    await clock.advance(3000)
    await $.tool.call({ tool: 'Read', tool_use_id: 'r2', file_path: '/repo/b.ts' } as never)
    await clock.advance(10)
    const ours = await band($)
    expect(ours.has(READ_ICON, 0, strip)).toBe(true)
    expect(ours.has(READ_ICON, strip)).toBe(false)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'pytest -q', agentId: 'a1' } as never)
    await clock.advance(1000)
    expect(sounds(ran)).toContain('pass')
    expect((db.get('pixling') as { stats: { testsPassed: number } }).stats.testsPassed).toBe(1)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'rm -rf build', agentId: 'a1' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('alarm')
  })

  test('an interrupted turn takes its working minis away without a celebration', async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    await $.turn.start({ text: 'go', turnId: 't' })
    await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
    await clock.advance(500)
    await $.turn.complete({ answer: '', durationMs: 900, isAborted: true, turnId: 't', reason: 'aborted' })
    await clock.advance(100)
    const strip = WIDE - MINI_SLOT
    const going = await band($)
    expect(going.has(TONGUE, strip)).toBe(false)
    expect(going.text).not.toMatch(/High five|Nice work|Helper is back/)
    await clock.advance(700)
    expect((await band($)).has(miniTint('Explore'))).toBe(false)
  })
})

describe('model switches', () => {
  test('a warm cache dear to re-write is put to the person; a cheap, cold or SDK switch is not', async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    const asked = await $.classic.PreModelSwitch(SWITCH)
    expect(asked.permissionDecision).toBe('ask')
    expect(asked.permissionDecisionReason).toMatch(/\$0\.45/)
    for (const calm of [{ estimated_cache_write_usd: 0.12 }, { prompt_cache_warm: false }, { source: 'sdk' }] as const) {
      expect((await $.classic.PreModelSwitch({ ...SWITCH, ...calm })).permissionDecision).toBeUndefined()
    }
  })

  test("the person's own hook decides first", async ($, on) => {
    const { clock, beneath } = host(on)
    beneath.answer = { permissionDecision: 'allow' }
    await $.session.start(START)
    await clock.advance(3000)
    expect((await $.classic.PreModelSwitch(SWITCH)).permissionDecision).toBe('allow')
  })

  test('with the guard off, nobody is asked', { options: { cacheGuard: false } }, async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    expect((await $.classic.PreModelSwitch(SWITCH)).permissionDecision).toBeUndefined()
  })

  test('a -p run has nobody to ask', async ($, on) => {
    const { clock } = host(on)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false } as never)
    await clock.advance(3000)
    expect((await $.classic.PreModelSwitch(SWITCH)).permissionDecision).toBeUndefined()
  })

  // With Auto effort on the effort gate names the level and the vitals leave it off (effort-band.test.tsx): off, they name it.
  test('a switch names the cache lifetime: known, saved with its source, the countdown sure', { options: { autoEffort: false } }, async ($, on) => {
    const { clock, db } = host(on)
    const step = model(on)
    await $.session.start(START)
    await clock.advance(3000)
    await step($, 'claude-opus-5-5', 'high')
    await clock.advance(2500)
    expect((await band($)).text).toMatch(/cache ~4:5\d/)
    await $.classic.PostModelSwitch({ ...SWITCH, cache_ttl: '1h' })
    await clock.advance(1100)
    const after = await band($)
    expect(after.text).toMatch(/cache 59:\d\d/)
    expect(after.text).not.toMatch(/cache ~/)
    expect(after.text).toMatch(/Switched to sonnet 5\.5|sonnet 5\.5 now/)
    expect(after.text).toMatch(/sonnet 5\.5 · high/)
    const saved = db.get('cacheTtl') as { ttl: string; source: string; learnedAt: number }
    expect(saved).toMatchObject({ ttl: '1h', source: 'switch' })
    expect(Math.abs(saved.learnedAt - (NOON + 5500))).toBeLessThan(5000)
  })

  test('a lifetime pinned in /config still wins over the switch', { options: { cacheTtl: '5m' } }, async ($, on) => {
    const { clock } = host(on)
    const step = model(on)
    await $.session.start(START)
    await clock.advance(3000)
    await step($)
    await $.classic.PostModelSwitch({ ...SWITCH, cache_ttl: '1h' })
    await clock.advance(2500)
    const after = await band($)
    expect(after.text).toMatch(/cache 4:5\d/)
    expect(after.text).not.toMatch(/cache 59:/)
  })
})

describe('the stored TTL', () => {
  test("0.2's bare string is not trusted: the lifetime is assumed, learned again and saved dated", { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, db } = host(on, { pixling: DUCK, cacheTtl: '1h' })
    const step = model(on)
    await $.session.start(START)
    await clock.advance(3000)
    // Trusted, the stored hour would make these long hits say nothing new. Ten minutes apart:
    // the plugin re-reads the clock every tenth frame, a minute each under SLOW.
    await step($, 'claude-opus-5-5', undefined, 0, 60_000)
    await clock.advance(10 * MIN)
    await step($, 'claude-opus-5-5', undefined, 58_000, 2_000)
    expect(db.get('cacheTtl')).toBe('1h')
    await clock.advance(10 * MIN)
    await step($, 'claude-opus-5-5', undefined, 58_000, 2_000)
    const saved = db.get('cacheTtl') as { ttl: string; source: string; learnedAt: number }
    expect(saved).toMatchObject({ ttl: '1h', source: 'learned' })
    expect(Math.abs(saved.learnedAt - (NOON + 20 * MIN))).toBeLessThan(2 * MIN)
  })

  test('a full miss that overturns a stored hour is saved as five minutes', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, db } = host(on, { pixling: DUCK, cacheTtl: { ttl: '1h', learnedAt: NOON - DAY, source: 'learned' } })
    const step = model(on)
    await $.session.start(START)
    await clock.advance(3000)
    await step($, 'claude-opus-5-5', undefined, 0, 60_000)
    // Past the tenth frame, so the plugin has read the clock again (see above).
    await clock.advance(10 * MIN)
    await step($, 'claude-opus-5-5', undefined, 0, 60_000)
    expect(db.get('cacheTtl')).toMatchObject({ ttl: '5m', source: 'learned' })
  })

  test("a switch's lifetime is trusted for 30 days, a learned one for 14", async ($, on) => {
    const { clock } = host(on, { pixling: DUCK, cacheTtl: { ttl: '1h', learnedAt: NOON - 20 * DAY, source: 'switch' } })
    const step = model(on)
    await $.session.start(START)
    await clock.advance(3000)
    await step($)
    await clock.advance(2500)
    expect((await band($)).text).toMatch(/cache 59:5\d/)
  })

  test('a learned lifetime older than 14 days is assumed again', async ($, on) => {
    const { clock } = host(on, { pixling: DUCK, cacheTtl: { ttl: '1h', learnedAt: NOON - 20 * DAY, source: 'learned' } })
    const step = model(on)
    await $.session.start(START)
    await clock.advance(3000)
    await step($)
    await clock.advance(2500)
    expect((await band($)).text).toMatch(/cache ~4:5\d/)
  })
})

describe('the vitals', () => {
  // With Auto effort on the effort gate names the level and the vitals leave it off (effort-band.test.tsx): off, they name it.
  test('they name the model and effort, and what the last turn took from the limits', { options: { autoEffort: false } }, async ($, on) => {
    const { clock, limits } = host(on)
    const step = model(on)
    limits.windows = [{ kind: 'five_hour', percentUsed: 40 }]
    await $.session.start(START)
    await clock.advance(3000)
    await $.turn.start({ text: 'go', turnId: 't' })
    await step($, 'claude-opus-5-5[1m]', 'xhigh')
    limits.windows = [{ kind: 'five_hour', percentUsed: 43.2 }]
    await $.turn.complete({ answer: 'done', durationMs: 2000, isAborted: false, turnId: 't', reason: 'answer' })
    await clock.advance(1100)
    const row = (await band($)).text
    expect(row).toMatch(/opus 5\.5 · xhigh/)
    expect(row).toMatch(/turn \+3%/)
  })

  test('without a model request or rate limits the row has no such pieces', async ($, on) => {
    const { clock } = host(on)
    await $.session.start(START)
    await clock.advance(3000)
    await $.turn.start({ text: 'go', turnId: 't' })
    await $.turn.complete({ answer: 'done', durationMs: 2000, isAborted: false, turnId: 't', reason: 'answer' })
    await clock.advance(1100)
    const row = (await band($)).text
    expect(row).not.toMatch(/turn \+/)
    expect(row).not.toMatch(/opus|sonnet|haiku/)
  })
})

describe('what the room reads', () => {
  test('the squad, plan mode and the last effect are published as they change', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on)
    const published: { key: string; value: unknown }[] = []
    on('state.set', ($, e, next) => {
      const w = e as unknown as { plugin: string; key: string; value?: unknown }
      if (w.plugin === 'pixlings' && ['squad', 'isPlanning', 'effect'].includes(w.key)) {
        published.push({ key: w.key, value: JSON.parse(JSON.stringify(w.value ?? null)) })
      }
      return next(e)
    })
    const last = (key: string): unknown => published.filter(w => w.key === key).at(-1)?.value
    on('prompt.attachment', ($, e) => ({ text: e.text }))
    await $.session.start(START)
    await clock.advance(3000)
    await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
    expect(last('squad')).toEqual([{ agentId: 'a1', label: 'Explore', speciesId: 'duck', startedAt: expect.any(Number), doneAt: null }])
    await $.prompt.attachment(attachment('plan_mode'))
    expect(last('isPlanning')).toBe(true)
    expect(last('effect')).toEqual({ kind: 'thinkingCap', at: expect.any(Number) })
    await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'a1', agent_transcript_path: '', agent_type: 'Explore' })
    expect((last('squad') as { doneAt: unknown }[])[0]?.doneAt).toEqual(expect.any(Number))
    expect(last('effect')).toEqual({ kind: 'highFive', at: expect.any(Number) })
    await $.session.measure(measure(90))
    expect(last('effect')).toEqual({ kind: 'sweat', at: expect.any(Number) })
    await clock.advance(3100)
    expect(last('squad')).toEqual([])
    await $.prompt.attachment(attachment('plan_mode_exit'))
    expect(last('isPlanning')).toBe(false)
    expect(last('effect')).toEqual({ kind: 'capOff', at: expect.any(Number) })
  })
})

// The drawing: nothing the reactions add leaves the canvas or changes the band's height.

const MOODS: Mood[] = ['idle', 'working', 'happy', 'celebrate', 'sad', 'alarmed', 'attention', 'sleep', 'love', 'dizzy', 'walk', 'unimpressed']
const HATS: (Hat | null)[] = [null, 'sprout', 'shroom', 'party', 'crown', 'halo', 'wizard']
const count = (f: Pixels, color: number): number => f.px.filter(c => c === color).length
const CAP_BLUE = 0x4dc3ff
/** Moods whose hearts, stars or sparkles may cross the cap. */
const OVER_HEAD: readonly Mood[] = ['love', 'dizzy', 'celebrate']

/** How far (in pixels, diagonals counting one) the nearest opaque pixel of the art is. */
const reach = (s: Species, x: number, y: number): number => {
  let best = Infinity
  s.art.forEach((row, ay) => {
    for (let ax = 0; ax < row.length; ax++) if (row[ax] !== '.') best = Math.min(best, Math.max(Math.abs(ax - x), Math.abs(ay - y)))
  })
  return best
}

describe('the drawing stays on the canvas', () => {
  test('the thinking cap is drawn whole on every species, hat and mood, and never grows the band', { timeoutMs: LONG }, () => {
    // The cap's red is no species' color: every red pixel is the dome's.
    for (const s of SPECIES) expect([...Object.values(s.palette), ...Object.values(s.shiny)]).not.toContain(CAP_RED)
    const problems: string[] = []
    for (const s of SPECIES) {
      for (const isFlipped of [false, true]) {
        for (const hat of HATS) {
          for (const mood of MOODS) {
            for (const t of [0, 140, 333, 700, 2900]) {
              const f = renderFrame({ species: s, isShiny: false, mood, t, hat, isFlipped, hasCap: true })
              const where = `${s.id} ${mood} ${hat ?? 'bare'}${isFlipped ? ' flipped' : ''} t=${t}`
              if (f.h !== layoutFor(s, hat).h) problems.push(`${where}: height ${f.h}`)
              // The dome's bottom is the cap's fourth row: at row 3 or below, the propeller is on.
              let bottom = -1
              f.px.forEach((c, i) => {
                if (c === CAP_RED) bottom = Math.max(bottom, Math.floor(i / f.w))
              })
              if (bottom < 3) problems.push(`${where}: cut off at the top (dome bottom at row ${bottom})`)
              // The red and blue halves, six pixels each, unless something flies across them.
              if (!OVER_HEAD.includes(mood) && (count(f, CAP_RED) !== 6 || count(f, CAP_BLUE) !== 6)) problems.push(`${where}: dome not whole`)
            }
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([])
  })

  test('the bead of sweat is drawn whole, against the body, beside the far eye', () => {
    const problems: string[] = []
    for (const real of SPECIES) {
      for (const isFlipped of [false, true]) {
        const art = isFlipped ? mirror(real) : real
        const { y } = layoutFor(real, null)
        // Unimpressed past its eye roll holds still, so the body sits where the layout puts it.
        for (const t of [2400, 2900, 3400, 3900]) {
          const dry = renderFrame({ species: real, isShiny: false, mood: 'unimpressed', t, isFlipped })
          const wet = renderFrame({ species: real, isShiny: false, mood: 'unimpressed', t, isFlipped, isSweating: true })
          let drawn = 0
          for (let i = 0; i < wet.px.length; i++) {
            if (wet.px[i] === dry.px[i]) continue
            drawn++
            const px = (i % wet.w) - SPRITE_X
            const py = Math.floor(i / wet.w) - y
            // On the body or right against it: a drop down the side of the head, never in the air.
            if (reach(art, px, py) > 1) problems.push(`${real.id}${isFlipped ? ' flipped' : ''} t=${t}: bead in the air at ${px},${py}`)
            if (px < art.eyes.at(-1)![0]) problems.push(`${real.id}${isFlipped ? ' flipped' : ''} t=${t}: bead left of the far eye`)
          }
          if (drawn !== 5) problems.push(`${real.id}${isFlipped ? ' flipped' : ''} t=${t}: ${drawn} bead pixels`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  test('minis working, carrying a tool, arriving, celebrating and leaving stay inside the band', () => {
    const duck = SPECIES.find(s => s.id === 'duck')!
    const states: Omit<MiniView, 'tint'>[] = [
      ...[0, 75, 150, 225, 300, 700, 1300].map(t => ({ t, doneT: null, icon: 'test' as const })),
      ...[0, 70, 140, 210, 280, 420, 600, 2400, 2550, 2700, 2900].map(doneT => ({ t: 5000, doneT })),
    ]
    const problems: string[] = []
    for (const state of states) {
      for (const hidden of [0, 7]) {
        const squad = Array.from({ length: 4 }, (_, i) => ({ ...state, tint: miniTint(i % 2 ? 'Explore' : 'Plan'), seed: i * 13 }))
        const strip = squadWidth(squad.length, hidden)
        // The same strip on the band's shortest canvas and on a taller one (a wizard's): cut off
        // at the top of the short one, the two would differ.
        const short = renderFrame({ species: duck, isShiny: false, mood: 'idle', t: 0, squad, hidden })
        const tall = renderFrame({ species: duck, isShiny: false, mood: 'idle', t: 0, hat: 'wizard', squad, hidden })
        if (short.w !== CANVAS_W + strip || short.h !== layoutFor(duck, null).h) problems.push(`${JSON.stringify(state)}: canvas ${short.w}×${short.h}`)
        const lift = tall.h - short.h
        for (let y = 0; y < tall.h; y++) {
          for (let x = CANVAS_W; x < tall.w; x++) {
            const high = tall.px[y * tall.w + x] ?? TRANSPARENT
            const low = y - lift >= 0 ? (short.px[(y - lift) * short.w + x] ?? TRANSPARENT) : TRANSPARENT
            if (high !== low) problems.push(`${JSON.stringify(state)} +${hidden}: cut at ${x},${y - lift}`)
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([])
  })

  test('a mini works in its color, jumps with its tongue out once done, then poofs to dust', () => {
    const tint = miniTint('Explore')
    const shows = (f: Pixels): boolean[] => [f.px.includes(tint), f.px.includes(TONGUE), f.px.includes(PUFF)]
    for (const t of [0, 150, 400, 1300]) expect(shows(renderMini({ tint, t, doneT: null }))).toEqual([true, false, false])
    for (let doneT = 0; doneT < MINI_POOF_MS; doneT += 150) expect(shows(renderMini({ tint, t: 5000, doneT }))).toEqual([true, true, false])
    for (let doneT = MINI_POOF_MS; doneT < MINI_LEAVE_MS; doneT += 100) expect(shows(renderMini({ tint, t: 5000, doneT }))).toEqual([false, false, true])
  })

  test('squished, it is shorter and wider under the press; springing back, it stays on the canvas', () => {
    const problems: string[] = []
    const bounds = (f: Pixels, color?: number) => {
      let top = f.h
      let bottom = -1
      let left = f.w
      let right = -1
      f.px.forEach((c, i) => {
        if (c === TRANSPARENT || c === PRESS || c === 0x9aa5bd || c === 0x5d6a80 || (color !== undefined && c !== color)) return
        const x = i % f.w
        const y = Math.floor(i / f.w)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
        left = Math.min(left, x)
        right = Math.max(right, x)
      })
      return { height: bottom - top + 1, width: right - left + 1, top }
    }
    for (const s of SPECIES) {
      for (const hat of HATS) {
        const rest = bounds(renderFrame({ species: s, isShiny: false, mood: 'working', t: 0, hat }))
        const pressed = renderFrame({ species: s, isShiny: false, mood: 'working', t: 0, hat, squishT: 0 })
        const squished = bounds(pressed)
        if (pressed.h !== layoutFor(s, hat).h) problems.push(`${s.id} ${hat}: height ${pressed.h}`)
        if (squished.height > rest.height * 0.75 || squished.width <= rest.width) problems.push(`${s.id} ${hat}: ${JSON.stringify(squished)} vs ${JSON.stringify(rest)}`)
        if (count(pressed, PRESS) < 18) problems.push(`${s.id} ${hat}: no press`)
        for (const reliefT of [0, 80, 200, 400]) {
          const spring = renderFrame({ species: s, isShiny: false, mood: 'happy', t: reliefT, hat, reliefT })
          if (spring.h !== layoutFor(s, hat).h) problems.push(`${s.id} ${hat} spring ${reliefT}: height ${spring.h}`)
          // The tallest stretch reaches the top row at most: the outline's darkest key is all there.
          if (bounds(spring).top < 0) problems.push(`${s.id} ${hat} spring ${reliefT}: off the top`)
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([])
  })
})
