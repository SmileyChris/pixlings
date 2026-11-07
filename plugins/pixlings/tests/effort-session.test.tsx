// Auto effort in a session: a prompt the person submits is judged by Haiku 5.5, and the main loop's requests carry the
// verdict's effort. What these tests read is what the engine beneath sees: the request's `effort` as it arrives at the
// bottom of `turn.step`, the `model.complete` calls, the toasts and the prompt box.

import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const USAGE = { input_tokens: 70, output_tokens: 22, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const COMPOSER = { kind: 'composer' } as const

type Engine = Parameters<TestBody>[0]
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Command = { name: string; description: string; source: string; plugin?: string }

type HostOptions = {
  /** What the judge answers, in turn; an Error is thrown, and `null` is a reply that is not an answer. */
  replies?: (Effort | Error | null)[]
  /** The model the session runs on. */
  model?: string
  /** The commands the app lists; an Error is thrown instead. */
  commands?: Command[] | Error
  /** The draft in the prompt box. */
  draft?: string
  /** Holds every store read until it settles, so a test can act while a session start is still reading its save. */
  holdStore?: Promise<void>
}

/** The engine beneath the pixling, recording what Auto does to it. */
const host = (on: On, o: HostOptions = {}) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  const db = new Map<string, unknown>()
  on('store.get', async ($, e) => {
    await o.holdStore
    return { value: db.get(e.key) } as never
  })
  /** Every key written to the store, in order. */
  const writes: string[] = []
  on('store.set', ($, e) => {
    writes.push(e.key)
    db.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  const asked: { model: string; prompt: string; timeoutMs?: number }[] = []
  const toasts: string[] = []
  const filled: string[] = []
  const reached: { effort: unknown; model: string; agentId?: string }[] = []
  const replies = [...(o.replies ?? [])]
  on('session.id', () => ({ value: 's1' }) as never)
  on('session.model', () => ({ value: o.model ?? 'claude-opus-5-5' }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('command.list', () => {
    if (o.commands instanceof Error) throw o.commands
    return { value: o.commands ?? [] } as never
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.read', ($, e) => ({ deny: `ENOENT: no such file or directory, open '${e.path}'` }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('model.complete', ($, e) => {
    asked.push(e)
    const next = replies.shift()
    if (next instanceof Error) throw next
    if (next === undefined || next === null) return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } } as never
    const text = `{"model":"opus","effort":"${next}","why":"judged ${next}","sure":0.9}`
    return { value: { isAnswered: true, text, usage: USAGE } } as never
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.read', () => ({ value: { text: o.draft ?? '', cursor: 0 } }) as never)
  on('command.run', { command: 'effort' }, ($, e) => {
    filled.push(`/effort ${e.args}`)
    return { text: '' } as never
  })
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('classic.StopFailure', () => ({}))
  on('classic.Notification', () => ({}))
  // The model step at the bottom: what reaches it is what the API would be asked.
  on('turn.step', async function* ($, e) {
    reached.push({ effort: e.effort, model: e.model, ...(e.agentId === undefined ? {} : { agentId: e.agentId }) })
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 20, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'test' },
    }
  })
  return { clock, asked, toasts, filled, reached, writes }
}

/** The person types a prompt (mid-turn when `turnId` is given). */
const say = async ($: Engine, text: string, extra: Record<string, unknown> = {}): Promise<void> => {
  await $.prompt.submit({ text, origin: COMPOSER, ...extra } as never)
}

/** One main-loop request, as the app made it (`effort` is the app's own setting). */
const step = async ($: Engine, model: string, effort: Effort | undefined, extra: Record<string, unknown> = {}): Promise<void> => {
  const stream = $.turn.step({ turnId: 't', index: 0, model, effort, messageCount: 3, ...extra } as never)
  for await (const _ of stream) {
    // drain
  }
  await stream.result
}

/** Effortless's own command, as the app lists it while Effortless is installed. */
const EFFORTLESS: Command = { name: 'effortless', description: 'effortless: settings, debug, handoff, setup, bench, auto, stats.', source: 'plugin', plugin: 'effortless' }

const endTurn = async ($: Engine): Promise<void> => {
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer' })
}

describe('Auto effort in a session', () => {
  test('a typed prompt is judged and its requests carry the verdict', async ($, on) => {
    const { asked, reached, toasts } = host(on, { replies: ['high'] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    expect(asked).toHaveLength(1)
    expect(asked[0]!.model).toBe('claude-haiku-5-5')
    expect(asked[0]!.timeoutMs).toBe(6000)
    expect(asked[0]!.prompt).toContain('refactor the auth module')
    await step($, 'claude-opus-5-5', 'medium')
    await step($, 'claude-opus-5-5', 'medium', { index: 1 })
    expect(reached.map(r => r.effort)).toEqual(['high', 'high'])
    expect(toasts).toEqual([])
  })

  test('a subagent runs at the turn’s level; a request with no effort of its own gains the verdict', async ($, on) => {
    const { reached } = host(on, { replies: ['xhigh'] })
    await $.session.start(START)
    await say($, 'rebuild the whole build pipeline')
    await step($, 'claude-opus-5-5', undefined)
    await step($, 'claude-sonnet-5-5', 'low', { agentId: 'sub-1', index: 1 })
    expect(reached.map(r => r.effort)).toEqual(['xhigh', 'xhigh'])
  })

  test('slash commands and non-cache-safe models are left alone', async ($, on) => {
    const { asked, reached } = host(on, { replies: ['max', 'max'], commands: [{ name: 'compact', description: 'Compact', source: 'builtin' }, { name: 'pixling', description: 'Your pixling', source: 'plugin', plugin: 'pixlings' }] })
    await $.session.start(START)
    await say($, '/compact')
    await say($, '/pixling room')
    expect(asked).toEqual([])
    await step($, 'claude-opus-5-5', 'medium')
    expect(reached.map(r => r.effort)).toEqual(['medium'])
  })

  test('a skill the person added is judged, and told what the skill is', async ($, on) => {
    const { asked, reached } = host(on, { replies: ['high'], commands: [{ name: 'review', description: 'Review a diff', source: 'plugin', plugin: 'tools' }] })
    await $.session.start(START)
    await say($, '/review the auth diff')
    expect(asked).toHaveLength(1)
    expect(asked[0]!.prompt).toContain('Review a diff')
    await step($, 'claude-opus-5-5', 'medium')
    expect(reached.map(r => r.effort)).toEqual(['high'])
  })

  test('a model where an effort change rewrites the cache is not judged, and its effort passes through', async ($, on) => {
    const { asked, reached } = host(on, { replies: ['max'], model: 'claude-fable-5-1' })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    expect(asked).toEqual([])
    await step($, 'claude-fable-5-1', 'high')
    expect(reached).toEqual([{ effort: 'high', model: 'claude-fable-5-1' }])
  })

  test('a prompt that is not the person’s is not judged', async ($, on) => {
    const { asked } = host(on, { replies: ['max'] })
    await $.session.start(START)
    await say($, 'a build finished', { origin: { kind: 'task-notification' } })
    expect(asked).toEqual([])
  })

  test('Haiku not answering sets medium, tells the person, and types nothing', async ($, on) => {
    const { asked, reached, toasts, filled } = host(on, { replies: [new Error('timed out')] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    expect(asked).toHaveLength(1)
    await step($, 'claude-opus-5-5', 'high')
    expect(reached.map(r => r.effort)).toEqual(['medium'])
    // Where to click to hand it back: the gate in the band, or the room's on a surface with no band.
    expect(toasts).toEqual(["Auto effort is off: Haiku didn't answer. Click A in the effort gate or in /pixling room to try again."])
    expect(filled).toEqual([])
  })

  test('a reply that is not an answer does the same', async ($, on) => {
    const { reached, toasts, filled } = host(on, { replies: [null] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'xhigh')
    expect(reached.map(r => r.effort)).toEqual(['medium'])
    expect(toasts).toHaveLength(1)
    expect(filled).toEqual([])
  })

  test('autoEffort off does nothing', { options: { autoEffort: false } }, async ($, on) => {
    const { asked, reached, toasts } = host(on, { replies: ['max'] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'medium')
    expect(asked).toEqual([])
    expect(reached.map(r => r.effort)).toEqual(['medium'])
    expect(toasts).toEqual([])
  })

  test('the floor and ceiling bound the verdict', { options: { effortCeiling: 'medium' } }, async ($, on) => {
    const { reached } = host(on, { replies: ['max'] })
    await $.session.start(START)
    await say($, 'rebuild the whole build pipeline')
    await step($, 'claude-opus-5-5', 'low')
    expect(reached.map(r => r.effort)).toEqual(['medium'])
  })

  test('a lower verdict for a message typed mid-turn waits for the turn to end', async ($, on) => {
    const { reached, asked } = host(on, { replies: ['high', 'low'] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'medium')
    await say($, 'also rename the helper file', { turnId: 't' })
    expect(asked).toHaveLength(2)
    await step($, 'claude-opus-5-5', 'medium', { index: 1 })
    await endTurn($)
    await step($, 'claude-opus-5-5', 'medium', { turnId: 't2', index: 0 })
    expect(reached.map(r => r.effort)).toEqual(['high', 'high', 'low'])
  })

  test('Haiku not answering a message typed mid-turn keeps the turn at its level till it ends, then medium', async ($, on) => {
    const { reached, toasts } = host(on, { replies: ['xhigh', null] })
    await $.session.start(START)
    await say($, 'rebuild the whole build pipeline')
    await step($, 'claude-opus-5-5', 'medium')
    await say($, 'also rename the helper file', { turnId: 't' })
    expect(toasts).toHaveLength(1)
    await step($, 'claude-opus-5-5', 'medium', { index: 1 })
    await step($, 'claude-opus-5-5', 'low', { agentId: 'sub-1', index: 2 })
    await endTurn($)
    await step($, 'claude-opus-5-5', 'medium', { turnId: 't2', index: 0 })
    expect(reached.map(r => r.effort)).toEqual(['xhigh', 'xhigh', 'xhigh', 'medium'])
  })

  test('a higher verdict for a message typed mid-turn applies at once', async ($, on) => {
    const { reached } = host(on, { replies: ['low', 'xhigh'] })
    await $.session.start(START)
    await say($, 'what is a monad')
    await step($, 'claude-opus-5-5', 'medium')
    await say($, 'actually rewrite the whole parser', { turnId: 't' })
    await step($, 'claude-opus-5-5', 'medium', { index: 1 })
    expect(reached.map(r => r.effort)).toEqual(['low', 'xhigh'])
  })

  test('the person changing effort in the app turns Auto off and their level goes out', async ($, on) => {
    const { reached, toasts, asked } = host(on, { replies: ['high', 'max'] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'medium')
    // The app's own effort moves: a change the person made there.
    await step($, 'claude-opus-5-5', 'low', { index: 1 })
    expect(reached.map(r => r.effort)).toEqual(['high', 'low'])
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toContain('Auto effort is off')
    await say($, 'now rebuild the whole thing')
    expect(asked).toHaveLength(1)
  })

  test('with Effortless installed Auto stands down: no judging, no steering, nothing stored, and one toast', async ($, on) => {
    const { asked, reached, toasts, writes } = host(on, { replies: ['max'], commands: [EFFORTLESS] })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    expect(asked).toEqual([])
    // Effortless steers from outside Pixlings: its levels reach Pixlings' requests as the app's, and are not the person's.
    await step($, 'claude-opus-5-5', 'high')
    await step($, 'claude-opus-5-5', 'low', { index: 1 })
    await say($, 'now rebuild the whole thing')
    expect(asked).toEqual([])
    expect(reached.map(r => r.effort)).toEqual(['high', 'low'])
    expect(writes.filter(key => key === 'effortAuto' || key === 'effortPick')).toEqual([])
    expect(toasts).toEqual(["Pixlings' Auto effort is paused while Effortless is installed. Uninstall Effortless to use it here."])
  })

  test('a command list that cannot be read is no Effortless', async ($, on) => {
    const { asked, reached } = host(on, { replies: ['high'], commands: new Error('no list') })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'medium')
    expect(asked).toHaveLength(1)
    expect(reached.map(r => r.effort)).toEqual(['high'])
  })

  test('a hook reload in a session Haiku failed in keeps Auto off at medium, whatever the store says', async ($, on) => {
    const { asked, reached } = host(on, { replies: ['max'] })
    // The engine's state outlives the module's reload; the store (mock, empty) still says Auto is on.
    const kept = new Map<string, unknown>([
      ['pixlings/effortAuto', false],
      ['pixlings/effortPick', { effort: 'medium', why: "Haiku didn't answer", by: 'manual' }],
    ])
    on('state.get', ($, e) => ({ value: { value: kept.get(`${e.plugin}/${e.key}`), version: 1 } }) as never)
    on('state.set', ($, e) => {
      kept.set(`${e.plugin}/${e.key}`, e.value)
      return { value: { isSet: true, version: 2 } } as never
    })
    await $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'high')
    expect(asked).toEqual([])
    expect(reached.map(r => r.effort)).toEqual(['medium'])
  })

  test('a prompt and a request that arrive while the saved state is still being read pass through untouched', async ($, on) => {
    let release: () => void = () => undefined
    const { asked, reached } = host(on, { replies: ['max'], holdStore: new Promise<void>(resolve => (release = resolve)) })
    // A reload: the engine's state remembers that Haiku failed (Auto off, medium), the store still says Auto is on.
    const kept = new Map<string, unknown>([
      ['pixlings/effortAuto', false],
      ['pixlings/effortPick', { effort: 'medium', why: "Haiku didn't answer", by: 'manual' }],
    ])
    on('state.get', ($, e) => ({ value: { value: kept.get(`${e.plugin}/${e.key}`), version: 1 } }) as never)
    on('state.set', ($, e) => {
      kept.set(`${e.plugin}/${e.key}`, e.value)
      return { value: { isSet: true, version: 2 } } as never
    })
    // The session start is not awaited, as a reload's is, and its store reads are held open.
    const starting = $.session.start(START)
    await say($, 'refactor the auth module')
    await step($, 'claude-opus-5-5', 'high')
    expect(asked).toEqual([])
    expect(reached.map(r => r.effort)).toEqual(['high'])
    release()
    await starting
    await say($, 'rebuild the whole build pipeline')
    await step($, 'claude-opus-5-5', 'high', { index: 1 })
    expect(asked).toEqual([])
    expect(reached.map(r => r.effort)).toEqual(['high', 'medium'])
  })
})
