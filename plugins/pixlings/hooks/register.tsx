import { atom, read, update } from 'claude-code'
import type { Elements, PromptOrigin, Register, Timer } from 'claude-code'

import type { PixlingsBubble, PixlingsCache, PixlingsEffect, PixlingsMini, PixlingsNap, PixlingsVital, PixlingsView } from '../types'
import type { PixlingsPersona } from '../types'
import { award, BADGES, countDay, earnedBadges, localDate, recapLine, touchDay } from './lib/badges.ts'
import { bandRows, FACES, formFor, isBandSize, QUOTE_INSET, layoutInfo, lineSpeech, pickForm, pictureOf, walkScale } from './lib/band.ts'
import type { Form, Part } from './lib/band.ts'
import { baseMood, holdFor, moodNow, PRIORITY, react, speak } from './lib/brain.ts'
import type { Bubble, Held } from './lib/brain.ts'
import { adopt, cleanName, companionOf, configPath, speciesNamed } from './lib/buddy.ts'
import type { Companion } from './lib/buddy.ts'
import { CARD_BG, CARD_SCALE, renderCard, shareText } from './lib/card.ts'
import { blank, CANVAS_W, HATCH_MS, layoutFor, MINI_LEAVE_MS, MINI_POOF_MS, miniTint, renderFrame, renderHatch, renderSilhouette, samePixels, SPRITE_X, SQUAD_CAP, squadWidth } from './lib/canvas.ts'
import type { Face, Hat, Icon, MiniView, Mood, Pixels } from './lib/canvas.ts'
import { blockingWindow, clockTime, formatDuration, iconFor, isTestCommand, linesWritten, riskOf, runsGitCommit, testOutcome } from './lib/detect.ts'
import type { LimitWindow, Risk } from './lib/detect.ts'
import { say } from './lib/lines.ts'
import type { LineKey, Slots } from './lib/lines.ts'
import {
  assetPath,
  linuxPlayer,
  linuxSpeaker,
  notificationArgv,
  openArgv,
  platformOfUname,
  speakable,
  windowsPlayer,
  wavPipeArgv,
  windowsSpeech,
  writeBytesArgv,
} from './lib/platform.ts'
import type { Platform, Player } from './lib/platform.ts'
import { encodePng } from './lib/png.ts'
import { mayQuip, quipOf, quipRequest, tokensOf } from './lib/quips.ts'
import type { QuipFacts, QuipKind, QuipReply, QuipRequest } from './lib/quips.ts'
import {
  bump,
  daysTogether,
  gain,
  gearOf,
  hatchPixling,
  isUnreadable,
  levelOf,
  mergeSave,
  rehatch,
  revive,
  UNLOCKS,
  xpBar,
} from './lib/progress.ts'
import type { Day, Pixling, Stats, XpEvent } from './lib/progress.ts'
import { base64, rasterOf, toSvg } from './lib/raster.ts'
import { isWalking, newWalker, roamRange, walk } from './lib/roam.ts'
import type { RoamMode, Walker } from './lib/roam.ts'
import { CARD_MAX, ROOM_EGG_KEY, ROOM_SPRITE_KEY, briefLine, cardModel, drawCard, drawRoom, personaLine, seatOf, tabOf } from './lib/room.ts'
import type { RoomActions, RoomKit, RoomModel } from './lib/room.ts'
import { RARITY_COLOR, RARITY_STARS, SPECIES, speciesById } from './lib/sprites.ts'
import type { Species } from './lib/sprites.ts'
import { addTics, isEyeRoll, ticsIn, topTics } from './lib/tics.ts'
import type { Tic } from './lib/tics.ts'
import {
  applyKnownTtl,
  decodeTtl,
  encodeTtl,
  freshCache,
  guardDecision,
  hitPercent,
  modelLabel,
  observe,
  remainingMs,
  tokens,
  turnQuota,
  vitals,
} from './lib/vitals.ts'
import { animalese, durationMs, wavOf } from './lib/voice.ts'
import type { Cache, QuotaDelta, RequestUsage, StoredTtl, Ttl } from './lib/vitals.ts'

/** The elements the band and the card share across surfaces. */
type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

const view = atom({ plugin: 'pixlings', key: 'view' } as const, null as PixlingsView | null)
const bubbleAtom = atom({ plugin: 'pixlings', key: 'bubble' } as const, null as PixlingsBubble)
const napAtom = atom({ plugin: 'pixlings', key: 'nap' } as const, null as PixlingsNap)
const hatchAtom = atom({ plugin: 'pixlings', key: 'hatchAt' } as const, null as number | null)
const moodAtom = atom({ plugin: 'pixlings', key: 'mood' } as const, 'idle')
const vitalsAtom = atom({ plugin: 'pixlings', key: 'vitals' } as const, [] as PixlingsVital[])
const cacheAtom = atom({ plugin: 'pixlings', key: 'cache' } as const, null as PixlingsCache)

const STORE_KEY = 'pixling'
/** Where a save this version cannot read is copied before the session runs without saving. */
const BACKUP_KEY = 'pixlingBackup'
const SEEN_KEY = 'lastSeen'
const TTL_KEY = 'cacheTtl'
/** How the card's text and the dex's begin and end: what their output rows are told apart by. */
const CARD_END = '/pixling share saves its card.'
const DEX_START = 'Pixledex: '
/** Whether the terminal drew images last time: a band starts from it rather than the fallback. */
const IMAGES_KEY = 'hasImages'
/** The cache warning comes this long before it expires, and only over a context worth saving. */
const COOLING_WARN_MS = 60_000
const MIN_WARN_CONTEXT = 20_000
const RASTER_KEY = 'pixling'
/** The band's picture of the pixling, where the terminal draws images. */
const IMAGE_KEY = 'pixling-image'
/**
 * A transparent cell beside a band that would be a picture where the terminal draws images: the
 * frame clock blits it to learn when it can, as the engine says so only once it has asked.
 */
const PROBE_KEY = 'pixling-probe'
const PROBE_PNG = base64(encodePng(blank(1, 1), 1, null))
/** How the engine's refusal starts when an Image draws its alt: the terminal draws no images. */
const ALT_DENY = 'the Image draws its alt here'
const FRAME_MS = 100
const DOZE_AFTER_MS = 15 * 60_000
const LONG_TURN_MS = 45_000
// An edit this many lines long is worth a quip, when quips are on.
const BIG_DIFF_LINES = 150
const NAP_RETRY_MS = 20 * 60_000
const NAP_GRACE_MS = 20_000
/** Past this a nap's conversation is stale: the reset is announced, Claude is not continued. */
const NAP_MAX_AGE_MS = 6 * 3_600_000
/** Continue prompts tried when no reset time can be read (an API key's limits are unreported). */
const NAP_MAX_RETRIES = 3
/** A reset further off than this is a weekly one: its time is given with the day. */
const FAR_RESET_MS = 20 * 3_600_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const CONTINUE_PROMPT =
  'The usage limit has reset. Please continue the task you were working on where you left off.'
const RETRY_LINE = 'Trying again, in case the limit has reset...'
const MAYBE_LINE = 'The limit may have reset by now.'
const GIVE_UP_LINE = "I can't tell when the limit resets. Send a message when you're ready."
const HATCH_LABEL = 'Hatch a new egg'

/** Prompts no person sent: another plugin's, a background task's, a schedule's, another agent's. */
const NOT_THE_PERSON: ReadonlySet<PromptOrigin['kind']> = new Set<PromptOrigin['kind']>([
  'plugin',
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'coordinator',
  'observer',
  'observer-activity',
  'unclassified',
])

const TONE_COLOR: Readonly<Record<PixlingsVital['tone'], string | undefined>> = {
  good: '#6fdc8c',
  warn: '#ffc53d',
  bad: '#ff5f5f',
  cold: '#7fd3ff',
  dim: undefined,
}

/** The hover card's fill and ink: its own pair, readable whatever the terminal's colors are. */
const CARD_FILL = '#1a1b26'
const CARD_FILL_PX = parseInt(CARD_FILL.slice(1), 16)
const CARD_INK = '#c0caf5'
/** The card's rows: its border, who it is, the badge shelf (icons of 7 pixels, 4 rows) and what it heard. */
const CARD_ROWS = 8

const isTtl = (value: unknown): value is Ttl => value === '5m' || value === '1h'

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

type Reaction = {
  mood?: Mood
  priority: number
  holdMs?: number
  line?: LineKey
  slots?: Slots
  /** A line said as written, in place of one picked for `line`. */
  text?: string
  /** Shown after the line in the bubble but not said aloud: a quip's token cost. */
  suffix?: string
  sound?: string
  /** Plays under the "important" sound setting too, and wins over a held mood. */
  isImportant?: boolean
  notify?: string
}

type GitOperation = {
  commit?: { sha: string; branch?: string }
  push?: { branch: string }
  pr?: { number: number; action: string }
}

/**
 * The side effects the pixling needs, bound once per load in `session.start`. Mods spell `$`
 * only at its call sites, so the logic below talks to the engine through these closures.
 */
type Io = {
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => Timer
  setView: (value: PixlingsView) => Promise<void>
  setBubble: (value: PixlingsBubble) => Promise<void>
  setNap: (value: PixlingsNap) => Promise<void>
  setHatchAt: (value: number | null) => Promise<void>
  setMood: (value: Mood) => Promise<void>
  /** The saved pixling as the store holds it now, which another session may have written. */
  load: () => Promise<unknown>
  save: (value: Pixling) => Promise<void>
  backup: (value: unknown) => Promise<void>
  /** The conversation's id; null when it cannot be read. */
  sessionId: () => Promise<string | null>
  run: (argv: string[], timeoutMs: number) => Promise<string>
  playAsset: (asset: string) => Promise<void>
  toast: (text: string, timeoutMs: number) => void
  invalidate: () => void
  blit: (requestId: string, key: string, cells: string) => Promise<boolean>
  /** Swaps a keyed Image's PNG (base64); why not when refused. */
  blitImage: (requestId: string, key: string, png: string) => Promise<string | undefined>
  /** Remembers whether the terminal draws images, for the next load to start from. */
  saveImages: (value: boolean) => Promise<void>
  usage: () => Promise<readonly LimitWindow[]>
  submit: (text: string) => Promise<void>
  setVitals: (value: PixlingsVital[]) => Promise<void>
  setCache: (value: Cache) => Promise<void>
  /** The TTL with when it was learned and from where (encodeTtl), as the store keeps it. */
  saveTtl: (stored: StoredTtl) => Promise<void>
  /** The prompt box's draft: a person typing is about to reply anyway. */
  draft: () => Promise<string>
  /** macOS's own voice, through the engine. */
  speak: (text: string) => Promise<void>
  pipe: (argv: string[], stdin: string, timeoutMs: number) => Promise<void>
}

export const register: Register = (on, options) => {
  const soundMode = String(options['sound'] ?? 'all')
  const bandMode = String(options['band'] ?? 'full')
  const bandSize = isBandSize(bandMode) ? bandMode : 'full'
  const chatter = String(options['chatter'] ?? 'normal')
  const wantsNotifications = options['notifications'] !== false
  const wantsAutoContinue = options['autoContinue'] !== false
  const wantsVitals = options['vitals'] !== false
  const wantsCacheWarning = options['cacheWarning'] !== false
  const ttlSetting = String(options['cacheTtl'] ?? 'auto')
  const wantsRoam = options['roam'] !== false
  const voiceMode = String(options['voice'] ?? 'animalese')

  // The engine's clock is the one timers run on; Date.now() is synced to it every second so
  // reading the time stays synchronous (a frame is drawn ten times a second).
  let clockOffset = 0
  let ticks = 0
  const now = (): number => Date.now() + clockOffset
  const syncClock = async (port: Io): Promise<void> => {
    clockOffset = (await port.now()) - Date.now()
  }

  // Everything below lives as long as this load of the module; a hot reload starts it over,
  // while the pixling itself is in $.store and the band's values in $.state.
  let io: Io | null = null
  let pixling: Pixling | null = null
  let platform: Platform = 'unknown'
  let player: Player = { kind: 'none' }
  let soundRoot = ''
  let held: Held | null = null
  let bubble: Bubble | null = null
  let bubbleId = 0
  let base: Mood = 'idle'
  let baseSince = 0
  let isWorking = false
  let icon: { icon: Icon; until: number } | null = null
  let lastActivity = 0
  let hatchAt: number | null = null
  let nap: PixlingsNap = null
  let napTimer: Timer | null = null
  let napRetries = 0
  /** Counts cancellations: a wake that is still on its way checks it before it says continue. */
  let napEpoch = 0
  /** The band drawing a live sprite (half blocks or a picture), by its request; the frame clock repaints it. */
  let bandId: string | null = null
  /** How the band last drew the pixling; null before it has. */
  let bandForm: Form | null = null
  /** The terminal draws images: learned from the probe, lost when a picture draws its alt. */
  let hasImages = false
  /** The band holding the probe, by its request. */
  let probeId: string | null = null
  let lastFrame: Pixels | null = null
  let svgSeenAt = 0
  let lastInvalidate = 0
  /** The room's sprite as a terminal shows it, by its key: the frame clock repaints it in place. */
  let roomSprite: { key: string; columns: number; rows: number; cells: string } | null = null
  let lastSoundAt = 0
  let lastTest: 'pass' | 'fail' | null = null
  let lastFailed: number | null = null
  let turnVerb: string | null = null
  let turnPast: string | null = null
  let lastLimitAt = 0
  let petsToday = 0
  let saidLateNight = ''
  let warnedWindows = new Set<string>()
  let lastMoodShown: Mood = 'idle'
  let saveTimer: Timer | null = null
  let cache: Cache = freshCache()
  let isTtlPinned = false
  let contextPercent: number | null = null
  let limits: readonly LimitWindow[] = []
  let warnedCacheAt: number | null = null
  let lastVitals = ''
  let walker: Walker | null = null
  let bandColumns = 0
  let speaker: ((text: string) => string[]) | null = null
  let lastSpokenAt = 0
  let voicePipe: string[] | null = null
  let voiceUntil = 0
  /**
   * Nobody watches: a `-p` run, or an SDK run with no surface attached. Nothing is shown, played
   * or said, and stats still count. An SDK host that draws (the desktop app, VS Code) attaches a
   * surface, at the start or later, and the session is watched from then on.
   */
  let isQuiet = false
  /** The pixling as this session loaded or last wrote it: what its own changes are counted from. */
  let savedAs: Pixling | null = null
  /** The store holds a save this version cannot read: it is left alone, nothing is written. */
  let isReadOnly = false
  let saving: Promise<void> = Promise.resolve()
  /** The conversation a nap fell asleep in, and when: it continues only that one, and not late. */
  let napSession: string | null = null
  let napSince = 0

  const species = (): Species => (pixling && speciesById(pixling.species)) || SPECIES[0]!

  // Persistence ---------------------------------------------------------------------------

  const persist = (): void => {
    if (!io || saveTimer || isReadOnly) return
    const port = io
    saveTimer = port.after(400, () => {
      saveTimer = null
      void checkBadges()
      void commit()
    })
  }

  /**
   * Saves by folding what this session changed into what the store holds now, since another
   * terminal may have saved meanwhile. One save at a time; a save this version cannot read is
   * never written over.
   */
  const commit = (): Promise<void> => {
    saving = saving.then(writeSave).catch(() => undefined)
    return saving
  }

  const writeSave = async (): Promise<void> => {
    const port = io
    if (!port || !pixling || isReadOnly) return
    const raw = await port.load()
    if (isUnreadable(raw)) {
      await readOnly(raw)
      return
    }
    const ours = pixling
    const stored = revive(raw)
    const merged = stored ? mergeSave(stored, savedAs, ours) : ours
    await port.save(merged)
    savedAs = merged
    const shown = pixling
    // What changed while the write was out is carried over onto what was written.
    pixling = shown === ours ? merged : mergeSave(merged, ours, shown)
    if (viewKey(pixling) !== viewKey(shown)) await publishView()
  }

  const viewKey = (p: Pixling): string => `${p.species}|${p.isShiny}|${p.name}|${p.xp}|${p.hat}|${p.face}`

  /** A save this version cannot read (a newer version's, or damaged): copied aside, left alone. */
  const readOnly = async (raw: unknown): Promise<void> => {
    const port = io
    if (!port || isReadOnly) return
    isReadOnly = true
    await port.backup(raw).catch(() => undefined)
    toast(`Pixlings can't read its save (a newer version's?). It is left as it was, a copy kept as "${BACKUP_KEY}"; nothing is saved this session.`, 12_000)
  }

  const toast = (text: string, timeoutMs: number): void => {
    if (io && !isQuiet && !isAway) io.toast(text, timeoutMs)
  }

  const publishView = async (): Promise<void> => {
    if (!io || !pixling) return
    const { level, into, need } = levelOf(pixling.xp)
    const { hat, face } = gearOf(pixling)
    await io.setView({
      name: pixling.name,
      speciesId: pixling.species,
      isShiny: pixling.isShiny,
      level,
      xpInto: into,
      xpNeed: need,
      hat,
      face,
    })
    await publishPersona()
  }

  // Sound and notifications ---------------------------------------------------------------

  const play = (id: string, isImportant = false): void => {
    const port = io
    if (!port || isQuiet || isAway || soundMode === 'off' || (soundMode === 'important' && !isImportant)) return
    lastSoundAt = now()
    const asset = `sounds/${id}.wav`
    port.after(0, () => {
      const playing =
        player.kind === 'engine'
          ? port.playAsset(asset)
          : player.kind === 'argv'
            ? port.run(player.argv(assetPath(soundRoot, asset, platform)), 20_000)
            : Promise.resolve()
      // No player on this machine: the pixling stays silent rather than noisy.
      void Promise.resolve(playing).catch(() => undefined)
    })
  }

  const notify = (body: string): void => {
    const port = io
    if (!port || isQuiet || isAway || !wantsNotifications || !pixling) return
    const argv = notificationArgv(platform, `${pixling.name} · Claude Code`, body)
    if (!argv) return
    port.after(0, () => {
      void port.run(argv, 15_000).catch(() => undefined)
    })
  }

  /**
   * The line said in the pixling's own voice: synthesized for this line and played from memory.
   * Chatter never talks over a sound that means something, nor over itself.
   */
  const chirp = (text: string): void => {
    const port = io
    const argv = voicePipe
    if (!port || !argv || soundMode !== 'all') return
    const at = now()
    if (at - lastSoundAt < 1500 || at < voiceUntil) return
    const pcm = animalese(text, species().voice)
    if (pcm.length === 0) return
    voiceUntil = at + durationMs(pcm) + latency()
    const wav = base64(wavOf(pcm))
    port.after(0, () => {
      void port.pipe(argv, wav, 20_000).catch(() => undefined)
    })
  }

  /** Reads a line aloud with the system voice; false when there is no voice to read it. */
  const speakLine = (text: string, delayMs: number): boolean => {
    const port = io
    if (!port || soundMode === 'off') return true
    const at = now()
    if (at - lastSpokenAt < 4000) return true
    const line = speakable(text)
    const reader = speaker
    const speaking: (() => Promise<unknown>) | null =
      platform === 'mac'
        ? () => port.speak(line)
        : platform === 'windows' || platform === 'wsl'
          ? () => port.pipe(windowsSpeech(), line, 20_000)
          : reader
            ? () => port.run(reader(line), 20_000)
            : null
    if (!speaking || !line) return false
    lastSpokenAt = at
    port.after(delayMs, () => {
      void Promise.resolve()
        .then(speaking)
        .catch(() => undefined)
    })
    return true
  }

  const voice = (text: string, priority: number, hasSound: boolean, isImportant: boolean): void => {
    if (voiceMode === 'off' || isQuiet || isAway) return
    if (voiceMode === 'speech') {
      // Under the "important" sound setting only what matters is read aloud.
      if (soundMode === 'important' && !isImportant) return
      if (priority >= PRIORITY.done && speakLine(text, hasSound ? 800 : 0)) return
    }
    if (!hasSound) chirp(text)
  }

  // Expression ----------------------------------------------------------------------------

  const currentMood = (at: number): { mood: Mood; since: number } => {
    const nextBase = baseMood({
      isSleeping: nap !== null,
      isWorking,
      isDozing: at - lastActivity > DOZE_AFTER_MS,
    })
    if (nextBase !== base) {
      base = nextBase
      baseSince = at
    }
    return moodNow(held, base, baseSince, at)
  }

  const syncMinimal = async (): Promise<void> => {
    if (!io || bandForm?.kind !== 'line') return
    const { mood } = currentMood(now())
    if (mood !== lastMoodShown) {
      lastMoodShown = mood
      await io.setMood(mood)
    }
  }

  const express = async (r: Reaction): Promise<void> => {
    const port = io
    if (!port || !pixling) return
    const at = now()
    if (r.mood) {
      const next = react(held, { mood: r.mood, priority: r.priority, holdMs: r.holdMs ?? 3000 }, at)
      if (next) held = next
      else if (!r.isImportant) return
    }
    if ((r.line || r.text) && (chatter !== 'quiet' || r.priority >= PRIORITY.testFail)) {
      const text = r.text ?? (r.line ? say(r.line, { name: pixling.name, ...r.slots }, pixling.species, Math.random) : '')
      const shown = r.suffix ? `${text}${r.suffix}` : text
      const spoken = speak(bubble, shown, r.priority, holdFor(shown), at)
      if (spoken) {
        bubble = spoken
        bubbleId += 1
        const id = bubbleId
        await port.setBubble({ text: shown, id })
        voice(text, r.priority, r.sound !== undefined, r.isImportant === true)
        port.after(spoken.until - at, () => {
          if (bubbleId === id) {
            bubble = null
            void port.setBubble(null)
          }
        })
      }
    }
    if (r.sound) play(r.sound, r.isImportant)
    if (r.notify) notify(r.notify)
    await syncMinimal()
  }

  const grant = async (event: XpEvent, stat?: keyof Stats): Promise<void> => {
    if (!io || !pixling) return
    const { pixling: next, levelUp } = gain(stat ? bump(pixling, stat) : pixling, event)
    pixling = next
    persist()
    await publishView()
    if (levelUp) {
      const unlock = levelUp.unlocks[levelUp.unlocks.length - 1]
      await express({
        mood: 'celebrate',
        priority: PRIORITY.celebrate,
        holdMs: 3500,
        line: unlock ? 'unlock' : 'levelUp',
        slots: { level: levelUp.level, item: unlock?.label },
        sound: 'levelup',
      })
      // A tall hat makes the band taller: redraw at the new size.
      io.invalidate()
    }
  }

  const count = (stat: keyof Stats): void => {
    if (pixling) {
      pixling = bump(pixling, stat)
      persist()
    }
  }

  const tally = (field: Exclude<keyof Day, 'date' | 'xp'>): void => {
    if (pixling) {
      pixling = countDay(pixling, field)
      persist()
    }
  }

  const isHatching = (at: number): boolean => hatchAt !== null && at - hatchAt < HATCH_MS + 2600

  const checkBadges = async (): Promise<void> => {
    const port = io
    if (!port || !pixling || isHatching(now())) return
    const { pixling: next, earned } = award(pixling, now())
    const [first] = earned
    if (!first) return
    // Saved by the persist that called this, right after.
    pixling = next
    await express({
      mood: 'celebrate',
      priority: PRIORITY.celebrate,
      holdMs: 3500,
      line: 'badge',
      slots: { item: `${first.emoji} ${first.name}` },
      sound: 'badge',
    })
    const more = earned.length > 1 ? ` (+${earned.length - 1} more)` : ''
    toast(`🏅 Badge: ${first.emoji} ${first.name}, ${first.how.toLowerCase()}${more}. See /pixling badges`, 8000)
  }

  /** The pixling's first look at today: moves the streak, and hands back yesterday's work once. */
  const greetDay = (): Day | null => {
    if (!pixling) return null
    const day = touchDay(pixling, now())
    pixling = day.pixling
    if (day.isNewDay) persist()
    return day.recap
  }

  /** Yesterday's work in the bubble, and the streak in a toast. */
  const showRecap = async (recap: Day, priority: number): Promise<void> => {
    if (!pixling) return
    await express({ mood: 'happy', priority, holdMs: 7000, line: 'recap', slots: { label: recapLine(recap, localDate(now())) } })
    const streak = pixling.streak.days
    if (streak >= 2) toast(`🔥 Day ${streak} in a row with ${pixling.name}. Keep it going!`, 7000)
  }

  const touch = async (): Promise<void> => {
    const at = now()
    const away = at - lastActivity
    lastActivity = at
    if (away > DOZE_AFTER_MS && !nap) {
      await express({ mood: 'happy', priority: PRIORITY.ambient, line: 'welcomeBack', slots: { dur: formatDuration(away) } })
    }
  }

  // Frames --------------------------------------------------------------------------------

  const frameAt = (at: number): Pixels => {
    const s = species()
    const p = pixling
    const { hat, face } = p ? gearOf(p) : { hat: null, face: null }
    if (p && hatchAt !== null && at - hatchAt < HATCH_MS + 2600) {
      return renderHatch(
        { species: s, isShiny: p.isShiny, mood: 'celebrate', t: Math.max(0, at - hatchAt), hat, face },
        RARITY_COLOR[s.rarity],
      )
    }
    const { mood, since } = currentMood(at)
    const activeIcon = icon && at < icon.until ? icon.icon : null
    const range = rangeNow()
    const w = walker
    const isStepping = w !== null && isWalking(w) && (mood === 'idle' || mood === 'working')
    const { shown, hidden } = squadAt(at)
    return renderFrame({
      species: s,
      isShiny: p?.isShiny ?? false,
      mood: isStepping ? 'walk' : mood,
      t: isStepping ? at : at - since,
      hat,
      face,
      icon: activeIcon,
      width: CANVAS_W + range,
      x: SPRITE_X + Math.min(w?.x ?? range, range),
      isFlipped: isStepping ? (w?.isFlipped ?? false) : false,
      hasCap: isPlanning,
      isSweating: contextPercent !== null && contextPercent >= SWEAT_AT,
      squishT: compactingSince === null ? null : at - compactingSince,
      reliefT: relievedAt === null ? null : at - relievedAt,
      squad: shown,
      hidden,
    })
  }

  /** The canvas's height in the pixling's gear: a tall hat adds headroom. */
  const canvasH = (): number => layoutFor(species(), pixling ? gearOf(pixling).hat : null).h

  /**
   * Canvas pixels to a column of the band as it draws (`walkScale`); 0 where it does not walk.
   * Before the band has drawn, the sizes that start as half blocks walk.
   */
  const walkScaleNow = (): number =>
    bandForm ? walkScale(bandForm, canvasH()) : bandSize === 'full' || bandSize === 'compact' ? 1 : 0

  /**
   * Pixels the pixling may walk: the band's columns past the canvas and the speech bubble, in the
   * canvas's pixels. The squad's strip is taken out of it first, so minis widen the band only once
   * that runs out.
   */
  const rangeNow = (): number => {
    const scale = walkScaleNow()
    if (!wantsRoam || bandMode === 'off' || scale === 0 || isHatching(now())) return 0
    return Math.round(Math.max(0, roamRange(bandColumns) - squadColumns(now())) * scale)
  }

  const roam = (at: number): void => {
    const range = rangeNow()
    if (!walker) walker = newWalker(range, at)
    const { mood } = currentMood(at)
    const isHeld = held !== null && at < held.until
    const mode: RoamMode = nap || mood === 'sleep' || isHeld || compactingSince !== null ? 'stay' : isWorking ? 'home' : 'wander'
    // A step is a column of the band, however many pixels that is.
    walker = walk(walker, range, mode, at, Math.random, Math.max(1, Math.round(walkScaleNow())))
  }

  // Vitals --------------------------------------------------------------------------------

  const refreshVitals = async (at: number): Promise<void> => {
    const port = io
    if (!port || !wantsVitals) return
    const pieces = vitals({ cache, now: at, isWorking, contextPercent, limits, model, effort, turnDelta })
    const key = pieces.map(v => `${v.text}:${v.tone}`).join('|')
    if (key !== lastVitals) {
      lastVitals = key
      await port.setVitals(pieces)
    }
  }

  /** A minute before the cache expires over a sizable context, the pixling taps the glass. */
  const warnCooling = async (at: number): Promise<void> => {
    const port = io
    const left = remainingMs(cache, at)
    if (!port || !wantsCacheWarning || isWorking || nap || left === null || left <= 0 || left > COOLING_WARN_MS) return
    if (cache.lastAt === warnedCacheAt || cache.context < MIN_WARN_CONTEXT) return
    warnedCacheAt = cache.lastAt
    const draft = await port.draft().catch(() => '')
    if (draft.trim() !== '') return
    await express({
      mood: 'attention',
      priority: PRIORITY.commit,
      holdMs: 5000,
      line: 'cacheCooling',
      slots: { dur: formatDuration(left) },
      sound: 'clock',
    })
  }

  /** What one main-thread request taught: the cache's state, and the model's verbal tics. */
  const afterStep = async (usage: RequestUsage | null, answer: string, sentAt: number): Promise<void> => {
    const port = io
    if (!port || !pixling) return
    if (usage) {
      const { cache: seen, news } = observe(cache, usage, sentAt, isTtlPinned)
      cache = seen
      await port.setCache(cache)
      if (news?.kind === 'learned') {
        await port.saveTtl(encodeTtl(news.ttl, sentAt, 'learned')).catch(() => undefined)
        await express({
          priority: PRIORITY.ambient,
          line: 'cacheLearned',
          slots: { item: news.ttl === '1h' ? 'an hour' : 'five minutes' },
        })
      } else if (news?.kind === 'cold') {
        // A full miss overturned a stored hour: what the store says is wrong, and is replaced.
        if (news.relearned) await port.saveTtl(encodeTtl(news.relearned, sentAt, 'learned')).catch(() => undefined)
        count('coldStarts')
        await express({
          mood: 'sad',
          priority: PRIORITY.commit,
          holdMs: 2600,
          line: 'cacheCold',
          slots: { n: tokens(news.rewritten), dur: formatDuration(news.gapMs) },
          sound: 'freeze',
        })
      }
    }
    if (answer) await hearTics(answer)
  }

  const hearTics = async (text: string): Promise<void> => {
    if (!pixling) return
    const found = ticsIn(text)
    const kinds = Object.keys(found) as Tic[]
    if (kinds.length === 0) return
    pixling = { ...pixling, tics: addTics(pixling.tics, found) }
    persist()
    const roll = kinds.find(isEyeRoll)
    if (!roll) return
    await express({
      mood: 'unimpressed',
      priority: PRIORITY.commit,
      holdMs: 2600,
      line: roll,
      slots: { n: pixling.tics[roll] ?? 1 },
      sound: 'eyeroll',
    })
  }

  // The terminal's room repaints its sprite in place, as the band does: a redraw would re-run
  // every hook of this plugin's on what it drew, a heckled transcript's messages too. A new size
  // is the one redraw, after which the room says what it shows again.
  const paintRoom = async (port: Io, t: number): Promise<void> => {
    const sprite = roomSprite
    if (!sprite) return
    const raster = rasterOf(roomFrame(t))
    if (raster.cells === sprite.cells) return
    if (raster.columns !== sprite.columns || raster.rows !== sprite.rows) {
      roomSprite = null
      port.invalidate()
      return
    }
    roomSprite = { ...sprite, cells: raster.cells }
    if (!(await port.blit(ROOM_ID, sprite.key, raster.cells))) roomSprite = null
  }

  /** The frame as the band's picture: a PNG, base64, sized to the form's cells. */
  const pictureSource = (frame: Pixels, form: { columns: number; rows: number }): string => {
    const { pixels, scale } = pictureOf(frame, form)
    return base64(encodePng(pixels, scale, null))
  }

  /** Asks whether the terminal draws images now; once it does, the band redraws as a picture. */
  const probeImages = async (port: Io, requestId: string): Promise<void> => {
    const deny = await port.blitImage(requestId, PROBE_KEY, PROBE_PNG)
    if (deny === undefined) {
      hasImages = true
      probeId = null
      await port.saveImages(true)
      port.invalidate()
    } else if (!deny.startsWith(ALT_DENY)) probeId = null
  }

  const tick = async (): Promise<void> => {
    const port = io
    if (!port || !pixling) return
    ticks += 1
    if (ticks % 10 === 0) await syncClock(port)
    const t = now()
    if (ticks % 10 === 1) {
      // The warning is its own setting: neither the vitals row nor the band turns it off.
      await refreshVitals(t)
      await warnCooling(t)
    }
    await paintRoom(port, t)
    if (probeId && ticks % 10 === 5) await probeImages(port, probeId)
    if (bandForm?.kind === 'line') {
      await syncMinimal()
      return
    }
    roam(t)
    const frame = frameAt(t)
    if (samePixels(lastFrame, frame)) return
    const hasResized = lastFrame !== null && (lastFrame.h !== frame.h || lastFrame.w !== frame.w)
    lastFrame = frame
    if (hasResized) {
      port.invalidate()
      return
    }
    if (bandId && bandForm?.kind === 'cells' && bandForm.rows * 2 >= frame.h) {
      const isShown = await port.blit(bandId, RASTER_KEY, rasterOf(frame).cells)
      if (!isShown) bandId = null
    } else if (bandId && bandForm?.kind === 'image') {
      const deny = await port.blitImage(bandId, IMAGE_KEY, pictureSource(frame, bandForm))
      if (deny?.startsWith(ALT_DENY)) {
        // The terminal draws none after all: the size's fallback, and the probe again.
        hasImages = false
        await port.saveImages(false)
        port.invalidate()
      }
      if (deny) bandId = null
    }
    // Surfaces without Raster draw an SVG: redraw them a few times a second.
    if (t - svgSeenAt < 30_000 && t - lastInvalidate > 280) {
      lastInvalidate = t
      port.invalidate()
    }
  }

  // Hatching ------------------------------------------------------------------------------

  // PowerShell takes about half a second to start playing; start the animation with the sound.
  const latency = (): number => (platform === 'windows' || platform === 'wsl' ? 450 : 80)

  const hatch = async (): Promise<void> => {
    const port = io
    if (!port) return
    const egg = pixling ? rehatch(pixling, Math.random, now()) : hatchPixling(Math.random, now())
    pixling = touchDay(bump(egg, 'sessions'), now()).pixling
    await commit()
    const s = species()
    const tier = s.rarity === 'legendary' ? 3 : s.rarity === 'rare' || s.rarity === 'epic' ? 2 : 1
    play(`hatch-${tier}`, true)
    hatchAt = now() + latency()
    held = null
    await port.setHatchAt(hatchAt)
    await publishView()
    port.after(latency() + 4400, () => {
      void (async () => {
        await express({ mood: 'celebrate', priority: PRIORITY.hatch, holdMs: 3000, line: 'hatch' })
        const shiny = pixling?.isShiny ? ' ✦ SHINY!' : ''
        toast(`${RARITY_STARS[s.rarity]} ${s.rarity.toUpperCase()}: a ${s.name} hatched!${shiny}  Try /pixling`, 8000)
      })()
    })
  }

  // Rate-limit nap ------------------------------------------------------------------------

  const armWake = (at: number): void => {
    if (!io) return
    napTimer?.cancel()
    napTimer = io.after(Math.max(1000, at - now()), () => {
      void wake()
    })
  }

  /** "14:00", or "Thu 14:00" for a reset more than 20 hours off (a weekly limit). */
  const resetTime = (at: number): string =>
    at - now() > FAR_RESET_MS ? `${WEEKDAYS[new Date(at).getDay()] ?? ''} ${clockTime(at)}` : clockTime(at)

  const fallAsleep = async (): Promise<void> => {
    const port = io
    const at = now()
    if (!port || nap || at - lastLimitAt < 3000) return
    lastLimitAt = at
    let resetsAt: number | null = null
    let kind = 'five_hour'
    try {
      const window = blockingWindow(await port.usage(), at)
      resetsAt = window?.resetsAt ?? null
      kind = window?.kind ?? kind
    } catch {
      // Usage unreadable: nap on a retry timer instead.
    }
    // A continue prompt that ran into the limit again: the same nap, gone on quietly.
    const isRetry = napRetries > 0
    held = null
    if (isRetry && resetsAt === null && napRetries >= NAP_MAX_RETRIES) {
      napRetries = 0
      await express({ mood: 'sleep', priority: PRIORITY.limit, holdMs: 4000, text: GIVE_UP_LINE })
      return
    }
    const wakeAt = resetsAt !== null ? resetsAt + NAP_GRACE_MS : at + NAP_RETRY_MS * Math.min(4, 1 + napRetries)
    // A reset days off (a weekly limit) is announced when it comes; the conversation is stale by then.
    const isAuto = wantsAutoContinue && !isQuiet && !isAway && (resetsAt === null || resetsAt - at <= NAP_MAX_AGE_MS)
    nap = { until: resetsAt, isAuto, kind }
    napSince = at
    napSession = await port.sessionId()
    await port.setNap(nap)
    const time = resetsAt !== null ? resetTime(resetsAt) : null
    await express({
      priority: PRIORITY.limit,
      line: time !== null ? 'limit' : 'limitUnknown',
      slots: { time },
      sound: 'sleep',
      isImportant: !isRetry,
      notify: isRetry
        ? undefined
        : time === null
          ? 'Usage limit hit.'
          : isAuto
            ? `Usage limit hit. I'll wake Claude at ${time}.`
            : `Usage limit hit. It resets: ${time}.`,
    })
    if (!isRetry) {
      count('naps')
      await grant('nap')
    }
    armWake(wakeAt)
  }

  const wake = async (): Promise<void> => {
    const port = io
    if (!port || !nap) return
    const asleep = nap
    // A timer's own moment: the next one is armed from it.
    await syncClock(port)
    if (nap !== asleep) return
    const at = now()
    // A reset is claimed only once the limits, read again, no longer block.
    const windows = await port.usage().catch((): readonly LimitWindow[] => [])
    // The person spoke (or the conversation ended) while the limits were read: nothing to wake.
    if (nap !== asleep) return
    const still = blockingWindow(windows, at)
    if (still && still.resetsAt !== null) {
      nap = { ...asleep, until: still.resetsAt, kind: still.kind, isAuto: asleep.isAuto && still.resetsAt - at <= NAP_MAX_AGE_MS }
      await port.setNap(nap)
      armWake(still.resetsAt + NAP_GRACE_MS)
      return
    }
    const isSure = asleep.until !== null || (windows.length > 0 && !still)
    const epoch = napEpoch
    nap = null
    napTimer = null
    await port.setNap(null)
    // Only into the conversation that hit the limit, and only while it is fresh.
    const isSameConversation = (await port.sessionId()) === napSession
    const shouldContinue = asleep.isAuto && isSameConversation && at - napSince <= NAP_MAX_AGE_MS
    if (isSure) {
      napRetries = 0
      await express({
        mood: 'attention',
        priority: PRIORITY.wake,
        holdMs: 4000,
        line: 'wake',
        sound: 'wake',
        isImportant: true,
        notify: shouldContinue ? 'Limit reset. Claude is back at work.' : 'Your usage limit has reset.',
      })
    } else {
      // No reset time was ever read (an API key's limits go unreported): a quiet try, not news.
      napRetries += 1
      await express({ mood: 'attention', priority: PRIORITY.wake, holdMs: 4000, text: shouldContinue ? RETRY_LINE : MAYBE_LINE, sound: 'wake' })
    }
    // A prompt, a /clear or a resume that came while it woke up still cancels the continue.
    if (shouldContinue && napEpoch === epoch) {
      // A session that cannot take a prompt now keeps the reminder in the bubble.
      await port.submit(CONTINUE_PROMPT).catch(() => undefined)
    }
  }

  const cancelNap = async (): Promise<void> => {
    napRetries = 0
    napEpoch += 1
    if (!io || !nap) return
    napTimer?.cancel()
    napTimer = null
    nap = null
    napRetries = 0
    await io.setNap(null)
  }

  // Reactions to shell work ---------------------------------------------------------------

  const reactRisk = async (risk: Risk): Promise<void> => {
    count('risky')
    await express({
      mood: 'alarmed',
      priority: risk.level === 'danger' ? PRIORITY.alarm : PRIORITY.testFail,
      holdMs: 3500,
      line: risk.level,
      slots: { label: risk.label },
      sound: risk.level === 'danger' ? 'alarm' : 'spicy',
      isImportant: risk.level === 'danger',
    })
  }

  const afterTests = async (output: string, isError: boolean): Promise<void> => {
    const outcome = testOutcome(output, isError)
    if (outcome.status === 'fail') {
      lastFailed = outcome.failed
      count('testsFailed')
      await express({
        mood: 'sad',
        priority: PRIORITY.testFail,
        holdMs: 4200,
        line: 'testFail',
        slots: { failed: outcome.failed },
        sound: 'fail',
      })
      maybeQuip('testFail', { failed: outcome.failed })
    } else if (lastTest === 'fail') {
      count('bugsSquashed')
      tally('squashed')
      await express({
        mood: 'celebrate',
        priority: PRIORITY.celebrate,
        holdMs: 3500,
        line: 'bugSquashed',
        slots: { failed: lastFailed ?? 'all' },
        sound: 'squash',
      })
      await grant('bugSquashed', 'testsPassed')
    } else {
      await express({
        mood: 'happy',
        priority: PRIORITY.testPass,
        holdMs: 2600,
        line: 'testPass',
        slots: { passed: outcome.passed },
        sound: 'pass',
      })
      await grant('testPass', 'testsPassed')
    }
    if (outcome.status === 'pass') tally('tests')
    lastTest = outcome.status
  }

  const afterGit = async (command: string, git: GitOperation | undefined): Promise<void> => {
    if (git?.pr && (git.pr.action === 'created' || git.pr.action === 'merged')) {
      const isMerged = git.pr.action === 'merged'
      await express({
        mood: 'celebrate',
        priority: PRIORITY.celebrate,
        holdMs: 3500,
        line: isMerged ? 'prMerged' : 'prCreated',
        slots: { pr: git.pr.number },
        sound: isMerged ? 'squash' : 'levelup',
      })
      await grant(isMerged ? 'prMerged' : 'prCreated', 'prs')
    } else if (git?.push) {
      await express({ mood: 'happy', priority: PRIORITY.commit, line: 'push', slots: { branch: git.push.branch }, sound: 'push' })
      await grant('push', 'pushes')
    } else if (git?.commit || runsGitCommit(command)) {
      await express({ mood: 'happy', priority: PRIORITY.commit, line: 'commit', sound: 'commit' })
      tally('commits')
      await grant('commit', 'commits')
    }
  }

  // Session -------------------------------------------------------------------------------

  /** Finds out where the session runs and how to play sound there; nothing plays when it can't. */
  const detectPlatform = async (port: Io, os: string | undefined, root: string): Promise<void> => {
    try {
      platform = os === 'Windows_NT' ? 'windows' : platformOfUname(await port.run(['uname', '-sr'], 5000))
      await choosePlayer(port, root)
    } catch {
      player = { kind: 'none' }
    }
  }

  const choosePlayer = async (port: Io, root: string): Promise<void> => {
    soundRoot = root
    voicePipe = wavPipeArgv(platform)
    if (platform === 'mac') {
      player = { kind: 'engine' }
    } else if (platform === 'windows') {
      player = { kind: 'argv', argv: windowsPlayer }
    } else if (platform === 'wsl') {
      soundRoot = (await port.run(['wslpath', '-w', root], 5000)).trim()
      player = soundRoot ? { kind: 'argv', argv: windowsPlayer } : { kind: 'none' }
    } else if (platform === 'linux') {
      const found = await port.run(['sh', '-c', 'command -v paplay || command -v pw-play || command -v aplay'], 5000)
      player = linuxPlayer(found)
      voicePipe = wavPipeArgv(platform, found)
      if (voiceMode === 'speech') {
        speaker = linuxSpeaker(await port.run(['sh', '-c', 'command -v spd-say || command -v espeak-ng || command -v espeak'], 5000))
      }
    }
  }

  // Reactions: compaction, context sweat, plan mode, the squad, model switches ----------------

  const squadAtom = atom({ plugin: 'pixlings', key: 'squad' } as const, [] as PixlingsMini[])
  const planningAtom = atom({ plugin: 'pixlings', key: 'isPlanning' } as const, false)
  const effectAtom = atom({ plugin: 'pixlings', key: 'effect' } as const, null as PixlingsEffect)

  const wantsCacheGuard = options['cacheGuard'] !== false
  /**
   * Re-writing a warm cache dearer than this is put to the person before a model switch. At
   * cache-write prices (1.25× input for 5m, 2× for 1h) a quarter is ~50k tokens of context
   * moving to Opus 5.5, ~100k to Sonnet 5.5, and never a switch down to Haiku: a session well
   * under way, where one keypress costs less than the money it saves. Below it, a dialog on
   * every /model would nag more than it saves.
   */
  const GUARD_USD = 0.25
  /** The context fill that makes it sweat, and the fill it must fall under to sweat again. */
  const SWEAT_AT = 85
  const SWEAT_AGAIN = 80
  /** A compaction that never reports its end lets the press up after this. */
  const COMPACT_MAX_MS = 10 * 60_000

  type Mini = PixlingsMini & { icon: { icon: Icon; until: number } | null }

  /** The $.state setters of this section, bound in session.start beside the Io port. */
  let stage: {
    squad: (value: PixlingsMini[]) => Promise<void>
    isPlanning: (value: boolean) => Promise<void>
    effect: (value: PixlingsEffect) => Promise<void>
  } | null = null
  /** Subagents' minis, oldest first; a finished one stays MINI_LEAVE_MS to celebrate and go. */
  let squad: Mini[] = []
  /** Minis that joined since the squad last stood empty: the high fives the last one counts. */
  let squadRun = 0
  let isPlanning = false
  let compactingSince: number | null = null
  let relievedAt: number | null = null
  let hasSweated = false
  let contextWindow: number | null = null
  /** turn.step's `model` and `effort` on the main loop (index.d.ts TurnStepInput). */
  let model: string | undefined
  let effort: string | number | undefined
  /** The rate-limit windows as a main turn began, and what the last one took from them. */
  let quotaBefore: readonly LimitWindow[] | null = null
  let turnDelta: readonly QuotaDelta[] = []

  /** The last short effect, for a surface that mirrors the band (the room). */
  const flash = async (kind: string): Promise<void> => {
    await stage?.effect({ kind, at: now() }).catch(() => undefined)
  }

  const publishSquad = async (): Promise<void> => {
    await stage?.squad(squad.map(({ icon: _icon, ...mini }) => mini)).catch(() => undefined)
  }

  const seedOf = (id: string): number => {
    let h = 0
    for (const ch of id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
    return Math.abs(h) % 97
  }

  /** The minis on the strip at `at`, oldest first, the rest counted; gone once they poofed. */
  const squadAt = (at: number): { shown: MiniView[]; hidden: number } => {
    const here = squad.filter(m => m.doneAt === null || at - m.doneAt < MINI_LEAVE_MS)
    const shown = here.slice(0, SQUAD_CAP).map(m => ({
      tint: miniTint(m.label),
      // A frame timed a moment before the event it follows draws the event's first frame.
      t: Math.max(0, at - m.startedAt),
      doneT: m.doneAt === null ? null : Math.max(0, at - m.doneAt),
      icon: m.icon && at < m.icon.until ? m.icon.icon : null,
      seed: seedOf(m.agentId),
    }))
    return { shown, hidden: here.length - shown.length }
  }

  const squadColumns = (at: number): number => {
    const { shown, hidden } = squadAt(at)
    return squadWidth(shown.length, hidden)
  }

  /** A subagent started: a mini tinted for its type hops onto the strip. */
  const joinSquad = async (agentId: string, agentType: string): Promise<void> => {
    if (!pixling || squad.some(m => m.agentId === agentId)) return
    const isFirst = squad.every(m => m.doneAt !== null)
    squadRun = isFirst ? 1 : squadRun + 1
    squad = [...squad, { agentId, label: agentType, speciesId: pixling.species, startedAt: now(), doneAt: null, icon: null }]
    await publishSquad()
    if (isFirst) await express({ priority: PRIORITY.ambient, line: 'squadUp', slots: { label: agentType } })
  }

  /**
   * A mini's agent finished: it jumps for joy, the pixling high-fives it, and it poofs away.
   * Stopped by an interrupt instead, it goes straight to the poof, with nothing to celebrate.
   */
  const leaveSquad = async (agentId: string, isAborted = false): Promise<void> => {
    const port = io
    const mini = squad.find(m => m.agentId === agentId)
    if (!port || !mini || mini.doneAt !== null) return
    const doneAt = isAborted ? now() - MINI_POOF_MS : now()
    squad = squad.map(m => (m.agentId === agentId ? { ...m, doneAt, icon: null } : m))
    await publishSquad()
    port.after(Math.max(0, MINI_LEAVE_MS - (now() - doneAt)), () => {
      squad = squad.filter(m => m.agentId !== agentId)
      void publishSquad()
    })
    if (isAborted) return
    await flash('highFive')
    if (squad.some(m => m.doneAt === null)) {
      await express({ mood: 'happy', priority: PRIORITY.ambient, holdMs: 900 })
    } else {
      const isOne = squadRun <= 1
      await express({
        mood: 'happy',
        priority: PRIORITY.ambient,
        holdMs: 1800,
        line: isOne ? 'squadDoneOne' : 'squadDone',
        slots: { n: squadRun, label: mini.label },
      })
    }
  }

  /** A subagent's tool: its icon over that agent's mini. */
  const showMiniIcon = (agentId: string, tool: Icon): void => {
    squad = squad.map(m => (m.agentId === agentId && m.doneAt === null ? { ...m, icon: { icon: tool, until: now() + 2500 } } : m))
  }

  /** A main-conversation compaction began: the press comes down on the pixling. */
  const squish = async (): Promise<void> => {
    const since = now()
    compactingSince = since
    relievedAt = null
    io?.after(COMPACT_MAX_MS, () => {
      if (compactingSince === since) compactingSince = null
    })
    await flash('squish')
  }

  /**
   * The compaction ended: the press lifts and the pixling springs back, saying what was freed.
   * `session.compact`'s result carries the conversation's size before and after, when core
   * recorded them; the context fill is the new size over the window the last measure reported,
   * or unknown until the next measure, never the stale fill from before.
   */
  const relieve = async (counts: { before?: number; after?: number } | null): Promise<void> => {
    compactingSince = null
    if (!counts) return
    relievedAt = now()
    const { before, after } = counts
    contextPercent = after !== undefined && contextWindow ? Math.min(100, (after / contextWindow) * 100) : null
    if (contextPercent === null || contextPercent < SWEAT_AGAIN) hasSweated = false
    await flash('relief')
    const freed = before !== undefined && after !== undefined && before > after ? before - after : null
    await express({
      mood: 'happy',
      priority: PRIORITY.commit,
      holdMs: 2600,
      line: freed !== null ? 'compacted' : 'compactedPlain',
      slots: freed !== null ? { n: tokens(freed), label: `${tokens(before!)} → ${tokens(after!)}` } : undefined,
      sound: 'push',
    })
  }

  /** The context crossed 85%: a bead of sweat while it stays there, and one line per crossing. */
  const noteContext = async (): Promise<void> => {
    const pct = contextPercent
    if (pct === null) return
    if (pct < SWEAT_AGAIN) hasSweated = false
    if (pct < SWEAT_AT || hasSweated) return
    hasSweated = true
    await flash('sweat')
    await express({ priority: PRIORITY.commit, line: 'contextSweat', slots: { n: Math.round(pct) } })
  }

  /** The main loop's plan-mode reminder puts the thinking cap on; the exit note takes it off. */
  const notePlan = async (type: string): Promise<void> => {
    const isOn = type === 'plan_mode' || type === 'plan_mode_reentry'
    if ((!isOn && type !== 'plan_mode_exit') || isOn === isPlanning) return
    isPlanning = isOn
    await stage?.isPlanning(isOn).catch(() => undefined)
    await flash(isOn ? 'thinkingCap' : 'capOff')
    await express({ priority: PRIORITY.ambient, line: isOn ? 'planOn' : 'planOff' })
  }

  /** The rate-limit windows now; the last measured ones when they cannot be read. */
  const readLimits = async (): Promise<readonly LimitWindow[]> =>
    io ? io.usage().catch(() => limits) : limits

  on('session.start', async ($, e, next) => {
    const port: Io = {
      now: () => $.clock.now(),
      after: (ms, fn) => $.clock.after(ms, fn),
      setView: async value => {
        await update($, view, () => value)
      },
      setBubble: async value => {
        await update($, bubbleAtom, () => value)
      },
      setNap: async value => {
        await update($, napAtom, () => value)
      },
      setHatchAt: async value => {
        await update($, hatchAtom, () => value)
      },
      setMood: async value => {
        await update($, moodAtom, () => value)
      },
      load: async () => $.store.get(STORE_KEY),
      save: async value => {
        await $.store.set(STORE_KEY, value)
      },
      backup: async value => {
        await $.store.set(BACKUP_KEY, value)
      },
      sessionId: async () => $.session.id().catch(() => null),
      run: async (argv, timeoutMs) => (await $.process.run(argv, { timeoutMs })).stdout,
      playAsset: async asset => {
        await $.audio.play({ asset })
      },
      toast: (text, timeoutMs) => $.ui.toast(text, { timeoutMs }),
      invalidate: () => $.ui.invalidate('ui.render'),
      blit: async (requestId, key, cells) => (await $.ui.blit({ requestId, key, cells })).deny === undefined,
      blitImage: async (requestId, key, png) => (await $.ui.blit({ requestId, key, source: { png } })).deny,
      saveImages: async value => {
        await $.store.set(IMAGES_KEY, value)
      },
      usage: async () => (await $.session.usage()).rateLimits,
      submit: async text => {
        await $.prompt.submit({ text })
      },
      setVitals: async value => {
        await update($, vitalsAtom, () => value)
      },
      setCache: async value => {
        await update($, cacheAtom, () => value)
      },
      saveTtl: async stored => {
        await $.store.set(TTL_KEY, stored)
      },
      draft: async () => (await $.prompt.read()).text,
      speak: async text => {
        await $.audio.speak(text)
      },
      pipe: async (argv, stdin, timeoutMs) => {
        await $.process.run(argv, { stdin, timeoutMs })
      },
    }
    io = port
    stage = {
      squad: async value => {
        await update($, squadAtom, () => value)
      },
      isPlanning: async value => {
        await update($, planningAtom, () => value)
      },
      effect: async value => {
        await update($, effectAtom, () => value)
      },
    }
    // The REPL has a person at the prompt; an SDK host that draws has a surface attached.
    const surfaces = await $.session.surfaces().catch(() => [])
    isQuiet = !e.isInteractive && surfaces.length === 0
    await syncClock(port)
    lastActivity = now()
    baseSince = now()

    if (!isQuiet) await detectPlatform(port, await $.env.get('OS'), $.plugin.root)

    // The cache's lifetime: the person's setting, else what a past session learned or a model
    // switch named while it is still trusted, else 5m. 0.2's bare '5m' or '1h' carries no date,
    // so it is not trusted: the lifetime is assumed and learned again.
    isTtlPinned = isTtl(ttlSetting)
    const known = isTtlPinned ? null : decodeTtl(await $.store.get(TTL_KEY), now())
    const ttl: Ttl = isTtl(ttlSetting) ? ttlSetting : (known?.ttl ?? '5m')
    const isKnown = isTtlPinned || known !== null
    const cacheNow = await read($, cacheAtom)
    cache = cacheNow ? { ...cacheNow, ttl, isTtlKnown: isKnown || cacheNow.isTtlKnown } : freshCache(ttl, isKnown)

    const raw = await $.store.get(STORE_KEY)
    const stored = revive(raw)
    const lastSeen = Number((await $.store.get(SEEN_KEY)) ?? 0)
    await $.store.set(SEEN_KEY, now())
    await $.command.register({
      name: 'pixling',
      description: 'Your pixling: card, pet, name, wear, dex, hatch, adopt your old /buddy, room, off/on',
      argumentHint: '[pet | name <name> | wear <item> | dex | hatch | adopt [species] | room | off | on | help]',
    })
    // The old /buddy's name; a session where the engine refuses it still has /pixling.
    await $.command
      .register({ name: 'buddy', description: 'Your pixling, under the old /buddy name: card, pet, off, on', argumentHint: '[pet | off | on]' })
      .catch(() => undefined)
    buddyIo = {
      setPersona: async value => {
        await update($, personaAtom, () => value)
      },
      setAway: async value => {
        await update($, awayAtom, () => value)
      },
      complete: async request => $.model.complete(request),
    }
    // A terminal that drew images last time draws the picture from the start, not the size's
    // fallback first; one that turns out not to falls back as it would after any refusal.
    hasImages = (await $.store.get(IMAGES_KEY)) === true
    // Sent away in an earlier session: it stays away until /pixling on.
    isAway = (await $.store.get(AWAY_KEY)) === true
    await buddyIo.setAway(isAway)
    if (!isQuiet) {
      $.clock.every(FRAME_MS, () => {
        void tick()
      })
    }

    // A hot reload finds a nap or a hatch in progress in $.state.
    const napNow = await read($, napAtom)
    if (napNow) {
      nap = napNow
      napSince = now()
      napSession = await port.sessionId()
      armWake(napNow.until !== null ? napNow.until + NAP_GRACE_MS : now() + NAP_RETRY_MS)
    }
    const hatchNow = await read($, hatchAtom)
    if (hatchNow !== null && now() - hatchNow < HATCH_MS + 2600) hatchAt = hatchNow

    if (isUnreadable(raw)) {
      // Never written over: the session runs on a stand-in it does not save.
      pixling = touchDay(bump(hatchPixling(Math.random, now()), 'sessions'), now()).pixling
      await readOnly(raw)
      await publishView()
    } else if (!stored) {
      // A first egg hatches where someone sees it, not in a -p run.
      if (!isQuiet) await hatch()
    } else {
      savedAs = stored
      pixling = bump(stored, 'sessions')
      const recap = greetDay()
      await publishView()
      await grant('session')
      const away = lastSeen > 0 ? now() - lastSeen : 0
      if (hatchAt === null && !isQuiet) {
        if (recap) {
          await showRecap(recap, PRIORITY.ambient)
        } else {
          await express({
            mood: 'happy',
            priority: PRIORITY.ambient,
            holdMs: 2500,
            line: away > 8 * 3_600_000 ? 'welcomeBack' : 'hello',
            slots: { dur: formatDuration(away) },
          })
        }
      }
    }
    return next(e)
  })

  // An SDK host (the desktop app, VS Code) starts unwatched and attaches a surface when it first
  // draws: from then on the pixling is seen, so it animates, plays, notifies and hatches.
  on('session.attach', async ($, e, next) => {
    const port = io
    if (isQuiet && port) {
      isQuiet = false
      await detectPlatform(port, await $.env.get('OS'), $.plugin.root)
      $.clock.every(FRAME_MS, () => {
        void tick()
      })
      if (!pixling) await hatch()
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // The conversation is over (a /clear or a resume goes on under another id): so is its nap,
    // its plan mode, its compaction, its squad, and the fill of its context with the sweat.
    await cancelNap().catch(() => undefined)
    squad = []
    isPlanning = false
    compactingSince = null
    relievedAt = null
    contextPercent = null
    hasSweated = false
    await publishSquad()
    await stage?.isPlanning(false).catch(() => undefined)
    await stage?.effect(null).catch(() => undefined)
    await refreshVitals(now()).catch(() => undefined)
    await commit()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!NOT_THE_PERSON.has(e.origin?.kind ?? 'unclassified') && pixling) {
      await touch()
      await cancelNap()
      const date = new Date(now())
      const night = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      if (date.getHours() >= 1 && date.getHours() < 5 && saidLateNight !== night) {
        saidLateNight = night
        await express({ mood: 'sleep', priority: PRIORITY.ambient, holdMs: 2500, line: 'lateNight', slots: { time: clockTime(now()) } })
      }
      if (isNamedIn(e.text)) maybeQuip('named')
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // Main-loop turns only: a subagent's run raises no turn.start.
    isWorking = true
    const s = species()
    turnVerb = s.verbs[Math.floor(Math.random() * s.verbs.length)] ?? null
    turnPast = s.past[Math.floor(Math.random() * s.past.length)] ?? null
    // The limits as the turn begins: what it took from them is told when it completes.
    quotaBefore = await readLimits()
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const sentAt = now()
    if (e.agentId === undefined) {
      // The model and effort the main loop's request names: the vitals row's last piece.
      model = e.model
      effort = e.effort
    }
    const result = yield* next(e)
    if (e.agentId === undefined && pixling) {
      // The pixling watches; it never breaks a turn.
      await afterStep(result.usage, result.answer, sentAt).catch(() => undefined)
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (!pixling) return next(e)
    lastActivity = now()
    const input = e as unknown as Record<string, unknown>
    const command = typeof input['command'] === 'string' ? input['command'] : ''
    // Whose tool it is: the main loop's icon goes over the pixling; a subagent's (agentId) over
    // that agent's mini, never the pixling; a loop with no mini (a fork, a workflow's agent)
    // shows none. Everything below is anyone's: danger is danger whoever runs it, and every
    // test run and git operation counts toward the stats.
    const nextIcon = iconFor(String(e.tool), command)
    if (nextIcon && e.agentId === undefined) icon = { icon: nextIcon, until: now() + 2500 }
    else if (nextIcon && e.agentId !== undefined) showMiniIcon(e.agentId, nextIcon)
    const risk = command ? riskOf(command) : null
    if (risk) await reactRisk(risk)

    const ran = await next(e)

    // The permission dialog, if there was one, has been answered by now.
    if (held?.mood === 'attention') held = null
    if (command && ran.deny === undefined) {
      const record = (ran.result ?? {}) as { stdout?: string; stderr?: string; gitOperation?: GitOperation }
      const output = ran.text ?? `${record.stdout ?? ''}\n${record.stderr ?? ''}`
      const isError = ran.isError === true
      if (isTestCommand(command)) await afterTests(output, isError)
      // `git commit -am x && npm test` commits and then tests: both count. A red run fails the
      // line, but the commit the engine saw still stands.
      if (!isError || record.gitOperation?.commit) await afterGit(command, record.gitOperation)
    }
    if (ran.deny === undefined && ran.isError !== true) {
      const lines = linesWritten(String(e.tool), input)
      if (lines >= BIG_DIFF_LINES) maybeQuip('bigDiff', { lines, files: 1 })
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    isWorking = false
    if (quotaBefore !== null) {
      const before = quotaBefore
      quotaBefore = null
      turnDelta = turnQuota(before, await readLimits())
    }
    if (!pixling) return result
    icon = null
    if (e.reason === 'aborted') {
      // An interrupt stops the subagents it was waiting on, which report no stop: their minis
      // go without a celebration.
      for (const m of squad) if (m.doneAt === null) await leaveSquad(m.agentId, true)
    }
    switch (e.reason) {
      case 'answer': {
        // A session that runs past midnight greets the new day on its first turn.
        const recap = greetDay()
        tally('turns')
        if (new Date(now()).getHours() < 5) count('nights')
        if (e.durationMs > LONG_TURN_MS) {
          await express({
            mood: 'happy',
            priority: PRIORITY.done,
            holdMs: 2500,
            line: 'doneLong',
            slots: { dur: formatDuration(e.durationMs) },
            sound: 'done',
            isImportant: true,
            notify: `Claude finished after ${formatDuration(e.durationMs)}.`,
          })
        } else {
          await express({
            mood: 'happy',
            priority: PRIORITY.done,
            holdMs: 1800,
            line: Math.random() < 0.35 ? 'done' : undefined,
            sound: 'done',
          })
        }
        // At the done reaction's priority, so the recap takes its bubble.
        if (recap) await showRecap(recap, PRIORITY.done)
        await grant('turn', 'turns')
        break
      }
      case 'aborted':
        await express({ mood: 'idle', priority: PRIORITY.ambient, line: 'aborted' })
        break
      case 'refusal':
        await express({ mood: 'dizzy', priority: PRIORITY.error, holdMs: 2500, line: 'refusal', sound: 'error' })
        break
      case 'error': {
        const windows = await (io?.usage() ?? Promise.resolve([])).catch(() => [])
        if (blockingWindow(windows, now())) {
          await fallAsleep()
        } else if (!nap && now() - lastLimitAt > 3000) {
          await express({ mood: 'dizzy', priority: PRIORITY.error, holdMs: 3000, line: 'error', sound: 'error' })
          maybeQuip('error')
        }
        break
      }
    }
    return result
  })

  on('classic.StopFailure', async ($, e, next) => {
    if (pixling) {
      if (e.error === 'rate_limit') {
        await fallAsleep()
      } else if (e.error === 'overloaded') {
        await express({ mood: 'dizzy', priority: PRIORITY.error, holdMs: 3000, line: 'overloaded', sound: 'error' })
      }
    }
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (pixling) {
      if (e.notification_type === 'permission_prompt') {
        count('permissions')
        await express({
          mood: 'attention',
          priority: PRIORITY.attention,
          holdMs: 60_000,
          line: 'permission',
          sound: 'attention',
          isImportant: true,
          notify: e.message || 'Claude needs your permission.',
        })
      } else if (e.notification_type === 'idle_prompt') {
        await express({ mood: 'idle', priority: PRIORITY.ambient, line: 'idle' })
      }
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    contextPercent = e.context.percent ?? contextPercent
    contextWindow = e.context.window
    limits = e.rateLimits
    await noteContext().catch(() => undefined)
    for (const w of e.rateLimits) {
      const key = `${w.kind}:${w.resetsAt ?? ''}`
      if (w.percentUsed >= 90 && w.percentUsed < 100 && !warnedWindows.has(key)) {
        warnedWindows = new Set([...warnedWindows, key])
        await express({
          mood: 'sleep',
          priority: PRIORITY.ambient,
          holdMs: 2500,
          line: 'tired',
          slots: { n: Math.round(w.percentUsed), window: w.kind.replace('_', '-') },
        })
      }
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    // The main conversation only: a subagent's or a fork's own transcript (agentId) is not the
    // pixling's to feel, and a precompute installs nothing.
    if (e.agentId !== undefined || e.trigger === 'precompute' || !pixling) return next(e)
    await squish().catch(() => undefined)
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } catch (error) {
      compactingSince = null
      throw error
    }
    // A vetoed compaction (`skip`) squeezed nothing: the press just lifts.
    const counts = result.skip === undefined ? { before: result.tokensBefore, after: result.tokensAfter } : null
    await relieve(counts).catch(() => undefined)
    return result
  })

  on('prompt.attachment', async ($, e, next) => {
    // Observe only: the attachment the model reads is the chain's answer beneath, untouched.
    const result = await next(e)
    if (e.agentId === undefined && pixling) await notePlan(e.type).catch(() => undefined)
    return result
  })

  on('classic.SubagentStart', async ($, e, next) => {
    if (pixling) await joinSquad(e.agent_id, e.agent_type).catch(() => undefined)
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    if (pixling) await leaveSquad(e.agent_id).catch(() => undefined)
    return next(e)
  })

  on('classic.PreModelSwitch', async ($, e, next) => {
    const result = await next(e)
    // The person's own settings hooks beneath decide first. A -p or SDK switch has nobody to
    // ask, and a cold cache costs nothing to leave (guardDecision reads the engine's word).
    if (!wantsCacheGuard || isQuiet || e.source === 'sdk') return result
    if (result.permissionDecision !== undefined || result.block !== undefined) return result
    const { shouldAsk, reason } = guardDecision({
      isWarm: e.prompt_cache_warm,
      estimatedUsd: e.estimated_cache_write_usd,
      remainingMs: remainingMs(cache, now()),
      thresholdUsd: GUARD_USD,
    })
    if (!shouldAsk) return result
    await express({ mood: 'attention', priority: PRIORITY.commit, holdMs: 4000 }).catch(() => undefined)
    return { ...result, permissionDecision: 'ask', permissionDecisionReason: reason }
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const port = io
    if (port && pixling) {
      const at = now()
      model = e.to_model
      // The engine names the cache's lifetime here: known, and kept 30 days with its source.
      // A lifetime the person pinned in /config still wins over it.
      if (!isTtlPinned) {
        cache = applyKnownTtl(cache, e.cache_ttl)
        await port.setCache(cache).catch(() => undefined)
      }
      await port.saveTtl(encodeTtl(e.cache_ttl, at, 'switch')).catch(() => undefined)
      await refreshVitals(at).catch(() => undefined)
      if (e.source !== 'resume' && e.source !== 'sdk') {
        const isDear = e.prompt_cache_warm && e.estimated_cache_write_usd >= 0.01
        await express({
          priority: PRIORITY.ambient,
          line: isDear ? 'modelSwitchWarm' : 'modelSwitch',
          slots: { label: modelLabel(e.to_model), item: `$${e.estimated_cache_write_usd.toFixed(2)}` },
        }).catch(() => undefined)
      }
    }
    return next(e)
  })

  // Commands ------------------------------------------------------------------------------

  // The buddy bridge, the away switch and the quips.

  /** The engine calls these need, bound in `session.start` beside the command registrations. */
  type BuddyIo = {
    setPersona: (value: PixlingsPersona) => Promise<void>
    setAway: (value: boolean) => Promise<void>
    complete: (request: QuipRequest) => Promise<QuipReply>
  }

  /**
   * What `/pixling adopt` asks of the engine, bound by the command's own hook (its `$` is the
   * person's command, which the dialog answers to). Each variable is read by name.
   */
  type AdoptIo = {
    read: (path: string) => Promise<string>
    ask: (question: string, labels: readonly string[]) => Promise<string>
    os: () => Promise<string | undefined>
    home: () => Promise<string | undefined>
    userProfile: () => Promise<string | undefined>
    configDir: () => Promise<string | undefined>
    redraw: () => void
  }

  /** What `/pixling off` and `on` ask of the engine: the kept choice, and a redraw of the band. */
  type AwayIo = { save: (away: boolean) => Promise<void>; redraw: () => void }

  const personaAtom = atom({ plugin: 'pixlings', key: 'persona' } as const, null as PixlingsPersona)
  const awayAtom = atom({ plugin: 'pixlings', key: 'isAway' } as const, false)
  const AWAY_KEY = 'away'
  const ROOM_ID = 'pixling-room'
  const quipMode = String(options['quips'] ?? 'off')
  const QUIP_PRIORITY: Readonly<Record<QuipKind, number>> = {
    testFail: PRIORITY.testFail,
    named: PRIORITY.pet,
    error: PRIORITY.error,
    bigDiff: PRIORITY.commit,
  }

  let buddyIo: BuddyIo | null = null
  /** Sent away with `/pixling off`: no band, sound, voice, toast, notification or auto-continue. */
  let isAway = false
  let shownPersona: PixlingsPersona | undefined
  let lastQuipAt: number | null = null
  let isQuipping = false

  const publishPersona = async (): Promise<void> => {
    const value = pixling?.persona ?? null
    if (!buddyIo || value === shownPersona) return
    shownPersona = value
    await buddyIo.setPersona(value)
  }

  /** The pixling's name said as a word, spelled as it is (names are capitalized; "cache" is not "Cache"). */
  const isNamedIn = (text: string): boolean => {
    const name = pixling?.name.trim() ?? ''
    if (!name) return false
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u').test(text)
  }

  /**
   * With quips on, asks Haiku for a line about what happened and shows it with its cost; any
   * failure leaves the canned line already said. At most one a minute, none while quiet or away.
   * Facts are counts only. Other events call it too: `maybeQuip('error')`,
   * `maybeQuip('bigDiff', { lines, files })`.
   */
  const maybeQuip = (kind: QuipKind, facts: QuipFacts = {}): void => {
    const port = io
    const engine = buddyIo
    const p = pixling
    if (!port || !engine || !p) return
    // Quiet chatter hides lines below a failure's: no tokens for a line nobody would see.
    if (chatter === 'quiet' && QUIP_PRIORITY[kind] < PRIORITY.testFail) return
    const at = now()
    if (!mayQuip({ mode: quipMode, isQuiet, isAway, isBusy: isQuipping, lastAt: lastQuipAt, now: at })) return
    lastQuipAt = at
    isQuipping = true
    const request = quipRequest({ name: p.name, species: species().name, persona: p.persona }, kind, facts)
    port.after(0, () => {
      void (async () => {
        try {
          const reply = await engine.complete(request)
          const spent = tokensOf(reply.usage)
          const quip = quipOf(reply)
          if (!pixling) return
          if (spent > 0) pixling = bump(pixling, 'quipTokens', spent)
          if (quip) pixling = bump(pixling, 'quips')
          persist()
          if (quip && !isAway) await express({ priority: QUIP_PRIORITY[kind], text: quip.text, suffix: ` · ${quip.tokens} tok` })
        } catch {
          // No quip this time: the canned line stands.
        } finally {
          isQuipping = false
        }
      })()
    })
  }

  /** Reads the old /buddy's companion: the engine's read, else the host's own reader. */
  /**
   * The companion in the config file, or why the file could not be read. A refused read stays
   * refused: the file holds credentials, and a hook that keeps plugins out of it has the last word.
   */
  const readCompanion = async (port: AdoptIo, path: string): Promise<{ companion: Companion | null } | { failed: string }> => {
    let text: string
    try {
      text = await port.read(path)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return /ENOENT|no such file|not found/i.test(reason) ? { companion: null } : { failed: reason }
    }
    return { companion: companionOf(text) }
  }

  const LOCAL_NOTE = [
    'Read on this machine; only the companion’s name, personality and hatch date were kept.',
    quipMode === 'haiku'
      ? 'With quips on, the personality is part of each quip’s request to Claude Haiku.'
      : 'Pixlings sends nothing anywhere itself.',
    'Like any command’s output, this reply is part of the conversation Claude reads.',
  ].join(' ')

  const adoptBuddy = async (port: AdoptIo, arg: string): Promise<{ text: string }> => {
    const was = pixling
    if (!was) return { text: 'Your egg has not hatched yet.' }
    const chosen = arg ? speciesNamed(arg) : null
    if (arg && !chosen) {
      return { text: `No species called "${arg}". Choose one of ${SPECIES.map(s => s.id).join(', ')}, or leave it out to keep ${was.name}'s body.` }
    }
    const isWindows = platform === 'windows' || (await port.os()) === 'Windows_NT'
    const home = isWindows
      ? (await port.userProfile()) || (await port.home())
      : (await port.home()) || (await port.userProfile())
    const configDir = await port.configDir()
    if (!home && !configDir) return { text: 'Could not find your home folder to look for your old /buddy in.' }
    const path = configPath(home ?? '', configDir, isWindows)
    const read = await readCompanion(port, path)
    if ('failed' in read) {
      return { text: [`Could not read ${path}: ${read.failed}`, `Nothing changed. ${was.name} is here, though. ♥`].join('\n') }
    }
    const found = read.companion
    if (!found) {
      return {
        text: [
          'No old /buddy companion to bring back.',
          `I looked in ${path} for the "companion" entry Claude Code's /buddy kept there (its name, personality and hatch date), and found none.`,
          `${was.name} is here, though. ♥`,
          LOCAL_NOTE,
        ].join('\n'),
      }
    }
    const yes = `Bring ${found.name} back`
    const no = `Keep ${was.name} as is`
    const body = chosen ? ` and becomes a ${chosen.name}` : ''
    let answer = no
    try {
      answer = await port.ask(
        `${was.name} takes the name and personality of your old /buddy${body}; its level, stats, badges, streak, tics and dex are kept. Adopt ${found.name}?`,
        [yes, no],
      )
    } catch {
      return { text: 'Nothing changed.' }
    }
    // Only the exact label is a yes: anything typed under "Other" leaves everything as it was.
    if (answer !== yes) return { text: `Nothing changed. ${was.name} stays as is.` }
    const before = pixling ?? was
    pixling = adopt(before, found, chosen ?? undefined)
    persist()
    await publishView()
    if (pixling.species !== before.species) port.redraw()
    await express({ mood: 'celebrate', priority: PRIORITY.celebrate, holdMs: 3500, line: 'buddyBack', slots: { name: found.name }, sound: 'levelup' })
    const days = found.hatchedAt !== null ? ` ${daysTogether(pixling, now())} day(s) together, counted from when ${found.name} hatched.` : ''
    return {
      text: [`${found.name} is back!${days}`, `Personality: ${pixling.persona}`, `Read from ${path}.`, LOCAL_NOTE].join('\n'),
    }
  }

  /** `/pixling off` and `on`: the choice is kept for later sessions; stats and XP count either way. */
  const switchAway = async (port: AwayIo, away: boolean): Promise<{ text: string }> => {
    const p = pixling
    if (!p) return { text: 'Your egg has not hatched yet.' }
    // Saved either way: another session may have changed the kept choice since this one read it.
    if (away === isAway) {
      await port.save(away)
      return { text: away ? `${p.name} is already away. /pixling on brings it back.` : `${p.name} is right here. ♥` }
    }
    isAway = away
    if (away && nap?.isAuto) {
      // Away means nobody to wake Claude for: the nap goes on without the auto-continue.
      nap = { ...nap, isAuto: false }
      await io?.setNap(nap)
    }
    await port.save(away)
    await buddyIo?.setAway(away)
    port.redraw()
    if (away) {
      return { text: `${p.name} is away: no band, sound, voice, toasts, notifications or auto-continue. Stats and XP still count. /pixling on brings it back.` }
    }
    await express({ mood: 'happy', priority: PRIORITY.celebrate, holdMs: 3000, line: 'backFromAway', sound: 'wake' })
    return { text: `${p.name} is back.` }
  }

  const WEARABLES = UNLOCKS.map(u => u.hat ?? u.face).join('|')
  const HELP = [
    "/pixling — your pixling's card",
    '/pixling share — save a trading card PNG to show it off',
    '/pixling badges — the badges, earned and still to earn',
    '/pixling pet — pet it',
    '/pixling name <name> — rename it',
    `/pixling wear <${WEARABLES}|none> — change its look`,
    '/pixling dex — the species you have hatched',
    '/pixling hatch — release it and hatch a new egg (level and stats reset; badges, streak and dex stay)',
    '/pixling adopt [species] — bring back your old /buddy: its name, personality and days together (read locally)',
    '/pixling room — open its room',
    '/pixling off — send it away: no band, sound, voice, toasts or auto-continue (stats still count)',
    '/pixling on — bring it back',
    '/buddy, /buddy pet, /buddy off, /buddy on — the same, under the old name',
    'Sound, voice, AI quips, the band, vitals, the cache warning and guard, the heckle and auto-continue are in /config.',
  ].join('\n')
  const BUDDY_HELP = [
    '/buddy — the card',
    '/buddy pet — pet it',
    '/buddy off — send it away',
    '/buddy on — bring it back',
    'Everything else is under /pixling help; /pixling adopt brings back your old /buddy.',
  ].join('\n')

  const slug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'pixling'

  const badgeLine = (b: (typeof BADGES)[number], p: Pixling): string => {
    const [have, need] = b.progress(p)
    const isEarned = p.badges[b.id] !== undefined
    const state = isEarned ? 'earned' : `${xpBar(have, need, 10)} ${have}/${need}`
    return `${isEarned ? b.emoji : '🔒'} ${b.name.padEnd(19)} ${state.padEnd(18)} ${b.how}`
  }

  /** The text card: who it is, its personality, whose Buddy it was, what its quips cost. */
  const cardText = (p: Pixling): string => {
    const met = p.adoptedFrom ? [`Adopted from your old /buddy: ${daysTogether(p, now())} day(s) together.`] : []
    const quips = p.stats.quips > 0 || quipMode === 'haiku' ? [`AI quips: ${p.stats.quips}, ${p.stats.quipTokens} tok in all.`] : []
    const away = isAway ? [`${p.name} is away. /pixling on brings it back.`] : []
    return [
      `${p.name} the ${species().name}, level ${levelOf(p.xp).level}. ${CARD_END}`,
      `Personality: ${p.persona}`,
      ...met,
      ...quips,
      ...away,
    ].join('\n')
  }

  const pet = async (): Promise<{ text: string }> => {
    if (!pixling) return { text: 'Your egg has not hatched yet.' }
    petsToday += 1
    count('pets')
    await express({ mood: 'love', priority: PRIORITY.pet, holdMs: 2600, line: 'pet', sound: 'pet' })
    if (petsToday <= 20) await grant('pet')
    return { text: `You pet ${pixling.name}. ♥` }
  }

  on('command.run', { command: 'pixling' }, async ($, e) => {
    if (!pixling) return { text: 'Your egg has not hatched yet.' }
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ').trim()
    switch (sub.toLowerCase()) {
      case '':
      case 'card':
        return { text: cardText(pixling) }
      case 'adopt':
        return adoptBuddy(
          {
            read: path => $.fs.read(path),
            ask: (question, labels) => $.ui.ask(question, labels),
            os: () => $.env.get('OS'),
            home: () => $.env.get('HOME'),
            userProfile: () => $.env.get('USERPROFILE'),
            configDir: () => $.env.get('CLAUDE_CONFIG_DIR'),
            redraw: () => $.ui.invalidate('ui.render'),
          },
          arg,
        )
      case 'off':
      case 'on':
        return switchAway(
          { save: away => $.store.set(AWAY_KEY, away), redraw: () => $.ui.invalidate('ui.render') },
          sub.toLowerCase() === 'off',
        )
      case 'room': {
        const title = `${pixling.name}'s room`
        try {
          const opened = await $.ui.open({ id: ROOM_ID, title })
          return { text: opened.isPlaced ? `${title} is open.` : `${title} opens once there is space for it: ${opened.reason}` }
        } catch {
          return { text: `${title} could not open here.` }
        }
      }
      case 'badges': {
        const p = pixling
        return { text: [`Badges ${earnedBadges(p).length}/${BADGES.length}`, ...BADGES.map(b => badgeLine(b, p))].join('\n') }
      }
      case 'share': {
        const p = pixling
        const png = encodePng(renderCard(p, now()), CARD_SCALE, CARD_BG)
        const home = platform === 'windows' ? await $.env.get('USERPROFILE') : await $.env.get('HOME')
        if (!home) return { text: 'Could not find your home folder to save the card in.' }
        const sep = platform === 'windows' ? '\\' : '/'
        const path = `${home.replace(/[\\/]+$/, '')}${sep}pixling-${slug(p.name)}.png`
        try {
          const wrote = await $.process.run(writeBytesArgv(platform), {
            stdin: base64(png),
            env: { PIXLING_OUT: path },
            timeoutMs: 30_000,
          })
          if (wrote.exitCode !== 0) return { text: `Could not save the card: ${wrote.stderr.trim() || `exit ${wrote.exitCode}`}` }
        } catch (error) {
          return { text: `Could not save the card: ${error instanceof Error ? error.message : String(error)}` }
        }
        const opener = openArgv(platform, path)
        if (opener) void $.process.run(opener, { timeoutMs: 15_000 }).catch(() => undefined)
        const post = shareText(p)
        const copied = await $.ui.copy({ text: post }).catch(() => null)
        await express({ mood: 'celebrate', priority: PRIORITY.celebrate, holdMs: 3000, line: 'share', sound: 'shutter' })
        return {
          text: [
            `Saved ${p.name}'s card to ${path}${opener ? ' and opened it' : ''}.`,
            copied?.isCopied ? 'A post to go with it is on your clipboard:' : 'A post to go with it:',
            post,
          ].join('\n'),
        }
      }
      case 'pet':
        return pet()
      case 'name': {
        const name = cleanName(arg)
        if (!name) return { text: 'Usage: /pixling name <new name>' }
        pixling = { ...pixling, name }
        persist()
        await publishView()
        await express({ mood: 'love', priority: PRIORITY.pet, line: 'rename', slots: { name } })
        return { text: `Your pixling is now called ${name}.` }
      }
      case 'wear': {
        const item = arg.toLowerCase()
        const level = levelOf(pixling.xp).level
        if (item === '') {
          // No item named: show the wardrobe, change nothing.
          const p = pixling
          const rows = UNLOCKS.map(u => {
            const name = u.hat ?? u.face ?? ''
            const isOn = gearOf(p).hat === name || gearOf(p).face === name
            return `${u.level <= level ? (isOn ? '● ' : '○ ') : '🔒 '}${name.padEnd(7)} ${u.label}${u.level <= level ? '' : ` (level ${u.level})`}`
          })
          return { text: [`${p.name}'s wardrobe (level ${level}). /pixling wear <item> or none:`, ...rows].join('\n') }
        }
        if (item === 'none') {
          pixling = { ...pixling, hat: 'none', face: 'none' }
        } else {
          const unlock = UNLOCKS.find(u => u.hat === item || u.face === item)
          if (!unlock) return { text: `Unknown item "${arg}". Wearables: ${WEARABLES}, none.` }
          if (unlock.level > level) return { text: `${unlock.label} unlocks at level ${unlock.level} (now ${level}).` }
          pixling = unlock.hat ? { ...pixling, hat: unlock.hat as Hat } : { ...pixling, face: unlock.face as Face }
        }
        persist()
        await publishView()
        $.ui.invalidate('ui.render')
        return { text: `${pixling.name} is wearing ${item || 'nothing'} now.` }
      }
      case 'dex':
        return { text: `${DEX_START}${pixling.dex.length}/${SPECIES.length} species hatched.` }
      case 'hatch': {
        const keep = `Keep ${pixling.name}`
        let answer = keep
        try {
          answer = await $.ui.ask(
            `Release ${pixling.name} and hatch a new egg? Level and stats start over; your badges, streak, tics and dex are kept.`,
            [keep, HATCH_LABEL],
          )
        } catch {
          return { text: 'Nothing changed.' }
        }
        // Anything typed under "Other" is not a yes.
        if (answer !== HATCH_LABEL) return { text: `${pixling.name} stays. ♥` }
        await hatch()
        return { text: 'A new egg is hatching...' }
      }
      default:
        return { text: HELP }
    }
  })

  // The old /buddy's own words lead to the same places.
  on('command.run', { command: 'buddy' }, async ($, e) => {
    if (!pixling) return { text: 'Your egg has not hatched yet.' }
    const sub = e.args.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    switch (sub) {
      case '':
      case 'card':
        return { text: cardText(pixling) }
      case 'pet':
        return pet()
      case 'off':
      case 'on':
        return switchAway({ save: away => $.store.set(AWAY_KEY, away), redraw: () => $.ui.invalidate('ui.render') }, sub === 'off')
      default:
        return { text: BUDDY_HELP }
    }
  })

  // Drawing -------------------------------------------------------------------------------

  // Values other parts of the pixling write: one never written reads as absent, and the
  // drawings go on as before it.
  const roomPersona = { plugin: 'pixlings', key: 'persona' } as const
  const roomAway = { plugin: 'pixlings', key: 'isAway' } as const
  const roomSquad = { plugin: 'pixlings', key: 'squad' } as const
  const roomPlanning = { plugin: 'pixlings', key: 'isPlanning' } as const
  const roomEffect = { plugin: 'pixlings', key: 'effect' } as const
  /** The room's shelf on show. */
  const roomAtom = atom({ plugin: 'pixlings', key: 'room' } as const, { tab: 'home' })
  const wantsHeckle = options['heckle'] === true

  /** What the band and the room say: the nap's countdown while it sleeps, else its line. */
  const sayingNow = (napping: PixlingsNap, said: PixlingsBubble, at: number): string | null =>
    napping !== null
      ? napping.until !== null
        ? `Zzz... back at ${resetTime(napping.until)} (${formatDuration(napping.until - at)})${napping.isAuto ? ', then Claude carries on' : ''}`
        : 'Zzz... napping through the limit.'
      : (said?.text ?? null)

  /** The pixling as the room draws it: in place, in its mood and gear; the egg while it hatches. */
  const roomFrame = (at: number): Pixels => {
    const p = pixling
    if (!p) return renderHatch({ species: SPECIES[0]!, isShiny: false, mood: 'idle', t: 200 }, RARITY_COLOR.common)
    if (isHatching(at)) return frameAt(at)
    const { mood, since } = currentMood(at)
    const { hat, face } = gearOf(p)
    return renderFrame({
      species: species(),
      isShiny: p.isShiny,
      mood,
      t: at - since,
      hat,
      face,
      icon: icon && at < icon.until ? icon.icon : null,
    })
  }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    const p = pixling
    if (e.props.hasSurvey || bandMode === 'off' || !v || !p || e.props.maxRows < 1) return next(e)
    // Sent away: nothing of it shows until it is called back.
    if ((await read($, roomAway)) === true) {
      bandId = null
      probeId = null
      return next(e)
    }
    const said = await read($, bubbleAtom)
    const napping = await read($, napAtom)
    const pieces = wantsVitals ? await read($, vitalsAtom) : []
    await read($, hatchAtom)
    const rawPersona = await read($, roomPersona)
    const persona = personaLine(rawPersona)
    bandColumns = e.props.bodyColumns
    const s = speciesById(v.speciesId) ?? SPECIES[0]!
    const color = hex(RARITY_COLOR[s.rarity])
    const at = now()
    const text = sayingNow(napping, said, at)
    // Under the pointer the band shows its card: who it is, the streak, the badges, the days
    // together and what it heard. The surface reveals it; no hook runs.
    const card = cardModel(p, persona, at)

    // The surface draws images: a terminal that said so. Elsewhere each size draws its fallback.
    const isTerminal = e.surface === 'terminal'
    let frame = frameAt(at)
    let picked = pickForm(bandSize, frame, isTerminal && hasImages, e.props.maxRows)
    // The walking strip widens the frame by its columns in the form's pixels: a band whose form
    // walks at another scale than the last draws the frame again at the width that follows.
    if (walkScale(picked, canvasH()) !== walkScaleNow()) {
      bandForm = picked
      // Its place was in the old scale's pixels: it starts again at home, beside the bubble.
      walker = null
      frame = frameAt(at)
      picked = pickForm(bandSize, frame, isTerminal && hasImages, e.props.maxRows)
    }
    const form = picked
    bandForm = form
    // A size a picture would draw keeps the probe beside the band until the terminal says it can.
    const wantsProbe = isTerminal && !hasImages && formFor(bandSize, frame, true).kind === 'image'
    probeId = wantsProbe ? (e.requestId ?? null) : null
    const probe = (Image: Elements['terminal']['Image']) =>
      wantsProbe ? <Image key={PROBE_KEY} source={{ png: PROBE_PNG }} columns={1} rows={1} alt=" " /> : null

    if (form.kind === 'line' || form.rows === 1) {
      const isPicture = form.kind === 'image'
      bandId = isPicture ? (e.requestId ?? null) : null
      lastFrame = isPicture ? frame : null
      const mood = (await read($, moodAtom)) as Mood
      const face = `${FACES[mood] ?? FACES.idle} `
      const lead = isPicture ? form.columns + 1 : face.length
      const before = lead + v.name.length + ` · Lv ${v.level}`.length + (pieces[0] ? pieces[0].text.length + 2 : 0)
      // Speech that runs past the line wraps under its start, so the band grows while it talks,
      // as far as the rows it may take; past those the last line is cut.
      const speech = text ? lineSpeech(text, Math.max(8, e.props.bodyColumns - 1 - before - 2), e.props.maxRows) : []
      // The card's line goes in the room the line leaves, sized to it, so revealing it moves
      // nothing: a row that overflowed would squeeze the name.
      const spare = e.props.bodyColumns - 1 - before - (speech.length ? Math.max(...speech.map(line => line.length)) + 2 : 0)
      const { Box, Text, Image } = $.ui.resolve(e) as Elements['terminal']
      return (
        <Box key="band" flexDirection="row">
          {isPicture ? (
            <Box marginRight={1}>
              <Image key={IMAGE_KEY} source={{ png: pictureSource(frame, form) }} columns={form.columns} rows={1} alt={face.trim()} />
            </Box>
          ) : (
            <Text color={color}>{face}</Text>
          )}
          <Text bold>{v.name}</Text>
          <Text dimColor>{` · Lv ${v.level}`}</Text>
          {pieces[0] ? <Text color={TONE_COLOR[pieces[0].tone]} dimColor={pieces[0].tone === 'dim'}>{`  ${pieces[0].text}`}</Text> : null}
          {speech.length === 1 ? <Text wrap="truncate-end">{`  ${speech[0]}`}</Text> : null}
          {speech.length > 1 ? (
            <Box flexDirection="column" flexShrink={1}>
              {speech.map(line => (
                <Text wrap="truncate-end">{`  ${line}`}</Text>
              ))}
            </Box>
          ) : null}
          {spare >= 12 ? (
            <Box display="none" hover={{ display: 'flex' }} width={spare} flexShrink={0}>
              <Text dimColor wrap="truncate-end">{`  ${briefLine(p, persona, at)}`}</Text>
            </Box>
          ) : null}
          {isTerminal ? probe(Image) : null}
        </Box>
      )
    }

    lastFrame = frame
    const stars = `${RARITY_STARS[s.rarity]}${v.isShiny ? ' ✦' : ''}`
    const spriteColumns = form.kind === 'image' ? form.columns : frame.w
    const width = Math.max(16, Math.min(56, e.props.bodyColumns - spriteColumns - 4))
    const column = { width, said: text, vitals: pieces.map(piece => piece.text) }
    // Half blocks grow to show the column whole while it talks; a picture talks from its bottom
    // row up, growing only past its own rows. Quiet, none grows.
    const rows = bandRows(form, column, e.props.maxRows)
    const blocks = layoutInfo({ ...column, rows })
    // The card opens past the info rows, over the band's empty right, so its shelf has room.
    // A band too short for the card shows its line instead, as wide as the band, as the engine
    // clips the reveal to the band's rows.
    const isBrief = rows < CARD_ROWS
    const cardWidth = isBrief
      ? Math.max(width, e.props.bodyColumns - spriteColumns - 2)
      : Math.max(width, Math.min(CARD_MAX, e.props.bodyColumns - spriteColumns - 4))

    /** One part of a row in the column (see `layoutInfo`). */
    const part = (Text: Kit['Text'], Button: Kit['Button'], piece: Part) => {
      if (piece.kind === 'name') {
        return [
          <Text bold color={color}>{v.name}</Text>,
          <Text dimColor wrap="truncate-end">{piece.isShort ? ` Lv ${v.level}  ` : ` Lv ${v.level} · ${s.name} ${stars}`}</Text>,
        ]
      }
      if (piece.kind === 'xp') {
        const bar = xpBar(v.xpInto, v.xpNeed, piece.width)
        // Beside a small sprite the bar is lighter: upper half blocks, level with the digits beside
        // them, or a line through the row's middle; the empty part dimmed.
        const glyph = piece.bar === 'half' ? '▀' : piece.bar === 'line' ? '━' : null
        const filled = bar.replace(/░/g, '').length
        return [
          glyph ? <Text color={color}>{glyph.repeat(filled)}</Text> : <Text color={color}>{bar}</Text>,
          ...(glyph ? [<Text dimColor>{glyph.repeat(piece.width - filled)}</Text>] : []),
          <Text dimColor>{` ${v.xpInto}/${v.xpNeed}  `}</Text>,
          napping?.isAuto ? <Button key="cancel-nap" label="cancel auto-continue" plain onPress={() => void cancelNap()} /> : null,
        ]
      }
      if (piece.kind === 'vitals') {
        return pieces.slice(piece.from, piece.to).map((vital, i) => (
          <Text color={TONE_COLOR[vital.tone]} dimColor={vital.tone === 'dim'} wrap="truncate-end">
            {`${i > 0 ? ' · ' : ''}${vital.text}`}
          </Text>
        ))
      }
      return [<Text wrap="truncate-end">{piece.text.padEnd(width - QUOTE_INSET)}</Text>, <Text color={color}>{' │'}</Text>]
    }

    const info = (Box: Kit['Box'], Text: Kit['Text'], Button: Kit['Button'], kit: RoomKit) => (
      <Box flexDirection="column" marginLeft={1} flexShrink={1} width={width}>
        {blocks.map(block =>
          block.kind === 'bubble' ? (
            <Box borderStyle="round" borderColor={color} paddingX={1} width={width} flexDirection="column">
              {block.lines.map(line => (
                <Text>{line}</Text>
              ))}
            </Box>
          ) : (
            <Box flexDirection="row">{block.parts.flatMap(piece => part(Text, Button, piece))}</Box>
          ),
        )}
        {/* Opaque, with its own ink, so the rows it covers never show through, on a dark terminal or a light one. */}
        <Box
          position="absolute"
          bottom={0}
          left={0}
          width={cardWidth}
          display="none"
          hover={{ display: 'flex' }}
          flexDirection="column"
          borderStyle={isBrief ? undefined : 'round'}
          borderColor={color}
          backgroundColor={CARD_FILL}
          paddingX={1}
        >
          {!isBrief
            ? drawCard(kit, card, cardWidth, CARD_FILL_PX, CARD_INK)
            : // The persona whole: the rows cut it, not the card's one-row cap.
              lineSpeech(briefLine(p, personaLine(rawPersona, Infinity), at), cardWidth - 2, rows).map(line => (
                <Text color={CARD_INK} wrap="truncate-end">
                  {line}
                </Text>
              ))}
        </Box>
      </Box>
    )

    if (e.surface === 'terminal') {
      const { Box, Text, Button, Raster, Image } = $.ui.resolve(e)
      bandId = e.requestId ?? null
      if (form.kind === 'image') {
        return (
          <Box key="band" flexDirection="row" alignItems="flex-end">
            <Image key={IMAGE_KEY} source={{ png: pictureSource(frame, form) }} columns={form.columns} rows={form.rows} alt=" " />
            {info(Box, Text, Button, { Box, Text, Button, Raster })}
          </Box>
        )
      }
      const raster = rasterOf(frame)
      return (
        <Box key="band" flexDirection="row" alignItems="flex-end">
          <Raster key={RASTER_KEY} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
          {info(Box, Text, Button, { Box, Text, Button, Raster })}
          {probe(Image)}
        </Box>
      )
    }
    svgSeenAt = at
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    return (
      <Box key="band" flexDirection="row" alignItems="flex-end">
        <Svg source={toSvg(frame, 4)} alt={`${v.name} the ${s.name}`} width={frame.w * 4} height={frame.h * 4} />
        {info(Box, Text, Button, { Box, Text, Button, Svg })}
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (!pixling || isAway || !turnVerb || e.surface !== 'terminal' || e.props.message !== null) return next(e)
    return next({ ...e, props: { ...e.props, word: turnVerb } })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (!pixling || isAway || !turnPast) return next(e)
    return next({ ...e, props: { ...e.props, word: turnPast } })
  })

  // `/pixling` and `/buddy` print the card; `/pixling dex` the species hatched so far.
  // Told apart by what the row printed, not the echoed arguments, so every other subcommand's
  // answer is drawn as it was printed.
  on('ui.render', { component: 'CommandOutput', props: { command: ['pixling', 'buddy'] } }, async ($, e, next) => {
    const { text } = e.props
    const sub = e.props.command === 'pixling' && text.startsWith(DEX_START) ? 'dex' : text.split('\n')[0]?.endsWith(CARD_END) ? 'card' : null
    const p = pixling
    if (!p || e.props.isErrored || sub === null) return next(e)
    // Sent away: the card and the dex are the engine's plain line until it is called back.
    if ((await read($, roomAway)) === true) return next(e)
    const s = species()
    const color = hex(RARITY_COLOR[s.rarity])

    if (sub === 'dex') {
      const cards = SPECIES.map(sp => {
        const isFound = p.dex.includes(sp.id)
        const frame = isFound ? renderFrame({ species: sp, isShiny: false, mood: 'idle', t: 0 }) : renderSilhouette(sp)
        return { sp, isFound, frame }
      })
      const perRow = Math.max(1, Math.floor((e.viewport?.columns ?? 100) / 24))
      const rows: (typeof cards)[] = []
      for (let i = 0; i < cards.length; i += perRow) rows.push(cards.slice(i, i + perRow))
      const title = `Pixledex  ${p.dex.length}/${SPECIES.length}`
      if (e.surface === 'terminal') {
        const { Box, Text, Raster } = $.ui.resolve(e)
        return (
          <Box flexDirection="column">
            <Text bold>{title}</Text>
            {rows.map((row, r) => (
              <Box flexDirection="row" gap={2}>
                {row.map(({ sp, isFound, frame }) => {
                  const raster = rasterOf(frame)
                  return (
                    <Box flexDirection="column" alignItems="center">
                      <Raster key={`dex-${r}-${sp.id}`} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
                      <Text color={isFound ? hex(RARITY_COLOR[sp.rarity]) : undefined} dimColor={!isFound}>
                        {`${isFound ? sp.name : '???'} ${RARITY_STARS[sp.rarity]}`}
                      </Text>
                    </Box>
                  )
                })}
              </Box>
            ))}
          </Box>
        )
      }
      const { Box, Text, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>{title}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={2}>
            {cards.map(({ sp, isFound, frame }) => (
              <Box flexDirection="column" alignItems="center">
                <Svg source={toSvg(frame, 3)} alt={isFound ? sp.name : 'Undiscovered'} width={frame.w * 3} height={frame.h * 3} />
                <Text dimColor={!isFound}>{isFound ? sp.name : '???'}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    const persona = personaLine(await read($, roomPersona))
    const { level, into, need } = levelOf(p.xp)
    const { hat, face } = gearOf(p)
    const frame = renderFrame({ species: s, isShiny: p.isShiny, mood: 'happy', t: 0, hat, face })
    const st = p.stats
    const earned = earnedBadges(p)
    const heard = topTics(p.tics, 3)
    const hit = hitPercent(cache)
    const lines = [
      `Tests passed ${st.testsPassed}   Bugs squashed ${st.bugsSquashed}   Commits ${st.commits}   PRs ${st.prs}`,
      `Turns ${st.turns}   Pushes ${st.pushes}   Naps ${st.naps}   Pets ${st.pets}   Close calls ${st.risky}`,
      `${daysTogether(p, now())} day(s) together · 🔥 streak ${p.streak.days} (best ${p.streak.best}) · ${st.sessions} sessions · dex ${p.dex.length}/${SPECIES.length}`,
      `Badges ${earned.length}/${BADGES.length} ${earned.map(b => b.emoji).join(' ')}`,
      ...(heard.length > 0 ? [`Heard: ${heard.map(t => `${t.label} ×${t.n}`).join(' · ')}`] : []),
      `Prompt cache: ${hit === null ? 'no requests yet' : `${hit}% served from cache`} · lives ${cache.ttl === '1h' ? 'an hour' : '5 minutes'}${cache.isTtlKnown ? '' : ' (assumed)'} · ${cache.coldStarts} cold start(s) this session`,
      '/pixling share saves this as a trading card · /pixling badges',
    ]
    const header = (Box: Kit['Box'], Text: Kit['Text']) => (
      <Box flexDirection="column" marginLeft={2} flexShrink={1}>
        <Text bold color={color}>
          {p.name.toUpperCase()}
        </Text>
        <Text>{`${s.name} · ${RARITY_STARS[s.rarity]} ${s.rarity}${p.isShiny ? ' · ✦ shiny' : ''}`}</Text>
        <Box flexDirection="row">
          <Text color={color}>{xpBar(into, need, 16)}</Text>
          <Text dimColor>{` Lv ${level} · ${into}/${need} xp`}</Text>
        </Box>
        {persona ? (
          <Text italic wrap="wrap">
            {persona}
          </Text>
        ) : null}
        <Text dimColor wrap="wrap">
          {s.blurb}
        </Text>
      </Box>
    )
    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const raster = rasterOf(frame)
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
          <Box flexDirection="row" alignItems="center">
            <Raster key="card" columns={raster.columns} rows={raster.rows} cells={raster.cells} />
            {header(Box, Text)}
          </Box>
          {lines.map(l => (
            <Text dimColor>{l}</Text>
          ))}
        </Box>
      )
    }
    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
        <Box flexDirection="row" alignItems="center">
          <Svg source={toSvg(frame, 5)} alt={`${p.name} the ${s.name}`} width={frame.w * 5} height={frame.h * 5} />
          {header(Box, Text)}
        </Box>
        {lines.map(l => (
          <Text dimColor>{l}</Text>
        ))}
      </Box>
    )
  })

  // The room: the pane `/pixling room` opens, on every surface. The id is room.ts's ROOM_ID,
  // written out so `claude plugin validate` can list it.
  on('ui.render', { component: 'Pane', requestId: 'pixling-room' }, async ($, e) => {
    // Each read subscribes the room to a redraw: a new line, a level, a nap, the shelf on show.
    await read($, view)
    const said = await read($, bubbleAtom)
    const napping = await read($, napAtom)
    const pieces = wantsVitals ? await read($, vitalsAtom) : []
    await read($, hatchAtom)
    const room = await read($, roomAtom)
    const persona = personaLine(await read($, roomPersona))
    const isAway = (await read($, roomAway)) === true
    const squad = (await read($, roomSquad)) ?? []
    const isPlanning = (await read($, roomPlanning)) === true
    const effect = (await read($, roomEffect)) ?? null
    const at = now()
    const tab = tabOf(room.tab)
    const frame = roomFrame(at)
    const isEgg = !pixling || isHatching(at)
    const columns = e.props.bodyColumns > 0 ? e.props.bodyColumns : (e.viewport?.columns ?? 40)
    const seat = seatOf(columns, e.surface === 'terminal', frame.w)
    // The pixling moves on the home shelf: the frame clock repaints a terminal's Raster in place
    // (paintRoom) and redraws what drew an SVG lately (tick).
    const isMoving = !isAway && (tab === 'home' || isEgg)
    if (e.surface === 'terminal') {
      const raster = rasterOf(frame)
      const key = isEgg ? ROOM_EGG_KEY : ROOM_SPRITE_KEY
      roomSprite = isMoving ? { key, columns: raster.columns, rows: raster.rows, cells: raster.cells } : null
    } else if (isMoving) svgSeenAt = at
    const model: RoomModel = {
      at,
      pixling,
      frame,
      isHatching: pixling !== null && isHatching(at),
      tab,
      bubble: sayingNow(napping, said, at),
      persona,
      vitals: pieces.map(piece => ({ text: piece.text, color: TONE_COLOR[piece.tone], isDim: piece.tone === 'dim' })),
      squad,
      isPlanning,
      effect,
      isAway,
      isFocused: e.props.isFocused,
    }
    const act: RoomActions = {
      show: tab => {
        void update($, roomAtom, () => ({ tab }))
      },
      pet: () => {
        void pet()
          .then(() => $.ui.invalidate('ui.render'))
          .catch(() => undefined)
      },
    }
    if (e.surface === 'terminal') {
      const { Box, Text, Button, Raster } = $.ui.resolve(e)
      return drawRoom({ Box, Text, Button, Raster }, seat, model, act)
    }
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    return drawRoom({ Box, Text, Button, Svg }, seat, model, act)
  })

  // Heckle: a faint eye roll and the running count under Claude's "You're absolutely right".
  // Only the drawing changes: the engine's own message is drawn from the props as received, and
  // the stored message is never touched. Hooked only when asked for, since every redraw of this
  // plugin's sites re-runs a hook on each message it matches ($.ui.invalidate).
  if (wantsHeckle) {
    /** Message id (`e.requestId`) → its place in the count, so a redraw never renumbers it. */
    const heckled = new Map<string, number>()
    /** Message id → the text's length when last scanned and whether it held the tic. */
    const scanned = new Map<string, { length: number; hasTic: boolean }>()
    /** What the pixling had heard when the transcript was first drawn; the count goes on from it. */
    let heardBefore: number | null = null
    on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
      if (isAway) return next(e)
      if (heardBefore === null && pixling) heardBefore = pixling.tics.absolutelyRight ?? 0
      const drawn = await next(e)
      const text = e.props.text
      const last = scanned.get(e.requestId)
      const hasTic = last && last.length === text.length ? last.hasTic : (ticsIn(text).absolutelyRight ?? 0) > 0
      scanned.set(e.requestId, { length: text.length, hasTic })
      if (!hasTic) return drawn
      let n = heckled.get(e.requestId)
      if (n === undefined) {
        n = (heardBefore ?? 0) + heckled.size + 1
        heckled.set(e.requestId, n)
      }
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {drawn}
          <Box marginLeft={2}>
            <Text dimColor>{`(¬_¬) #${n}`}</Text>
          </Box>
        </Box>
      )
    })
  }
}
