// Auto effort: the pure decisions (planPrompt, settle, readAutoConfig, readStoredPick) and the per-session controller,
// driven by plain fake deps and a fake clock, with no engine.

import { describe, expect } from 'claude-code/testing'

import type { PixlingsEffortPick, PixlingsEffortShift } from '../types'
import { AUTO_ON_BRAIN_MS, createAuto, planPrompt, readAutoConfig, readStoredPick, settle, SWITCHED_MS } from '../hooks/effort/auto.ts'
import type { AutoConfig, AutoDeps, PromptFacts } from '../hooks/effort/auto.ts'
import type { Verdict } from '../hooks/effort/haiku.ts'
import type { Effort, Pick } from '../hooks/effort/judge.ts'
import { test } from './kit.ts'

const CFG: AutoConfig = { isOn: true, floor: 'low', ceiling: 'max', bias: 0 }

const facts = (over: Partial<PromptFacts> = {}): PromptFacts => ({
  text: 'refactor the auth module',
  isPerson: true,
  isSlash: false,
  hasAttachments: false,
  modelId: 'claude-opus-5-5',
  context: '',
  midTurn: false,
  ...over,
})
const byHaiku = (effort: Effort): PixlingsEffortPick => ({ effort, why: 'judged', by: 'haiku' })

describe('planPrompt', () => {
  test('skips what Auto never judges', () => {
    const current = byHaiku('medium')
    expect(planPrompt(facts({ isPerson: false }), true, current)).toEqual({ kind: 'skip' })
    expect(planPrompt(facts({ text: '/compact', isSlash: true }), true, current)).toEqual({ kind: 'skip' })
    expect(planPrompt(facts(), false, current)).toEqual({ kind: 'skip' })
    expect(planPrompt(facts({ modelId: 'claude-fable-5-1' }), true, current)).toEqual({ kind: 'skip' })
    expect(planPrompt(facts({ modelId: 'claude-haiku-5-5' }), true, current)).toEqual({ kind: 'skip' })
  })

  test('a bare follow-up keeps the Auto level', () => {
    expect(planPrompt(facts({ text: 'go' }), true, byHaiku('high'))).toEqual({ kind: 'keep' })
  })

  test('a follow-up with an attachment, or answering a question, is judged', () => {
    expect(planPrompt(facts({ text: 'go', hasAttachments: true }), true, byHaiku('high')).kind).toBe('judge')
    expect(planPrompt(facts({ text: 'go', context: 'assistant: Should I build the parser?' }), true, byHaiku('high')).kind).toBe('judge')
  })

  test('a follow-up after a manual pick is judged', () => {
    expect(planPrompt(facts({ text: 'go' }), true, { effort: 'low', why: 'your pick', by: 'manual' }).kind).toBe('judge')
  })

  test('a named level skips the judge', () => {
    expect(planPrompt(facts({ text: 'max effort please' }), true, byHaiku('low'))).toEqual({ kind: 'named', effort: 'max' })
  })

  test('the judge is told about a skill and a message typed mid-turn', () => {
    const skill = planPrompt(facts({ text: '/review the diff', isSlash: true, skill: { name: 'review', description: 'Review a diff' } }), true, null)
    expect(skill).toEqual({ kind: 'judge', question: '/review the diff\n\n[This is a slash command that runs a skill: Review a diff. Judge the work the skill will do.]' })
    const mid = planPrompt(facts({ text: 'also fix the docs', midTurn: true }), true, byHaiku('high'))
    expect(mid.kind).toBe('judge')
    if (mid.kind === 'judge') expect(mid.question).toContain('[Sent while the assistant was still working on the last task at high effort.')
  })

  test('the judge is told the message carries attachments', () => {
    const plan = planPrompt(facts({ text: 'fix this', hasAttachments: true, attachments: [{ type: 'image' }, { type: 'image' }] }), true, null)
    expect(plan).toEqual({ kind: 'judge', question: 'fix this\n\n[The message comes with 2 images to look at.]' })
  })
})

describe('settle', () => {
  test('the ceiling caps a verdict, and says it was your settings', () => {
    expect(settle({ effort: 'max', why: 'huge job', sure: 0.9 }, { ...CFG, ceiling: 'high' })).toEqual({ effort: 'high', why: 'your settings' })
  })

  test('the bias tips a close call', () => {
    expect(settle({ effort: 'high', why: 'tricky', sure: 0.5 }, { ...CFG, bias: -1 })).toEqual({ effort: 'medium', why: 'your settings' })
  })

  test('an untouched verdict keeps its reason', () => {
    expect(settle({ effort: 'high', why: 'tricky', sure: 0.9 }, CFG)).toEqual({ effort: 'high', why: 'tricky' })
  })
})

describe('readAutoConfig', () => {
  test('defaults', () => {
    expect(readAutoConfig({})).toEqual({ isOn: true, floor: 'low', ceiling: 'max', bias: 0 })
  })

  test('bad values read as defaults', () => {
    expect(readAutoConfig({ effortBias: '9', effortFloor: 'x' })).toEqual({ isOn: true, floor: 'low', ceiling: 'max', bias: 0 })
  })

  test('values as stored', () => {
    expect(readAutoConfig({ autoEffort: false, effortFloor: 'medium', effortCeiling: 'xhigh', effortBias: '-1' })).toEqual({
      isOn: false,
      floor: 'medium',
      ceiling: 'xhigh',
      bias: -1,
    })
  })
})

describe('readStoredPick', () => {
  test('bad stored pick reads as none', () => {
    expect(readStoredPick('banana')).toBeNull()
    expect(readStoredPick({ effort: 'huge' })).toBeNull()
    expect(readStoredPick(null)).toBeNull()
    expect(readStoredPick({ effort: 'high', why: 'x', by: 'jev' })).toBeNull()
  })

  test('a good pick reads as itself', () => {
    expect(readStoredPick({ effort: 'high', why: 'x', by: 'manual' })).toEqual({ effort: 'high', why: 'x', by: 'manual' })
  })
})

// --- the controller ---

type Answer = Verdict | null | Promise<Verdict | null>

type Fake = {
  deps: AutoDeps
  state: { pick?: PixlingsEffortPick; isAuto?: boolean; shift?: PixlingsEffortShift }
  stored: Map<string, unknown>
  sets: [string, unknown][]
  toasts: string[]
  typed: Effort[]
  asked: { prompt: string; current: Pick | null; context: string }[]
  /** What the judge answers, in turn; null (didn't answer) once they run out. */
  verdicts: Answer[]
  clock: { now: number }
  /** What the engine's state still holds across a hook reload; nothing at a first load. */
  kept: { pick?: PixlingsEffortPick; isAuto?: boolean; shift?: PixlingsEffortShift }
}

const fake = (opts: { cfg?: Partial<AutoConfig>; stored?: Map<string, unknown>; verdicts?: Answer[]; kept?: Fake['kept'] } = {}): Fake => {
  const f: Fake = {
    state: {},
    stored: opts.stored ?? new Map(),
    sets: [],
    toasts: [],
    typed: [],
    asked: [],
    verdicts: [...(opts.verdicts ?? [])],
    clock: { now: 1_000 },
    kept: opts.kept ?? {},
    deps: undefined as unknown as AutoDeps,
  }
  f.deps = {
    now: () => f.clock.now,
    setState: async p => {
      Object.assign(f.state, p)
    },
    store: {
      get: async k => f.stored.get(k),
      set: async (k, v) => {
        f.sets.push([k, v])
        f.stored.set(k, v)
      },
    },
    readState: async () => f.kept,
    toast: t => {
      f.toasts.push(t)
    },
    setAppEffort: async level => {
      f.typed.push(level)
    },
    ask: async (prompt, current, context) => {
      f.asked.push({ prompt, current, context })
      return (await f.verdicts.shift()) ?? null
    },
    cfg: { ...CFG, ...opts.cfg },
  }
  return f
}

/** A loaded controller whose pick is already `effort` by haiku, with nothing recorded yet. */
const withPick = async (f: Fake, effort: Effort) => {
  const auto = createAuto(f.deps)
  await auto.load()
  f.verdicts.unshift({ effort, why: 'judged' })
  await auto.onPrompt(facts())
  f.asked.length = 0
  f.sets.length = 0
  f.toasts.length = 0
  return auto
}

describe('createAuto', () => {
  test('verdict applies and shifts', async () => {
    const f = fake()
    const auto = await withPick(f, 'medium')
    f.verdicts.push({ effort: 'xhigh', why: 'big refactor' })
    f.clock.now = 5_000
    await auto.onPrompt(facts())
    expect(auto.view().pick).toEqual({ effort: 'xhigh', why: 'big refactor', by: 'haiku' })
    expect(auto.view().shift).toEqual({ from: 'medium', to: 'xhigh', until: 5_000 + 10_000 })
    expect(SWITCHED_MS).toBe(10_000)
    expect(f.state.pick).toEqual({ effort: 'xhigh', why: 'big refactor', by: 'haiku' })
    expect(f.state.shift).toEqual({ from: 'medium', to: 'xhigh', until: 15_000 })
    expect(f.stored.get('effortPick')).toEqual({ effort: 'xhigh', why: 'big refactor', by: 'haiku' })
  })

  test('the judge is asked with the current pick and the context', async () => {
    const f = fake({ verdicts: [{ effort: 'high', why: 'x' }] })
    const auto = createAuto(f.deps)
    await auto.load()
    await auto.onPrompt(facts({ text: 'refactor it', context: 'user: hi' }))
    expect(f.asked).toEqual([{ prompt: 'refactor it', current: { model: 'opus', effort: 'medium', why: '', by: 'manual' }, context: 'user: hi' }])
  })

  test('the settings bound a verdict', async () => {
    const capped = fake({ cfg: { ceiling: 'high' } })
    const a = await withPick(capped, 'medium')
    capped.verdicts.push({ effort: 'max', why: 'huge job', sure: 0.9 })
    await a.onPrompt(facts())
    expect(a.view().pick).toEqual({ effort: 'high', why: 'your settings', by: 'haiku' })

    const leaned = fake({ cfg: { bias: -1 } })
    const b = await withPick(leaned, 'low')
    leaned.verdicts.push({ effort: 'high', why: 'tricky', sure: 0.5 })
    await b.onPrompt(facts())
    expect(b.view().pick).toEqual({ effort: 'medium', why: 'your settings', by: 'haiku' })
  })

  test('named level skips the judge', async () => {
    const f = fake({ cfg: { ceiling: 'high' } })
    const auto = await withPick(f, 'medium')
    await auto.onPrompt(facts({ text: 'max effort please' }))
    expect(f.asked).toHaveLength(0)
    expect(auto.view().pick).toEqual({ effort: 'max', why: 'you asked for it', by: 'named' })
  })

  test('mid-turn lower verdict waits for the turn to end', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    f.verdicts.push({ effort: 'low', why: 'small' })
    await auto.onPrompt(facts({ text: 'also rename it', midTurn: true }))
    expect(auto.view().pick?.effort).toBe('high')
    await auto.onTurnEnd()
    expect(auto.view().pick).toEqual({ effort: 'low', why: 'small', by: 'haiku' })
    expect(f.state.pick?.effort).toBe('low')
  })

  test('mid-turn higher verdict applies at once', async () => {
    const f = fake()
    const auto = await withPick(f, 'medium')
    f.verdicts.push({ effort: 'max', why: 'harder' })
    await auto.onPrompt(facts({ text: 'and redo the schema', midTurn: true }))
    expect(auto.view().pick?.effort).toBe('max')
  })

  test('a held pick is dropped when Auto went off before the turn ended', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    f.verdicts.push({ effort: 'low', why: 'small' })
    await auto.onPrompt(facts({ text: 'also rename it', midTurn: true }))
    await auto.toggleAuto()
    await auto.onTurnEnd()
    expect(auto.view().pick?.effort).toBe('high')
  })

  test("haiku failure drops to medium for the session", async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    await auto.onPrompt(facts())
    expect(auto.view().isAuto).toBe(false)
    expect(auto.view().pick).toEqual({ effort: 'medium', why: "Haiku didn't answer", by: 'manual' })
    expect(f.state.isAuto).toBe(false)
    expect(f.state.pick).toEqual({ effort: 'medium', why: "Haiku didn't answer", by: 'manual' })
    expect(f.toasts).toHaveLength(1)
    expect(f.sets.filter(([k]) => k === 'effortAuto')).toEqual([])
    expect(f.typed).toEqual([])
    await auto.toggleAuto()
    expect(auto.view().isAuto).toBe(true)
    await auto.onPrompt(facts())
    expect(auto.view().isAuto).toBe(false)
    expect(f.toasts).toHaveLength(2)
  })

  test('failure is session-only', async () => {
    const stored = new Map<string, unknown>()
    const f = fake({ stored })
    const auto = createAuto(f.deps)
    await auto.load()
    await auto.onPrompt(facts())
    expect(auto.view().isAuto).toBe(false)
    const again = createAuto(fake({ stored }).deps)
    await again.load()
    expect(again.view().isAuto).toBe(true)
  })

  test('the session-only failure survives a hook reload', async () => {
    const stored = new Map<string, unknown>([['effortAuto', true]])
    const failed = fake({ stored })
    const auto = createAuto(failed.deps)
    await auto.load()
    await auto.onPrompt(facts())
    expect(failed.state.isAuto).toBe(false)
    // The hook reloads: closure state is gone, the engine's state is not, and the store still says Auto is on.
    const reloaded = createAuto(fake({ stored, kept: failed.state }).deps)
    await reloaded.load()
    expect(reloaded.view().isAuto).toBe(false)
    expect(reloaded.view().pick).toEqual({ effort: 'medium', why: "Haiku didn't answer", by: 'manual' })
    expect(reloaded.requestEffort({ modelId: 'claude-opus-5-5', effort: 'high' })).toBe('medium')
  })

  test('a reload with nothing kept loads from the store as before', async () => {
    const reloaded = createAuto(fake({ stored: new Map([['effortAuto', true]]), kept: {} }).deps)
    await reloaded.load()
    expect(reloaded.view().isAuto).toBe(true)
  })

  test('a second prompt while the judge is out keeps the level', async () => {
    const f = fake()
    const auto = await withPick(f, 'medium')
    let answer: (v: Verdict | null) => void = () => undefined
    f.verdicts.push(new Promise<Verdict | null>(resolve => (answer = resolve)))
    const first = auto.onPrompt(facts())
    await Promise.resolve()
    expect(auto.view().isJudging).toBe(true)
    await auto.onPrompt(facts({ text: 'and the tests' }))
    expect(f.asked).toHaveLength(1)
    answer({ effort: 'high', why: 'x' })
    await first
    expect(auto.view().isJudging).toBe(false)
    expect(auto.view().pick?.effort).toBe('high')
  })

  test('a level picked while the judge is out stands', async () => {
    for (const answer of [{ effort: 'high', why: 'x' } as Verdict, null]) {
      const f = fake()
      const auto = await withPick(f, 'medium')
      let reply: (v: Verdict | null) => void = () => undefined
      f.verdicts.push(new Promise<Verdict | null>(resolve => (reply = resolve)))
      const judged = auto.onPrompt(facts())
      await auto.pickLevel('max')
      reply(answer)
      await judged
      expect(auto.view().pick).toEqual({ effort: 'max', why: 'your pick', by: 'manual' })
      expect(f.toasts).toEqual([])
    }
  })

  test('a level named while the judge is out applies at once, and the verdict that comes back after it is dropped', async () => {
    for (const answer of [{ effort: 'low', why: 'small' } as Verdict, null]) {
      const f = fake()
      const auto = await withPick(f, 'medium')
      let reply: (v: Verdict | null) => void = () => undefined
      f.verdicts.push(new Promise<Verdict | null>(resolve => (reply = resolve)))
      const judged = auto.onPrompt(facts())
      await auto.onPrompt(facts({ text: 'use max effort' }))
      expect(auto.view().pick).toEqual({ effort: 'max', why: 'you asked for it', by: 'named' })
      expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'medium' })).toBe('max')
      reply(answer)
      await judged
      expect(auto.view().pick).toEqual({ effort: 'max', why: 'you asked for it', by: 'named' })
      expect(auto.view().isAuto).toBe(true)
      expect(f.toasts).toEqual([])
      expect(f.asked).toHaveLength(1)
    }
  })

  test('Haiku not answering a message typed mid-turn leaves the running turn at its level, and medium follows when it ends', async () => {
    const opus = 'claude-opus-5-5'
    const f = fake()
    const auto = await withPick(f, 'xhigh')
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('xhigh')
    await auto.onPrompt(facts({ text: 'also rename the helper', midTurn: true }))
    // Auto is off at once, for this session only, and the person is told.
    expect(auto.view().isAuto).toBe(false)
    expect(f.state.isAuto).toBe(false)
    expect(f.sets.filter(([k]) => k === 'effortAuto')).toEqual([])
    expect(f.toasts).toEqual(["Auto effort is off: Haiku didn't answer. Click A in the effort gate or in /pixling room to try again."])
    // The running turn's remaining steps and its subagents keep xhigh.
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('xhigh')
    expect(auto.requestEffort({ modelId: opus, effort: 'medium', agentId: 'a1' })).toBe('xhigh')
    expect(auto.nextEffort(opus)).toBe('xhigh')
    await auto.onTurnEnd()
    expect(auto.view().pick).toEqual({ effort: 'medium', why: "Haiku didn't answer", by: 'manual' })
    expect(f.state.pick).toEqual({ effort: 'medium', why: "Haiku didn't answer", by: 'manual' })
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('medium')
    expect(auto.view().isAuto).toBe(false)
  })

  test('Haiku not answering mid-turn while the turn runs at medium or below sets medium at once', async () => {
    for (const running of ['low', 'medium'] as const) {
      const f = fake()
      const auto = await withPick(f, running)
      await auto.onPrompt(facts({ text: 'also rename the helper', midTurn: true }))
      expect(auto.view().pick, running).toEqual({ effort: 'medium', why: "Haiku didn't answer", by: 'manual' })
      expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'medium' }), running).toBe('medium')
    }
  })

  test('after a mid-turn failure, a level the person picks or Auto turned back on stands when the turn ends', async () => {
    const picked = await withPick(fake(), 'xhigh')
    await picked.onPrompt(facts({ text: 'also rename the helper', midTurn: true }))
    await picked.pickLevel('high')
    await picked.onTurnEnd()
    expect(picked.view().pick).toEqual({ effort: 'high', why: 'your pick', by: 'manual' })

    const back = await withPick(fake(), 'xhigh')
    await back.onPrompt(facts({ text: 'also rename the helper', midTurn: true }))
    await back.toggleAuto()
    await back.onTurnEnd()
    expect(back.view().isAuto).toBe(true)
    expect(back.view().pick).toEqual({ effort: 'xhigh', why: 'judged', by: 'haiku' })
  })

  test('a throwing dependency never throws into the turn', async () => {
    const f = fake()
    const auto = createAuto({
      ...f.deps,
      setState: async () => {
        throw new Error('state')
      },
      store: {
        get: async () => {
          throw new Error('get')
        },
        set: async () => {
          throw new Error('set')
        },
      },
      toast: () => {
        throw new Error('toast')
      },
      setAppEffort: async () => {
        throw new Error('type')
      },
      ask: async () => {
        throw new Error('ask')
      },
    })
    await auto.load()
    await auto.onPrompt(facts())
    expect(auto.view().pick?.effort).toBe('medium')
    await auto.pickLevel('low')
    await auto.toggleAuto()
    await auto.onTurnEnd()
    expect(() => auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'max' })).not.toThrow()
  })

  test('pickLevel', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    const judged = auto.view().shift
    await auto.pickLevel('low')
    expect(auto.view().isAuto).toBe(false)
    expect(f.stored.get('effortAuto')).toBe(false)
    expect(auto.view().pick).toEqual({ effort: 'low', why: 'your pick', by: 'manual' })
    expect(f.state.pick).toEqual({ effort: 'low', why: 'your pick', by: 'manual' })
    expect(f.typed).toEqual(['low'])
    // A pick of the person's draws no shift of its own.
    expect(auto.view().shift).toBe(judged)
  })

  test('turning Auto on shows the brain for a second; turning it off does not', async () => {
    const f = fake()
    const auto = createAuto(f.deps)
    await auto.load()
    // On as it loads: the first press turns it off, with no brain.
    await auto.toggleAuto()
    expect(auto.view().isAuto).toBe(false)
    expect(auto.view().isJudging).toBe(false)
    f.clock.now = 2_000
    await auto.toggleAuto()
    expect(auto.view().isAuto).toBe(true)
    expect(auto.view().isJudging).toBe(true)
    f.clock.now = 2_000 + AUTO_ON_BRAIN_MS - 1
    expect(auto.view().isJudging).toBe(true)
    f.clock.now = 2_000 + AUTO_ON_BRAIN_MS
    expect(auto.view().isJudging).toBe(false)
  })

  test('toggleAuto', async () => {
    const f = fake()
    const auto = createAuto(f.deps)
    await auto.load()
    expect(auto.view().isAuto).toBe(true)
    await auto.toggleAuto()
    expect(auto.view().isAuto).toBe(false)
    expect(f.state.isAuto).toBe(false)
    expect(f.stored.get('effortAuto')).toBe(false)
    await auto.toggleAuto()
    expect(auto.view().isAuto).toBe(true)
    expect(f.stored.get('effortAuto')).toBe(true)
  })

  test('load restores Auto off and the pick that was in force', async () => {
    const stored = new Map<string, unknown>([
      ['effortAuto', false],
      ['effortPick', { effort: 'xhigh', why: 'your pick', by: 'manual' }],
    ])
    const f = fake({ stored })
    const auto = createAuto(f.deps)
    await auto.load()
    expect(auto.view().isAuto).toBe(false)
    expect(auto.view().pick).toEqual({ effort: 'xhigh', why: 'your pick', by: 'manual' })
    expect(f.state).toEqual({ isAuto: false, pick: { effort: 'xhigh', why: 'your pick', by: 'manual' } })
  })

  test('load ignores garbage in the store', async () => {
    const stored = new Map<string, unknown>([
      ['effortAuto', 'nope'],
      ['effortPick', 'banana'],
    ])
    const auto = createAuto(fake({ stored }).deps)
    await auto.load()
    expect(auto.view().isAuto).toBe(true)
    expect(auto.view().pick).toBeNull()
  })

  test('requestEffort', async () => {
    const opus = 'claude-opus-5-5'
    const f = fake()
    const auto = await withPick(f, 'high')
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('high')
    expect(auto.requestEffort({ modelId: 'claude-fable-5-1', effort: 'medium' })).toBeUndefined()
    expect(auto.requestEffort({ modelId: 'claude-haiku-5-5', effort: undefined })).toBeUndefined()

    const low = await withPick(fake({ cfg: { floor: 'low' } }), 'low')
    expect(low.requestEffort({ modelId: opus, effort: 'medium', agentId: 'a1' })).toBe('medium')
    expect(low.requestEffort({ modelId: opus, effort: 'medium', agentId: 'a1' })).toBe('medium')

    const manual = createAuto(fake().deps)
    await manual.load()
    await manual.pickLevel('low')
    expect(manual.requestEffort({ modelId: opus, effort: 'medium', agentId: 'a1' })).toBeUndefined()
    expect(manual.requestEffort({ modelId: opus, effort: 'medium' })).toBe('low')

    const off = await withPick(fake(), 'high')
    await off.toggleAuto()
    expect(off.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
  })

  test('requestEffort with no pick leaves the request as it is', async () => {
    const auto = createAuto(fake().deps)
    await auto.load()
    expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'medium' })).toBeUndefined()
  })

  test('autoEffort off leaves everything alone', async () => {
    const f = fake({ cfg: { isOn: false }, verdicts: [{ effort: 'high', why: 'x' }] })
    const auto = createAuto(f.deps)
    await auto.load()
    await auto.onPrompt(facts())
    expect(f.asked).toHaveLength(0)
    expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'medium' })).toBeUndefined()
    expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'max' })).toBeUndefined()
    expect(f.toasts).toEqual([])
  })

  test("a level Pixlings set is not mistaken for the person's", async () => {
    const opus = 'claude-opus-5-5'
    const f = fake()
    const auto = createAuto(f.deps)
    await auto.load()
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
    await auto.pickLevel('low')
    f.sets.length = 0
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('low')
    // The person pressed Enter on the /effort Pixlings typed: the app is on low now.
    expect(auto.requestEffort({ modelId: opus, effort: 'low' })).toBe('low')
    expect(auto.view().isAuto).toBe(false)
    expect(auto.view().pick).toEqual({ effort: 'low', why: 'your pick', by: 'manual' })
    expect(f.toasts).toEqual([])
    expect(f.sets).toEqual([])

  })

  test('the app moving to the level Auto sends is the person', async () => {
    // turn.step reports the app's own effort, never the one Pixlings rewrote: only the person moves it.
    const opus = 'claude-opus-5-5'
    const g = fake()
    const sent = await withPick(g, 'high')
    expect(sent.requestEffort({ modelId: opus, effort: 'medium' })).toBe('high')
    expect(sent.requestEffort({ modelId: opus, effort: 'high' })).toBe('high')
    expect(sent.view().isAuto).toBe(false)
    expect(sent.view().pick).toEqual({ effort: 'high', why: 'your pick in the app', by: 'manual' })
    expect(g.stored.get('effortAuto')).toBe(false)
    expect(g.toasts).toHaveLength(1)
  })

  test('the person setting the level Auto sent, then Auto moving away, is still the person', async () => {
    const opus = 'claude-opus-5-5'
    const f = fake()
    const auto = await withPick(f, 'high')
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('high')
    // The person runs /effort high; the next prompt is judged low before another request goes out.
    f.verdicts.push({ effort: 'low', why: 'small' })
    await auto.onPrompt(facts({ text: 'rename the variable' }))
    expect(auto.view().pick?.effort).toBe('low')
    expect(auto.requestEffort({ modelId: opus, effort: 'high' })).toBe('high')
    expect(auto.view().isAuto).toBe(false)
    expect(auto.view().pick).toEqual({ effort: 'high', why: 'your pick in the app', by: 'manual' })
    expect(f.toasts).toHaveLength(1)
  })

  test('the app taking the typed /effort before any request carried it is not the person', async () => {
    const opus = 'claude-opus-5-5'
    const f = fake()
    const auto = createAuto(f.deps)
    await auto.load()
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
    await auto.pickLevel('xhigh')
    expect(auto.requestEffort({ modelId: opus, effort: 'xhigh' })).toBe('xhigh')
    expect(auto.view().pick).toEqual({ effort: 'xhigh', why: 'your pick', by: 'manual' })
    expect(f.toasts).toEqual([])
  })

  test("the person's own change turns Auto off", async () => {
    const opus = 'claude-opus-5-5'
    const f = fake()
    const auto = await withPick(f, 'high')
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('high')
    expect(auto.requestEffort({ modelId: opus, effort: 'max' })).toBe('max')
    expect(auto.view().isAuto).toBe(false)
    expect(auto.view().pick).toEqual({ effort: 'max', why: 'your pick in the app', by: 'manual' })
    await Promise.resolve()
    expect(f.stored.get('effortAuto')).toBe(false)
    expect(f.state.isAuto).toBe(false)
    expect(f.state.pick).toEqual({ effort: 'max', why: 'your pick in the app', by: 'manual' })
    expect(f.toasts).toHaveLength(1)
    expect(f.toasts[0]).toContain('Max')
    expect(auto.requestEffort({ modelId: opus, effort: 'max' })).toBe('max')
    expect(f.toasts).toHaveLength(1)
  })

  test('a model switch is not the person changing effort', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'medium' })).toBe('high')
    expect(auto.requestEffort({ modelId: 'claude-sonnet-5-5', effort: 'low' })).toBe('high')
    expect(auto.view().isAuto).toBe(true)
    expect(f.toasts).toEqual([])
  })

  test("a new session with Auto off takes the app's level over the carried pick", async () => {
    const stored = new Map<string, unknown>([
      ['effortAuto', false],
      ['effortPick', { effort: 'xhigh', why: 'your pick', by: 'manual' }],
    ])
    const f = fake({ stored })
    const auto = createAuto(f.deps)
    await auto.load()
    expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'low' })).toBe('low')
    expect(auto.view().pick).toEqual({ effort: 'low', why: 'your pick in the app', by: 'manual' })
    expect(f.toasts).toHaveLength(1)
  })

  test('a model switch in a carried-over session is not the person', async () => {
    const stored = new Map<string, unknown>([
      ['effortAuto', false],
      ['effortPick', { effort: 'xhigh', why: 'your pick', by: 'manual' }],
    ])
    const f = fake({ stored })
    const auto = createAuto(f.deps)
    await auto.load()
    expect(auto.requestEffort({ modelId: 'claude-opus-5-5', effort: 'xhigh' })).toBe('xhigh')
    expect(auto.requestEffort({ modelId: 'claude-sonnet-5-5', effort: 'high' })).toBe('xhigh')
    expect(f.toasts).toEqual([])
    expect(auto.view().pick).toEqual({ effort: 'xhigh', why: 'your pick', by: 'manual' })
    expect(auto.view().isAuto).toBe(false)
  })
})

describe('nextEffort: the level the next main-loop request carries', () => {
  const opus = 'claude-opus-5-5'
  const fable = 'claude-fable-5-1'

  test('Auto off after it picked high while the app is at medium: the app’s medium', async () => {
    const auto = await withPick(fake(), 'high')
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('high')
    expect(auto.nextEffort(opus)).toBe('high')
    await auto.toggleAuto()
    expect(auto.nextEffort(opus)).toBe('medium')
    // The same as the request then carries: the app's own.
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
  })

  test('a manual pick on a model Auto does not steer: the app’s own level', async () => {
    const auto = createAuto(fake().deps)
    await auto.load()
    await auto.pickLevel('low')
    expect(auto.requestEffort({ modelId: fable, effort: 'high' })).toBeUndefined()
    expect(auto.nextEffort(fable)).toBe('high')
    expect(auto.nextEffort(opus)).toBe('low')
  })

  test('on opus with Auto on and a pick of high: high', async () => {
    const auto = await withPick(fake(), 'high')
    expect(auto.nextEffort(opus)).toBe('high')
  })

  test('nothing known: undefined; a thinking budget is not a level', async () => {
    const auto = createAuto(fake().deps)
    await auto.load()
    expect(auto.nextEffort(opus)).toBeUndefined()
    auto.requestEffort({ modelId: opus, effort: 32_000 })
    expect(auto.nextEffort(opus)).toBeUndefined()
  })

  test('after a switch to another model the app’s effort there is not known yet', async () => {
    const auto = createAuto(fake().deps)
    await auto.load()
    auto.requestEffort({ modelId: opus, effort: 'xhigh' })
    expect(auto.nextEffort(opus)).toBe('xhigh')
    expect(auto.nextEffort('claude-sonnet-5-5')).toBeUndefined()
  })

  test('it changes nothing: asking twice, then a request, steers as before', async () => {
    const auto = await withPick(fake(), 'high')
    auto.nextEffort('claude-sonnet-5-5')
    auto.nextEffort(opus)
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBe('high')
    expect(auto.view().isAuto).toBe(true)
  })
})

describe('reason: what the gate says after the A', () => {
  const opus = 'claude-opus-5-5'

  test('the reason for a level Auto moved to, while its arrows show, and gone with them', async () => {
    const f = fake()
    const auto = await withPick(f, 'medium')
    f.verdicts.push({ effort: 'xhigh', why: 'big refactor' })
    f.clock.now = 5_000
    await auto.onPrompt(facts())
    expect(auto.reason(opus, 5_000)).toBe('big refactor')
    expect(auto.reason(opus, 5_000 + SWITCHED_MS - 1)).toBe('big refactor')
    expect(auto.reason(opus, 5_000 + SWITCHED_MS)).toBe('')
    // A level named in the prompt moves it too, with its own reason.
    f.clock.now = 30_000
    await auto.onPrompt(facts({ text: 'max effort please' }))
    expect(auto.reason(opus, 30_000)).toBe('you asked for it')
  })

  test('a judgement that keeps the level shows its reason for as long, with no arrows', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    f.clock.now = 60_000
    f.verdicts.push({ effort: 'high', why: 'still hard' })
    await auto.onPrompt(facts())
    expect(auto.view().shift).toEqual({ from: 'high', to: 'high', until: 60_000 + SWITCHED_MS })
    expect(auto.reason(opus, 60_000)).toBe('still hard')
    expect(auto.reason(opus, 60_000 + SWITCHED_MS)).toBe('')
  })

  test('on a model Auto does not steer, that it is paused there, for as long as it is', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    expect(auto.reason('claude-fable-5-1', f.clock.now)).toBe('paused on this model')
    expect(auto.reason('claude-haiku-5-5', f.clock.now + 60_000)).toBe('paused on this model')
  })

  test('none for a level the person picked or Haiku not answering, until Haiku judges again', async () => {
    const f = fake()
    const auto = await withPick(f, 'high')
    const at = f.clock.now
    await auto.pickLevel('low')
    await auto.toggleAuto()
    expect(auto.reason(opus, at)).toBe('')
    // Haiku doesn't answer; the person turns Auto back on.
    await auto.onPrompt(facts())
    expect(auto.view().pick?.why).toBe("Haiku didn't answer")
    await auto.toggleAuto()
    expect(auto.reason(opus, at)).toBe('')
    f.verdicts.push({ effort: 'xhigh', why: 'big refactor' })
    await auto.onPrompt(facts())
    expect(auto.reason(opus, at)).toBe('big refactor')
  })
})

describe('standing down while Effortless is installed', () => {
  const opus = 'claude-opus-5-5'
  const PAUSED = "Pixlings' Auto effort is paused while Effortless is installed. Uninstall Effortless to use it here."

  test('no judging and no steering, told once however often it stands down', async () => {
    const f = fake({ verdicts: [{ effort: 'max', why: 'huge job' }] })
    const auto = createAuto(f.deps)
    await auto.load()
    auto.standDown()
    auto.standDown()
    await auto.onPrompt(facts())
    await auto.onPrompt(facts({ text: 'max effort please' }))
    expect(f.asked).toHaveLength(0)
    expect(auto.view().pick).toBeNull()
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
    expect(auto.requestEffort({ modelId: opus, effort: 'medium', agentId: 'a1' })).toBeUndefined()
    expect(f.toasts).toEqual([PAUSED])
  })

  test('a request at another effort is Effortless steering, not the person: Auto stays on and nothing is stored', async () => {
    const f = fake()
    const auto = createAuto(f.deps)
    await auto.load()
    auto.standDown()
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
    expect(auto.requestEffort({ modelId: opus, effort: 'max' })).toBeUndefined()
    await Promise.resolve()
    expect(auto.view().isAuto).toBe(true)
    expect(f.sets).toEqual([])
    expect(f.toasts).toEqual([PAUSED])
  })

  test('the gate shows the effort the requests last carried, and says why Auto is paused', async () => {
    const auto = await withPick(fake(), 'high')
    auto.standDown()
    auto.requestEffort({ modelId: opus, effort: 'low' })
    expect(auto.nextEffort(opus)).toBe('low')
    expect(auto.reason(opus, 0)).toBe('paused: Effortless is installed')
    expect(auto.reason('claude-fable-5-1', 0)).toBe('paused: Effortless is installed')
  })

  test('a click does what it shows for this session, and stores nothing', async () => {
    const f = fake()
    const auto = createAuto(f.deps)
    await auto.load()
    auto.standDown()
    await auto.toggleAuto()
    expect(auto.view().isAuto).toBe(false)
    expect(f.state.isAuto).toBe(false)
    await auto.pickLevel('high')
    expect(auto.view().pick).toEqual({ effort: 'high', why: 'your pick', by: 'manual' })
    // The app's own control is asked to follow; Pixlings still sends nothing of its own.
    expect(f.typed).toEqual(['high'])
    expect(auto.requestEffort({ modelId: opus, effort: 'medium' })).toBeUndefined()
    expect(f.sets).toEqual([])
  })
})
