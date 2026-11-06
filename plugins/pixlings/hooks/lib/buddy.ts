// The bridge from Claude Code's retired /buddy. Its companion was left in the global config file
// (`~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json`) under `companion`: a name, a free-text
// personality and when it hatched. Its body was never stored: /buddy rolled it afresh from the
// account id each time. Its personality was written from that body at hatch, so a species the
// personality names is taken first; else the roll is redone, to the same species and shininess
// while the same account is signed in. That file holds much
// else of the person's; only those three fields and what the roll gives are ever kept from it.
// The account id is hashed here and dropped. The file's text is parsed here and dropped, never
// printed, stored or sent, and a parse error is not passed on (an engine's message can quote it).

import { oneLine } from './persona.ts'
import type { Pixling } from './progress.ts'

export type Companion = {
  name: string
  personality: string | null
  hatchedAt: number | null
  /** The pixling species its body was: /buddy's 18 are Pixlings' 18, its blob our blip. */
  species: string
  isShiny: boolean
}

/** The file name, and the variable that moves the folder it lives in. */
export const CONFIG_FILE = '.claude.json'

/** Where the companion is looked for: the config folder when one is set, else the home folder. */
export const configPath = (home: string, configDir: string | undefined, isWindows: boolean): string => {
  const sep = isWindows ? '\\' : '/'
  const folder = configDir && configDir.trim() !== '' ? configDir : home
  return `${folder.replace(/[\\/]+$/, '')}${sep}${CONFIG_FILE}`
}

/**
 * Epoch milliseconds from epoch milliseconds, epoch seconds or an ISO date; null when it is none
 * of those. A number under 1e11 is seconds: 1e11 ms is 1973, 1e11 s is the year 5138.
 */
export const epochMs = (value: unknown): number | null => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number(value)
        : typeof value === 'string'
          ? Date.parse(value)
          : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n < 1e11 ? n * 1000 : n)
}

// The roll ----------------------------------------------------------------------------------------

/** /buddy's species, in the order it picked from. */
const BUDDY_SPECIES = [
  'duck', 'goose', 'blip', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle',
  'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk',
] as const
const SALT = 'friend-2026-401'
const RARITY_WEIGHTS = [60, 25, 10, 4, 1] as const

const utf8 = (s: string): number[] => {
  const out: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

const M64 = (1n << 64n) - 1n
const SECRET = [0xa0761d6478bd642fn, 0xe7037ed1a0b428dbn, 0x8ebc6af09c88c6e3n, 0x589965cc75374cc3n] as const
const mum = (a: bigint, b: bigint): [bigint, bigint] => {
  const x = a * b
  return [x & M64, (x >> 64n) & M64]
}
const mix = (a: bigint, b: bigint): bigint => {
  const [lo, hi] = mum(a, b)
  return lo ^ hi
}
const le = (bytes: readonly number[], at: number, n: number): bigint => {
  let v = 0n
  for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[at + i] ?? 0)
  return v
}

/** `Bun.hash`: Zig's Wyhash, seed 0, over the UTF-8 bytes. */
export const wyhash = (text: string): bigint => {
  const bytes = utf8(text)
  const len = bytes.length
  let s0 = mix(SECRET[0], SECRET[1])
  let s1 = s0
  let s2 = s0
  let a: bigint
  let b: bigint
  if (len <= 16) {
    if (len >= 4) {
      const end = len - 4
      const q = (len >> 3) << 2
      a = (le(bytes, 0, 4) << 32n) | le(bytes, q, 4)
      b = (le(bytes, end, 4) << 32n) | le(bytes, end - q, 4)
    } else if (len > 0) {
      a = (BigInt(bytes[0] ?? 0) << 16n) | (BigInt(bytes[len >> 1] ?? 0) << 8n) | BigInt(bytes[len - 1] ?? 0)
      b = 0n
    } else {
      a = 0n
      b = 0n
    }
  } else {
    let i = 0
    if (len >= 48) {
      for (; i + 48 < len; i += 48) {
        s0 = mix(le(bytes, i, 8) ^ SECRET[1], le(bytes, i + 8, 8) ^ s0)
        s1 = mix(le(bytes, i + 16, 8) ^ SECRET[2], le(bytes, i + 24, 8) ^ s1)
        s2 = mix(le(bytes, i + 32, 8) ^ SECRET[3], le(bytes, i + 40, 8) ^ s2)
      }
      s0 ^= s1 ^ s2
    }
    for (; i + 16 < len; i += 16) s0 = mix(le(bytes, i, 8) ^ SECRET[1], le(bytes, i + 8, 8) ^ s0)
    a = le(bytes, len - 16, 8)
    b = le(bytes, len - 8, 8)
  }
  ;[a, b] = mum(a ^ SECRET[1], b ^ s0)
  return mix(a ^ SECRET[0] ^ BigInt(len), b ^ SECRET[1])
}

/** FNV-1a over UTF-16 code units: what /buddy hashed with where there was no Bun (an npm install). */
export const fnv1a = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The body /buddy rolled for this account: its rarity, species, eyes, hat (none for a common)
 * and shininess, in that order, from one stream seeded by the account id and its salt. The
 * native install hashed with `Bun.hash`; an npm install, under Node, with FNV-1a.
 */
export const buddyBody = (userId: string, isNative: boolean): { species: string; isShiny: boolean } => {
  const key = userId + SALT
  const rng = mulberry32(isNative ? Number(wyhash(key) & 0xffffffffn) : fnv1a(key))
  let roll = rng() * 100
  let rarity = 0
  while (rarity < RARITY_WEIGHTS.length - 1 && (roll -= RARITY_WEIGHTS[rarity] ?? 0) >= 0) rarity++
  const species = BUDDY_SPECIES[Math.floor(rng() * BUDDY_SPECIES.length)] ?? 'blip'
  rng() // its eyes
  if (rarity > 0) rng() // its hat
  return { species, isShiny: rng() < 0.01 }
}

/** The one species a Buddy's personality names ("a sharp-tongued rabbit"), or null for none or several. */
export const speciesInText = (text: string): string | null => {
  const named = new Set<string>()
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) {
    const word = m[0]
    const id = BUDDY_SPECIES.find(s => word === s || word === `${s}s` || word === `${s}es`) ?? (/^blobs?$/.test(word) ? 'blip' : undefined)
    if (id) named.add(id)
  }
  return named.size === 1 ? ([...named][0] ?? null) : null
}

/** A name the pixling can wear: what `/pixling name` allows, at most 20 characters. */
export const cleanName = (name: string): string =>
  name
    .replace(/[^\p{L}\p{N} _'-]/gu, '')
    .slice(0, 20)
    .trim()

/**
 * The companion in a config file's text, or null when there is none to adopt. Everything but
 * its name, personality, hatch time and the body rolled from the account id is left behind with
 * the parsed text.
 */
export const companionOf = (text: string): Companion | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed['companion'])) return null
  const c = parsed['companion']
  const name = typeof c['name'] === 'string' ? cleanName(c['name']) : ''
  if (!name) return null
  const personality = typeof c['personality'] === 'string' ? oneLine(c['personality']) : ''
  // /buddy's own fallbacks: the signed-in account, else the install's id, else 'anon'.
  const account = isRecord(parsed['oauthAccount']) ? parsed['oauthAccount']['accountUuid'] : undefined
  const userId = typeof account === 'string' && account ? account : typeof parsed['userID'] === 'string' && parsed['userID'] ? parsed['userID'] : 'anon'
  // Only an npm install ran under Node; the native one, the default, under Bun.
  const method = parsed['installMethod']
  const isNode = typeof method === 'string' && /^(npm.*|global|local)$/i.test(method)
  // The body the personality was written for, when it names one; it says "shiny" if it was.
  const told = speciesInText(personality)
  const body = told ? { species: told, isShiny: /\bshiny\b/i.test(personality) } : buddyBody(userId, !isNode)
  return { name, personality: personality || null, hatchedAt: epochMs(c['hatchedAt']), ...body }
}

/**
 * The pixling taking the companion in: its name, its personality (a template's stays when the
 * Buddy had none), its hatch time for the days together, and its body: the species joins the
 * dex, and a shiny Buddy is shiny (a shiny pixling stays one). Level, stats, badges, streak,
 * tics and the rest of the dex are untouched. Adopting again changes nothing more.
 */
export const adopt = (p: Pixling, c: Companion): Pixling => ({
  ...p,
  name: c.name,
  persona: c.personality ?? p.persona,
  adoptedFrom: { name: c.name, hatchedAt: c.hatchedAt },
  species: c.species,
  isShiny: p.isShiny || c.isShiny,
  dex: p.dex.includes(c.species) ? p.dex : [...p.dex, c.species],
})

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
