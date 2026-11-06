// Wearable gear: hats, face gear and neckwear. Each species wears each piece in a box fitted by
// hand (fit.ts); the pieces here draw themselves into any box, stretched or squashed to fit.

import { FIT } from './fit.ts'
import type { Species } from './sprites.ts'

export type Hat = 'sprout' | 'shroom' | 'beanie' | 'party' | 'crown' | 'chef' | 'halo' | 'wizard' | 'cowboy' | 'viking' | 'tophat' | 'grad'
export type Face = 'shades' | 'monocle' | 'visor' | '3d' | 'eyepatch'
export type Neck = 'chain' | 'bowtie' | 'medal' | 'scarf' | 'bandana'
export type GearId = Hat | Face | Neck

export type Metal = 'gold' | 'silver' | 'copper'
export type Cloth = 'red' | 'blue' | 'black' | 'green'
export type Stripes = 'blue-white' | 'blue-yellow'

/** Where a piece sits, in sprite pixels from the art's top-left, facing as drawn; and its look. */
export type Box = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  /** Sunglasses: each lens's width. */
  readonly lens?: number
  readonly metal?: Metal
  readonly color?: Cloth
  readonly stripes?: Stripes
  /** Eyepatch: the strap round the head. */
  readonly band?: boolean
  /** Bandana: white polka dots. */
  readonly dots?: boolean
  /** Medal: each strap's width. */
  readonly strap?: number
  /** Medal: the disc's width. */
  readonly disc?: number
}

export const HAT_IDS: readonly Hat[] = ['sprout', 'shroom', 'beanie', 'party', 'crown', 'chef', 'halo', 'wizard', 'cowboy', 'viking', 'tophat', 'grad']
export const FACE_IDS: readonly Face[] = ['shades', 'monocle', 'visor', '3d', 'eyepatch']
export const NECK_IDS: readonly Neck[] = ['chain', 'bowtie', 'medal', 'scarf', 'bandana']

export const isHat = (id: string): id is Hat => (HAT_IDS as readonly string[]).includes(id)
export const isFace = (id: string): id is Face => (FACE_IDS as readonly string[]).includes(id)
export const isNeck = (id: string): id is Neck => (NECK_IDS as readonly string[]).includes(id)

// Hats ----------------------------------------------------------------------------------------

type HatArt = {
  readonly rows: readonly string[]
  readonly colors: Readonly<Record<string, number>>
  /** How far above the head's top row the hat's top row sits, for a species with no fitted box. */
  readonly lift: number
  /** Columns on each side that keep their width when the hat stretches (a brim's tip, a tassel). */
  readonly edges?: number
}

export const HATS: Readonly<Record<Hat, HatArt>> = {
  sprout: { rows: ['LL.LL', '.LGL.', '..G..'], colors: { L: 0x8ee08a, G: 0x3f9a4a }, lift: 3 },
  shroom: { rows: ['...W...', '.RRRRR.', 'RWRWRWR'], colors: { R: 0xe8475f, W: 0xfff4f4 }, lift: 2 },
  beanie: { rows: ['..W..', '.BBB.', 'BBBBB', 'CCCCC'], colors: { W: 0xf4f1e6, B: 0x3fae5a, C: 0x2f8b46 }, lift: 3 },
  party: { rows: ['..Y..', '..P..', '.PBP.', '.BPB.', 'PBPBP'], colors: { Y: 0xffe14d, P: 0xff5fa2, B: 0x5ad1ff }, lift: 4 },
  crown: { rows: ['Y.Y.Y', 'YYYYY', 'YRYBY'], colors: { Y: 0xffd23f, R: 0xff4d6d, B: 0x4dc3ff }, lift: 2 },
  chef: { rows: ['.WWWWW.', 'WWWWWWW', '.WWWWW.', '.SSSSS.'], colors: { W: 0xfbfaf5, S: 0xd9d6cc }, lift: 3, edges: 1 },
  halo: { rows: ['.YYYYY.', 'Y.....Y', '.YYYYY.'], colors: { Y: 0xffe98a }, lift: 5 },
  wizard: {
    rows: ['....P..', '...PP..', '..PYP..', '..PPPP.', '.PPPPPP', 'BBBBBBBB'],
    colors: { P: 0x7b4dff, Y: 0xffe14d, B: 0x4a2fb8 },
    lift: 5,
  },
  cowboy: { rows: ['..BB.BB..', '..BBBBB..', '..DDDDD..', 'BBBBBBBBB'], colors: { B: 0xa0622d, D: 0x5e3a1a }, lift: 3, edges: 2 },
  viking: {
    rows: ['W.....W', 'W.SSS.W', 'WSSHSSW', 'GGGGGGG'],
    colors: { W: 0xf4f1e6, S: 0x9aa3b5, H: 0xe6e9f2, G: 0xb8862b },
    lift: 3,
    edges: 1,
  },
  tophat: { rows: ['.KKKKK.', '.KHKKK.', '.KHKKK.', '.RRRRR.', 'KKKKKKK'], colors: { K: 0x2e2e3e, H: 0x4a4a60, R: 0xd8344a }, lift: 4 },
  grad: { rows: ['HHHHHHHHH', '..KKKKK.Y', '..KKKKK.Y'], colors: { H: 0x4a4a60, K: 0x2e2e3e, Y: 0xffd23f }, lift: 2, edges: 2 },
}

type Put = (x: number, y: number, color: number) => void

/** A hat's pattern stretched to its box by nearest pixel; with `edges`, only its middle stretches. */
const drawHat = (id: Hat, it: Box, put: Put): void => {
  const g = HATS[id]
  const gw = Math.max(...g.rows.map(row => row.length))
  const gh = g.rows.length
  const e = g.edges && it.w > 2 * g.edges ? g.edges : 0
  const col = (x: number): number => {
    if (!e) return Math.floor((x * gw) / it.w)
    if (x < e) return x
    if (x >= it.w - e) return gw - (it.w - x)
    const i = x - e
    const mw = it.w - 2 * e
    const gm = gw - 2 * e
    // Evenly from the middle out, so a symmetric hat stays symmetric.
    return e + (i < mw / 2 ? Math.floor((i * gm) / mw) : gm - 1 - Math.floor(((mw - 1 - i) * gm) / mw))
  }
  for (let y = 0; y < it.h; y++) {
    const row = g.rows[Math.floor((y * gh) / it.h)] ?? ''
    for (let x = 0; x < it.w; x++) {
      const ch = row[col(x)] ?? '.'
      const color = g.colors[ch]
      if (ch !== '.' && color !== undefined) put(it.x + x, it.y + y, color)
    }
  }
}

// Face gear and neckwear ---------------------------------------------------------------------

/** [main, shade, highlight] */
const METALS: Readonly<Record<Metal, readonly [number, number, number]>> = {
  gold: [0xf2c14e, 0xb8862b, 0xfff1a8],
  silver: [0xe6e9f2, 0x9aa3b5, 0xffffff],
  copper: [0xe8742a, 0x9a4416, 0xffb07a],
}
/** [cloth, knot or tie, fold]: the fold is a bow tie's middle row, a tone between the two. */
const CLOTHS: Readonly<Record<Cloth, readonly [number, number, number]>> = {
  red: [0xd8344a, 0x8e1b2c, 0xb32a3f],
  blue: [0x4d7cff, 0x24357a, 0x3a5fd0],
  black: [0x3a3a4c, 0x101018, 0x25252f],
  green: [0x3fae5a, 0x1f6b34, 0x2f8b46],
}
const SCARVES: Readonly<Record<Stripes, readonly [number, number]>> = {
  'blue-white': [0x4d7cff, 0xf4f1e6],
  'blue-yellow': [0x4d7cff, 0xffd23f],
}
const STRAP_BLUE = 0x4d7cff
const STRAP_RED = 0xd8344a
const WHITE = 0xffffff
const CREAM = 0xf4f1e6

/** On a shiny body the fitted metal can vanish or clash: these species wear another. */
const SHINY_METAL: Readonly<Record<string, Metal>> = { robot: 'silver', capybara: 'gold', chonk: 'copper' }
/** Likewise the fitted cloth of a bow tie or bandana. */
const SHINY_CLOTH: Readonly<Record<string, Cloth>> = { octopus: 'red' }

const metal = (it: Box): readonly [number, number, number] => METALS[it.metal ?? 'gold']
const cloth = (it: Box): readonly [number, number, number] => CLOTHS[it.color ?? 'red']

const DRAW: Readonly<Record<Face | Neck, (it: Box, put: Put) => void>> = {
  // A bar along the top, a dark lens at each end with a glint.
  shades(it, put) {
    const frame = 0x101018
    const lens = Math.min(it.lens ?? 4, it.w)
    for (let x = it.x; x < it.x + it.w; x++) put(x, it.y, frame)
    for (const lx of [it.x, it.x + it.w - lens]) {
      for (let dy = 0; dy < it.h; dy++) for (let dx = 0; dx < lens; dx++) put(lx + dx, it.y + dy, frame)
      put(lx + 1, it.y, 0x8fa3ff)
    }
  },
  // A ring round one eye, a short cord hanging from its corner.
  monocle(it, put) {
    const [a, b] = metal(it)
    for (let x = it.x; x < it.x + it.w; x++) {
      put(x, it.y, a)
      put(x, it.y + it.h - 1, a)
    }
    for (let y = it.y; y < it.y + it.h; y++) {
      put(it.x, y, a)
      put(it.x + it.w - 1, y, a)
    }
    for (let i = 1; i <= 3; i++) put(it.x + it.w - 1, it.y + it.h - 1 + i, i % 2 ? b : a)
  },
  // One band right across, lighter along the top.
  visor(it, put) {
    for (let x = it.x; x < it.x + it.w; x++) {
      for (let dy = 0; dy < it.h; dy++) put(x, it.y + dy, dy === 0 ? 0x9ff3ff : 0x2fb8d8)
    }
  },
  // A cream frame along the top, a red lens and a cyan one.
  '3d'(it, put) {
    for (let x = it.x; x < it.x + it.w; x++) put(x, it.y, CREAM)
    const lens = Math.ceil(it.w / 2)
    for (const [lx, color] of [
      [it.x, 0xe8434b],
      [it.x + it.w - lens, 0x3ec6e0],
    ] as const) {
      for (let dy = 1; dy < it.h; dy++) for (let dx = 0; dx < lens; dx++) put(lx + dx, it.y + dy, color)
      if (it.h > 1) put(lx + 1, it.y + 1, WHITE)
    }
  },
  // Square along the top, its bottom corners clipped; with the band, a strap each way, the long
  // one climbing up and over to the right.
  eyepatch(it, put) {
    const patch = 0x141420
    const strap = 0x3a3a4c
    const isRound = it.w >= 3 && it.h >= 2
    for (let y = 0; y < it.h; y++) {
      for (let x = 0; x < it.w; x++) {
        const isCorner = isRound && (x === 0 || x === it.w - 1) && y === it.h - 1
        if (!isCorner) put(it.x + x, it.y + y, patch)
      }
    }
    if (it.band) {
      put(it.x - 1, it.y, strap)
      const r = it.x + it.w
      put(r, it.y, strap)
      put(r + 1, it.y - 1, strap)
      put(r + 2, it.y - 1, strap)
      put(r + 3, it.y - 2, strap)
    }
  },
  // A sagging line, filled down to its neighbors so a deep sag stays joined, a pendant at the
  // lowest point.
  chain(it, put) {
    const [a, b, hi] = metal(it)
    const left = it.x
    const right = it.x + it.w - 1
    const c = (left + right) / 2
    const half = Math.max(1, (right - left) / 2)
    const depth = Math.max(0, it.h - 3)
    const sagAt = (x: number): number => 1 - ((x - c) / half) ** 2
    const peak = Math.max(sagAt(Math.floor(c)), sagAt(Math.ceil(c)), 1e-9)
    const yAt = (x: number): number => it.y + Math.round((depth * sagAt(x)) / peak)
    let bottom = it.y
    for (let x = left; x <= right; x++) {
      const y = yAt(x)
      const to = Math.max(y, x > left ? yAt(x - 1) - 1 : y, x < right ? yAt(x + 1) - 1 : y)
      for (let yy = y; yy <= to; yy++) {
        put(x, yy, (x + yy) % 2 ? a : b)
        bottom = Math.max(bottom, yy)
      }
    }
    const pc = Math.round(c)
    put(pc - 1, bottom + 1, a)
    put(pc, bottom + 1, hi)
    put(pc + 1, bottom + 1, a)
    put(pc, bottom + 2, b)
  },
  // Two wings widening out from a knot.
  bowtie(it, put) {
    const [wing, knot, fold] = cloth(it)
    const kw = it.w % 2 === 0 ? 2 : 1
    const k0 = it.x + (it.w - kw) / 2
    const reach = Math.max(1, (it.w - kw) / 2)
    const mid = (it.h - 1) / 2
    for (let x = it.x; x < it.x + it.w; x++) {
      const isKnot = x >= k0 && x < k0 + kw
      const t = isKnot ? 0 : (x < k0 ? k0 - x : x - (k0 + kw - 1)) / reach
      for (let y = 0; y < it.h; y++) {
        const d = Math.abs(y - mid)
        if (isKnot ? d <= 0.5 : d <= t * mid + 1e-9) put(x, it.y + y, isKnot ? knot : it.h >= 3 && d <= 0.5 ? fold : wing)
      }
    }
  },
  // A blue strap from the top-left corner and a red one from the top-right, meeting at a disc.
  medal(it, put) {
    const [a, b, hi] = metal(it)
    const strap = it.strap ?? 1
    const discW = Math.min(it.disc ?? 4, it.w)
    const discH = Math.min(3, it.h)
    const off = Math.floor((it.w - discW) / 2)
    const rows = it.h - discH
    const end = Math.max(0, off - (strap - 1))
    const at = (r: number): number => (rows > 1 ? Math.round((r * end) / (rows - 1)) : 0)
    for (let r = 0; r < rows; r++) {
      const from = at(r)
      const to = rows === 1 ? end : r < rows - 1 ? Math.max(from, at(r + 1) - 1) : from
      for (let o = from; o <= to + strap - 1; o++) {
        put(it.x + o, it.y + r, STRAP_BLUE)
        put(it.x + it.w - 1 - o, it.y + r, STRAP_RED)
      }
    }
    const dx = it.x + off
    const dy = it.y + rows
    for (let y = 0; y < discH; y++) for (let x = 0; x < discW; x++) put(dx + x, dy + y, a)
    if (discW > 2 && discH > 1) put(dx + 1, dy + 1, hi)
    if (discH > 2) put(dx + discW - 1, dy + discH - 1, b)
  },
  // A striped band round the neck, a tail hanging near its right end.
  scarf(it, put) {
    const [one, two] = SCARVES[it.stripes ?? 'blue-white']
    const band = Math.min(2, it.h)
    for (let x = 0; x < it.w; x++) for (let y = 0; y < band; y++) put(it.x + x, it.y + y, (x >> 1) % 2 ? two : one)
    for (let y = band; y < it.h; y++) put(it.x + it.w - 2, it.y + y, y % 2 ? one : two)
  },
  // A triangle tied at the neck, point down: the tied band along the top, dots inside.
  bandana(it, put) {
    const [main, tie] = cloth(it)
    for (let y = 0; y < it.h; y++) {
      const inset = it.h > 1 ? Math.floor((y * (it.w - 1)) / 2 / (it.h - 1)) : 0
      const from = inset
      const to = Math.max(inset, it.w - 1 - inset)
      for (let x = from; x <= to; x++) {
        const isEdge = x === from || x === to
        const isDot = it.dots === true && y > 0 && !isEdge && (x + 2 * y) % 4 === 1
        put(it.x + x, it.y + y, y === 0 ? tie : isDot ? CREAM : main)
      }
    }
  },
}

// Fitting -----------------------------------------------------------------------------------

/** A box for a species nobody fitted: the hat on the head, glasses on the eyes, gear at the neck. */
const fallback = (s: Species, id: GearId): Box => {
  const [ew, eh] = s.eyeSize
  const l = s.eyes[0] ?? [5, 6]
  const r = s.eyes[s.eyes.length - 1] ?? l
  if (isHat(id)) {
    const g = HATS[id]
    const w = Math.max(...g.rows.map(row => row.length))
    return { x: s.head[0] - Math.floor(w / 2), y: s.head[1] - g.lift, w, h: g.rows.length }
  }
  const across = { x: l[0] - 1, y: l[1], w: r[0] + ew - l[0] + 2, h: eh }
  const row = s.mouth ? s.mouth[1] + 2 : l[1] + eh + 3
  switch (id) {
    case 'shades':
      return { ...across, lens: ew + 2 }
    case 'monocle':
      return { x: r[0] - 1, y: r[1] - 1, w: ew + 2, h: eh + 2, metal: 'gold' }
    case 'visor':
      return { ...across, x: across.x - 1, w: across.w + 2 }
    case '3d':
      return { ...across, y: across.y - 1, h: eh + 1 }
    case 'eyepatch':
      return { x: l[0] - 1, y: l[1] - 1, w: ew + 2, h: eh + 2, band: true }
    case 'chain':
      return { x: 4, y: row, w: 8, h: 4, metal: 'gold' }
    case 'bowtie':
      return { x: 6, y: row, w: 4, h: 3, color: 'red' }
    case 'medal':
      return { x: 4, y: row - 1, w: 8, h: 6, metal: 'gold', strap: 1, disc: 4 }
    case 'scarf':
      return { x: 3, y: row, w: 10, h: 5, stripes: 'blue-white' }
    case 'bandana':
      return { x: 4, y: row, w: 8, h: 4, color: 'red', dots: true }
  }
}

/** Where species `s` (facing as drawn) wears `id`. */
export const boxOf = (s: Species, id: GearId): Box => FIT[s.id]?.[id] ?? fallback(s, id)

/** Pieces that slide to the mirrored spot walking left but keep their pattern the right way round. */
const SLIDES: ReadonlySet<GearId> = new Set<GearId>([...HAT_IDS, 'shades', 'scarf', 'bandana'])

const eyeXs = (s: Species, isFlipped: boolean): number[] =>
  s.eyes.map(([x]) => (isFlipped ? 16 - x - s.eyeSize[0] : x))

/**
 * Draws `id` as species `s` (facing as drawn, never the mirror) wears it, through `put` in sprite
 * coordinates as seen. Walking left, gear mirrors with the sprite, except: hats, sunglasses, the
 * scarf and the bandana slide to the mirrored box unflipped; the monocle stays on the pixling's
 * own left eye and the eyepatch on its right, keeping their shape; the medal mirrors but keeps
 * blue on the left strap and red on the right. Shiny, a few species swap the metal or the cloth
 * (SHINY_METAL, SHINY_CLOTH).
 */
export const drawGear = (s: Species, id: GearId, isFlipped: boolean, put: Put, isShiny = false): void => {
  const fitted = boxOf(s, id)
  const shinyMetal = isShiny && fitted.metal ? SHINY_METAL[s.id] : undefined
  const shinyCloth = isShiny && fitted.color ? SHINY_CLOTH[s.id] : undefined
  const it = { ...fitted, ...(shinyMetal && { metal: shinyMetal }), ...(shinyCloth && { color: shinyCloth }) }
  const draw = isHat(id) ? (b: Box, p: Put) => drawHat(id, b, p) : DRAW[id]
  if (!isFlipped) {
    draw(it, put)
    return
  }
  if (SLIDES.has(id)) {
    draw({ ...it, x: 16 - it.x - it.w }, put)
    return
  }
  if (id === 'monocle' || id === 'eyepatch') {
    const side = id === 'monocle' ? Math.max : Math.min
    draw({ ...it, x: it.x + side(...eyeXs(s, true)) - side(...eyeXs(s, false)) }, put)
    return
  }
  const swap = (c: number): number => (id !== 'medal' ? c : c === STRAP_BLUE ? STRAP_RED : c === STRAP_RED ? STRAP_BLUE : c)
  draw(it, (x, y, color) => put(15 - x, y, swap(color)))
}

const depths = new Map<string, number>()

/** The lowest sprite row `id` paints on species `s`; past 15 it hangs below the art. */
export const gearBottom = (s: Species, id: GearId): number => {
  const key = `${s.id}/${id}`
  const seen = depths.get(key)
  if (seen !== undefined) return seen
  let bottom = -Infinity
  drawGear(s, id, false, (_x, y) => {
    bottom = Math.max(bottom, y)
  })
  depths.set(key, bottom)
  return bottom
}
