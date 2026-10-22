import { describe, expect, mock } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

import { test } from './kit.ts'
import { ROOM_ID } from '../hooks/lib/room.ts'
import { SPECIES } from '../hooks/lib/sprites.ts'

/** Tests that mount on every surface, or run seconds of clock: slower when suites share the CPU. */
const LONG = 20_000

const NOON = Date.parse('2026-10-03T12:00:00Z')

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const BANDS = ['terminal', 'desktop'] as const

type Surface = (typeof SURFACES)[number]

/** The room as `/pixling room` opens it, seated `columns` cells wide. */
const pane = <S extends Surface>(surface: S, columns: number, isFocused = false) =>
  ({
    plugin: 'pixlings',
    surface,
    component: 'Pane',
    requestId: ROOM_ID,
    props: {
      title: 'Pixling',
      isFocused,
      bodyColumns: columns,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns, rows: 40 },
  }) as const

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

const printed = (command: string, args: string): string =>
  args === '' || args === 'card'
    ? 'Quackers the Duck, level 3. /pixling share saves its card.'
    : command === 'pixling' && args === 'dex'
      ? 'Pixledex: 2/15 species hatched.'
      : 'Quackers is wearing a party hat now.'

const card = (command: string, args: string) =>
  ({
    plugin: 'pixlings',
    component: 'CommandOutput',
    // What each printed: the card's line, the dex's count, or another answer.
    props: { command, args, text: printed(command, args), isErrored: false },
    viewport: { columns: 100, rows: 40 },
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
  stats: { testsPassed: 12, commits: 7, pets: 3 },
  dex: ['duck', 'cat', 'owl'],
  // Earned already, so no celebration holds the stage during a test.
  badges: { hello: 1, liftoff: 2 },
  streak: { last: '2026-10-03', days: 4, best: 6 },
  tics: { absolutelyRight: 24, robust: 3 },
}

/** What the engine draws where the pixling passes: the tests' stand-in, marked to be told apart. */
const ENGINE = { type: 'Box', props: {}, children: ['engine'] }

type Ran = { argv: readonly string[] }

/**
 * The engine beneath the pixling. `shared` answers the values other parts of the pixling write
 * (the persona, away, the squad); a key left out reads as the kit keeps it, never written.
 */
const host = (on: On, stored?: unknown, shared: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: NOON })
  const db = new Map<string, unknown>()
  if (stored !== undefined) db.set('pixling', stored)
  on('store.get', ($, e) => ({ value: db.get(e.key) }) as never)
  on('store.set', ($, e) => {
    db.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\tester' })
  const ran: Ran[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  const invalidated = { count: 0 }
  on('ui.invalidate', () => {
    invalidated.count += 1
    return { value: undefined } as never
  })
  /** Every repaint in place, by where and what it named. */
  const blits: { requestId: string; key: string }[] = []
  on('ui.blit', ($, e) => {
    blits.push({ requestId: e.requestId, key: e.key })
    return { value: {} } as never
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  /** Every drawing the engine was asked for beneath the pixling, as it was asked. */
  const asked: { requestId: string; props: unknown }[] = []
  on('ui.render', ($, e) => {
    asked.push({ requestId: e.requestId, props: e.props })
    return ENGINE as never
  })
  // A shared key stays what the test pins, but the pixling's own writes to it land (and are passed
  // over), so a compare-and-set writer such as `update` never spins on it.
  const versions: Record<string, number> = {}
  const isPinned = (e: { plugin: string; key: string }): boolean => e.plugin === 'pixlings' && Object.hasOwn(shared, e.key)
  on('state.get', ($, e, next) =>
    isPinned(e) ? ({ value: { value: shared[e.key], version: versions[e.key] ?? 1 } } as never) : next(e),
  )
  on('state.set', ($, e, next) => {
    if (!isPinned(e)) return next(e)
    const version = (versions[e.key] ?? 1) + 1
    versions[e.key] = version
    return { value: { isSet: true, version } } as never
  })
  return { clock, db, ran, asked, shared, invalidated, blits }
}

const start = async ($: { session: { start: (e: never) => Promise<unknown> } }, isInteractive = true): Promise<void> => {
  await $.session.start({ cwd: '/repo', surface: isInteractive ? 'terminal' : null, isInteractive } as never)
}

const sounds = (ran: Ran[]): string[] =>
  ran.flatMap(r => {
    const m = r.argv.join(' ').match(/sounds\\([\w-]+)\.wav/)
    return m ? [m[1] ?? ''] : []
  })

type Node = { type?: string; props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: unknown[] }

/** Every element of a drawn tree, outermost first. */
const elements = (tree: unknown): Node[] => {
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return [node, ...(node.children ?? []).flatMap(elements)]
}

const textOf = (tree: unknown): string =>
  typeof tree === 'string' ? tree : elements(tree).flatMap(n => (n.children ?? []).filter(c => typeof c === 'string')).join('\n')

/** The Box the surface shows only under the pointer: drawn `display: none`, revealed by hover. */
const hoverReveal = (tree: RenderElement): Node | undefined =>
  elements(tree).find(n => n.type === 'Box' && n.props?.['display'] === 'none' && (n.hover ?? (n.props?.['hover'] as Record<string, unknown> | undefined))?.['display'] === 'flex')

describe('the room', () => {
  test('shows the pixling big, its card and a pet Button on every surface', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(pane(surface, 100))
      const big = await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })
      expect(big, surface).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Svg' : 'Raster' }), surface).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'Quackers' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: ' Lv 3' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Duck ★ common/ }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /xp$/ }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /4-day streak \(best 6\) · 33 days together/ }), surface).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'pet' }), surface).toBeDefined()
      for (const tab of ['home', 'garden', 'badges']) expect(await ui.find({ type: 'Button', key: `tab-${tab}` }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  test('its tabs show the dex garden and the badge shelf, and come back home', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(pane(surface, 100))
      await ui.press({ key: 'tab-garden' })
      expect(await ui.find({ type: 'Text', text: `Dex garden · 3/${SPECIES.length} found` }), surface).toBeDefined()
      expect(await ui.findAll({ type: 'Text', text: '???' }), surface).toHaveLength(SPECIES.length - 3)
      expect(await ui.findAll({ type: surface === 'terminal' ? 'Raster' : 'Svg' }), surface).toHaveLength(SPECIES.length)
      expect((await ui.find({ type: 'Button', key: 'tab-garden' }))?.props['variant'], surface).toBe('primary')

      await ui.press({ key: 'tab-badges' })
      expect(await ui.find({ type: 'Text', text: 'Badge shelf · 2/16' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '🥚 Hello, World' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '🚀 Liftoff' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '🔒 14 still locked' }), surface).toBeDefined()
      // 24 of 25 heard: the nearest badge, its bar and what it takes.
      expect(await ui.find({ type: 'Text', text: 'Next: 🙄 Absolutely Right' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: ' 24/25' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Hear "You're absolutely right" 25 times/ }), surface).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'pet' }), surface).toBeUndefined()

      await ui.press({ key: 'tab-home' })
      expect(await ui.find({ type: 'Box', key: 'room-top' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Dex garden ·/ }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the pet Button pets it as /pixling pet does, and the room follows', { timeoutMs: LONG }, async ($, on) => {
    const { clock, db, ran } = host(on, DUCK)
    await start($)
    await clock.advance(10_000)
    const ui = await $.ui.mount(pane('vscode', 60))
    await ui.press({ key: 'pet' })
    await clock.advance(1000)
    expect(sounds(ran)).toContain('pet')
    expect((db.get('pixling') as { stats: { pets: number } }).stats.pets).toBe(4)
    // The pet's line is in the room's bubble.
    const bubble = elements(await ui.drawn()).find(n => n.type === 'Box' && n.props?.['borderStyle'] === 'round')
    expect(bubble).toBeDefined()
    // A rename elsewhere redraws the room on its own.
    await $.command.run({ command: 'pixling', args: 'name Sir Quacks' } as never)
    expect(await ui.find({ type: 'Text', text: 'Sir Quacks' })).toBeDefined()
    await ui.unmount()
  })

  test('it sits by its seat: side by side when wide, stacked on a phone or a slim pane', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    const seats: [Surface, number, 'row' | 'column'][] = [
      ['terminal', 100, 'row'],
      ['terminal', 40, 'column'],
      ['desktop', 100, 'row'],
      ['vscode', 48, 'row'],
      ['vscode', 38, 'column'],
      ['mobile', 36, 'column'],
    ]
    for (const [surface, columns, direction] of seats) {
      const ui = await $.ui.mount(pane(surface, columns))
      const label = `${surface} at ${columns}`
      expect((await ui.find({ type: 'Box', key: 'room-top' }))?.props['flexDirection'], label).toBe(direction)
      expect(((await ui.drawn()) as Node).props?.['width'], label).toBe(columns)
      const garden = await ui.find({ type: 'Button', key: 'tab-garden' })
      expect(garden?.props['label'], label).toBe(columns < 44 ? 'Garden' : 'Dex garden')
      if (surface !== 'terminal') {
        // The sprite shrinks with the seat; every picture fits in it.
        const svg = await ui.find({ type: 'Svg' })
        expect(Number(svg?.props['width']), label).toBeLessThanOrEqual(columns * 8)
      }
      await ui.unmount()
    }
  })

  test('on the home shelf the frame clock redraws it; on another shelf it rests', { timeoutMs: LONG }, async ($, on) => {
    const { clock, invalidated } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    const idle = invalidated.count
    await clock.advance(3000)
    // Nothing drawn that moves: no redraws asked for.
    expect(invalidated.count - idle).toBe(0)
    const ui = await $.ui.mount(pane('vscode', 48))
    const shown = invalidated.count
    await clock.advance(3000)
    expect(invalidated.count - shown).toBeGreaterThan(0)
    await ui.press({ key: 'tab-badges' })
    await clock.advance(31_000)
    const resting = invalidated.count
    await clock.advance(3000)
    expect(invalidated.count - resting).toBe(0)
    await ui.unmount()
  })

  // A redraw re-runs every hook of the plugin's, a heckled transcript's messages included: the
  // terminal's Raster is repainted in place instead, as the band's is.
  test('on the terminal the frame clock repaints the sprite in place, never redrawing the plugin', { timeoutMs: LONG }, async ($, on) => {
    const { clock, invalidated, blits } = host(on, DUCK)
    await start($)
    const ui = await $.ui.mount(pane('terminal', 100))
    await clock.advance(1000)
    const shown = invalidated.count
    const painted = blits.length
    await clock.advance(5000)
    expect(invalidated.count - shown).toBe(0)
    const repaints = blits.slice(painted)
    expect(repaints.length).toBeGreaterThan(0)
    expect(repaints.every(b => b.requestId === ROOM_ID && b.key === 'room-pixling')).toBe(true)
    await ui.press({ key: 'tab-badges' })
    await clock.advance(1000)
    const resting = blits.length
    await clock.advance(3000)
    expect(blits.length - resting).toBe(0)
    await ui.unmount()
  })

  test('a focused room on the terminal names its hotkeys', async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    const ui = await $.ui.mount(pane('terminal', 100, true))
    expect(await ui.find({ type: 'Text', text: 'h home · g garden · b badges · p pet' })).toBeDefined()
    expect((await ui.find({ type: 'Button', key: 'tab-badges' }))?.props['hotkey']).toBe('b')
    await ui.unmount()
  })

  test('shows the persona, the vitals, the helpers at work and the effect playing', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK, {
      persona: 'A rubber duck who listens more than it quacks',
      vitals: [{ text: '❄ cache cold', tone: 'cold' }],
      squad: [
        { agentId: 'a1', label: 'Explore the repo', speciesId: 'owl', startedAt: NOON, doneAt: null },
        { agentId: 'a2', label: 'Review', speciesId: 'cat', startedAt: NOON, doneAt: NOON + 1000 },
        { agentId: 'a3', label: 'Plan', speciesId: 'duck', startedAt: NOON, doneAt: null },
      ],
      isPlanning: true,
      effect: { kind: 'compactionSquish', at: NOON },
    })
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(pane(surface, 60))
      expect(await ui.find({ type: 'Text', text: 'A rubber duck who listens more than it quacks' }), surface).toBeDefined()
      expect((await ui.find({ type: 'Text', text: '❄ cache cold' }))?.props['color'], surface).toBe('#7fd3ff')
      expect(await ui.find({ type: 'Text', text: '👥 2 helpers working · 1 done' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '… Explore the repo (Owl)' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '✓ Review (Cat)' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '🧢 Thinking cap on: plan mode' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '✨ compaction squish' }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  test('away, it shows where it went and how to call it back', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK, { isAway: true })
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(pane(surface, 60))
      expect(await ui.find({ type: 'Text', text: '💤 Quackers is away.' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\/pixling on/ }), surface).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' }), surface).toBeUndefined()
      expect(await ui.find({ type: 'Button', key: 'pet' }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('before its egg hatches the room shows the egg, then the hatching, then the pixling', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on)
    for (const surface of SURFACES) {
      // No session yet: nothing has hatched.
      const ui = await $.ui.mount(pane(surface, 60))
      expect(await ui.find({ type: 'Text', text: 'An egg, not hatched yet.' }), surface).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'tab-home' }), surface).toBeUndefined()
      await ui.unmount()
    }
    await start($)
    await clock.advance(500)
    const hatching = await $.ui.mount(pane('mobile', 36))
    expect(await hatching.find({ type: 'Text', text: 'Hatching…' })).toBeDefined()
    await hatching.unmount()
    await clock.advance(8000)
    const hatched = await $.ui.mount(pane('mobile', 36))
    expect(await hatched.find({ type: 'Button', key: 'pet' })).toBeDefined()
    await hatched.unmount()
  })
})

describe('the band', () => {
  test('hovering it reveals a stat card: persona, streak, badges, days together, top tics', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK, { persona: 'A rubber duck who listens' })
    await start($)
    await clock.advance(3000)
    for (const surface of BANDS) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const tree = await ui.drawn()
      expect((tree as Node).props?.['key'], surface).toBe('band')
      const card = hoverReveal(tree)
      expect(card, surface).toBeDefined()
      expect(card?.props?.['position'], surface).toBe('absolute')
      // Laid over the info rows, it is filled so none of them show through its blank cells.
      expect(card?.props?.['backgroundColor'], surface).toBeDefined()
      const text = textOf(card)
      expect(text).toContain('A rubber duck who listens')
      expect(text).toContain('4-day streak')
      expect(text).toContain('best 6')
      expect(text).toContain('33 days together')
      expect(text).toContain('2/16')
      expect(text).toContain('Heard: "You\'re absolutely right" ×24 · "robust" ×3')
      // The flame and the badges are drawn as the pixling is, never as emoji.
      expect(/\p{Extended_Pictographic}/u.test(text), surface).toBe(false)
      const icons = elements(card).filter(n => n.type === (surface === 'terminal' ? 'Raster' : 'Svg'))
      expect(icons.length, surface).toBe(3)
      if (surface === 'terminal') {
        expect(icons.map(n => n.props?.['key'])).toEqual(['card-flame', 'card-badge-hello', 'card-badge-liftoff'])
      }
      // Never narrower than the info rows it lies over.
      const column = elements(tree).find(n => (n.children ?? []).includes(card as never))
      expect(Number(card?.props?.['width']), surface).toBeGreaterThanOrEqual(Number(column?.props?.['width']))
      // Not drawn until hovered: the plain band reads as before.
      expect(await ui.find({ type: 'Text', text: 'Quackers' }), surface).toBeDefined()
      await ui.unmount()
    }
    // On a wide terminal it opens past the info rows, over the band's empty right.
    const wide = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 160 }, viewport: { columns: 160, rows: 40 } })
    const wideTree = await wide.drawn()
    const opened = hoverReveal(wideTree)
    const column = elements(wideTree).find(n => (n.children ?? []).includes(opened as never))
    expect(Number(opened?.props?.['width'])).toBe(72)
    expect(Number(column?.props?.['width'])).toBe(56)
    await wide.unmount()
  })

  test('the one-line band reveals the same, on its line', { options: { band: 'minimal' }, timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of BANDS) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const tree = await ui.drawn()
      expect((tree as Node).props?.['key'], surface).toBe('band')
      const reveal = hoverReveal(tree)
      expect(textOf(reveal), surface).toContain('🔥 4-day streak · 🏅 2/16 · 33 days together')
      // Sized to the room the line leaves, so revealing it squeezes nothing on the line.
      const width = Number(reveal?.props?.['width'])
      expect(width, surface).toBeGreaterThanOrEqual(12)
      expect(width, surface).toBeLessThan(BAND.props.bodyColumns - 'Quackers · Lv 3'.length)
      expect(reveal?.props?.['flexShrink'], surface).toBe(0)
      await ui.unmount()
    }
  })

  for (const band of ['full', 'minimal'] as const) {
    test(`away, the ${band} band draws nothing of it`, { options: { band }, timeoutMs: LONG }, async ($, on) => {
      const { clock, shared } = host(on, DUCK, { isAway: false })
      await start($)
      await clock.advance(3000)
      for (const surface of BANDS) {
        shared['isAway'] = false
        const ui = await $.ui.mount({ ...BAND, surface })
        expect(await ui.find({ type: 'Text', text: 'Quackers' }), surface).toBeDefined()
        shared['isAway'] = true
        await ui.redraw()
        expect(await ui.drawn(), surface).toMatchObject(ENGINE)
        await ui.unmount()
      }
    })
  }

  test('/pixling off hides the band and the room, /pixling on brings them back', { timeoutMs: LONG }, async ($, on) => {
    const { clock, db } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ type: 'Text', text: 'Quackers' })).toBeDefined()
    await $.command.run({ command: 'pixling', args: 'off' } as never)
    expect(db.get('away')).toBe(true)
    await band.redraw()
    expect(await band.drawn()).toMatchObject(ENGINE)
    const room = await $.ui.mount(pane('terminal', 60))
    expect(await room.find({ type: 'Text', text: '💤 Quackers is away.' })).toBeDefined()
    await room.unmount()
    await $.command.run({ command: 'pixling', args: 'on' } as never)
    await band.redraw()
    expect(await band.find({ type: 'Text', text: 'Quackers' })).toBeDefined()
    await band.unmount()
  })
})

describe('the card', () => {
  test('/pixling shows the persona line when there is one', { timeoutMs: LONG }, async ($, on) => {
    const { clock, shared } = host(on, DUCK, {})
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const plain = await $.ui.mount({ ...card('pixling', ''), surface })
      expect(await plain.find({ type: 'Text', text: 'QUACKERS' }), surface).toBeDefined()
      expect(await plain.find({ type: 'Text', text: 'A rubber duck who listens' }), surface).toBeUndefined()
      await plain.unmount()
    }
    shared['persona'] = 'A rubber duck who listens'
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...card('pixling', 'card'), surface })
      const persona = await ui.find({ type: 'Text', text: 'A rubber duck who listens' })
      expect(persona?.props['italic'], surface).toBe(true)
      await ui.unmount()
    }
  })

  test('/buddy prints the pixling card; other /buddy rows are the engine own', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      for (const args of ['', 'card']) {
        const ui = await $.ui.mount({ ...card('buddy', args), surface })
        expect(await ui.find({ type: 'Text', text: 'QUACKERS' }), `${surface} /buddy ${args}`).toBeDefined()
        expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' }), `${surface} /buddy ${args}`).toBeDefined()
        await ui.unmount()
      }
      for (const args of ['dex', 'adopt']) {
        const ui = await $.ui.mount({ ...card('buddy', args), surface })
        expect(await ui.drawn(), `${surface} /buddy ${args}`).toMatchObject(ENGINE)
        await ui.unmount()
      }
    }
  })

  test("another subcommand's answer is drawn as printed, whatever arguments the row echoes", { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      for (const args of ['wear party', '']) {
        const ui = await $.ui.mount({
          ...card('pixling', args),
          props: { command: 'pixling', args, text: 'Quackers is wearing a party hat now.', isErrored: false },
          surface,
        })
        expect(await ui.drawn(), `${surface} /pixling ${args}`).toMatchObject(ENGINE)
        await ui.unmount()
      }
    }
  })

  test('away, the /pixling and /buddy cards are the engine own', { timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK, { isAway: true })
    await start($)
    await clock.advance(3000)
    // Hatched and loaded, so the engine's own card below is the away rule's doing.
    const home = await $.ui.mount(pane('terminal', 60))
    expect(await home.find({ type: 'Text', text: '💤 Quackers is away.' })).toBeDefined()
    await home.unmount()
    for (const surface of SURFACES) {
      for (const command of ['pixling', 'buddy']) {
        const ui = await $.ui.mount({ ...card(command, ''), surface })
        expect(await ui.drawn(), `${surface} /${command}`).toMatchObject(ENGINE)
        await ui.unmount()
      }
    }
  })
})

describe('a long persona', () => {
  /** An adopted Buddy's personality: up to 280 characters, line breaks and all. */
  const BUDDY = (
    'Barnacle, a patient old axolotl who regrows broken builds overnight, hums while the tests run,\n' +
    'and has never once said the word robust. '
  )
    .repeat(3)
    .slice(0, 280)
  const HEAD = /^Barnacle, a patient old axolotl who regrows broken builds overnight, hums while/

  /** The persona as drawn: one line, cut short with an ellipsis, never the whole 280. */
  const expectCut = (line: string | undefined, where: string): void => {
    expect(line, where).toMatch(HEAD)
    expect(line, where).not.toContain('\n')
    expect([...(line ?? '')].length, where).toBeLessThanOrEqual(100)
    expect(line?.endsWith('…'), where).toBe(true)
  }

  test('is cut to one short line in the room, the card and the band', { timeoutMs: LONG }, async ($, on) => {
    expect(BUDDY.length).toBe(280)
    const { clock } = host(on, DUCK, { persona: BUDDY })
    await start($)
    await clock.advance(3000)
    for (const surface of SURFACES) {
      const room = await $.ui.mount(pane(surface, 60))
      expectCut((await room.find({ type: 'Text', text: HEAD }))?.text, `${surface} room`)
      await room.unmount()
      const shown = await $.ui.mount({ ...card('pixling', ''), surface })
      expectCut((await shown.find({ type: 'Text', text: HEAD }))?.text, `${surface} card`)
      await shown.unmount()
    }
    for (const surface of BANDS) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const first = textOf(hoverReveal(await ui.drawn())).split('\n')[0]
      expectCut(first, `${surface} band`)
      await ui.unmount()
    }
  })
})

describe('the heckle', () => {
  const RIGHT = "You're absolutely right! The test was wrong, not the code."
  const message = (surface: 'terminal' | 'desktop', requestId: string, text: string) =>
    ({
      plugin: 'pixlings',
      surface,
      component: 'AssistantMessage',
      requestId,
      props: { text, isFirstOfReply: true },
    }) as const

  test('off (the default), a message is the engine own, untouched', async ($, on) => {
    const { clock, asked } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of BANDS) {
      const ui = await $.ui.mount(message(surface, `off-${surface}`, RIGHT))
      expect(await ui.drawn(), surface).toMatchObject(ENGINE)
      expect(asked.find(a => a.requestId === `off-${surface}`)?.props, surface).toEqual({ text: RIGHT, isFirstOfReply: true })
      await ui.unmount()
    }
  })

  test('on, the engine draws the message as received, then a faint eye roll and the running count', { options: { heckle: true }, timeoutMs: LONG }, async ($, on) => {
    const { clock, asked } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    for (const surface of BANDS) {
      const ui = await $.ui.mount(message(surface, `on-${surface}`, RIGHT))
      const tree = (await ui.drawn()) as Node
      expect(tree.children?.[0], surface).toMatchObject(ENGINE)
      // The props passed on are the ones the engine raised: the stored message is not touched.
      expect(asked.filter(a => a.requestId === `on-${surface}`).map(a => a.props), surface).toEqual([{ text: RIGHT, isFirstOfReply: true }])
      const roll = await ui.find({ type: 'Text', text: /^\(¬_¬\) #\d+$/ })
      expect(roll?.props['dimColor'], surface).toBe(true)
      await ui.unmount()
    }
  })

  test('the count goes on from what it had heard, and a message keeps its number', { options: { heckle: true }, timeoutMs: LONG }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    const count = async (ui: { find: (q: { type: string; text: RegExp }) => Promise<{ text: string } | undefined> }) =>
      (await ui.find({ type: 'Text', text: /^\(¬_¬\) #/ }))?.text
    // It had heard it 24 times: the next is the 25th.
    const first = await $.ui.mount(message('terminal', 'm1', RIGHT))
    expect(await count(first)).toBe('(¬_¬) #25')
    const second = await $.ui.mount(message('desktop', 'm2', `Ah. You are absolutely correct about the cache.`))
    expect(await count(second)).toBe('(¬_¬) #26')
    await first.redraw()
    expect(await count(first)).toBe('(¬_¬) #25')
    await first.unmount()
    // Drawn again from scratch (scrolled away and back): the same number.
    const again = await $.ui.mount(message('terminal', 'm1', RIGHT))
    expect(await count(again)).toBe('(¬_¬) #25')
    await again.unmount()
    await second.unmount()
  })

  test('sent away, the spinner, the turn word, the dex and the heckle are the engine own', { options: { heckle: true }, timeoutMs: LONG }, async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    const { clock, asked } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    await $.turn.start({ text: 'go', turnId: 't' } as never)
    const spinner = { plugin: 'pixlings', surface: 'terminal', component: 'Spinner', props: { word: 'Working', message: null, suffix: '', mode: 'responding' } } as const
    const turn = { plugin: 'pixlings', surface: 'terminal', component: 'TurnDuration', props: { word: 'Worked', durationMs: 4000 } } as const
    const wordOf = (requestId: string) => (asked.filter(a => a.requestId === requestId).at(-1)?.props as { word?: string } | undefined)?.word

    // Here, it lends the spinner and the turn its words, heckles, and draws the dex.
    const s1 = await $.ui.mount({ ...spinner, requestId: 'spin-here' })
    expect(wordOf('spin-here')).not.toBe('Working')
    await s1.unmount()
    const t1 = await $.ui.mount({ ...turn, requestId: 'turn-here' })
    expect(wordOf('turn-here')).not.toBe('Worked')
    await t1.unmount()
    const m1 = await $.ui.mount(message('terminal', 'here', RIGHT))
    expect(await m1.find({ type: 'Text', text: /^\(¬_¬\) #/ })).toBeDefined()
    await m1.unmount()
    const d1 = await $.ui.mount({ ...card('pixling', 'dex'), surface: 'terminal' })
    expect(await d1.drawn()).not.toMatchObject(ENGINE)
    await d1.unmount()

    await $.command.run({ command: 'pixling', args: 'off' } as never)
    const s2 = await $.ui.mount({ ...spinner, requestId: 'spin-away' })
    expect(wordOf('spin-away')).toBe('Working')
    await s2.unmount()
    const t2 = await $.ui.mount({ ...turn, requestId: 'turn-away' })
    expect(wordOf('turn-away')).toBe('Worked')
    await t2.unmount()
    const m2 = await $.ui.mount(message('terminal', 'away', RIGHT))
    expect(await m2.drawn()).toMatchObject(ENGINE)
    await m2.unmount()
    const d2 = await $.ui.mount({ ...card('pixling', 'dex'), surface: 'terminal' })
    expect(await d2.drawn()).toMatchObject(ENGINE)
    await d2.unmount()
  })

  test('on, a message without the tic is the engine own', { options: { heckle: true } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await start($)
    await clock.advance(3000)
    const ui = await $.ui.mount(message('terminal', 'plain', 'Here is the plan: `you are absolutely right` stays in code.'))
    expect(await ui.drawn()).toMatchObject(ENGINE)
    await ui.unmount()
  })
})
