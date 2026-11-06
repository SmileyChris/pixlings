// The pixling's life: hatching rolls, names, experience, levels and what each level unlocks.

import { FACE_IDS, NECK_IDS, type Face, type GearId, type Hat, type Neck } from './gear.ts'
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
  /** The gear chosen with `/pixling wear`; null wears the newest it has. */
  hat: Hat | 'none' | null
  face: Face | 'none' | null
  neck: Neck | 'none' | null
  /** Gear it keeps from before face gear dropped at random: sunglasses, for one past level 6. */
  kept: GearId[]
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
  /**
   * What its egg was rolled from: a birth time, the parent's when the parent had matured, else the
   * seed the parent's own egg came from, back to the last ancestor that matured. Null for a first egg
   * and for saves from before.
   */
  eggSeed: number | null
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

/** Each time its XP passes another SHINY_EGG_XP, this chance it lays a shiny egg: the next hatch is shiny. */
export const SHINY_EGG_CHANCE = 0.01
export const SHINY_EGG_XP = 1000

const NAMES = [
  'Mochi', 'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Pip', 'Sprocket', 'Tofu', 'Noodle', 'Waffles',
  'Bean', 'Kiwi', 'Miso', 'Pickle', 'Gizmo', 'Dumpling', 'Boba', 'Chip', 'Cookie', 'Fig',
  'Juniper', 'Lumen', 'Nova', 'Orbit', 'Pebble', 'Quill', 'Rune', 'Tango', 'Echo', 'Ziggy',
  'Null', 'Sudo', 'Lambda', 'Kernel', 'Cache', 'Async', 'Regex', 'Grep', 'Bit', 'Loop',
  'Hex', 'Tux', 'Ping', 'Pong', 'Turbo', 'Wasabi', 'Yuzu', 'Mango', 'Olive', 'Clover',
] as const

/** Picks a rarity by weight, then a species of it, then a name. Shininess is not rolled: it hatches from a shiny egg. */
export const roll = (random: () => number): { species: Species; name: string } => {
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
  const name = NAMES[Math.floor(random() * NAMES.length)] ?? 'Pip'
  return { species, name }
}

export const hatchPixling = (random: () => number, now: number, dex: readonly string[] = []): Pixling => {
  const { species, name } = roll(random)
  return {
    v: 1,
    species: species.id,
    isShiny: false,
    name,
    hatchedAt: now,
    xp: 0,
    hat: null,
    face: null,
    neck: null,
    kept: [],
    stats: emptyStats(),
    pettedAt: null,
    eggSeed: null,
    dex: [...new Set([...dex, species.id])],
    badges: {},
    streak: { last: null, days: 0, best: 0 },
    day: emptyDay(''),
    tics: {},
    persona: personaFor(species.id, now),
    adoptedFrom: null,
  }
}

/**
 * A pixling below this level when released hasn't matured: the next egg comes from the same birth
 * time as its own, so it hatches the same species and name. Releasing over and over rerolls nothing.
 */
export const MATURE_LEVEL = 5

/** What the next egg is rolled from: its own birth time once it has matured, else its own egg's seed again. */
export const nextSeedOf = (p: Pick<Pixling, 'hatchedAt' | 'eggSeed' | 'xp'>): number =>
  p.eggSeed !== null && levelOf(p.xp).level < MATURE_LEVEL ? p.eggSeed : p.hatchedAt

/** A random stream fixed by a birth time: the same seed rolls the same egg. */
export const seededRandom = (seed: number): (() => number) => {
  let a = (Math.floor(seed) % 0x7fffffff ^ Math.floor(seed / 0x100000000)) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The next egg after `p`, rolled from its seed: the same until a pixling matures. */
export const nextEgg = (p: Pixling, now: number): Pixling => {
  const seed = nextSeedOf(p)
  return { ...rehatch(p, seededRandom(seed), now), eggSeed: seed }
}

/** A new egg for the same person: the badges, streak, tics and dex are theirs and stay. */
export const rehatch = (p: Pixling, random: () => number, now: number): Pixling => ({
  ...hatchPixling(random, now, p.dex),
  isShiny: shinyEggOf(p) !== null,
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

export type Unlock = { level: number; hat?: Hat; face?: Face; neck?: Neck; label: string }

/** Hats come at set levels; every other level may drop face gear or neckwear (dropsOf). */
export const UNLOCKS: readonly Unlock[] = [
  { level: 2, hat: 'sprout', label: 'a sprout' },
  { level: 4, hat: 'shroom', label: 'a mushroom cap' },
  { level: 6, hat: 'beanie', label: 'a beanie' },
  { level: 9, hat: 'party', label: 'a party hat' },
  { level: 12, hat: 'crown', label: 'a crown' },
  { level: 15, hat: 'chef', label: "a chef's hat" },
  { level: 18, hat: 'halo', label: 'a halo' },
  { level: 25, hat: 'wizard', label: 'a wizard hat' },
  { level: 30, hat: 'cowboy', label: 'a cowboy hat' },
  { level: 35, hat: 'viking', label: 'a viking helmet' },
  { level: 42, hat: 'tophat', label: 'a top hat' },
  { level: 50, hat: 'grad', label: 'a graduation cap' },
]

export const GEAR_LABELS: Readonly<Record<Face | Neck, string>> = {
  shades: 'sunglasses',
  monocle: 'a monocle',
  visor: 'a visor',
  '3d': '3D glasses',
  eyepatch: 'an eyepatch',
  chain: 'a chain',
  bowtie: 'a bow tie',
  medal: 'a medal',
  scarf: 'a scarf',
  bandana: 'a bandana',
}

/**
 * How face gear and neckwear drop: from level `from`, each level without a hat has `chance` of a
 * piece, doubled for every `doubleAfter` such levels in a row without one (0 never doubles). Each
 * piece of the slot it has more of is `toward` times as likely, so a set fills before the other
 * starts (1 picks evenly).
 */
export type DropOdds = { readonly chance: number; readonly doubleAfter: number; readonly from: number; readonly toward: number }
export const DROP_ODDS: DropOdds = { chance: 0.1, doubleAfter: 4, from: 10, toward: 3 }

/** The chance at a level after `dry` levels in a row without a drop. */
export const chanceAfter = (odds: DropOdds, dry: number): number =>
  Math.min(1, odds.chance * 2 ** (odds.doubleAfter > 0 ? Math.floor(dry / odds.doubleAfter) : 0))

const HAT_LEVELS = new Set(UNLOCKS.map(u => u.level))
const DROPPABLE: readonly (Face | Neck)[] = [...FACE_IDS, ...NECK_IDS]
const isFacePiece = (id: string): boolean => (FACE_IDS as readonly string[]).includes(id)

/** One of `left` for the roll `r` in [0, 1): each piece of the slot `owned` has more of `toward` times as likely. */
const pickPiece = (left: readonly (Face | Neck)[], owned: ReadonlySet<string>, toward: number, r: number): Face | Neck => {
  const faces = [...owned].filter(isFacePiece).length
  const necks = owned.size - faces
  const isMore = (id: string): boolean => (faces > necks ? isFacePiece(id) : necks > faces ? !isFacePiece(id) : false)
  const weights = left.map(id => (isMore(id) ? toward : 1))
  let at = r * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < left.length; i++) if ((at -= weights[i]!) < 0) return left[i]!
  return left[left.length - 1]!
}

/** A roll in [0, 1) fixed by the egg and a level (or an XP step): every session and every replay agree. */
const rollAt = (hatchedAt: number, level: number, salt: number): number => {
  let x = Math.imul((hatchedAt % 0x7fffffff) ^ Math.imul(level, 0x9e3779b1) ^ salt, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 0x100000000
}

/**
 * What dropped at each level up to `level`, in order: from `odds.from`, a level with no hat rolls
 * `odds.chance` for a piece the pixling hasn't got, doubling after every `odds.doubleAfter` empty levels in a row, picked at
 * random from the rest, leaning toward the slot it has more of. The rolls come from the egg, so they need no saving.
 */
export const dropsOf = (p: Pick<Pixling, 'hatchedAt' | 'kept'>, level: number, odds: DropOdds = DROP_ODDS): Unlock[] => {
  const owned = new Set<string>(p.kept)
  const out: Unlock[] = []
  let dry = 0
  for (let at = Math.max(2, odds.from); at <= level; at++) {
    if (HAT_LEVELS.has(at)) continue
    const left = DROPPABLE.filter(id => !owned.has(id))
    if (left.length === 0) break
    if (rollAt(p.hatchedAt, at, 1) >= chanceAfter(odds, dry)) {
      dry++
      continue
    }
    dry = 0
    const id = pickPiece(left, owned, odds.toward, rollAt(p.hatchedAt, at, 2))
    owned.add(id)
    out.push(isFacePiece(id) ? { level: at, face: id as Face, label: GEAR_LABELS[id] } : { level: at, neck: id as Neck, label: GEAR_LABELS[id] })
  }
  return out
}

/** Everything the pixling has at `level`: hats by level, kept gear, and what dropped, in order. */
export const unlockedAt = (p: Pick<Pixling, 'hatchedAt' | 'kept'>, level: number): Unlock[] => {
  const kept = p.kept.flatMap((id): Unlock[] =>
    (FACE_IDS as readonly string[]).includes(id)
      ? [{ level: 0, face: id as Face, label: GEAR_LABELS[id as Face] }]
      : (NECK_IDS as readonly string[]).includes(id)
        ? [{ level: 0, neck: id as Neck, label: GEAR_LABELS[id as Neck] }]
        : [],
  )
  return [...kept, ...UNLOCKS.filter(u => u.level <= level), ...dropsOf(p, level)].sort((a, b) => a.level - b.level)
}

export type Gear = { hat: Hat | null; face: Face | null; neck: Neck | null }

/** What it wears: its choice when it has that piece, else the newest it got; 'none' for nothing. */
export const gearOf = (p: Pixling): Gear => {
  const open = unlockedAt(p, levelOf(p.xp).level)
  const choose = <T extends string>(chosen: T | 'none' | null, have: T[]): T | null =>
    chosen === 'none' ? null : chosen && have.includes(chosen) ? chosen : (have[have.length - 1] ?? null)
  return {
    hat: choose(p.hat, open.flatMap(u => (u.hat ? [u.hat] : []))),
    face: choose(p.face, open.flatMap(u => (u.face ? [u.face] : []))),
    neck: choose(p.neck, open.flatMap(u => (u.neck ? [u.neck] : []))),
  }
}

/** Adds experience; returns the new pixling and the levels crossed, with what they unlocked. */
export const gain = (
  p: Pixling,
  event: XpEvent,
): { pixling: Pixling; levelUp: { level: number; unlocks: Unlock[] } | null; isShinyEgg: boolean } => {
  const before = levelOf(p.xp).level
  const pixling = { ...p, xp: p.xp + XP[event], day: { ...p.day, xp: p.day.xp + XP[event] } }
  const after = levelOf(pixling.xp).level
  // Laid by now and not before: this gain crossed the step it came at.
  const isShinyEgg = shinyEggOf(p) === null && shinyEggOf(pixling) !== null
  if (after <= before) return { pixling, levelUp: null, isShinyEgg }
  return {
    pixling,
    levelUp: { level: after, unlocks: unlockedAt(p, after).filter(u => u.level > before) },
    isShinyEgg,
  }
}

/**
 * The shiny egg it has laid by now, or null: each time its XP passes another SHINY_EGG_XP, a roll
 * fixed by the egg comes under SHINY_EGG_CHANCE. The XP it came at, and the level it was then.
 */
export const shinyEggOf = (p: Pick<Pixling, 'hatchedAt' | 'xp'>, chance = SHINY_EGG_CHANCE): { xp: number; level: number } | null => {
  for (let k = 1; k * SHINY_EGG_XP <= p.xp; k++) {
    if (rollAt(p.hatchedAt, k, 4) < chance) return { xp: k * SHINY_EGG_XP, level: levelOf(k * SHINY_EGG_XP).level }
  }
  return null
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
    neck: v.neck ?? null,
    // A save from before gear dropped: sunglasses came at level 6, and one that had them keeps them.
    kept: Array.isArray(v.kept)
      ? v.kept.filter((id): id is GearId => typeof id === 'string')
      : levelOf(typeof v.xp === 'number' ? v.xp : 0).level >= 6
        ? ['shades']
        : [],
    stats: { ...emptyStats(), ...(v.stats ?? {}) },
    pettedAt: typeof v.pettedAt === 'number' ? v.pettedAt : null,
    eggSeed: typeof v.eggSeed === 'number' ? v.eggSeed : null,
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
 * hatch wins. Counters add up; name, hat, face and neck are ours when we changed them; badges, the dex,
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
    neck: pick(stored.neck, since.neck, ours.neck),
    kept: [...new Set([...stored.kept, ...ours.kept])],
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
