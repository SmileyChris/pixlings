// The pixling's life: hatching rolls, names, experience, levels and what each level unlocks.

import type { Face, Hat } from './canvas.ts'
import { oneLine, personaFor } from './persona.ts'
import { RARITY_ORDER, RARITY_WEIGHT, SPECIES } from './sprites.ts'
import type { Rarity, Species } from './sprites.ts'
import type { TicCounts } from './tics.ts'

export type Stats = {
  turns: number
  testsPassed: number
  testsFailed: number
  bugsSquashed: number
  commits: number
  pushes: number
  prs: number
  risky: number
  sessions: number
  pets: number
  naps: number
  permissions: number
  /** Turns between midnight and five. */
  nights: number
  /** Times the prompt cache went cold under a pause. */
  coldStarts: number
  /** Opt-in Haiku quips said, and every token they were billed for. */
  quips: number
  quipTokens: number
}

/** Consecutive days with at least one turn, by local date. */
export type Streak = { last: string | null; days: number; best: number }

/** One local day's work, for the morning recap. */
export type Day = { date: string; turns: number; commits: number; squashed: number; tests: number; xp: number }

/** The old /buddy companion this pixling was adopted from: its days together count from then. */
export type AdoptedFrom = { name: string; hatchedAt: number | null }

export type Pixling = {
  v: 1
  species: string
  isShiny: boolean
  name: string
  hatchedAt: number
  xp: number
  /** The hat and face gear chosen with `/pixling wear`; null picks the best unlocked. */
  hat: Hat | 'none' | null
  face: Face | 'none' | null
  stats: Stats
  /** Every species this person has hatched, for the dex. */
  dex: string[]
  /** Badge id → when it was earned. */
  badges: Record<string, number>
  streak: Streak
  day: Day
  /** The model's verbal tics the pixling has heard, by kind. */
  tics: TicCounts
  /** Its one-line personality: a template's, or an adopted Buddy's own. */
  persona: string
  adoptedFrom: AdoptedFrom | null
  /** When it was last petted; another pet waits PET_COOLDOWN_MS. */
  pettedAt: number | null
}

export const emptyStats = (): Stats => ({
  turns: 0,
  testsPassed: 0,
  testsFailed: 0,
  bugsSquashed: 0,
  commits: 0,
  pushes: 0,
  prs: 0,
  risky: 0,
  sessions: 0,
  pets: 0,
  naps: 0,
  permissions: 0,
  nights: 0,
  coldStarts: 0,
  quips: 0,
  quipTokens: 0,
})

export const emptyDay = (date: string): Day => ({ date, turns: 0, commits: 0, squashed: 0, tests: 0, xp: 0 })

export const SHINY_ODDS = 64

const NAMES = [
  'Mochi', 'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Pip', 'Sprocket', 'Tofu', 'Noodle', 'Waffles',
  'Bean', 'Kiwi', 'Miso', 'Pickle', 'Gizmo', 'Dumpling', 'Boba', 'Chip', 'Cookie', 'Fig',
  'Juniper', 'Lumen', 'Nova', 'Orbit', 'Pebble', 'Quill', 'Rune', 'Tango', 'Echo', 'Ziggy',
  'Null', 'Sudo', 'Lambda', 'Kernel', 'Cache', 'Async', 'Regex', 'Grep', 'Bit', 'Loop',
  'Hex', 'Tux', 'Ping', 'Pong', 'Turbo', 'Wasabi', 'Yuzu', 'Mango', 'Olive', 'Clover',
] as const

/** Picks a rarity by weight, then a species of it, then the 1-in-64 shiny roll. */
export const roll = (random: () => number): { species: Species; isShiny: boolean; name: string } => {
  const total = RARITY_ORDER.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0)
  let x = random() * total
  let rarity: Rarity = 'common'
  for (const r of RARITY_ORDER) {
    x -= RARITY_WEIGHT[r]
    if (x < 0) {
      rarity = r
      break
    }
  }
  const pool = SPECIES.filter(s => s.rarity === rarity)
  const species = pool[Math.floor(random() * pool.length)] ?? SPECIES[0]!
  const isShiny = random() < 1 / SHINY_ODDS
  const name = NAMES[Math.floor(random() * NAMES.length)] ?? 'Pip'
  return { species, isShiny, name }
}

export const hatchPixling = (random: () => number, now: number, dex: readonly string[] = []): Pixling => {
  const { species, isShiny, name } = roll(random)
  return {
    v: 1,
    species: species.id,
    isShiny,
    name,
    hatchedAt: now,
    xp: 0,
    hat: null,
    face: null,
    stats: emptyStats(),
    pettedAt: null,
    dex: [...new Set([...dex, species.id])],
    badges: {},
    streak: { last: null, days: 0, best: 0 },
    day: emptyDay(''),
    tics: {},
    persona: personaFor(species.id, now),
    adoptedFrom: null,
  }
}

/** A new egg for the same person: the badges, streak, tics and dex are theirs and stay. */
export const rehatch = (p: Pixling, random: () => number, now: number): Pixling => ({
  ...hatchPixling(random, now, p.dex),
  badges: p.badges,
  streak: p.streak,
  tics: p.tics,
})

// Experience ------------------------------------------------------------------------------------

export const XP = {
  turn: 4,
  testPass: 8,
  bugSquashed: 25,
  commit: 12,
  push: 15,
  prCreated: 30,
  prMerged: 50,
  pet: 1,
  session: 5,
  nap: 10,
} as const

export type XpEvent = keyof typeof XP

/** Total experience needed to reach `level` (level 1 needs none). */
export const xpForLevel = (level: number): number =>
  level <= 1 ? 0 : Math.round(30 * Math.pow(level - 1, 1.8))

export const MAX_LEVEL = 99

export const levelOf = (xp: number): { level: number; into: number; need: number } => {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++
  const floor = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, into: xp - floor, need: next - floor }
}

// Unlocks --------------------------------------------------------------------------------------

export type Unlock = { level: number; hat?: Hat; face?: Face; label: string }

export const UNLOCKS: readonly Unlock[] = [
  { level: 2, hat: 'sprout', label: 'a sprout' },
  { level: 4, hat: 'shroom', label: 'a mushroom cap' },
  { level: 6, face: 'shades', label: 'sunglasses' },
  { level: 9, hat: 'party', label: 'a party hat' },
  { level: 12, hat: 'crown', label: 'a crown' },
  { level: 18, hat: 'halo', label: 'a halo' },
  { level: 25, hat: 'wizard', label: 'a wizard hat' },
]

export const unlockedAt = (level: number): Unlock[] => UNLOCKS.filter(u => u.level <= level)

export const gearOf = (p: Pixling): { hat: Hat | null; face: Face | null } => {
  const { level } = levelOf(p.xp)
  const open = unlockedAt(level)
  const hats = open.flatMap(u => (u.hat ? [u.hat] : []))
  const faces = open.flatMap(u => (u.face ? [u.face] : []))
  const hat = p.hat === 'none' ? null : p.hat && hats.includes(p.hat) ? p.hat : (hats[hats.length - 1] ?? null)
  const face = p.face === 'none' ? null : p.face && faces.includes(p.face) ? p.face : (faces[faces.length - 1] ?? null)
  return { hat, face }
}

/** Adds experience; returns the new pixling and the levels crossed, with what they unlocked. */
export const gain = (
  p: Pixling,
  event: XpEvent,
): { pixling: Pixling; levelUp: { level: number; unlocks: Unlock[] } | null } => {
  const before = levelOf(p.xp).level
  const pixling = { ...p, xp: p.xp + XP[event], day: { ...p.day, xp: p.day.xp + XP[event] } }
  const after = levelOf(pixling.xp).level
  if (after <= before) return { pixling, levelUp: null }
  return {
    pixling,
    levelUp: { level: after, unlocks: UNLOCKS.filter(u => u.level > before && u.level <= after) },
  }
}

export const bump = (p: Pixling, stat: keyof Stats, by = 1): Pixling => ({
  ...p,
  stats: { ...p.stats, [stat]: p.stats[stat] + by },
})

/** Reads a stored value back into a pixling, or null when it is not one. */
export const revive = (value: unknown): Pixling | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<Pixling>
  if (v.v !== 1 || typeof v.species !== 'string' || typeof v.name !== 'string') return null
  if (!SPECIES.some(s => s.id === v.species)) return null
  const hatchedAt = typeof v.hatchedAt === 'number' ? v.hatchedAt : Date.now()
  const persona = typeof v.persona === 'string' ? oneLine(v.persona) : ''
  return {
    v: 1,
    species: v.species,
    isShiny: v.isShiny === true,
    name: v.name.slice(0, 24),
    hatchedAt,
    xp: typeof v.xp === 'number' && v.xp >= 0 ? v.xp : 0,
    hat: v.hat ?? null,
    face: v.face ?? null,
    stats: { ...emptyStats(), ...(v.stats ?? {}) },
    pettedAt: typeof v.pettedAt === 'number' ? v.pettedAt : null,
    dex: Array.isArray(v.dex) ? v.dex.filter((d): d is string => typeof d === 'string') : [v.species],
    badges: isRecord(v.badges) ? numbersOf(v.badges) : {},
    streak: isRecord(v.streak)
      ? {
          last: typeof v.streak.last === 'string' ? v.streak.last : null,
          days: numberOr(v.streak.days, 0),
          best: numberOr(v.streak.best, 0),
        }
      : { last: null, days: 0, best: 0 },
    day: isRecord(v.day) && typeof v.day.date === 'string'
      ? { ...emptyDay(v.day.date), ...numbersOf(v.day), date: v.day.date }
      : emptyDay(''),
    tics: isRecord(v.tics) ? numbersOf(v.tics) : {},
    // A save from before personalities gets one seeded by its hatch: the same every session.
    persona: persona || personaFor(v.species, hatchedAt),
    adoptedFrom: isRecord(v.adoptedFrom) && typeof v.adoptedFrom.name === 'string'
      ? {
          name: v.adoptedFrom.name.slice(0, 24),
          hatchedAt: typeof v.adoptedFrom.hatchedAt === 'number' && Number.isFinite(v.adoptedFrom.hatchedAt) ? v.adoptedFrom.hatchedAt : null,
        }
      : null,
  }
}

/** A stored value that is there but is no pixling this version can read: never to be written over. */
export const isUnreadable = (value: unknown): boolean => value !== undefined && value !== null && revive(value) === null

// Saving ----------------------------------------------------------------------------------------
// Every session keeps the pixling it loaded (its base) and saves by folding what it changed since
// into what the store holds now, so two terminals never overwrite each other's progress.

/** `stored` moved on by what `ours` added since `base`, per key, never below zero. */
const moved = <K extends string>(
  stored: Partial<Record<K, number>>,
  base: Partial<Record<K, number>>,
  ours: Partial<Record<K, number>>,
): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = { ...stored }
  for (const key of Object.keys(ours) as K[]) {
    const by = (ours[key] ?? 0) - (base[key] ?? 0)
    if (by !== 0) out[key] = Math.max(0, (stored[key] ?? 0) + by)
  }
  return out
}

/** The later `last` wins; on the same day, the longer run. The best is the best either saw. */
const laterStreak = (a: Streak, b: Streak): Streak => {
  const [x, y] = [a.last ?? '', b.last ?? '']
  const later = x > y ? a : y > x ? b : a.days >= b.days ? a : b
  return { ...later, best: Math.max(a.best, b.best, later.days) }
}

const DAY_COUNTS = ['turns', 'commits', 'squashed', 'tests', 'xp'] as const

/** Today's record: the newer date wins whole; on the same date, both sessions' counts add up. */
const mergeDay = (stored: Day, base: Day, ours: Day): Day => {
  if (ours.date !== stored.date) return ours.date > stored.date ? ours : stored
  const since = base.date === ours.date ? base : emptyDay(ours.date)
  const day = { ...stored }
  for (const k of DAY_COUNTS) day[k] = Math.max(0, stored[k] + ours[k] - since[k])
  return day
}

/**
 * What to write when the store holds `stored`, this session loaded or last wrote `base` (null
 * before its first save) and holds `ours` now. A different `hatchedAt` is another egg: the later
 * hatch wins. Counters add up; name, hat and face are ours when we changed them; badges, the dex,
 * the streak and the tics belong to the person and are merged across eggs.
 */
export const mergeSave = (stored: Pixling, base: Pixling | null, ours: Pixling): Pixling => {
  const isSameEgg = stored.hatchedAt === ours.hatchedAt
  // No base, yet the store holds this very egg: ours is the newer copy of it.
  const since = base ?? (isSameEgg ? stored : null)
  const badges = { ...stored.badges }
  for (const [id, at] of Object.entries(ours.badges)) badges[id] = Math.min(at, badges[id] ?? at)
  const person = {
    dex: [...new Set([...stored.dex, ...ours.dex])],
    badges,
    streak: laterStreak(stored.streak, ours.streak),
    tics: moved(stored.tics, since?.tics ?? {}, ours.tics),
  }
  if (!isSameEgg || !since) return { ...(stored.hatchedAt > ours.hatchedAt ? stored : ours), ...person }
  const pick = <T>(theirs: T, was: T, now: T): T => (now === was ? theirs : now)
  // A record read back from the store is a new object each time: compared by value.
  const pickValue = <T>(theirs: T, was: T, now: T): T => (JSON.stringify(now) === JSON.stringify(was) ? theirs : now)
  return {
    ...stored,
    species: pick(stored.species, since.species, ours.species),
    persona: pick(stored.persona, since.persona, ours.persona),
    adoptedFrom: pickValue(stored.adoptedFrom, since.adoptedFrom, ours.adoptedFrom),
    name: pick(stored.name, since.name, ours.name),
    hat: pick(stored.hat, since.hat, ours.hat),
    face: pick(stored.face, since.face, ours.face),
    xp: Math.max(0, stored.xp + ours.xp - since.xp),
    stats: moved(stored.stats, since.stats, ours.stats) as Stats,
    pettedAt: Math.max(stored.pettedAt ?? 0, ours.pettedAt ?? 0) || null,
    day: mergeDay(stored.day, since.day, ours.day),
    ...person,
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const numberOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback

const numbersOf = (v: object): Record<string, number> =>
  Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0))

export const xpBar = (into: number, need: number, width: number): string => {
  const filled = need <= 0 ? width : Math.min(width, Math.round((into / need) * width))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** When the person met this pixling: an adopted Buddy's hatch, else its own. */
export const metAt = (p: Pixling): number => p.adoptedFrom?.hatchedAt ?? p.hatchedAt

/** How close it is to you, by the pets it has had: never goes down. Best friend is the Best Friends badge. */
export const FRIENDSHIP: readonly { readonly pets: number; readonly name: string }[] = [
  { pets: 0, name: 'Stranger' },
  { pets: 5, name: 'Acquaintance' },
  { pets: 15, name: 'Pal' },
  { pets: 35, name: 'Friend' },
  { pets: 60, name: 'Close friend' },
  { pets: 100, name: 'Best friend' },
]

export type Friendship = { readonly tier: number; readonly name: string; readonly hearts: string; readonly next: number | null }

/** Its friendship at `pets`: the tier (0–5), its name, five hearts filled to it, and the pets to the next. */
export const friendshipOf = (pets: number): Friendship => {
  const tier = FRIENDSHIP.reduce((at, f, i) => (pets >= f.pets ? i : at), 0)
  const up = FRIENDSHIP[tier + 1]
  return { tier, name: FRIENDSHIP[tier]!.name, hearts: '♥'.repeat(tier) + '♡'.repeat(FRIENDSHIP.length - 1 - tier), next: up ? up.pets - pets : null }
}

/** Between pets: a pet is a moment, not a button to hold down. */
export const PET_COOLDOWN_MS = 20 * 60_000

/** How long until it can be petted again; 0 when it can be now. */
export const petWait = (p: Pick<Pixling, 'pettedAt'>, now: number): number =>
  p.pettedAt === null ? 0 : Math.max(0, p.pettedAt + PET_COOLDOWN_MS - now)

export const daysTogether = (p: Pixling, now: number): number =>
  Math.max(1, Math.floor((now - metAt(p)) / 86_400_000) + 1)
