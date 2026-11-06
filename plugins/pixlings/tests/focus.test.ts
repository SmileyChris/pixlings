import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUS_MONITOR_ARGV, busReader, clickRouter, focusPaneArgv, folderOf, notificationTitle, removeNotificationArgv, zellijPaneOf } from '../hooks/lib/focus.ts'
import { linuxNotification, notificationIdOf } from '../hooks/lib/platform.ts'

// What `dbus-monitor` printed on GNOME 49 with Ghostty 1.3.1: a notification Ghostty raised, then
// GNOME Shell's click on it.
const SHOWN = `method call time=1793743311.156689 sender=:1.147 -> destination=org.gtk.Notifications serial=159 path=/org/gtk/Notifications; interface=org.gtk.Notifications; member=AddNotification
   string "com.mitchellh.ghostty"
   string "Quackers · Claude Code: Claude finished after 2m."
   array [
      dict entry(
         string "title"
         variant             string "Ghostty"
      )
      dict entry(
         string "body"
         variant             string "Quackers · Claude Code: Claude finished after 2m."
      )
      dict entry(
         string "priority"
         variant             string "normal"
      )
      dict entry(
         string "default-action"
         variant             string "app.present-surface"
      )
      dict entry(
         string "default-action-target"
         variant             uint64 93855776765104
      )
   ]
`

const CLICKED = `method call time=1793743317.655011 sender=:1.12 -> destination=com.mitchellh.ghostty serial=23440 path=/com/mitchellh/ghostty; interface=org.freedesktop.Application; member=ActivateAction
   string "present-surface"
   array [
      variant          uint64 93855776765104
   ]
   array [
      dict entry(
         string "activation-token"
         variant             string "gnome-shell//5419-31-host_TIME93786246"
      )
   ]
`

const read = (text: string, pieces = 1) => {
  const reader = busReader()
  const size = Math.ceil(text.length / pieces)
  const events = []
  for (let i = 0; i < text.length; i += size) events.push(...reader(text.slice(i, i + size)))
  return events
}

describe('clicking a notification focuses the pane', () => {
  test('zellij pane from its variables', () => {
    expect(zellijPaneOf('gracious-clarinet', '10')).toEqual({ session: 'gracious-clarinet', pane: '10' })
    expect(zellijPaneOf(undefined, '10')).toBeNull()
    expect(zellijPaneOf('s', '')).toBeNull()
    expect(zellijPaneOf('s', 'terminal_3')).toBeNull()
    expect(focusPaneArgv({ session: 's', pane: '3' })).toEqual(['zellij', '--session', 's', 'action', 'focus-pane-id', 'terminal_3'])
  })

  test('reads the notification Ghostty raised and the click on it', () => {
    expect(read(SHOWN + CLICKED)).toEqual([
      { kind: 'shown', id: 'Quackers · Claude Code: Claude finished after 2m.', body: 'Quackers · Claude Code: Claude finished after 2m.', surface: '93855776765104' },
      { kind: 'clicked', surface: '93855776765104' },
    ])
  })

  test('a click is read at once, not when the next message comes', () => {
    const reader = busReader()
    reader(SHOWN)
    expect(reader(CLICKED.split('\n').slice(0, 4).join('\n') + '\n')).toEqual([{ kind: 'clicked', surface: '93855776765104' }])
  })

  test('pieces split mid-line read the same', () => {
    expect(read(SHOWN + CLICKED, 17)).toEqual(read(SHOWN + CLICKED))
  })

  test("another app's notification and another action are passed over", () => {
    const other = SHOWN.replace('string "com.mitchellh.ghostty"', 'string "org.gnome.Nautilus"')
    const action = CLICKED.replace('"present-surface"', '"new-window"')
    const elsewhere = CLICKED.replace('destination=com.mitchellh.ghostty', 'destination=org.gnome.Nautilus')
    expect(read(other + action + elsewhere)).toEqual([])
  })

  test('a body over several lines is known by its first', () => {
    const multi = SHOWN.replace(
      'variant             string "Quackers · Claude Code: Claude finished after 2m."',
      'variant             string "Quackers · Claude Code: first\nsecond"',
    )
    expect(read(multi)[0]).toMatchObject({ kind: 'shown', body: 'Quackers · Claude Code: first', surface: '93855776765104' })
  })

  test('the click is ours only when our notification was the latest from that surface', () => {
    const router = clickRouter()
    const surface = '7'
    expect(router.read({ kind: 'clicked', surface })).toBe(false)
    router.sent('Quackers · Claude Code', 'Claude finished after 2m.')
    router.read({ kind: 'shown', id: 'a', surface, body: 'Quackers · Claude Code: Claude finished after 2m.' })
    expect(router.read({ kind: 'clicked', surface })).toBe(true)
    expect(router.read({ kind: 'clicked', surface: '8' })).toBe(false)
    // Claude Code's own notification is no pixling's: a click on it still comes here.
    router.read({ kind: 'shown', id: 'b', surface, body: 'Claude Code: Claude is waiting for your input' })
    expect(router.read({ kind: 'clicked', surface })).toBe(true)
    // Another session's pixling in the same Ghostty tab notified since: the click is its.
    router.read({ kind: 'shown', id: 'c', surface, body: 'Spooky · Claude Code: Claude finished after 5m.' })
    expect(router.read({ kind: 'clicked', surface })).toBe(false)
  })

  test('one pixling notification per Ghostty tab: the session that sent the new one takes down the rest', () => {
    const mine = clickRouter()
    const theirs = clickRouter()
    const shown = (id: string, body: string, surface = '7') =>
      [mine, theirs].map(r => r.superseded({ kind: 'shown', id, surface, body }))
    mine.sent('Quackers · pixlings', 'Claude finished after 2m.')
    expect(shown('a', 'Quackers · pixlings: Claude finished after 2m.')).toEqual([[], []])
    // Claude Code's own is left alone; another Ghostty tab is counted apart.
    expect(shown('x', 'Claude Code: Claude is waiting for your input')).toEqual([[], []])
    expect(shown('o', 'Quackers · other: Claude finished after 1m.', '8')).toEqual([[], []])
    theirs.sent('Quackers · web', 'Claude needs your permission to use Bash')
    expect(shown('b', 'Quackers · web: Claude needs your permission to use Bash')).toEqual([[], ['a']])
    mine.sent('Quackers · pixlings', 'Claude finished after 3m.')
    expect(shown('c', 'Quackers · pixlings: Claude finished after 3m.')).toEqual([['b'], []])
    // The same text again is the same id: Ghostty replaces it itself.
    expect(shown('c', 'Quackers · pixlings: Claude finished after 3m.')).toEqual([[], []])
  })

  test('the title names the pixling and the session\'s folder', () => {
    expect(notificationTitle('Quackers', folderOf('/home/chris/dev/lab/pixlings'))).toBe('Quackers · pixlings')
    expect(notificationTitle('Quackers', folderOf('C:\\work\\site\\'))).toBe('Quackers · site')
    expect(notificationTitle('Quackers', folderOf(undefined))).toBe('Quackers · Claude Code')
  })

  test('the take-down names the id as a GVariant string', () => {
    expect(removeNotificationArgv('say "hi" \\ bye').at(-1)).toBe('"say \\"hi\\" \\\\ bye"')
  })

  test('notify-send replaces the last notification by its id', () => {
    expect(linuxNotification('T', 'b')).toEqual(['notify-send', '--app-name=Pixlings', '--print-id', '--', 'T', 'b'])
    expect(linuxNotification('T', '-b', '42')).toEqual(['notify-send', '--app-name=Pixlings', '--print-id', '--replace-id=42', '--', 'T', '-b'])
    expect(notificationIdOf('42\n')).toBe('42')
    expect(notificationIdOf('')).toBeUndefined()
  })
})

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

/** A Linux session in a zellij pane under Ghostty, the session bus fed by the test. */
const linux = (on: On, channel: string | null) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  mock.store(on, { pixling: DUCK })
  mock.env(on, { TERM_PROGRAM: 'ghostty', ZELLIJ_SESSION_NAME: 'gracious-clarinet', ZELLIJ_PANE_ID: '10' })
  const ran: string[] = []
  const notified: string[] = []
  const spawned: string[] = []
  const bus: string[] = []
  let wake = (): void => undefined
  on('process.run', ($, e) => {
    ran.push(e.argv.join(' '))
    const stdout = e.argv[0] === 'uname' ? 'Linux 6.6.158-1-MANJARO' : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('process.spawn', async function* ($, e) {
    spawned.push(e.argv.join(' '))
    for (;;) {
      const text = bus.shift()
      if (text === undefined) await new Promise<void>(resolve => (wake = resolve))
      else yield { stream: 'stdout' as const, text }
    }
  })
  on('ui.notify', ($, e) => {
    notified.push(e.text)
    return { value: channel ? { isSent: true, channel } : { isSent: false, reason: 'no-channel' } } as never
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.Notification', () => ({}))
  const send = (text: string): void => {
    bus.push(text)
    wake()
  }
  return { clock, ran, notified, spawned, send }
}

describe('under Ghostty and zellij', () => {
  test('the notification is Ghostty\'s, and its click focuses the zellij pane', async ($, on) => {
    const { clock, ran, notified, spawned, send } = linux(on, 'ghostty')
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    expect(spawned).toEqual([BUS_MONITOR_ARGV.join(' ')])
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await clock.advance(10)
    expect(notified).toEqual(['Claude needs your permission to use Bash'])
    expect(ran.some(r => r.startsWith('notify-send'))).toBe(false)
    const focus = focusPaneArgv({ session: 'gracious-clarinet', pane: '10' }).join(' ')
    send(SHOWN.replaceAll('Quackers · Claude Code: Claude finished after 2m.', 'Quackers · repo: Claude needs your permission to use Bash'))
    await clock.advance(10)
    expect(ran).not.toContain(focus)
    send(CLICKED)
    await clock.advance(10)
    expect(ran).toContain(focus)
    // The next one takes the first down from the desktop's list.
    await $.classic.Notification({ message: 'Claude needs your permission to use Edit', notification_type: 'permission_prompt' })
    await clock.advance(10)
    send(SHOWN.replaceAll('Quackers · Claude Code: Claude finished after 2m.', 'Quackers · repo: Claude needs your permission to use Edit'))
    await clock.advance(10)
    expect(ran).toContain(removeNotificationArgv('Quackers · repo: Claude needs your permission to use Bash').join(' '))
  })

  test('a channel that is not Ghostty\'s falls back to notify-send', async ($, on) => {
    const { clock, ran, notified } = linux(on, null)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await clock.advance(10)
    expect(notified.length).toBe(1)
    expect(ran.some(r => r.startsWith('notify-send'))).toBe(true)
  })
})
