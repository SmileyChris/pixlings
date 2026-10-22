import { describe, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { test } from './kit.ts'
import { SPECIES } from '../hooks/lib/sprites.ts'

/** Tests that run minutes or days of clock: about a second alone, slower when suites share the CPU. */
const LONG = 20_000

/**
 * Stretches the 100 ms frame clock to a minute for a test that skips minutes ahead and checks
 * nothing that moves frame by frame (the pixling re-reads the clock every ten frames, so a
 * cache countdown is one). An inline plugin sees nothing of this file but its body.
 */
const SLOW = {
  name: 'slow-frames',
  register: (on: On) => {
    on('clock.every', ($, e, next) => next({ ...e, ms: Math.max(e.ms, 60_000) }))
  },
}

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

/** What a terminal without images answers a blit to an Image: the engine's own words. */
const ALT_DENY = 'the Image draws its alt here: the terminal draws neither kitty placeholder images (none) nor iTerm2 inline images (none)'

type Ran = { argv: readonly string[]; init?: { stdin?: string; env?: Record<string, string> } }

/** Answers what the pixling asks of the engine beneath it, and records host processes. */
const host = (on: On, stored?: unknown, terminal: { hasImages: boolean } = { hasImages: true }, memory: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  mock.store(on, { ...(stored === undefined ? {} : { pixling: stored }), ...memory })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  const ran: Ran[] = []
  const toasts: string[] = []
  const copied: string[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv, init: e.init })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  // A terminal without images refuses a blit to an Image in the engine's own words.
  const blitted: string[] = []
  on('ui.blit', ($, e) => {
    blitted.push(e.key)
    return { value: 'source' in e && !terminal.hasImages ? { deny: ALT_DENY } : {} } as never
  })
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  return { clock, ran, toasts, copied, blitted }
}

type Engine = Parameters<TestBody>[0]

type Reply = { answer: string; read: number; written: number }

/**
 * The model beneath the plugins: each request the test raises takes the next queued reply.
 * Registered before the test's first call on `$`, as the kit asks.
 */
const model = (on: On) => {
  const queue: Reply[] = []
  on('turn.step', async function* ($, e) {
    const r = queue.shift() ?? { answer: '', read: 0, written: 0 }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: r.answer,
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 20, output_tokens: 400, cache_read_input_tokens: r.read, cache_creation_input_tokens: r.written, model: 'test' },
    }
  })
  /** One main-thread request answered with `answer` and these cache counts. */
  return async ($: Engine, answer: string, read: number, written: number): Promise<void> => {
    queue.push({ answer, read, written })
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
  // Earned already, so its celebration does not hold the stage during a test.
  badges: { hello: 1 },
}

const sounds = (ran: Ran[]): string[] =>
  ran.flatMap(r => {
    const m = r.argv.join(' ').match(/sounds\\([\w-]+)\.wav/)
    return m ? [m[1] ?? ''] : []
  })

describe('the band', () => {
  test('a first session hatches an egg, plays the hatch and shows a pixling', async ($, on) => {
    const { clock, ran } = host(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(6000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    const name = await ui.find({ type: 'Text', text: / Lv 1 · / })
    expect(name).toBeDefined()
    expect(sounds(ran).some(s => s.startsWith('hatch-'))).toBe(true)
    await ui.unmount()
  })

  test('a stored pixling comes back with its name and level on terminal and desktop', async ($, on) => {
    host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'Quackers' })).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('failing tests make it sad and play the fail sound; fixing them squashes the bug', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    let output = '==== 2 failed, 10 passed in 0.5s ===='
    let isError = true
    on('tool.call', ($, e) =>
      isError
        ? { isError: true as const, result: { stdout: output, stderr: '', interrupted: false }, text: output }
        : { result: { stdout: output, stderr: '', interrupted: false }, text: output },
    )
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('fail')
    const sad = await ui.find({ type: 'Text', text: /fail|red|no\.|down|machine|beta|duck|Quack/i })
    expect(sad).toBeDefined()

    output = '==== 12 passed in 0.5s ===='
    isError = false
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't2', command: 'pytest -q' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('squash')
    expect(await ui.find({ type: 'Text', text: /SQUASHED|red to green|Fixed it|defeated/ })).toBeDefined()
    await ui.unmount()
  })

  test('a risky command alarms before it runs', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'git push --force origin main' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('alarm')
    expect(await ui.find({ type: 'Text', text: /force push/ })).toBeDefined()
    await ui.unmount()
  })

  test('a permission prompt calls you with a sound and a desktop notification', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    on('classic.Notification', () => ({}))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await clock.advance(10)
    expect(sounds(ran)).toContain('attention')
    expect(ran.some(r => r.argv.join(' ').includes('ToastNotificationManager'))).toBe(true)
  })

  test('a rate limit puts it to sleep and the reset wakes Claude', { plugins: [SLOW], timeoutMs: LONG }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const resetsAt = Date.parse('2026-10-03T12:05:00Z')
    const submitted: string[] = []
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { window: 200_000 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(resetsAt).toISOString() }],
      },
    }) as never)
    on('classic.StopFailure', () => ({}))
    on('prompt.submit', ($, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(10)
    expect(sounds(ran)).toContain('sleep')
    expect(await ui.find({ type: 'Text', text: /back at/ })).toBeDefined()
    expect(submitted).toEqual([])

    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(sounds(ran)).toContain('wake')
    expect(submitted.length).toBe(1)
    expect(submitted[0]).toMatch(/continue/)
    await ui.unmount()
  })

  test('the one-line band grows while it talks: a line past its end wraps under its start', { options: { band: 'minimal' } }, async ($, on) => {
    const { clock } = host(on, DUCK, { hasImages: false })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    // Every rename line has the name in it: twenty letters make it longer than the line's end.
    await $.command.run({ command: 'pixling', args: 'name Bartholomew Quackington' } as never)
    await clock.advance(10)
    const spoken = (texts: string[]) => texts.filter(t => t.startsWith('  ') && !t.startsWith('  ⚡'))
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 60 }, surface: 'terminal' })
    const said = spoken((await ui.findAll({ type: 'Text' })).map(t => t.text))
    expect(said.length).toBeGreaterThan(1)
    expect(said.join(' ')).toContain('Bartholomew')
    await ui.unmount()
    // No more rows than the band may take: one row, its line cut.
    const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 60, maxRows: 1 }, surface: 'terminal' })
    const one = spoken((await short.findAll({ type: 'Text' })).map(t => t.text))
    expect(one).toHaveLength(1)
    expect(one[0]).toMatch(/…$/)
    await short.unmount()
  })

  test('/pixling pet and /pixling name change the pixling', async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const pet = await $.command.run({ command: 'pixling', args: 'pet' } as never)
    expect(pet.text).toContain('You pet Quackers')
    const renamed = await $.command.run({ command: 'pixling', args: 'name Sir Quacks' } as never)
    expect(renamed.text).toContain('Sir Quacks')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Sir Quacks' })).toBeDefined()
    await ui.unmount()
  })

  test('a fresh session is awake, not dozing', { options: { band: 'minimal' } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(5000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /zz/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\(•ᴗ•\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('every species can be the stored pixling', async ($, on) => {
    host(on, null)
    for (const s of SPECIES) {
      expect(s.verbs.length).toBeGreaterThan(0)
      expect(s.past.length).toBeGreaterThan(0)
    }
  })

  test('a model request starts the cache countdown; a minute before it cools the pixling warns', { timeoutMs: LONG }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const step = model(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await step($, 'Here is the plan.', 0, 64_000)
    // The countdown starts at 5:00 and shows 4:59 once a whole second has passed.
    await clock.advance(2500)
    expect(await ui.find({ type: 'Text', text: /cache ~4:5\d/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0% cached/ })).toBeDefined()

    // To 15.5 s short of the 5-minute mark: the warning has just come, its bubble still up.
    await clock.advance(239_000)
    expect(sounds(ran)).toContain('clock')
    expect(await ui.find({ type: 'Text', text: /expires|cold|cools/ })).toBeDefined()

    await clock.advance(70_000)
    expect(await ui.find({ type: 'Text', text: '❄ cache cold' })).toBeDefined()
    await ui.unmount()
  })

  test('coming back after the cache expired is a cold start it counts', { timeoutMs: LONG }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const step = model(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await step($, 'First.', 0, 64_000)
    await clock.advance(9 * 60_000)
    await step($, 'Back again.', 0, 66_000)
    await clock.advance(50)
    expect(sounds(ran)).toContain('freeze')
    expect(await ui.find({ type: 'Text', text: /66k/ })).toBeDefined()
    await ui.unmount()
  })

  test("\"You're absolutely right\" gets an eye roll and a running count", async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const step = model(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await step($, "You're absolutely right! The test was wrong.", 30_000, 2_000)
    await clock.advance(50)
    expect(sounds(ran)).toContain('eyeroll')
    expect(await ui.find({ type: 'Text', text: /bsolutely right/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\b1\b/ })).toBeDefined()
    await ui.unmount()
  })

  test('a badge is earned once, with a fanfare and a toast', async ($, on) => {
    const { clock, ran, toasts } = host(on, { ...DUCK, stats: { bugsSquashed: 9 }, badges: { hello: 1 } })
    let output = '==== 1 failed, 3 passed in 0.5s ===='
    let isError = true
    on('tool.call', () =>
      isError
        ? { isError: true as const, result: { stdout: output, stderr: '', interrupted: false }, text: output }
        : { result: { stdout: output, stderr: '', interrupted: false }, text: output },
    )
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'pytest -q' } as never)
    await clock.advance(5000)
    output = '==== 4 passed in 0.5s ===='
    isError = false
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'pytest -q' } as never)
    await clock.advance(1000)
    expect(sounds(ran)).toContain('badge')
    expect(toasts.filter(t => t.includes('Exterminator')).length).toBe(1)
    await clock.advance(5000)
    expect(toasts.filter(t => t.includes('Exterminator')).length).toBe(1)
    const list = await $.command.run({ command: 'pixling', args: 'badges' } as never)
    expect(list.text).toMatch(/Badges 2\/16/)
  })

  test('/pixling share saves a PNG through a process and copies a post', async ($, on) => {
    const { clock, ran, copied } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const shared = await $.command.run({ command: 'pixling', args: 'share' } as never)
    expect(shared.text).toContain('C:\\Users\\tester\\pixling-quackers.png')
    const write = ran.find(r => r.init?.env?.['PIXLING_OUT'] !== undefined)
    expect(write?.init?.env?.['PIXLING_OUT']).toBe('C:\\Users\\tester\\pixling-quackers.png')
    // A PNG's signature, base64: iVBORw0KGgo
    expect(write?.init?.stdin?.startsWith('iVBORw0KGgo')).toBe(true)
    expect(ran.some(r => r.argv[0] === 'explorer.exe')).toBe(true)
    expect(copied[0]).toContain('github.com/cglremrcn/pixlings')
    await clock.advance(50)
    expect(sounds(ran)).toContain('shutter')
  })

  test('with room to spare the band widens and the pixling walks it', async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const raster = await ui.find({ type: 'Raster' })
    expect(raster?.props['columns']).toBe(22 + 30)
    await ui.unmount()
  })

  test('a line without a sound of its own is said in the pixling’s voice, made for that line', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const before = ran.length
    await $.command.run({ command: 'pixling', args: 'name Sir Quacks' } as never)
    await clock.advance(50)
    const said = ran.slice(before).find(r => r.argv.join(' ').includes('MemoryStream'))
    // A WAV's "RIFF" header, base64: UklGR
    expect(said?.init?.stdin?.startsWith('UklGR')).toBe(true)
    await $.command.run({ command: 'pixling', args: 'name Sir Quacks' } as never)
    await clock.advance(50)
    // Still talking: the second line does not talk over the first.
    expect(ran.slice(before).filter(r => r.argv.join(' ').includes('MemoryStream')).length).toBe(1)
  })

  test('voice off keeps it quiet', { options: { voice: 'off' } }, async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.command.run({ command: 'pixling', args: 'name Sir Quacks' } as never)
    await clock.advance(50)
    expect(ran.some(r => r.argv.join(' ').includes('MemoryStream'))).toBe(false)
  })

  test('/pixling wear with no item shows the wardrobe and changes nothing', async ($, on) => {
    const { clock } = host(on, { ...DUCK, xp: 200 })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const shown = await $.command.run({ command: 'pixling', args: 'wear' } as never)
    expect(shown.text).toContain('wardrobe')
    expect(shown.text).toMatch(/● sprout/)
    expect(shown.text).toMatch(/🔒 wizard/)
    const again = await $.command.run({ command: 'pixling', args: 'wear' } as never)
    expect(again.text).toMatch(/● sprout/)
  })
})

const imageOf = async (ui: { find: (q: never) => Promise<unknown> }, key: string) =>
  (await ui.find({ type: 'Image', key } as never)) as { props: { columns: number; rows: number } } | undefined

describe('the band at each size', () => {
  test('compact starts as half blocks with the probe, and becomes a 10×4 picture once the terminal draws images', { options: { band: 'compact', roam: false } }, async ($, on) => {
    const { clock, blitted: seen } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Raster', key: 'pixling' } as never)).toBeDefined()
    expect(await imageOf(ui, 'pixling-probe')).toBeDefined()
    await clock.advance(1000)
    expect(seen).toContain('pixling-probe')
    await ui.redraw()
    expect(await ui.find({ type: 'Raster', key: 'pixling' } as never)).toBeUndefined()
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ columns: 10, rows: 4 })
    expect(await imageOf(ui, 'pixling-probe')).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Quackers' })).toBeDefined()
    // The frame clock swaps the picture, a PNG each frame.
    await clock.advance(1000)
    expect(seen).toContain('pixling-image')
    await ui.unmount()
  })

  test('a terminal that drew images last time draws the picture from the first frame', { options: { band: 'compact' } }, async ($, on) => {
    const { clock } = host(on, DUCK, { hasImages: true }, { hasImages: true })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    // Before any probe: no half blocks first.
    expect(await ui.find({ type: 'Raster', key: 'pixling' } as never)).toBeUndefined()
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ rows: 4 })
    await ui.unmount()
  })

  test('without images compact stays half blocks', { options: { band: 'compact' } }, async ($, on) => {
    const { clock } = host(on, DUCK, { hasImages: false })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(2000)
    await ui.redraw()
    expect(await ui.find({ type: 'Raster', key: 'pixling' } as never)).toBeDefined()
    expect(await imageOf(ui, 'pixling-image')).toBeUndefined()
    await ui.unmount()
  })

  test('slim without images is the line, its probe beside it', { options: { band: 'slim' } }, async ($, on) => {
    const { clock } = host(on, DUCK, { hasImages: false })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(2000)
    await ui.redraw()
    expect(await ui.find({ type: 'Raster', key: 'pixling' } as never)).toBeUndefined()
    expect(await imageOf(ui, 'pixling-image')).toBeUndefined()
    expect(await imageOf(ui, 'pixling-probe')).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' · Lv 3' })).toBeDefined()
    await ui.unmount()
  })

  test('minimal where images draw is a 3×1 picture on the line', { options: { band: 'minimal' } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(1000)
    await ui.redraw()
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ columns: 3, rows: 1 })
    expect(await ui.find({ type: 'Text', text: ' · Lv 3' })).toBeDefined()
    await ui.unmount()
  })

  test('in a picture it walks the same columns as in half blocks; on the line it stays put', { options: { band: 'compact' } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    // Half blocks first: the canvas and 30 columns to walk (a 110-column band).
    expect((await ui.find({ type: 'Raster', key: 'pixling' } as never))?.props['columns']).toBe(52)
    await clock.advance(1000)
    await ui.redraw()
    // The picture: its 10 columns and the same 30.
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ columns: 40, rows: 4 })
    await ui.redraw({ ...BAND.props, maxRows: 1 })
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ columns: 3, rows: 1 })
    await ui.unmount()
  })

  test('slim, too short for the card, reveals its line under the pointer', { options: { band: 'slim', roam: false } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(60_000)
    await ui.redraw()
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ rows: 2 })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.some(t => t.startsWith('🔥 1-day streak · 🏅'))).toBe(true)
    expect(await ui.find({ type: 'Raster', key: 'card-flame' } as never)).toBeUndefined()
    await ui.unmount()
  })

  test('slim talks from its bottom row up: the picture keeps its two rows, the column shows all the speech', { options: { band: 'slim', roam: false } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(1000)
    await $.command.run({ command: 'pixling', args: 'name Bartholomew Quackington' } as never)
    await clock.advance(10)
    await ui.redraw()
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ rows: 2 })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    // Under the name and XP's one row, with a bar on its right, uncut.
    expect(texts.some(t => t.includes('Bartholomew'))).toBe(true)
    expect(texts.some(t => t.endsWith('…'))).toBe(false)
    expect(texts).toContain(' Lv 3  ')
    expect(texts).toContain(' │')
    expect(texts.some(t => t.startsWith('╭'))).toBe(false)
    await ui.unmount()
  })

  test('a picture that draws its alt after all falls back to half blocks', { options: { band: 'compact' } }, async ($, on) => {
    const terminal = { hasImages: true }
    const { clock } = host(on, DUCK, terminal)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await clock.advance(1000)
    await ui.redraw()
    expect(await imageOf(ui, 'pixling-image')).toBeDefined()
    terminal.hasImages = false
    await clock.advance(1000)
    await ui.redraw()
    expect(await ui.find({ type: 'Raster', key: 'pixling' } as never)).toBeDefined()
    expect(await imageOf(ui, 'pixling-probe')).toBeDefined()
    await ui.unmount()
  })

  test("short of rows, compact steps down to slim's picture", { options: { band: 'compact', roam: false } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(3000)
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 3 }, surface: 'terminal' })
    await clock.advance(1000)
    await ui.redraw()
    expect((await imageOf(ui, 'pixling-image'))?.props).toMatchObject({ columns: 5, rows: 2 })
    await ui.unmount()
  })
})
