import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'
import { wavPipeArgv, windowsPlayer, windowsSpeech, windowsToast, writeBytesArgv } from '../hooks/lib/platform.ts'
import { emptyDay, hatchPixling, isUnreadable, mergeSave, rehatch, revive } from '../hooks/lib/progress.ts'
import type { Pixling } from '../hooks/lib/progress.ts'

const NOON = Date.parse('2026-10-03T12:00:00Z')
const MIN = 60_000

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
  viewport: { columns: 110, rows: 40 },
} as const

/**
 * Stretches the 100 ms frame clock to a minute, so a test can sleep through hours of nap. An
 * inline plugin loads on its own: it sees nothing of this file but its own body.
 */
const SLOW = {
  name: 'slow-frames',
  register: (on: On) => {
    on('clock.every', ($, e, next) => next({ ...e, ms: Math.max(e.ms, 60_000) }))
  },
}

/** The same for a test that sleeps through days: a frame every half hour. */
const SLOWER = {
  name: 'slower-frames',
  register: (on: On) => {
    on('clock.every', ($, e, next) => next({ ...e, ms: Math.max(e.ms, 1_800_000) }))
  },
}

/** Tests that jump hours or days of clock: ~1 s alone, but slower when other suites share the CPU. */
const LONG = 20_000

type Ran = { argv: readonly string[]; init?: { stdin?: string; env?: Record<string, string> } }

/** The engine beneath the pixling: a store the test can read, a session id it can change. */
const host = (on: On, stored?: unknown, now = NOON) => {
  const clock = mock.clock(on, { now })
  const db = new Map<string, unknown>()
  if (stored !== undefined) db.set('pixling', stored)
  on('store.get', ($, e) => ({ value: db.get(e.key) }) as never)
  on('store.set', ($, e) => {
    db.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  const session = { id: 's1' }
  on('session.id', () => ({ value: session.id }) as never)
  const ran: Ran[] = []
  const submitted: string[] = []
  const toasts: string[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv, init: e.init })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    // The plugin's own $.prompt.submit and the test's direct call both arrive as the event.
    return { text: e.text }
  })
  return { clock, db, ran, submitted, toasts, session }
}

/** The rate-limit windows `$.session.usage()` reports; the test moves them. */
const usage = (on: On, windows: { kind: string; percentUsed: number; resetsAt?: string }[]) => {
  const state = { windows }
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: state.windows } }) as never)
  on('classic.StopFailure', () => ({}))
  on('classic.Notification', () => ({}))
  return state
}

const fullUntil = (at: number) => [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(at).toISOString() }]

type Engine = Parameters<TestBody>[0]

const model = (on: On) => {
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'tool_use' as const,
      usage: { input_tokens: 20, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 64_000, model: 'test' },
    }
  })
  return async ($: Engine): Promise<void> => {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'test', messageCount: 3 })
    for await (const _ of stream) {
      // Drain the chunks; the result is what the pixling reads.
    }
    await stream.result
  }
}

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

const sounds = (ran: Ran[]): string[] =>
  ran.flatMap(r => {
    const m = r.argv.join(' ').match(/sounds\\([\w-]+)\.wav/)
    return m ? [m[1] ?? ''] : []
  })

const continues = (submitted: string[]): string[] => submitted.filter(t => /continue the task/.test(t))

const spoken = (ran: Ran[]): Ran[] => ran.filter(r => r.argv.join(' ').includes('SpeechSynthesizer'))

const answering = (on: On, answer: string, asked: string[] = []) => {
  on('tool.call', ($, e) => {
    const input = e as unknown as { questions?: { question: string }[] }
    for (const q of input.questions ?? []) asked.push(q.question)
    const answers = Object.fromEntries((input.questions ?? []).map(q => [q.question, answer]))
    return { result: { questions: input.questions ?? [], answers }, text: 'answered' } as never
  })
  return asked
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const hhmm = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('the nap', () => {
  test('a /clear during the nap cancels the auto-continue', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, DUCK)
    const resetsAt = NOON + 5 * MIN
    usage(on, fullUntil(resetsAt))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(10)
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
  })

  test('a nap never continues into another conversation than the one it fell asleep in', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted, session } = host(on, DUCK)
    const resetsAt = NOON + 5 * MIN
    usage(on, fullUntil(resetsAt))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(10)
    // A resume took the process to another conversation without a session.end reaching us.
    session.id = 's2'
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
  })

  test('the same conversation is still continued at the reset', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, DUCK)
    const resetsAt = NOON + 5 * MIN
    usage(on, fullUntil(resetsAt))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted).length).toBe(1)
  })

  test('a weekly limit days away names the day, and the reset is announced, not continued', { plugins: [SLOWER], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted, ran } = host(on, DUCK)
    const resetsAt = Date.parse('2026-10-06T14:00:00Z')
    usage(on, [{ kind: 'seven_day', percentUsed: 100, resetsAt: new Date(resetsAt).toISOString() }])
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(10)
    const when = `${WEEKDAY[new Date(resetsAt).getDay()]} ${hhmm(resetsAt)}`
    expect(await ui.find({ type: 'Text', text: `back at ${when}` })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /carries on/ })).toBeUndefined()
    await ui.unmount()
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
    expect(ran.some(r => r.argv.join(' ').includes('Your usage limit has reset'))).toBe(true)
  })

  test('a prompt from Remote Control is the person: it cancels the auto-continue', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, DUCK)
    const resetsAt = NOON + 5 * MIN
    usage(on, fullUntil(resetsAt))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.set(resetsAt + 5_000)
    await $.prompt.submit({ text: 'ok, now do the other thing', wait: false, origin: { kind: 'bridge' } } as never)
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(submitted).toEqual(['ok, now do the other thing'])
  })

  test('a background task notification is not the person: the auto-continue stands', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, DUCK)
    const resetsAt = NOON + 5 * MIN
    usage(on, fullUntil(resetsAt))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.set(resetsAt + 5_000)
    await $.prompt.submit({ text: 'task done', wait: false, origin: { kind: 'task-notification' } } as never)
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted).length).toBe(1)
  })

  test('still limited at the planned reset: it sleeps on to the new one instead of claiming a reset', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted, ran } = host(on, DUCK)
    const first = NOON + 5 * MIN
    const later = NOON + 9 * MIN
    const limits = usage(on, fullUntil(first))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    limits.windows = fullUntil(later)
    await clock.set(first + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
    expect(sounds(ran)).not.toContain('wake')
    await clock.set(later + 30_000)
    await clock.settle()
    expect(continues(submitted).length).toBe(1)
    expect(sounds(ran)).toContain('wake')
  })

  test('a nap a second limit stretched past six hours announces the reset instead of continuing', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted, ran } = host(on, DUCK)
    const first = NOON + 5 * 60 * MIN
    const second = first + 2 * 60 * MIN
    const limits = usage(on, fullUntil(first))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    limits.windows = fullUntil(second)
    await clock.set(first + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
    await clock.set(second + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
    expect(ran.some(r => r.argv.join(' ').includes('Your usage limit has reset'))).toBe(true)
  })

  test('with no reset time to read, retries are quiet, worded as a retry, and stop after three', { options: { sound: 'important', band: 'minimal' }, plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted, ran } = host(on, DUCK)
    usage(on, [])
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(20 * MIN + 1000)
    expect(await ui.find({ type: 'Text', text: /trying again/i })).toBeDefined()
    // Not the certain wake: none of its lines.
    expect(await ui.find({ type: 'Text', text: /I'm up|Limit reset!|Rise and shine/ })).toBeUndefined()
    await ui.unmount()
    for (let i = 0; i < 6; i++) {
      // Each continue prompt runs into the limit again.
      if (continues(submitted).length > i) await $.classic.StopFailure({ error: 'rate_limit' })
      await clock.advance(90 * MIN)
    }
    expect(continues(submitted).length).toBe(3)
    expect(sounds(ran).filter(s => s === 'sleep').length).toBe(1)
    expect(sounds(ran)).not.toContain('wake')
  })
})

describe('the cache warning', () => {
  test('vitals off does not silence it', { options: { vitals: false } }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const step = model(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    await step($)
    await clock.advance(250_000)
    expect(sounds(ran)).toContain('clock')
  })

  test('with the band off it waits out a running turn, then warns', { options: { band: 'off' } }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const step = model(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    await $.turn.start({ text: 'go', turnId: 't' })
    await step($)
    // A long tool run inside the turn: no model request for 4m10s.
    await clock.advance(250_000)
    expect(sounds(ran)).not.toContain('clock')
    await $.turn.complete({ answer: 'done', durationMs: 253_000, isAborted: false, turnId: 't', reason: 'answer' })
    await clock.advance(2000)
    expect(sounds(ran)).toContain('clock')
  })
})

describe('the save', () => {
  test("two sessions: a save folds this session's changes into the other's", async ($, on) => {
    const { clock, db } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const mine = db.get('pixling') as { xp: number }
    // Meanwhile another terminal renamed it, levelled it up and saved.
    db.set('pixling', { ...mine, name: 'Ember', xp: 5000, dex: ['duck', 'dragon'] })
    await $.command.run({ command: 'pixling', args: 'pet' } as never)
    await clock.advance(1000)
    const now = db.get('pixling') as { name: string; xp: number; dex: string[]; stats: { pets: number } }
    expect(now.name).toBe('Ember')
    expect(now.xp).toBe(5001)
    expect(now.stats.pets).toBe(1)
    expect(now.dex).toEqual(['duck', 'dragon'])
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect(card.text).toContain('Ember')
  })

  test('another session hatched a new egg: the later hatch wins, the badges stay', async ($, on) => {
    const { clock, db } = host(on, { ...DUCK, badges: { hello: 1, exterminator: 5 } })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    db.set('pixling', { ...DUCK, species: 'cat', name: 'Miso', hatchedAt: NOON, xp: 0, dex: ['duck', 'cat'], badges: { hello: 1 } })
    await $.command.run({ command: 'pixling', args: 'pet' } as never)
    await clock.advance(1000)
    const now = db.get('pixling') as { species: string; name: string; badges: Record<string, number> }
    expect(now.species).toBe('cat')
    expect(now.name).toBe('Miso')
    expect(now.badges['exterminator']).toBe(5)
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect(card.text).toContain('Miso the')
  })

  test('a save it cannot read is backed up and never overwritten', async ($, on) => {
    const future = { v: 2, species: 'phoenix', name: 'Blaze', xp: 9999, stats: { turns: 400 } }
    const { clock, db, toasts, ran } = host(on, future)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(6000)
    await $.command.run({ command: 'pixling', args: 'pet' } as never)
    await clock.advance(1000)
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: {} } as never)
    expect(db.get('pixling')).toEqual(future)
    expect(db.get('pixlingBackup')).toEqual(future)
    expect(toasts.some(t => /save/i.test(t))).toBe(true)
    // A stand-in, not a celebrated new egg.
    expect(sounds(ran).some(s => s.startsWith('hatch-'))).toBe(false)
  })

  test('a save another version writes mid-session is not written over either', async ($, on) => {
    const { clock, db } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const future = { v: 2, species: 'phoenix', name: 'Blaze', xp: 9999 }
    db.set('pixling', future)
    await $.command.run({ command: 'pixling', args: 'pet' } as never)
    await clock.advance(1000)
    await $.command.run({ command: 'pixling', args: 'name Pip' } as never)
    await clock.advance(1000)
    expect(db.get('pixling')).toEqual(future)
    expect(db.get('pixlingBackup')).toEqual(future)
  })

  test('re-hatching keeps the badges, the streak and the tics', async ($, on) => {
    const stored = {
      ...DUCK,
      xp: 5000,
      badges: { hello: 1, exterminator: 2 },
      streak: { last: '2026-10-02', days: 4, best: 9 },
      tics: { absolutelyRight: 7 },
    }
    const { clock, db } = host(on, stored)
    const asked = answering(on, 'Hatch a new egg')
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'hatch' } as never)
    expect(out.text).toContain('A new egg is hatching')
    await clock.advance(6000)
    const now = db.get('pixling') as { xp: number; hatchedAt: number; badges: Record<string, number>; streak: { best: number }; tics: Record<string, number> }
    expect(now.hatchedAt).not.toBe(DUCK.hatchedAt)
    expect(now.badges['exterminator']).toBe(2)
    expect(now.streak.best).toBe(9)
    expect(now.tics['absolutelyRight']).toBe(7)
    expect(asked[0]).toMatch(/badges/)
  })

  test('free text typed into the release dialog does not release the pixling', async ($, on) => {
    const { clock, db } = host(on, { ...DUCK, xp: 5000 })
    answering(on, 'no, keep him')
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'hatch' } as never)
    await clock.advance(1000)
    expect(out.text).not.toContain('A new egg is hatching')
    expect((db.get('pixling') as { xp: number }).xp).toBeGreaterThanOrEqual(5000)
  })
})

describe('a -p or SDK run', () => {
  test('stays quiet but keeps the stats', async ($, on) => {
    const { clock, ran, db, toasts } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false } as never)
    await clock.advance(3000)
    await $.turn.complete({ answer: 'done', durationMs: 90_000, isAborted: false, turnId: 't', reason: 'answer' })
    await clock.advance(3000)
    expect(ran).toEqual([])
    expect(toasts).toEqual([])
    const now = db.get('pixling') as { stats: { sessions: number; turns: number } }
    expect(now.stats.sessions).toBe(1)
    expect(now.stats.turns).toBe(1)
  })

  test('a nap in a run nobody watches never continues on its own', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, DUCK)
    const resetsAt = NOON + 5 * MIN
    usage(on, fullUntil(resetsAt))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false } as never)
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
  })

  test('does not hatch the first egg where nobody can see it', async ($, on) => {
    const { clock, ran, db } = host(on)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false } as never)
    await clock.advance(6000)
    expect(sounds(ran).some(s => s.startsWith('hatch-'))).toBe(false)
    expect(db.get('pixling')).toBeUndefined()
  })
})

describe('the day', () => {
  test('a session running past midnight shows yesterday’s recap on the first turn after it', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const late = new Date(2026, 9, 3, 23, 50).getTime()
    const { clock } = host(on, DUCK, late)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(5 * MIN)
    await $.turn.complete({ answer: 'one', durationMs: 2000, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(15 * MIN)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.turn.complete({ answer: 'two', durationMs: 2000, isAborted: false, turnId: 't2', reason: 'answer' })
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /Yesterday: 1 turn/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('one line, two things', () => {
  test('a line that commits and then fails its tests counts the commit and the red run', async ($, on) => {
    const { clock, db } = host(on, DUCK)
    usage(on, [])
    const out = '[main 1a2b3c4] Add x\n==== 2 failed, 10 passed in 0.5s ===='
    on('tool.call', () => ({
      isError: true,
      result: { stdout: out, stderr: '', interrupted: false, gitOperation: { commit: { sha: '1a2b3c4' } } },
      text: out,
    }) as never)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const stored = db.get('pixling') as { stats: { commits?: number; testsFailed?: number } }
    const commits = stored.stats.commits ?? 0
    const red = stored.stats.testsFailed ?? 0
    await $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'git commit -am "Add x" && npm test' } as never)
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: {} } as never)
    const after = db.get('pixling') as { stats: { commits?: number; testsFailed?: number } }
    expect(after.stats.commits).toBe(commits + 1)
    expect(after.stats.testsFailed).toBe(red + 1)
  })
})

describe('sound and speech', () => {
  test('with sound on important, speech reads only the important lines', { options: { sound: 'important', voice: 'speech' } }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    usage(on, [])
    on('tool.call', () => ({
      result: { stdout: '[main 1a2b3c4] Add x', stderr: '', interrupted: false, gitOperation: { commit: { sha: '1a2b3c4' } } },
      text: '[main 1a2b3c4] Add x',
    }) as never)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'git commit -m "Add x"' } as never)
    await clock.advance(2000)
    expect(spoken(ran)).toEqual([])
    await clock.advance(5000)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await clock.advance(2000)
    expect(spoken(ran).length).toBe(1)
  })

  test('PowerShell reads speech as UTF-8, and no argv asks to bypass the execution policy', () => {
    expect(windowsSpeech().at(-1)).toContain('[Console]::InputEncoding = [Text.Encoding]::UTF8')
    const script = windowsSpeech().at(-1) ?? ''
    expect(script.indexOf('InputEncoding')).toBeLessThan(script.indexOf('[Console]::In.ReadToEnd()'))
    for (const argv of [windowsSpeech(), windowsPlayer('C:\\a.wav'), windowsToast('t', 'b'), writeBytesArgv('windows'), wavPipeArgv('windows') ?? []]) {
      expect(argv).not.toContain('-ExecutionPolicy')
      expect(argv).not.toContain('Bypass')
      expect(argv[0]).toBe('powershell.exe')
    }
  })
})

describe('the band', () => {
  test('a band with fewer rows than the sprite draws one line instead', async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const cramped = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 3 }, surface: 'terminal' })
    expect(await cramped.find({ type: 'Raster' })).toBeUndefined()
    expect(await cramped.find({ type: 'Text', text: 'Quackers' })).toBeDefined()
    await cramped.unmount()
    const roomy = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await roomy.find({ type: 'Raster' })).toBeDefined()
    await roomy.unmount()
  })
})

describe('merge on save', () => {
  const egg = (over: Partial<Pixling> = {}): Pixling => ({
    ...revive({ ...DUCK, day: { date: '2026-10-03', turns: 4, commits: 1, squashed: 0, tests: 2, xp: 30 } })!,
    ...over,
  })

  test('the same egg: counters add up, and what only one side changed is kept', () => {
    const base = egg({ tics: { robust: 2 }, badges: { hello: 10 }, streak: { last: '2026-10-03', days: 3, best: 5 } })
    // The other session: +100 xp, 2 commits, 7 turns, a rename, a badge and a tic.
    const stored: Pixling = {
      ...base,
      name: 'Ember',
      xp: base.xp + 100,
      stats: { ...base.stats, commits: 2, turns: 7 },
      badges: { ...base.badges, shipper: 50 },
      tics: { robust: 3 },
      day: { ...base.day, turns: 9, commits: 3 },
    }
    // This session: +5 xp, a pet, 3 turns, a hat, the same badge earned later, other tics.
    const ours: Pixling = {
      ...base,
      xp: base.xp + 5,
      hat: 'sprout',
      stats: { ...base.stats, pets: 1, turns: 3 },
      badges: { ...base.badges, shipper: 70 },
      tics: { robust: 4, delve: 1 },
      day: { ...base.day, turns: 7 },
    }
    const merged = mergeSave(stored, base, ours)
    expect(merged.xp).toBe(base.xp + 105)
    expect(merged.stats.commits).toBe(2)
    expect(merged.stats.pets).toBe(1)
    expect(merged.stats.turns).toBe(10)
    expect(merged.name).toBe('Ember')
    expect(merged.hat).toBe('sprout')
    expect(merged.badges).toEqual({ hello: 10, shipper: 50 })
    expect(merged.tics).toEqual({ robust: 5, delve: 1 })
    expect(merged.day).toEqual({ date: '2026-10-03', turns: 12, commits: 3, squashed: 0, tests: 2, xp: 30 })
  })

  test('a name changed on both sides is ours: the later save names it', () => {
    const base = egg()
    expect(mergeSave({ ...base, name: 'Ember' }, base, { ...base, name: 'Pip' }).name).toBe('Pip')
  })

  test('another egg: the later hatch wins whole, the person keeps badges, dex, streak and tics', () => {
    const base = egg({ tics: { robust: 1 }, streak: { last: '2026-10-02', days: 6, best: 6 } })
    const ours: Pixling = { ...base, xp: base.xp + 40, tics: { robust: 3 }, badges: { hello: 1, dangerous: 99 } }
    const newer: Pixling = {
      ...hatchPixling(() => 0.5, base.hatchedAt + 1000, ['cat']),
      tics: { robust: 1 },
      badges: { hello: 5 },
      streak: { last: '2026-10-03', days: 1, best: 2 },
    }
    const merged = mergeSave(newer, base, ours)
    expect(merged.hatchedAt).toBe(newer.hatchedAt)
    expect(merged.species).toBe(newer.species)
    expect(merged.xp).toBe(0)
    expect(merged.badges).toEqual({ hello: 1, dangerous: 99 })
    expect(merged.dex).toEqual([...new Set(['cat', newer.species, 'duck'])])
    expect(merged.streak).toEqual({ last: '2026-10-03', days: 1, best: 6 })
    expect(merged.tics).toEqual({ robust: 3 })
    // Our own re-hatch is the later one: it wins over the old egg in the store.
    const mine = rehatch(ours, () => 0.5, base.hatchedAt + 2000)
    expect(mergeSave(base, base, mine).hatchedAt).toBe(mine.hatchedAt)
  })

  test('a day rolled over on one side keeps the newer day whole', () => {
    const base = egg()
    const tomorrow = { ...emptyDay('2026-10-04'), turns: 2 }
    expect(mergeSave(base, base, { ...base, day: tomorrow }).day).toEqual(tomorrow)
    expect(mergeSave({ ...base, day: tomorrow }, base, { ...base, day: { ...base.day, turns: 9 } }).day).toEqual(tomorrow)
  })

  test('with no base yet, the store holding this very egg is not counted twice', () => {
    const stored = egg({ xp: 300, tics: { robust: 2 } })
    const ours: Pixling = { ...stored, xp: 320, stats: { ...stored.stats, pets: 2 }, tics: { robust: 3 } }
    const merged = mergeSave(stored, null, ours)
    expect(merged.xp).toBe(320)
    expect(merged.stats.pets).toBe(2)
    expect(merged.tics).toEqual({ robust: 3 })
  })

  test('counters never fall below zero', () => {
    const base = egg({ xp: 500 })
    expect(mergeSave({ ...base, xp: 10 }, base, { ...base, xp: 20 }).xp).toBe(0)
  })

  test('re-hatching keeps what is the person’s; an unreadable save is told apart from an empty one', () => {
    const p = egg({ badges: { hello: 1, exterminator: 3 }, streak: { last: '2026-10-03', days: 4, best: 8 }, tics: { delve: 2 }, dex: ['duck', 'owl'] })
    const next = rehatch(p, () => 0.99, NOON)
    expect(next.hatchedAt).toBe(NOON)
    expect(next.xp).toBe(0)
    expect(next.badges).toEqual(p.badges)
    expect(next.streak).toEqual(p.streak)
    expect(next.tics).toEqual(p.tics)
    expect(next.dex).toContain('owl')
    expect(isUnreadable(undefined)).toBe(false)
    expect(isUnreadable(null)).toBe(false)
    expect(isUnreadable(DUCK)).toBe(false)
    expect(isUnreadable({ ...DUCK, v: 2 })).toBe(true)
    expect(isUnreadable({ ...DUCK, species: 'phoenix' })).toBe(true)
    expect(isUnreadable('garbage')).toBe(true)
  })
})
