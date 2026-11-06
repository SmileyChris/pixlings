// Sound and desktop notifications on every OS. Claude Code's own `$.audio.play` plays only on
// macOS (claude-code.d.ts: "a Linux or Windows terminal, having no player, plays nothing"), so
// Windows and Linux get a player of their own here. These builders are pure: they return the
// argv a host process runs.

export type Platform = 'mac' | 'windows' | 'wsl' | 'linux' | 'unknown'

export type Player = { kind: 'engine' } | { kind: 'argv'; argv: (path: string) => string[] } | { kind: 'none' }

const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`

export const POWERSHELL = 'powershell.exe'

// No `-ExecutionPolicy Bypass`: the policy governs script files, never `-Command`, and EDR tools flag it.
export const PS_FLAGS = ['-NoProfile', '-NonInteractive', '-Command'] as const

export const windowsPlayer = (path: string): string[] => [
  POWERSHELL,
  ...PS_FLAGS,
  `(New-Object System.Media.SoundPlayer ${psQuote(path)}).PlaySync()`,
]

/** The first Linux player found by `command -v`, as an argv builder. */
export const linuxPlayer = (found: string): Player => {
  const bin = found.trim().split('\n')[0]?.trim() ?? ''
  if (bin.endsWith('paplay') || bin.endsWith('pw-play')) return { kind: 'argv', argv: path => [bin, path] }
  if (bin.endsWith('aplay')) return { kind: 'argv', argv: path => [bin, '-q', path] }
  if (bin.endsWith('afplay')) return { kind: 'argv', argv: path => [bin, path] }
  return { kind: 'none' }
}

const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// PowerShell's own AppUserModelID: toasts under it show without registering an app.
const PS_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

export const windowsToast = (title: string, body: string): string[] => {
  const toast = `<toast><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(body)}</text></binding></visual><audio silent="true"/></toast>`
  const script = [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$x.LoadXml(${psQuote(toast)})`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${psQuote(PS_APP_ID)}).Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
  ].join('; ')
  return [POWERSHELL, ...PS_FLAGS, script]
}

const appleQuote = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export const macNotification = (title: string, body: string): string[] => [
  'osascript',
  '-e',
  `display notification ${appleQuote(body)} with title ${appleQuote(title)}`,
]

/**
 * Prints the id of the notification it raises (`-p`), and takes the place of `replaces`, the last
 * one's id, so unread notifications never stack.
 */
export const linuxNotification = (title: string, body: string, replaces?: string): string[] => [
  'notify-send',
  '--app-name=Pixlings',
  '--print-id',
  ...(replaces && /^\d+$/.test(replaces) ? [`--replace-id=${replaces}`] : []),
  '--',
  title,
  body,
]

/** The id `notify-send --print-id` printed; undefined when it printed none. */
export const notificationIdOf = (stdout: string): string | undefined => stdout.trim().split('\n')[0]?.match(/^\d+$/)?.[0]

export const notificationArgv = (platform: Platform, title: string, body: string, replaces?: string): string[] | null => {
  switch (platform) {
    case 'mac':
      return macNotification(title, body)
    case 'windows':
    case 'wsl':
      return windowsToast(title, body)
    case 'linux':
      return linuxNotification(title, body, replaces)
    case 'unknown':
      return null
  }
}

/** Reads `uname -sr` output into a platform. */
export const platformOfUname = (uname: string): Platform => {
  if (/darwin/i.test(uname)) return 'mac'
  if (/microsoft|wsl/i.test(uname)) return 'wsl'
  if (/linux|bsd/i.test(uname)) return 'linux'
  if (/mingw|msys|cygwin/i.test(uname)) return 'windows'
  return 'unknown'
}

/** Joins a plugin root and a relative asset path with the platform's separator. */
export const assetPath = (root: string, relative: string, platform: Platform): string => {
  const sep = platform === 'windows' || /^[A-Za-z]:\\/.test(root) ? '\\' : '/'
  return root.replace(/[\\/]+$/, '') + sep + relative.split('/').join(sep)
}

// Files and speech ------------------------------------------------------------------------------

/**
 * A process that writes its standard input, base64, to the file named by the `PIXLING_OUT`
 * environment variable: the engine's `$.fs.write` writes text, and a PNG is bytes.
 */
export const writeBytesArgv = (platform: Platform): string[] =>
  platform === 'windows'
    ? [
        POWERSHELL,
        ...PS_FLAGS,
        '[IO.File]::WriteAllBytes($env:PIXLING_OUT, [Convert]::FromBase64String([Console]::In.ReadToEnd()))',
      ]
    : ['sh', '-c', 'base64 --decode > "$PIXLING_OUT"']

/** Opens a file in the desktop's own viewer; null where there is none to reach. */
export const openArgv = (platform: Platform, path: string): string[] | null => {
  switch (platform) {
    case 'windows':
      return ['explorer.exe', path]
    case 'mac':
      return ['open', path]
    case 'linux':
      return ['xdg-open', path]
    case 'wsl':
    case 'unknown':
      return null
  }
}

/**
 * Speaks its standard input aloud in an English voice, through Windows' own synthesizer. Windows
 * PowerShell reads standard input in the OEM code page; the text arrives as UTF-8.
 */
export const windowsSpeech = (): string[] => [
  POWERSHELL,
  ...PS_FLAGS,
  [
    'try { [Console]::InputEncoding = [Text.Encoding]::UTF8 } catch {}',
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en*' } | Select-Object -First 1",
    'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }',
    '$s.Rate = 1',
    '$s.Speak([Console]::In.ReadToEnd())',
  ].join('; '),
]

/** The first Linux speaker found by `command -v`, as an argv builder taking the text. */
export const linuxSpeaker = (found: string): ((text: string) => string[]) | null => {
  const bin = found.trim().split('\n')[0]?.trim() ?? ''
  // `--` ends the options: a line that starts with "-" (a quip can) is said, never obeyed.
  if (bin.endsWith('spd-say')) return text => [bin, '--wait', '--', text]
  if (bin.endsWith('espeak-ng') || bin.endsWith('espeak')) return text => [bin, '--', text]
  return null
}

/** A line made fit to say: emoji, kaomoji and markup dropped, whitespace folded. */
export const speakable = (text: string): string =>
  text
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️/gu, '')
    .replace(/[*_`~<>[\]{}|\^]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A process that plays a WAV given on standard input as base64: the pixling's voice is made
 * fresh for every line, so there is no file of the mod's to play.
 */
export const wavPipeArgv = (platform: Platform, linuxPlayer = ''): string[] | null => {
  switch (platform) {
    case 'windows':
    case 'wsl':
      return [
        POWERSHELL,
        ...PS_FLAGS,
        '$b = [Convert]::FromBase64String([Console]::In.ReadToEnd()); (New-Object System.Media.SoundPlayer (New-Object System.IO.MemoryStream (,$b))).PlaySync()',
      ]
    case 'mac':
      return ['sh', '-c', 'd=$(mktemp -d) && base64 --decode > "$d/v.wav" && afplay "$d/v.wav"; rm -rf "$d"']
    case 'linux': {
      const bin = linuxPlayer.trim().split('\n')[0]?.trim() ?? ''
      if (!bin) return null
      const play = bin.endsWith('aplay') ? `"${bin}" -q` : `"${bin}"`
      return ['sh', '-c', `d=$(mktemp -d) && base64 --decode > "$d/v.wav" && ${play} "$d/v.wav"; rm -rf "$d"`]
    }
    case 'unknown':
      return null
  }
}
