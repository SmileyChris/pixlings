// Eggs: each one's look, picked by its seed, and its 16×16 pixels. A natural pattern on one of six
// shells, and on top a mark that hints at what is inside without saying: plain, a mossy vine,
// glowing veins, or a gold cap (epic and legendary alike). A shiny egg shines harder than a pixling.
// Pure and on its own: canvas.ts stamps these pixels where it drew the one cream egg.

import { seededRandom } from './progress.ts'
import type { Rarity } from './sprites.ts'

export const EGG_SHAPE: readonly string[] = [
  '................',
  '................',
  '......KKKK......',
  '.....KWWWWK.....',
  '....KWWLWWWK....',
  '...KWWLWWWWWK...',
  '...KWWWWWSWWK...',
  '..KWWWWWSSWWWK..',
  '..KWSWWWWWWWWK..',
  '..KWSSWWWWWLWK..',
  '..KWWWWWWWLWWK..',
  '..KWWWWWWWWWSK..',
  '...KWWWWWWWSK...',
  '...KSWWWWWSSK...',
  '....KKSSSSKK....',
  '......KKKK......',
]

export type Shell = 'cream' | 'rose' | 'sand' | 'fog' | 'peach' | 'charcoal'
export type Pattern = 'speckled' | 'spotted' | 'dappled' | 'marbled' | 'dusted'
export type Mark = 'plain' | 'mossy' | 'glowing' | 'gilded'

/** Outline, shell, shade, highlight and the pattern's colour. */
export const SHELLS: Record<Shell, { K: number; W: number; S: number; L: number; M: number }> = {
  cream: { W: 0xfaf3e3, S: 0xd9c9a8, L: 0xffffff, K: 0x5d4a3a, M: 0xb08a5e },
  rose: { W: 0xf7e1e6, S: 0xdfb6c0, L: 0xfff4f6, K: 0x5e3c46, M: 0xc9788c },
  sand: { W: 0xefe2c4, S: 0xd2bf95, L: 0xfbf4e2, K: 0x5a4a2c, M: 0xa88a4e },
  fog: { W: 0xe4e6ea, S: 0xbcc1ca, L: 0xf6f7f9, K: 0x3e434c, M: 0x7d8594 },
  peach: { W: 0xfde8dc, S: 0xe9bfa8, L: 0xfff6f0, K: 0x64463a, M: 0xd98466 },
  charcoal: { W: 0x4f4b56, S: 0x3a3740, L: 0x77727f, K: 0x1d1b22, M: 0x9a94a4 },
}

const SHELL_IDS = Object.keys(SHELLS) as Shell[]
const PATTERNS: readonly Pattern[] = ['speckled', 'spotted', 'dappled', 'marbled', 'dusted']
const MARK_OF: Record<Rarity, Mark> = { common: 'plain', uncommon: 'mossy', rare: 'glowing', epic: 'gilded', legendary: 'gilded' }

const MOSS = 0x6fdc8c
const MOSS_DARK = 0x3f9e5c
const LEAF = 0xa8f0bd
const GLOW = 0x5aa9ff
const GLOW_HOT = 0xd6ebff
const GOLD = 0xffc53d
const GOLD_SHADE = 0xc98f1a
const GOLD_SHINE = 0xfff0b8
/** How far the cap's outline leans toward gold, at full strength; its lightness never moves. */
const RIM_LEAN = 0.65
const WHITE = 0xffffff
const GLINT = 0xfff6bd
const FLARE_AIR = 0xc8c29a

// The egg's shine: a pixling's, faster and brighter, so it can't be missed in a nest.
const SHINE_MS = 1500
const SHEEN_CHANCE = 0.45
const SHEEN_LIFT = 0.38
const SHEEN_MS = 650
const GLINT_MS = 480

type Point = readonly [number, number]

const LOOK_SALT = 0x9e3779b9

/** A pattern pixel: the mark colour, or (dappled) a tint a shade off the shell. */
type Spot = 'mark' | 'tint'

export type EggLook = {
  readonly seed: number
  readonly pattern: Pattern
  readonly shell: Shell
  readonly mark: Mark
  readonly isShiny: boolean
  /** Pattern pixels by index (y·16 + x). */
  readonly spots: Readonly<Record<number, Spot>>
  /** Glowing veins: each pixel and how far along its vein it is. */
  readonly veins: readonly (readonly [number, number, number])[]
  readonly flecks: readonly Point[]
  readonly phase: number
  /** Where in its shine each egg starts, so a nest's eggs don't shine in step. */
  readonly clockOffset: number
}

const at = (x: number, y: number): string => EGG_SHAPE[y]?.[x] ?? '.'
/** Shell, shade or highlight: inside the outline. */
const inside = (x: number, y: number): boolean => 'WLS'.includes(at(x, y))
const RIM: readonly Point[] = EGG_SHAPE.flatMap((row, y) => [...row].flatMap((c, x) => (c === 'K' ? [[x, y] as const] : [])))

/** The egg `seed` lays, holding a `rarity`: the same seed is always the same egg. */
export const eggLookOf = (seed: number, rarity: Rarity, isShiny: boolean): EggLook => {
  // Its own stream, apart from the one its species is rolled from: a look must not give that away.
  const r = seededRandom(Math.imul(seed ^ LOOK_SALT, 0x85ebca6b) >>> 0)
  const pattern = PATTERNS[Math.floor(r() * PATTERNS.length)] ?? 'speckled'
  const shell = SHELL_IDS[Math.floor(r() * SHELL_IDS.length)] ?? 'cream'
  const ph = r() * 6.28
  const spots: Record<number, Spot> = {}
  const spot = (x: number, y: number, kind: Spot = 'mark'): void => {
    if (inside(x, y) && at(x, y) !== 'L') spots[y * 16 + x] = kind
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y) || at(x, y) === 'L') continue
      if (pattern === 'speckled' && r() < 0.14) spot(x, y)
      if (pattern === 'marbled' && Math.sin(x * 0.8 + Math.sin(y * 0.75 + ph) * 2.2 + ph) > 0.82) spot(x, y)
      // Thicker toward the base, leaving the top clear for a cap.
      if (pattern === 'dusted' && r() < 0.03 + 0.4 * Math.pow(Math.max(0, y - 6) / 8, 1.6)) spot(x, y)
    }
  }
  if (pattern === 'spotted') {
    for (let i = 0; i < 4; i++) {
      const cx = 4 + Math.floor(r() * 8)
      const cy = 5 + Math.floor(r() * 8)
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) spot(cx + dx, cy + dy)
    }
  }
  if (pattern === 'dappled') {
    for (let i = 0; i < 4; i++) {
      const cx = 3 + Math.floor(r() * 9)
      const cy = 5 + Math.floor(r() * 8)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) spot(cx + dx, cy + dy, 'tint')
      spot(cx + (r() < 0.5 ? -1 : 2), cy + Math.floor(r() * 2), 'tint')
    }
  }
  const veins: [number, number, number][] = []
  for (let v = 0; v < 4; v++) {
    let x = 4 + Math.floor(r() * 8)
    let y = 4 + v * 2
    for (let s = 0; s < 7 - v; s++) {
      if (inside(x, y)) veins.push([x, y, s])
      if (s === 2 && inside(x + 1, y)) veins.push([x + 1, y, s])
      y++
      x += Math.floor(r() * 3) - 1
    }
  }
  const flecks: Point[] = []
  while (flecks.length < 7) {
    const x = 3 + Math.floor(r() * 10)
    const y = 6 + Math.floor(r() * 8)
    if (inside(x, y) && at(x, y) !== 'L') flecks.push([x, y])
  }
  const phase = r() * 6.28
  return { seed, pattern, shell, mark: MARK_OF[rarity], isShiny, spots, veins, flecks, phase, clockOffset: Math.floor(r() * 4500) }
}

/** The egg at `t` ms as 16×16 colours, row by row, null off the egg. A null look is the cream egg. */
export const eggPixels = (look: EggLook | null, t: number): (number | null)[] => {
  const P = SHELLS[look?.shell ?? 'cream']
  const buf: (number | null)[] = new Array(256).fill(null)
  const markShade = mix(P.M, P.K, 0.3)
  const tint = mix(P.W, P.M, 0.4)
  const tintShade = mix(P.S, P.M, 0.4)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = at(x, y)
      const k = y * 16 + x
      if (c === '.') continue
      const s = look?.spots[k]
      buf[k] =
        c === 'K' ? P.K
        : c === 'L' ? P.L
        : c === 'S' ? (s === 'mark' ? markShade : s === 'tint' ? tintShade : P.S)
        : s === 'mark' ? P.M
        : s === 'tint' ? tint
        : P.W
    }
  }
  if (!look) return buf
  if (look.mark === 'mossy') {
    for (let x = 3; x < 13; x++) {
      const y = 12 + Math.round(Math.sin(x * 0.9 + look.phase) * 0.8)
      if (inside(x, y)) buf[y * 16 + x] = MOSS
      if (inside(x, y + 1)) buf[(y + 1) * 16 + x] = MOSS_DARK
      if ((x + Math.round(look.phase)) % 4 === 0 && inside(x, y - 1)) buf[(y - 1) * 16 + x] = LEAF
    }
  }
  if (look.mark === 'glowing') {
    const pulse = (Math.sin(t / 650 + look.phase) + 1) / 2
    for (const [x, y, s] of look.veins) {
      const k = y * 16 + x
      const wave = (Math.sin(t / 260 - s * 0.9) + 1) / 2
      buf[k] = mix(mix(buf[k] ?? P.W, GLOW, 0.55 + pulse * 0.45), GLOW_HOT, wave * pulse * 0.7)
    }
  }
  if (look.mark === 'gilded') {
    const first = look.flecks[0]?.[0] ?? 0
    for (let y = 2; y <= 5; y++) {
      for (let x = 0; x < 16; x++) {
        if (!inside(x, y)) continue
        buf[y * 16 + x] = at(x, y) === 'L' ? GOLD_SHINE : y === 5 && (x + first) % 2 === 0 ? GOLD_SHADE : GOLD
      }
    }
    for (const [x, y] of look.flecks) buf[y * 16 + x] = GOLD
    // The outline round the cap leans toward gold, keeping its own lightness, and fades out below.
    for (const [x, y] of RIM) {
      const k = y <= 4 ? 1 : y === 5 ? 0.65 : y === 6 ? 0.3 : 0
      if (k) buf[y * 16 + x] = leanToGold(P.K, k * RIM_LEAN)
    }
  }
  if (look.isShiny) shine(buf, t + look.clockOffset)
  return buf
}

/** What a surface with no pictures says instead: the look in plain words, never what it holds. */
export const describeEgg = (look: EggLook): string => {
  const mark =
    look.mark === 'mossy' ? ' with a green vine'
    : look.mark === 'glowing' ? ' with glowing blue veins'
    : look.mark === 'gilded' ? ' with a gold cap'
    : ''
  return `A ${look.pattern} ${look.shell} egg${mark}${look.isShiny ? ', shimmering' : ''}`
}

// The shine -------------------------------------------------------------------------------------
// Each beat either sweeps a band of light across the egg and glints the edge it crosses, or glints
// one outline pixel toward the top left. Every beat flares a cross round its glint.

const shine = (buf: (number | null)[], clock: number): void => {
  const beat = Math.floor(clock / SHINE_MS)
  const local = clock - beat * SHINE_MS
  const flare = 1 + Math.floor(hash(beat * 29 + 3) * 2)
  const peakAt = (g: number): number => 1 - Math.abs((g / GLINT_MS) * 2 - 1)
  const glintAt = ([x, y]: Point, peak: number): void => {
    const k = y * 16 + x
    const c = buf[k]
    if (c !== null && c !== undefined) buf[k] = mix(c, GLINT, Math.min(1, peak * 1.6))
    if (peak <= 0.45) return
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx > 15 || ny > 15) continue
      const n = buf[ny * 16 + nx]
      if (n !== null && n !== undefined) buf[ny * 16 + nx] = mix(n, WHITE, 0.45 * peak)
      else if (flare >= 2 && peak > 0.75) buf[ny * 16 + nx] = FLARE_AIR
    }
  }
  if (hash(beat * 11 + 5) >= SHEEN_CHANCE) {
    if (local >= GLINT_MS) return
    const ranked = RIM.map((pt, i) => ({ pt, score: hash(beat * 31 + i) * 0.3 + (1 - (pt[0] / 16 + pt[1] / 16) / 2) * 0.7 })).sort(
      (a, b) => b.score - a.score,
    )
    const pick = ranked[Math.floor(hash(beat * 5 + 9) * 4)]
    if (pick) glintAt(pick.pt, peakAt(local))
    return
  }
  if (local >= SHEEN_MS + GLINT_MS) return
  const tilt = 0.5 + hash(beat * 7 + 1) * 1.25
  const uMin = 2 + 2 * tilt
  const uMax = 13 + 15 * tilt
  const pos = uMin - 2 + (uMax - uMin + 4) * Math.min(1, local / SHEEN_MS)
  if (local < SHEEN_MS) {
    for (let k = 0; k < 256; k++) {
      const c = buf[k]
      if (c === null || c === undefined) continue
      const d = Math.abs((k % 16) + Math.floor(k / 16) * tilt - pos)
      if (d < 1.5) buf[k] = mix(c, WHITE, SHEEN_LIFT * (1 - d / 1.5))
    }
  }
  const fireAt = SHEEN_MS * (0.2 + hash(beat * 3 + 2) * 0.6)
  if (local >= fireAt && local < fireAt + GLINT_MS) {
    const u = uMin - 2 + ((uMax - uMin + 4) * fireAt) / SHEEN_MS
    const gap = ([x, y]: Point): number => Math.abs(x + y * tilt - u)
    const edge = RIM.reduce((b, p) => (gap(p) < gap(b) || (gap(p) === gap(b) && p[1] < b[1]) ? p : b))
    glintAt(edge, peakAt(local - fireAt))
  }
}

// Colour ----------------------------------------------------------------------------------------

const mix = (a: number, b: number, k: number): number => {
  const t = Math.max(0, Math.min(1, k))
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const hash = (n: number): number => seededRandom(n * 7919 + 13)()

const toHsl = (c: number): [number, number, number] => {
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

const fromHsl = ([h, s, l]: [number, number, number]): number => {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const ch = (v: number): number => Math.round((v + m) * 255)
  return (ch(r) << 16) | (ch(g) << 8) | ch(b)
}

/** Blends toward gold, then puts the colour's own lightness back: it never passes through other hues. */
const leanToGold = (c: number, k: number): number => {
  const [h, s] = toHsl(mix(c, GOLD, k))
  return fromHsl([h, s, toHsl(c)[2]])
}
