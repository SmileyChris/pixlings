// Clicking a notification takes you back to the pixling's own pane.
//
// Under Ghostty a notification is Ghostty's own (the engine writes its notification sequence), and
// a click raises Ghostty's window and the tab that wrote it. Under zellij that Ghostty tab holds a
// whole zellij session, and the click never reaches zellij: it stays on whichever zellij tab was
// last shown. So the pixling listens on the session bus, where GNOME Shell's click reaches Ghostty
// as `ActivateAction("present-surface", <surface>)`, learns which surface its own notifications
// came from when Ghostty raises them (`AddNotification`, its default action's target), and on a
// click on that surface asks zellij to focus its pane. These are pure: the reader turns
// `dbus-monitor`'s text into events, the router decides when a click is ours.

export type ZellijPane = { session: string; pane: string }

/** The zellij pane the session runs in, from zellij's own variables; null outside zellij. */
export const zellijPaneOf = (session: string | undefined, pane: string | undefined): ZellijPane | null => {
  const s = session?.trim() ?? ''
  const p = pane?.trim() ?? ''
  return s && /^\d+$/.test(p) ? { session: s, pane: p } : null
}

/** Focuses the pane, switching zellij to its tab, from outside the session. */
export const focusPaneArgv = (p: ZellijPane): string[] => [
  'zellij',
  '--session',
  p.session,
  'action',
  'focus-pane-id',
  `terminal_${p.pane}`,
]

/** Ghostty's notifications raised and their clicks, as `dbus-monitor` prints them. */
export const BUS_MONITOR_ARGV = [
  'dbus-monitor',
  '--session',
  "type='method_call',interface='org.gtk.Notifications',member='AddNotification'",
  "type='method_call',interface='org.freedesktop.Application',member='ActivateAction'",
]

/** `shown`: Ghostty raised notification `id` (its text, as Ghostty names them) from `surface`. */
export type BusEvent = { kind: 'shown'; id: string; body: string; surface: string } | { kind: 'clicked'; surface: string }

type Reading =
  | { kind: 'none' }
  | { kind: 'add'; hasApp: boolean; id: string | null; key: string; body: string | null; surface: string | null }
  | { kind: 'activate'; isGhostty: boolean; isPresent: boolean }

const HEADER = /^(method call|signal|method return|error) /
const STRING = /^\s*(variant\s+)?string "(.*)"\s*$/
/** A string dbus-monitor printed over several lines (its text held a newline): its first line. */
const OPEN_STRING = /^\s*variant\s+string "(.*)$/
const UINT64 = /^\s*(?:variant\s+)?uint64 (\d+)\s*$/

/**
 * Reads `dbus-monitor` text, in pieces as it comes, into events. Each event is sent the moment its
 * last field is read: the monitor prints the next message only when the bus carries one, so
 * waiting for it would hold a click until the next notification.
 */
export const busReader = (): ((chunk: string) => BusEvent[]) => {
  let rest = ''
  let at: Reading = { kind: 'none' }
  const line = (text: string): BusEvent | null => {
    if (HEADER.test(text)) {
      at = / member=AddNotification$/.test(text)
        ? { kind: 'add', hasApp: false, id: null, key: '', body: null, surface: null }
        : / member=ActivateAction$/.test(text)
          ? { kind: 'activate', isGhostty: /destination=com\.mitchellh\.ghostty\b/.test(text), isPresent: false }
          : { kind: 'none' }
      return null
    }
    const str = STRING.exec(text)
    if (at.kind === 'activate') {
      if (!at.isGhostty) return null
      // The action's name, then its parameter: the surface to present.
      if (!at.isPresent) {
        if (str) at = str[2] === 'present-surface' ? { ...at, isPresent: true } : { kind: 'none' }
        return null
      }
      const surface = UINT64.exec(text)?.[1]
      if (!surface) return null
      at = { kind: 'none' }
      return { kind: 'clicked', surface }
    }
    if (at.kind !== 'add') return null
    if (str && !at.hasApp) {
      // The first string is the application's id; Ghostty's alone are read.
      at = str[2] === 'com.mitchellh.ghostty' ? { ...at, hasApp: true } : { kind: 'none' }
      return null
    }
    if (str && !str[1] && at.id === null) {
      // Then the notification's id, which a later one of the same id replaces.
      at.id = str[2] ?? ''
      return null
    }
    if (str && !str[1] && (str[2] === 'body' || str[2] === 'default-action-target')) {
      at.key = str[2]
      return null
    }
    if (at.key === 'body') {
      const body = str?.[1] ? str[2] : OPEN_STRING.exec(text)?.[1]
      if (body !== undefined) {
        at.body = body
        at.key = ''
      }
    } else if (at.key === 'default-action-target') {
      const surface = UINT64.exec(text)?.[1]
      if (surface) {
        at.surface = surface
        at.key = ''
      }
    }
    if (at.id === null || at.body === null || at.surface === null) return null
    const shown: BusEvent = { kind: 'shown', id: at.id, body: at.body, surface: at.surface }
    at = { kind: 'none' }
    return shown
  }
  return chunk => {
    const lines = (rest + chunk).split('\n')
    rest = lines.pop() ?? ''
    return lines.flatMap(text => {
      const event = line(text)
      return event ? [event] : []
    })
  }
}

/** The first line of a notification's text, all a reader needs to know it again. */
const firstLine = (text: string): string => text.split('\n')[0]?.trim() ?? ''

/** The last part of the session's folder; empty for none. */
export const folderOf = (cwd: string | undefined): string => (cwd ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''

/** A pixling notification's title: the pixling and the session's folder, which tells sessions apart. */
export const notificationTitle = (name: string, folder: string): string => `${name} · ${folder || 'Claude Code'}`

/**
 * How Ghostty shows a pixling's notification, any session's: its title, `<name> · <folder>`,
 * then `: ` and the body. Claude Code's own ("Claude Code: Claude is waiting…") has no dot.
 */
const PIXLING_NOTIFICATION = /^[^:\n]+ · [^:\n]+: /

/**
 * Knows the pixling notifications among those Ghostty raises, the session's own and every other
 * session's, keeping one per Ghostty tab (surface). A click names a surface, not a notification;
 * with one pixling notification on it, the click is that one's, and the session that sent it
 * focuses its pane. Notifications that are no pixling's (Claude Code's own "waiting for your
 * input", say) are left alone, and a click on them goes to the pane of that last pixling too.
 */
export const clickRouter = (keep = 20) => {
  const sent: { title: string; line: string }[] = []
  /** Per surface: the latest pixling notification's text, and the pixling notifications shown. */
  const latest = new Map<string, string>()
  const shown = new Map<string, string[]>()
  const isOurs = (body: string): boolean => sent.some(s => body.startsWith(`${s.title}: `) && body.includes(s.line))
  return {
    /** The pixling raised a notification of this title and text. */
    sent: (title: string, text: string): void => {
      const line = firstLine(text)
      if (!line) return
      sent.push({ title, line })
      if (sent.length > keep) sent.shift()
    },
    /** True when the event is a click on a surface whose latest pixling notification was ours. */
    read: (event: BusEvent): boolean => {
      if (event.kind === 'shown') {
        if (PIXLING_NOTIFICATION.test(event.body)) latest.set(event.surface, event.body)
        return false
      }
      const body = latest.get(event.surface)
      return body !== undefined && isOurs(body)
    },
    /**
     * The ids of the pixling notifications on its surface that this one, a pixling's, supersedes.
     * Every session keeps count, but only the one that sent it takes the others down.
     */
    superseded: (event: BusEvent): string[] => {
      if (event.kind !== 'shown' || !PIXLING_NOTIFICATION.test(event.body)) return []
      const old = (shown.get(event.surface) ?? []).filter(id => id !== event.id)
      shown.set(event.surface, [event.id])
      return isOurs(event.body) ? old : []
    },
  }
}

/** A GVariant string literal, as `gdbus call` reads its arguments. */
const gvariantString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Takes down one of Ghostty's notifications from the desktop's list. */
export const removeNotificationArgv = (id: string): string[] => [
  'gdbus',
  'call',
  '--session',
  '--dest',
  'org.gtk.Notifications',
  '--object-path',
  '/org/gtk/Notifications',
  '--method',
  'org.gtk.Notifications.RemoveNotification',
  'com.mitchellh.ghostty',
  gvariantString(id),
]
