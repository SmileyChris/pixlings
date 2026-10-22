import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'
import { adopt, cleanName, companionOf, configPath, epochMs, speciesNamed } from '../hooks/lib/buddy.ts'
import { oneLine, personaFor, personasOf, TEMPLATE_MAX } from '../hooks/lib/persona.ts'
import { daysTogether, hatchPixling, mergeSave, rehatch, revive } from '../hooks/lib/progress.ts'
import type { Pixling } from '../hooks/lib/progress.ts'
import { mayQuip, QUIP_GAP_MS, QUIP_MAX_CHARS, quipOf, quipRequest } from '../hooks/lib/quips.ts'
import { SPECIES } from '../hooks/lib/sprites.ts'

const NOON = Date.parse('2026-10-03T12:00:00Z')
const MIN = 60_000

/** Tests that jump minutes of clock: quick alone, slower while other suites share the CPU. */
const LONG = 20_000

/** Stretches the 100 ms frame clock to a minute, so a test can sleep through a nap. */
const SLOW = {
  name: 'slow-frames',
  register: (on: On) => {
    on('clock.every', ($, e, next) => next({ ...e, ms: Math.max(e.ms, 60_000) }))
  },
}

// A stand-in for the person's ~/.claude.json: the companion beside things that are none of the
// pixling's business. The real file on this machine is never read by these tests.
const SECRET = 'sk-ant-api03-NEVER-LEAK-THIS'
const EMAIL = 'someone@example.com'
const PRIVATE_PROMPT = 'my private prompt about payroll'
const COMPANION = {
  name: 'Pebblet',
  personality: 'A pebble that hums when the tests pass and sulks when they do not.',
  // Epoch seconds: 2026-01-01T00:00:00Z.
  hatchedAt: 1_767_225_600,
}
const CONFIG = JSON.stringify({
  numStartups: 412,
  primaryApiKey: SECRET,
  oauthAccount: { emailAddress: EMAIL, accountUuid: 'acc-123' },
  projects: { 'C:\\work\\secret-project': { history: [{ display: PRIVATE_PROMPT }] } },
  companion: { ...COMPANION, extra: SECRET },
})
const CONFIG_PATH = 'C:\\Users\\tester\\.claude.json'

const LEAKS = [SECRET, EMAIL, PRIVATE_PROMPT, 'secret-project', 'numStartups', 'acc-123']

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
  dex: ['duck', 'owl'],
  badges: { hello: 1, exterminator: 2 },
  streak: { last: '2026-10-02', days: 4, best: 9 },
  tics: { absolutelyRight: 7 },
}

type Ran = { argv: readonly string[]; init?: { stdin?: string; env?: Record<string, string> } }

type Reply = Record<string, unknown>

const USAGE = { input_tokens: 70, output_tokens: 22, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type HostOptions = {
  stored?: unknown
  away?: boolean
  env?: Record<string, string>
  /** What `$.fs.read` answers for a path; with none the file is missing. */
  read?: (path: string) => string
  /** Why `$.fs.read` rejects, as the engine words it (too large, refused by a hook). */
  refuse?: string
  /** A host process's standard output, by its argv. */
  stdout?: (argv: readonly string[]) => string
  /** What `$.model.complete` resolves; a throw rejects it. */
  reply?: () => Reply
}

/**
 * The path as the pixling asked for it. The tests play a Windows machine, and on a POSIX host the
 * engine takes `C:\…` for a relative path and puts the working directory before it.
 */
const asAsked = (path: string): string => path.replace(/^.*[\\/](?=[A-Za-z]:\\)/, '')

/** The engine beneath the pixling: a store the test reads, and every call the pixling makes. */
const host = (on: On, o: HostOptions = {}) => {
  const clock = mock.clock(on, { now: NOON })
  const db = new Map<string, unknown>()
  if (o.stored !== undefined) db.set('pixling', o.stored)
  if (o.away !== undefined) db.set('away', o.away)
  on('store.get', ($, e) => ({ value: db.get(e.key) }) as never)
  on('store.set', ($, e) => {
    db.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  mock.env(on, o.env ?? { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  on('session.id', () => ({ value: 's1' }) as never)
  const ran: Ran[] = []
  const toasts: string[] = []
  const registered: string[] = []
  const opened: { id: string; title?: string }[] = []
  const reads: string[] = []
  const models: { model: string; prompt: string; system?: string; maxTokens?: number; timeoutMs?: number }[] = []
  const submitted: string[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv, init: e.init })
    const stdout = o.stdout?.(e.argv) ?? ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', ($, e) => {
    const path = asAsked(e.path)
    reads.push(path)
    if (o.refuse) return { deny: o.refuse } as never
    if (!o.read) return { deny: `ENOENT: no such file or directory, open '${path}'` } as never
    return { value: o.read(path) } as never
  })
  on('model.complete', ($, e) => {
    models.push(e)
    if (!o.reply) throw new Error('no model in this test')
    return { value: o.reply() } as never
  })
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } } as never
  })
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
    return { text: e.text }
  })
  on('classic.StopFailure', () => ({}))
  on('classic.Notification', () => ({}))
  return { clock, db, ran, toasts, registered, opened, reads, models, submitted }
}

/** Answers every AskUserQuestion with `answer`, and keeps the questions. */
const answering = (on: On, answer: string, asked: string[] = []) => {
  on('tool.call', ($, e) => {
    const input = e as unknown as { questions?: { question: string }[] }
    for (const q of input.questions ?? []) asked.push(q.question)
    const answers = Object.fromEntries((input.questions ?? []).map(q => [q.question, answer]))
    return { result: { questions: input.questions ?? [], answers }, text: 'answered' } as never
  })
  return asked
}

/** A Bash test run that fails: `failed` red out of twelve. */
const redTests = (on: On, failed = 2) => {
  const output = `==== ${failed} failed, 10 passed in 0.5s ==== secret_fixture_value`
  on('tool.call', () => ({ isError: true as const, result: { stdout: output, stderr: '', interrupted: false }, text: output }) as never)
}

type Engine = Parameters<TestBody>[0]

/** Reads the pixling's shared state as another plugin would (the band, the room): through `$.state`. */
const PEEK = {
  name: 'peek',
  register: (on: On) => {
    // Each key spelled out: the engine lists what a module reads, so a key is never computed.
    on('command.run', { command: 'peek' }, async ($, e) => {
      const read =
        e.args === 'persona'
          ? await $.state.get({ plugin: 'pixlings', key: 'persona' } as never)
          : e.args === 'isAway'
            ? await $.state.get({ plugin: 'pixlings', key: 'isAway' } as never)
            : e.args === 'nap'
              ? await $.state.get({ plugin: 'pixlings', key: 'nap' } as never)
              : await $.state.get({ plugin: 'pixlings', key: 'bubble' } as never)
      return { text: JSON.stringify(read.value ?? null) }
    })
  },
}

const state = async ($: Engine, key: string): Promise<unknown> =>
  JSON.parse((await $.command.run({ command: 'peek', args: key } as never)).text ?? 'null') as unknown

const bubbleText = async ($: Engine): Promise<string> => ((await state($, 'bubble')) as { text?: string } | null)?.text ?? ''

const sounds = (ran: Ran[]): string[] =>
  ran.flatMap(r => {
    const m = r.argv.join(' ').match(/sounds\\([\w-]+)\.wav/)
    return m ? [m[1] ?? ''] : []
  })

const continues = (submitted: string[]): string[] => submitted.filter(t => /continue the task/.test(t))

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

describe('reading the old /buddy', () => {
  test('only the name, personality and hatch time are kept from the config file', () => {
    const found = companionOf(CONFIG)
    expect(found).toEqual({ name: 'Pebblet', personality: COMPANION.personality, hatchedAt: 1_767_225_600_000 })
    expect(Object.keys(found ?? {}).sort()).toEqual(['hatchedAt', 'name', 'personality'])
    for (const leak of LEAKS) expect(JSON.stringify(found)).not.toContain(leak)
  })

  test('no companion, no name, broken JSON: nothing to adopt, and nothing of the text comes back', () => {
    expect(companionOf(JSON.stringify({ numStartups: 3 }))).toBeNull()
    expect(companionOf(JSON.stringify({ companion: { personality: 'shy' } }))).toBeNull()
    expect(companionOf(JSON.stringify({ companion: 'Pebblet' }))).toBeNull()
    expect(companionOf(`{"primaryApiKey":"${SECRET}", oops`)).toBeNull()
    // A byte-order mark is not a reason to miss it.
    expect(companionOf(`\uFEFF${CONFIG}`)?.name).toBe('Pebblet')
  })

  test('hatch times in epoch ms, epoch seconds or ISO; anything else is unknown', () => {
    expect(epochMs(1_767_225_600_000)).toBe(1_767_225_600_000)
    expect(epochMs(1_767_225_600)).toBe(1_767_225_600_000)
    expect(epochMs('1767225600')).toBe(1_767_225_600_000)
    expect(epochMs('2026-01-01T00:00:00.000Z')).toBe(1_767_225_600_000)
    expect(epochMs('soon')).toBeNull()
    expect(epochMs(-5)).toBeNull()
    expect(epochMs(null)).toBeNull()
    expect(companionOf(JSON.stringify({ companion: { name: 'Pip', hatchedAt: 'whenever' } }))).toEqual({ name: 'Pip', personality: null, hatchedAt: null })
  })

  test('a name is cleaned as /pixling name cleans one; a personality is folded to one line', () => {
    expect(cleanName('Pebb<l>et!!')).toBe('Pebblet')
    expect(cleanName('A'.repeat(40)).length).toBe(20)
    expect(oneLine('two\nlines\u0007 here  ')).toBe('two lines here')
    expect(oneLine('x'.repeat(500)).length).toBeLessThanOrEqual(280)
  })

  test('the file is looked for in CLAUDE_CONFIG_DIR when set, else the home folder', () => {
    expect(configPath('C:\\Users\\tester', undefined, true)).toBe(CONFIG_PATH)
    expect(configPath('/home/t/', undefined, false)).toBe('/home/t/.claude.json')
    expect(configPath('/home/t', '/opt/claude-config', false)).toBe('/opt/claude-config/.claude.json')
  })

})

describe('adoption keeps what is the person’s', () => {
  const base = (): Pixling => revive(DUCK)!
  const found = { name: 'Pebblet', personality: COMPANION.personality, hatchedAt: 1_767_225_600_000 }

  test('it takes the name, personality and days together; badges, streak, tics, dex and level stay', () => {
    const p = base()
    const next = adopt(p, found)
    expect(next.name).toBe('Pebblet')
    expect(next.persona).toBe(COMPANION.personality)
    expect(next.adoptedFrom).toEqual({ name: 'Pebblet', hatchedAt: 1_767_225_600_000 })
    expect(next.species).toBe('duck')
    expect(next.badges).toEqual(p.badges)
    expect(next.streak).toEqual(p.streak)
    expect(next.tics).toEqual(p.tics)
    expect(next.dex).toEqual(p.dex)
    expect(next.xp).toBe(p.xp)
    expect(next.stats).toEqual(p.stats)
    // 2026-01-01 to 2026-10-03 noon: day 276 together, not the duck's 33.
    expect(daysTogether(p, NOON)).toBe(33)
    expect(daysTogether(next, NOON)).toBe(276)
  })

  test('adopting twice is harmless; a chosen species is worn and joins the dex', () => {
    const once = adopt(base(), found)
    expect(adopt(once, found)).toEqual(once)
    const cat = adopt(base(), found, speciesNamed('Cat') ?? undefined)
    expect(cat.species).toBe('cat')
    expect(cat.dex).toEqual(['duck', 'owl', 'cat'])
    expect(speciesNamed('phoenix')).toBeNull()
    // No personality on the Buddy: the pixling keeps its own.
    expect(adopt(base(), { ...found, personality: null }).persona).toBe(base().persona)
  })

  test('saves from before adoption load, and a merge keeps what either side adopted', () => {
    const old = base()
    expect(old.adoptedFrom).toBeNull()
    const ours = adopt(old, found, speciesNamed('cat') ?? undefined)
    // Another session only petted it meanwhile: our adoption survives the merge.
    const theirs: Pixling = { ...old, stats: { ...old.stats, pets: old.stats.pets + 2 } }
    const merged = mergeSave(revive(JSON.parse(JSON.stringify(theirs)))!, revive(JSON.parse(JSON.stringify(old)))!, ours)
    expect(merged.name).toBe('Pebblet')
    expect(merged.species).toBe('cat')
    expect(merged.persona).toBe(COMPANION.personality)
    expect(merged.adoptedFrom).toEqual({ name: 'Pebblet', hatchedAt: 1_767_225_600_000 })
    expect(merged.stats.pets).toBe(5)
    // The other way round: they adopted, we only petted; theirs stays.
    const back = mergeSave(revive(JSON.parse(JSON.stringify(ours)))!, old, { ...old, stats: { ...old.stats, pets: 4 } })
    expect(back.adoptedFrom).toEqual({ name: 'Pebblet', hatchedAt: 1_767_225_600_000 })
    expect(back.species).toBe('cat')
    expect(back.persona).toBe(COMPANION.personality)
    // A stored round trip keeps both fields.
    expect(revive(JSON.parse(JSON.stringify(ours)))?.adoptedFrom).toEqual(ours.adoptedFrom)
  })
})

describe('personas', () => {
  test('every species has its own short templates', () => {
    for (const s of SPECIES) {
      const pool = personasOf(s.id)
      expect(pool.length).toBeGreaterThanOrEqual(3)
      for (const line of pool) expect(line.length).toBeLessThanOrEqual(TEMPLATE_MAX)
    }
  })

  test('a hatch gets one; an old save gets the same one every time it loads', () => {
    const egg = hatchPixling(() => 0.3, NOON)
    expect(personasOf(egg.species)).toContain(egg.persona)
    const once = revive(DUCK)!
    const again = revive(JSON.parse(JSON.stringify(DUCK)))!
    expect(once.persona).toBe(again.persona)
    expect(once.persona).toBe(personaFor('duck', DUCK.hatchedAt))
    // Different hatch times spread over the pool rather than all landing on one line.
    const seen = new Set(Array.from({ length: 40 }, (_, i) => personaFor('duck', DUCK.hatchedAt + i * 1000)))
    expect(seen.size).toBeGreaterThan(1)
    // A new egg is a new personality; adopting is not carried into it.
    const adopted = adopt(once, { name: 'Pebblet', personality: 'Hums.', hatchedAt: 1 })
    const fresh = rehatch(adopted, () => 0.7, NOON)
    expect(fresh.adoptedFrom).toBeNull()
    expect(fresh.badges).toEqual(adopted.badges)
  })
})

describe('quips, the policy', () => {
  test('the request names the pixling and what happened, in counts, with a tiny budget', () => {
    const r = quipRequest({ name: 'Quackers', species: 'Duck', persona: 'Listens to every bug story.' }, 'testFail', { failed: 3 })
    expect(r.model).toBe('haiku')
    expect(r.maxTokens).toBeLessThanOrEqual(120)
    expect(r.timeoutMs).toBeGreaterThan(0)
    expect(r.system).toContain(`${QUIP_MAX_CHARS} characters or fewer`)
    expect(r.prompt).toContain('Quackers')
    expect(r.prompt).toContain('3 tests just failed')
    expect(quipRequest({ name: 'Q', species: 'Duck', persona: 'p' }, 'bigDiff', { lines: 420, files: 9 }).prompt).toContain('420 lines across 9 files')
  })

  test('at most one a minute, never off, quiet, away or while one is on its way', () => {
    const ok = { mode: 'haiku', isQuiet: false, isAway: false, isBusy: false, lastAt: null, now: NOON }
    expect(mayQuip(ok)).toBe(true)
    expect(mayQuip({ ...ok, mode: 'off' })).toBe(false)
    expect(mayQuip({ ...ok, isQuiet: true })).toBe(false)
    expect(mayQuip({ ...ok, isAway: true })).toBe(false)
    expect(mayQuip({ ...ok, isBusy: true })).toBe(false)
    expect(mayQuip({ ...ok, lastAt: NOON - QUIP_GAP_MS + 1 })).toBe(false)
    expect(mayQuip({ ...ok, lastAt: NOON - QUIP_GAP_MS })).toBe(true)
  })

  test('a reply becomes one short line and its cost; no answer is no quip', () => {
    expect(quipOf({ isAnswered: true, text: '"Red again? Bold."\nextra', usage: USAGE })).toEqual({ text: 'Red again? Bold.', tokens: 92 })
    const long = quipOf({ isAnswered: true, text: 'word '.repeat(40), usage: USAGE })
    expect(long?.text.length).toBeLessThanOrEqual(QUIP_MAX_CHARS)
    expect(quipOf({ isAnswered: true, text: '  ""  ', usage: USAGE })).toBeNull()
    expect(quipOf({ isAnswered: false, usage: USAGE })).toBeNull()
  })
})

describe('/pixling adopt', () => {
  test('brings the old /buddy back from a local read, says so, and keeps nothing else of the file', { plugins: [PEEK] }, async ($, on) => {
    const { clock, db, reads, ran, toasts, models } = host(on, { stored: DUCK, read: path => (path === CONFIG_PATH ? CONFIG : '') })
    const asked = answering(on, 'Bring Pebblet back')
    await $.session.start(START)
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    expect(reads).toEqual([CONFIG_PATH])
    expect(asked[0]).toMatch(/badges, streak, tics and dex are kept\. Adopt Pebblet\?$/)
    expect(out.text).toContain('Pebblet is back!')
    expect(out.text).toContain('276 day(s) together')
    expect(out.text).toMatch(/Read on this machine/)
    expect(out.text).toMatch(/sends nothing anywhere itself/)
    expect(out.text).toMatch(/part of the conversation Claude reads/)
    expect(await bubbleText($)).toMatch(/Pebblet is back!/)
    expect(await state($, 'persona')).toBe(COMPANION.personality)
    await clock.advance(1000)
    const saved = db.get('pixling') as Pixling
    expect(saved.name).toBe('Pebblet')
    expect(saved.persona).toBe(COMPANION.personality)
    expect(saved.adoptedFrom).toEqual({ name: 'Pebblet', hatchedAt: 1_767_225_600_000 })
    expect(saved.badges['exterminator']).toBe(2)
    expect(saved.streak.best).toBe(9)
    expect(saved.tics['absolutelyRight']).toBe(7)
    expect(saved.dex).toEqual(['duck', 'owl'])
    expect(saved.species).toBe('duck')
    // Nothing else of the file is printed, stored, shown, run or sent.
    const everything = JSON.stringify([out.text, [...db.entries()], toasts, ran, models, await state($, 'bubble'), await state($, 'persona')])
    for (const leak of LEAKS) expect(everything).not.toContain(leak)
    expect(models).toEqual([])
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect(card.text).toContain(`Personality: ${COMPANION.personality}`)
    expect(card.text).toContain('Adopted from your old /buddy: 276 day(s) together')
  })

  test('with quips on, it says the personality goes into each quip', { options: { quips: 'haiku' } }, async ($, on) => {
    const { clock } = host(on, { stored: DUCK, read: path => (path === CONFIG_PATH ? CONFIG : '') })
    answering(on, 'Bring Pebblet back')
    await $.session.start(START)
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    expect(out.text).toContain('Pebblet is back!')
    expect(out.text).toMatch(/personality is part of each quip’s request to Claude Haiku/)
    expect(out.text).not.toMatch(/sends nothing anywhere/)
  })

  test('a read the engine refuses (too large, say) is reported as such, and nothing else reads it', async ($, on) => {
    const { clock, db, ran } = host(on, {
      stored: DUCK,
      refuse: 'the file is over 4 MiB',
      stdout: () => CONFIG,
    })
    answering(on, 'Bring Pebblet back')
    await $.session.start(START)
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    expect(out.text).toContain(`Could not read ${CONFIG_PATH}:`)
    expect(out.text).toContain('the file is over 4 MiB')
    expect(out.text).not.toMatch(/found none|is back/)
    expect(ran.filter(r => r.argv.join(' ').includes('Get-Content') || r.argv[0] === 'cat')).toEqual([])
    await clock.advance(1000)
    expect((db.get('pixling') as Pixling).name).toBe('Quackers')
  })

  test('CLAUDE_CONFIG_DIR moves where it looks', async ($, on) => {
    const { clock, reads } = host(on, { stored: DUCK, env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester', CLAUDE_CONFIG_DIR: 'D:\\cfg' } })
    await $.session.start(START)
    await clock.advance(3000)
    await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    expect(reads).toEqual(['D:\\cfg\\.claude.json'])
  })

  test('nothing found: a friendly word on what was looked for, and no dialog', async ($, on) => {
    const { clock, db } = host(on, { stored: DUCK, read: () => JSON.stringify({ numStartups: 1 }) })
    const asked = answering(on, 'Bring Pebblet back')
    await $.session.start(START)
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    expect(out.text).toContain('No old /buddy companion')
    expect(out.text).toContain(CONFIG_PATH)
    expect(out.text).toContain('"companion"')
    expect(out.text).toMatch(/Read on this machine/)
    expect(out.text).toMatch(/part of the conversation Claude reads/)
    expect(asked).toEqual([])
    await clock.advance(1000)
    expect((db.get('pixling') as Pixling).name).toBe('Quackers')
  })

  test('free text typed into the dialog is no yes', async ($, on) => {
    const { clock, db } = host(on, { stored: DUCK, read: () => CONFIG })
    answering(on, 'yes please, bring Pebblet back')
    await $.session.start(START)
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'adopt' } as never)
    expect(out.text).toContain('Nothing changed')
    await clock.advance(1000)
    const saved = db.get('pixling') as Pixling
    expect(saved.name).toBe('Quackers')
    expect(saved.adoptedFrom).toBeNull()
  })

  test('a species may be chosen; an unknown one is refused before anything is read', async ($, on) => {
    const { clock, db, reads } = host(on, { stored: DUCK, read: () => CONFIG })
    answering(on, 'Bring Pebblet back')
    await $.session.start(START)
    await clock.advance(3000)
    const bad = await $.command.run({ command: 'pixling', args: 'adopt phoenix' } as never)
    expect(bad.text).toContain('No species called "phoenix"')
    expect(reads).toEqual([])
    await $.command.run({ command: 'pixling', args: 'adopt Cat' } as never)
    // Twice: harmless.
    await $.command.run({ command: 'pixling', args: 'adopt cat' } as never)
    await clock.advance(1000)
    const saved = db.get('pixling') as Pixling
    expect(saved.species).toBe('cat')
    expect(saved.name).toBe('Pebblet')
    expect(saved.badges).toEqual(expect.objectContaining(DUCK.badges))
    expect(saved.dex).toEqual(['duck', 'owl', 'cat'])
  })
})

describe('an old save', () => {
  test('loads with a seeded persona, published for the band and shown on the card', { plugins: [PEEK] }, async ($, on) => {
    const { clock } = host(on, { stored: DUCK })
    await $.session.start(START)
    await clock.advance(3000)
    const expected = personaFor('duck', DUCK.hatchedAt)
    expect(await state($, 'persona')).toBe(expected)
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect(card.text).toContain(`Personality: ${expected}`)
    expect(card.text).toContain('Quackers the Duck')
  })
})

describe('/pixling off and on', () => {
  test('off is kept for later sessions and silences everything; stats still count', { plugins: [PEEK] }, async ($, on) => {
    const { clock, db, ran, toasts } = host(on, { stored: DUCK })
    await $.session.start(START)
    await clock.advance(10_000)
    const out = await $.command.run({ command: 'pixling', args: 'off' } as never)
    expect(out.text).toContain('is away')
    expect(db.get('away')).toBe(true)
    expect(await state($, 'isAway')).toBe(true)
    const before = ran.length
    const toastsBefore = toasts.length
    // A line with no sound of its own would be said in its voice.
    await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: 't0', reason: 'aborted' })
    await clock.advance(2000)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await $.turn.complete({ answer: 'done', durationMs: 90_000, isAborted: false, turnId: 't', reason: 'answer' })
    await clock.advance(5000)
    // No sound, no voice, no desktop notification, no toast.
    expect(ran.slice(before)).toEqual([])
    expect(toasts.slice(toastsBefore)).toEqual([])
    await clock.advance(1000)
    expect((db.get('pixling') as Pixling).stats.turns).toBe(1)
  })

  test('a session that starts away stays away; on brings it back with a line', { plugins: [PEEK] }, async ($, on) => {
    const { clock, db, ran, toasts } = host(on, { stored: DUCK, away: true })
    await $.session.start(START)
    await clock.advance(10_000)
    expect(await state($, 'isAway')).toBe(true)
    // The streak badge it earned on the way in is kept, not toasted.
    expect(toasts).toEqual([])
    await $.turn.complete({ answer: 'done', durationMs: 90_000, isAborted: false, turnId: 't', reason: 'answer' })
    await clock.advance(5000)
    expect(sounds(ran)).toEqual([])
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect(card.text).toContain('is away')
    const back = await $.command.run({ command: 'pixling', args: 'on' } as never)
    expect(back.text).toContain('Quackers is back')
    expect(db.get('away')).toBe(false)
    expect(await state($, 'isAway')).toBe(false)
    expect(await bubbleText($)).toMatch(/back|Missed me/i)
    await clock.advance(1000)
    expect(sounds(ran)).toContain('wake')
  })

  test('away, a nap does not continue Claude at the reset', { plugins: [SLOW, PEEK], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, { stored: DUCK, away: true })
    const resetsAt = NOON + 5 * MIN
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(resetsAt).toISOString() }] } }) as never)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    expect((await state($, 'nap')) as { isAuto: boolean }).toMatchObject({ isAuto: false })
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
  })

  test('sent away mid-nap: the auto-continue is called off', { plugins: [SLOW, PEEK], timeoutMs: LONG }, async ($, on) => {
    const { clock, submitted } = host(on, { stored: DUCK })
    const resetsAt = NOON + 5 * MIN
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(resetsAt).toISOString() }] } }) as never)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.classic.StopFailure({ error: 'rate_limit' })
    expect((await state($, 'nap')) as { isAuto: boolean }).toMatchObject({ isAuto: true })
    await $.command.run({ command: 'pixling', args: 'off' } as never)
    expect((await state($, 'nap')) as { isAuto: boolean }).toMatchObject({ isAuto: false })
    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(continues(submitted)).toEqual([])
  })
})

describe('/buddy and /pixling room', () => {
  test('/buddy is registered beside /pixling and answers card, pet, off and on', async ($, on) => {
    const { clock, db, registered } = host(on, { stored: DUCK })
    await $.session.start(START)
    await clock.advance(3000)
    expect(registered).toEqual(expect.arrayContaining(['pixling', 'buddy']))
    const card = await $.command.run({ command: 'buddy', args: '' } as never)
    expect(card.text).toContain('Quackers the Duck')
    const pet = await $.command.run({ command: 'buddy', args: 'pet' } as never)
    expect(pet.text).toContain('You pet Quackers')
    await $.command.run({ command: 'buddy', args: 'off' } as never)
    expect(db.get('away')).toBe(true)
    await $.command.run({ command: 'buddy', args: 'on' } as never)
    expect(db.get('away')).toBe(false)
    const help = await $.command.run({ command: 'buddy', args: 'dance' } as never)
    expect(help.text).toContain('/pixling adopt')
    await clock.advance(1000)
    expect((db.get('pixling') as Pixling).stats.pets).toBe(4)
  })

  test('/pixling room opens its pane, titled with its name', async ($, on) => {
    const { clock, opened } = host(on, { stored: DUCK })
    await $.session.start(START)
    await clock.advance(3000)
    const out = await $.command.run({ command: 'pixling', args: 'room' } as never)
    expect(opened).toEqual([expect.objectContaining({ id: 'pixling-room', title: "Quackers's room" })])
    expect(out.text).toContain("Quackers's room is open")
  })

  test('help lists the new commands', async ($, on) => {
    const { clock } = host(on, { stored: DUCK })
    await $.session.start(START)
    await clock.advance(3000)
    const help = await $.command.run({ command: 'pixling', args: 'help' } as never)
    for (const word of ['/pixling adopt [species] —', '/pixling room —', '/pixling off —', '/pixling on —', '/buddy, /buddy pet', 'AI quips']) expect(help.text).toContain(word)
  })
})

describe('quips in a session', () => {
  const answered = () => ({ isAnswered: true, text: '"Two down? I blame the cat."', usage: USAGE })

  test('off by default: red tests and its name never call the model', async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK, reply: answered })
    redTests(on)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await $.prompt.submit({ text: 'Quackers, look at this', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(2000)
    expect(models).toEqual([])
  })

  test('red tests ask Haiku once a minute, in counts only, and show the cost', { options: { quips: 'haiku' }, timeoutMs: LONG, plugins: [PEEK] }, async ($, on) => {
    const { clock, models, db } = host(on, { stored: DUCK, reply: answered })
    redTests(on)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q tests/secret_test.py' } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
    const [ask] = models
    expect(ask?.model).toBe('haiku')
    expect(ask?.maxTokens).toBeLessThanOrEqual(120)
    expect(ask?.timeoutMs).toBeGreaterThan(0)
    expect(ask?.prompt).toContain('2 tests just failed')
    expect(ask?.prompt).toContain('Quackers')
    expect(ask?.prompt).not.toContain('secret')
    expect(ask?.prompt).not.toContain('pytest')
    expect(await bubbleText($)).toBe('Two down? I blame the cat. · 92 tok')
    // Ten seconds later: the minute is not up.
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't2', command: 'pytest -q' } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
    await clock.advance(MIN)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'pytest -q' } as never)
    await clock.advance(50)
    expect(models.length).toBe(2)
    await clock.advance(1000)
    const saved = db.get('pixling') as Pixling
    expect(saved.stats.quips).toBe(2)
    expect(saved.stats.quipTokens).toBe(184)
    const card = await $.command.run({ command: 'pixling', args: '' } as never)
    expect(card.text).toContain('AI quips: 2, 184 tok')
  })

  test('a big edit and an API error ask too, in counts only; a small edit does not', { options: { quips: 'haiku' }, plugins: [PEEK] }, async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK, reply: answered })
    on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Write', tool_use_id: 'w0', file_path: '/repo/src/secret.ts', content: 'tiny\n'.repeat(20) } as never)
    await clock.advance(50)
    expect(models.length).toBe(0)
    await $.tool.call({ tool: 'Write', tool_use_id: 'w1', file_path: '/repo/src/secret.ts', content: 'const x = 1\n'.repeat(180) } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
    expect(models[0]?.prompt).toContain('Claude just changed 180 lines across 1 file')
    expect(models[0]?.prompt).not.toContain('secret')
    expect(models[0]?.prompt).not.toContain('const x')
    // Past the minute: the pixling reads the test clock every ten frames, so a hair over it.
    await clock.advance(MIN + 1000)
    await $.turn.complete({ answer: '', durationMs: 3000, isAborted: false, turnId: 't', reason: 'error' } as never)
    await clock.advance(50)
    expect(models.length).toBe(2)
    expect(models[1]?.prompt).toContain('Claude just ran into an error')
  })

  test('saying its name sends only that it was said', { options: { quips: 'haiku' }, plugins: [PEEK] }, async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK, reply: answered })
    await $.session.start(START)
    await clock.advance(10_000)
    await $.prompt.submit({ text: 'is the word quackers in src/payroll.ts?', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(50)
    // Spelled otherwise, it is a word, not its name.
    expect(models).toEqual([])
    await $.prompt.submit({ text: 'Quackers, what do you make of src/payroll.ts?', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
    expect(models[0]?.prompt).toContain('said your name')
    expect(models[0]?.prompt).not.toContain('payroll')
    expect(await bubbleText($)).toContain('· 92 tok')
  })

  test('a failed call leaves the canned line, silently', { options: { quips: 'haiku' }, plugins: [PEEK] }, async ($, on) => {
    const { clock, models, toasts } = host(on, {
      stored: DUCK,
      reply: () => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: { ...USAGE, input_tokens: 0, output_tokens: 0 } }),
    })
    redTests(on)
    await $.session.start(START)
    await clock.advance(10_000)
    const shown = toasts.length
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
    const said = await bubbleText($)
    expect(said).not.toBe('')
    expect(said).not.toContain('tok')
    expect(toasts.slice(shown)).toEqual([])
  })

  test('a rejected call is no quip either', { options: { quips: 'haiku' }, plugins: [PEEK] }, async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK })
    redTests(on)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
    expect(await bubbleText($)).not.toContain('tok')
  })

  test('away or in a -p run, quips stay off even when chosen', { options: { quips: 'haiku' } }, async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK, away: true, reply: answered })
    redTests(on)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await $.prompt.submit({ text: 'Quackers?', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(50)
    expect(models).toEqual([])
  })

  test('with chatter quiet, no tokens go on a quip it would not show', { options: { quips: 'haiku', chatter: 'quiet' } }, async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK, reply: answered })
    redTests(on)
    await $.session.start(START)
    await clock.advance(10_000)
    await $.prompt.submit({ text: 'Quackers?', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(50)
    expect(models).toEqual([])
    // A red test is said even when quiet: that one may be a quip.
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await clock.advance(50)
    expect(models.length).toBe(1)
  })

  test('in a -p run, no quip', { options: { quips: 'haiku' } }, async ($, on) => {
    const { clock, models } = host(on, { stored: DUCK, reply: answered })
    redTests(on)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false } as never)
    await clock.advance(3000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await clock.advance(50)
    expect(models).toEqual([])
  })
})
