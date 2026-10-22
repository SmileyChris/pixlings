// Frame composition: a species body on a small canvas, with eyes, mouth, cheeks, hats and
// particles drawn for a mood at a moment. Pure and deterministic in `t`, so the README media
// is rendered by this exact code.

import type { Point, Species } from './sprites.ts'

export const CANVAS_W = 22
/** The canvas height without a tall hat; a hat that needs headroom adds two rows at a time. */
export const CANVAS_H = 18
export const SPRITE_X = 3
const SPRITE_Y = 2

export const TRANSPARENT = -1

export type Pixels = { readonly w: number; readonly h: number; readonly px: Int32Array }

export type Mood =
  | 'idle'
  | 'working'
  | 'happy'
  | 'celebrate'
  | 'sad'
  | 'alarmed'
  | 'attention'
  | 'sleep'
  | 'love'
  | 'dizzy'
  | 'walk'
  | 'unimpressed'

export type Icon = 'read' | 'edit' | 'bash' | 'web' | 'agent' | 'test'

export type Hat = 'sprout' | 'shroom' | 'party' | 'crown' | 'halo' | 'wizard'

export type Face = 'shades'

export type FrameInput = {
  readonly species: Species
  readonly isShiny: boolean
  readonly mood: Mood
  /** Milliseconds since the mood began. */
  readonly t: number
  readonly hat?: Hat | null
  readonly face?: Face | null
  readonly icon?: Icon | null
  /** Draw the cactus bloom and similar species-specific flourishes. */
  readonly isBlooming?: boolean
  /** The canvas width; wider than CANVAS_W gives the pixling room to walk. */
  readonly width?: number
  /** The sprite's left edge on the canvas. */
  readonly x?: number
  /** Faces left (the art faces right or front). */
  readonly isFlipped?: boolean
  /** Plan mode: the propeller thinking cap, in place of the worn hat. */
  readonly hasCap?: boolean
  /** The context window is nearly full: a bead of sweat runs down the brow. */
  readonly isSweating?: boolean
  /** Milliseconds into a compaction, squished under the press; null or absent when none runs. */
  readonly squishT?: number | null
  /** Milliseconds since a compaction ended, springing back up; null or absent when none did. */
  readonly reliefT?: number | null
  /** Holds still at rest: idle, working and asleep draw no bob. */
  readonly isCalm?: boolean
  /** Subagents' minis, on a strip of their own right of the canvas `width`. */
  readonly squad?: readonly MiniView[]
  /** Minis past the strip's cap, counted as "+N" at its end. */
  readonly hidden?: number
}

/** One subagent's mini as the strip draws it. */
export type MiniView = {
  /** Its body color (miniTint of its agent type). */
  readonly tint: number
  /** Milliseconds since it joined. */
  readonly t: number
  /** Milliseconds since its agent finished; null while it works. */
  readonly doneT: number | null
  /** The tool its agent is running, held over its head. */
  readonly icon?: Icon | null
  /** Offsets its bob and glances, so a squad does not move in lockstep. */
  readonly seed?: number
}

export const blank = (w = CANVAS_W, h = CANVAS_H): Pixels => ({
  w,
  h,
  px: new Int32Array(w * h).fill(TRANSPARENT),
})

const put = (p: Pixels, x: number, y: number, color: number): void => {
  if (x >= 0 && y >= 0 && x < p.w && y < p.h) {
    p.px[y * p.w + x] = color
  }
}

const get = (p: Pixels, x: number, y: number): number =>
  x >= 0 && y >= 0 && x < p.w && y < p.h ? (p.px[y * p.w + x] ?? TRANSPARENT) : TRANSPARENT

/** Draws a small pattern: `.` skips, other characters map through `colors`. */
export const stamp = (
  p: Pixels,
  x: number,
  y: number,
  rows: readonly string[],
  colors: Readonly<Record<string, number>>,
): void => {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx] ?? '.'
      const color = colors[ch]
      if (ch !== '.' && color !== undefined) {
        put(p, x + dx, y + dy, color)
      }
    }
  })
}

// A tiny deterministic PRNG so particles look random but render the same every time.
const hash = (n: number): number => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 0xffffffff
}

const step = (t: number, ms: number): number => Math.floor(t / ms)

const pick = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length] as T

// ---------------------------------------------------------------------------------------------
// Faces

type EyeStyle = 'open' | 'closed' | 'happy' | 'sad' | 'wide' | 'spin' | 'lookLeft' | 'lookRight' | 'rolled' | 'lidded'
type MouthStyle = 'smile' | 'flat' | 'open' | 'frown' | 'o' | 'wavy' | 'none'

const WHITE = 0xffffff
const TONGUE = 0xff6b81
const CHEEK = 0xff8fab
const TEAR = 0x7fd3ff

const drawEyes = (p: Pixels, s: Species, ox: number, oy: number, style: EyeStyle, t: number): void => {
  const [w, h] = s.eyeSize
  const isGlowing = s.eyeColor !== 0x1b1424
  s.eyes.forEach(([ex, ey], index) => {
    const x = ox + ex
    const y = oy + ey
    const fill = (color: number): void => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(p, x + dx, y + dy, color)
    }
    switch (style) {
      case 'open':
      case 'lookLeft':
      case 'lookRight': {
        fill(s.eyeColor)
        if (!isGlowing && w >= 2) {
          put(p, style === 'lookRight' ? x + w - 1 : x, y, WHITE)
        }
        if (isGlowing && style !== 'open') {
          put(p, x, y + (style === 'lookLeft' ? 0 : h - 1), WHITE)
        }
        return
      }
      case 'closed':
        for (let dx = 0; dx < w; dx++) put(p, x + dx, y + h - 1, s.eyeColor)
        return
      case 'happy':
        // A small arch: ∩.
        for (let dx = 0; dx < w; dx++) put(p, x + dx, y, s.eyeColor)
        put(p, x - 1, y + 1, s.eyeColor)
        put(p, x + w, y + 1, s.eyeColor)
        return
      case 'sad': {
        fill(s.eyeColor)
        if (!isGlowing && w >= 2) put(p, x + w - 1, y + h - 1, WHITE)
        const outer = index === 0 ? x : x + w - 1
        const drop = step(t, 220) % 3
        put(p, outer, y + h + drop, TEAR)
        return
      }
      case 'wide':
        for (let dy = 0; dy < Math.max(h, 2); dy++) {
          for (let dx = 0; dx < Math.max(w, 2); dx++) put(p, x + dx, y + dy, WHITE)
        }
        put(p, x + (index === 0 ? Math.max(w, 2) - 1 : 0), y + Math.max(h, 2) - 1, s.eyeColor)
        return
      case 'rolled':
        // Pupils up, whites below: an eye roll.
        fill(WHITE)
        for (let dx = 0; dx < w; dx++) put(p, x + dx, y, s.eyeColor)
        return
      case 'lidded':
        // A flat lid and a pupil peeking sideways: ¬_¬
        for (let dx = 0; dx < w; dx++) put(p, x + dx, y, s.eyeColor)
        put(p, x + w - 1, y + Math.max(h, 2) - 1, s.eyeColor)
        return
      case 'spin': {
        const phase = step(t, 120) % 2
        if (w >= 2 && h >= 2) {
          put(p, x + phase, y, s.eyeColor)
          put(p, x + 1 - phase, y + 1, s.eyeColor)
        } else {
          put(p, x, y + phase, s.eyeColor)
        }
        return
      }
    }
  })
}

const drawMouth = (p: Pixels, s: Species, ox: number, oy: number, style: MouthStyle): void => {
  if (!s.mouth || style === 'none') return
  const [mx, my] = s.mouth
  const x = ox + mx
  const y = oy + my
  const ink = s.eyeColor
  const dots: Record<Exclude<MouthStyle, 'none'>, Point[]> = {
    smile: [
      [0, 0],
      [3, 0],
      [1, 1],
      [2, 1],
    ],
    flat: [
      [1, 0],
      [2, 0],
    ],
    open: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    frown: [
      [1, 0],
      [2, 0],
      [0, 1],
      [3, 1],
    ],
    o: [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    wavy: [
      [0, 1],
      [1, 0],
      [2, 1],
      [3, 0],
    ],
  }
  for (const [dx, dy] of dots[style]) put(p, x + dx, y + dy, ink)
  if (style === 'open') {
    put(p, x + 1, y + 1, TONGUE)
    put(p, x + 2, y + 1, TONGUE)
  }
}

const drawCheeks = (p: Pixels, s: Species, ox: number, oy: number): void => {
  for (const [cx, cy] of s.cheeks) {
    put(p, ox + cx, oy + cy, CHEEK)
    put(p, ox + cx + 1, oy + cy, CHEEK)
  }
}

// ---------------------------------------------------------------------------------------------
// Hats and face gear, anchored on the head's center column and top row.

type Gear = { rows: readonly string[]; colors: Readonly<Record<string, number>>; lift: number }

const HATS: Readonly<Record<Hat, Gear>> = {
  sprout: {
    rows: ['LL.LL', '.LGL.', '..G..'],
    colors: { L: 0x8ee08a, G: 0x3f9a4a },
    lift: 3,
  },
  shroom: {
    rows: ['...W...', '.RRRRR.', 'RWRWRWR'],
    colors: { R: 0xe8475f, W: 0xfff4f4 },
    lift: 2,
  },
  party: {
    rows: ['..Y..', '..P..', '.PBP.', '.BPB.', 'PBPBP'],
    colors: { Y: 0xffe14d, P: 0xff5fa2, B: 0x5ad1ff },
    lift: 4,
  },
  crown: {
    rows: ['Y.Y.Y', 'YYYYY', 'YRYBY'],
    colors: { Y: 0xffd23f, R: 0xff4d6d, B: 0x4dc3ff },
    lift: 2,
  },
  halo: {
    rows: ['.YYYYY.', 'Y.....Y', '.YYYYY.'],
    colors: { Y: 0xffe98a },
    lift: 5,
  },
  wizard: {
    rows: ['....P..', '...PP..', '..PYP..', '..PPPP.', '.PPPPPP', 'BBBBBBBB'],
    colors: { P: 0x7b4dff, Y: 0xffe14d, B: 0x4a2fb8 },
    lift: 5,
  },
}

const topRow = (s: Species): number => {
  const row = s.art.findIndex(line => /[^.]/.test(line))
  return row < 0 ? 0 : row
}

/** Where the sprite sits and how tall the canvas is, so a hat or a jump never clips. */
export const layoutFor = (s: Species, hat?: Hat | null): { y: number; h: number } => {
  const need = hat ? HATS[hat].lift - s.head[1] + (hat === 'halo' ? 1 : 0) : 0
  let y = SPRITE_Y
  while (y < need) y += 2
  return { y, h: y + 16 }
}

/** How far up the sprite may jump without leaving the canvas (hat, or thinking cap, included). */
const headroom = (s: Species, y: number, hat?: Hat | null, hasCap = false): number => {
  const hatTop = hasCap
    ? s.head[1] - CAP_LIFT
    : hat
      ? s.head[1] - HATS[hat].lift - (hat === 'halo' ? 1 : 0)
      : topRow(s)
  return Math.max(0, y + Math.min(topRow(s), hatTop))
}

const drawHat = (p: Pixels, s: Species, ox: number, oy: number, hat: Hat, t: number): void => {
  const gear = HATS[hat]
  const width = Math.max(...gear.rows.map(r => r.length))
  const [hx, hy] = s.head
  const bob = hat === 'halo' ? step(t, 500) % 2 : 0
  stamp(p, ox + hx - Math.floor(width / 2), oy + hy - gear.lift - bob, gear.rows, gear.colors)
}

const drawShades = (p: Pixels, s: Species, ox: number, oy: number): void => {
  const [w, h] = s.eyeSize
  const left = s.eyes[0]
  const right = s.eyes[s.eyes.length - 1]
  if (!left || !right) return
  const frame = 0x101018
  const glint = 0x8fa3ff
  const y = oy + left[1]
  for (let x = ox + left[0] - 1; x <= ox + right[0] + w; x++) put(p, x, y, frame)
  for (const [ex, ey] of s.eyes) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = -1; dx <= w; dx++) put(p, ox + ex + dx, oy + ey + dy, frame)
    }
    put(p, ox + ex, oy + ey, glint)
  }
}

// ---------------------------------------------------------------------------------------------
// Particles

const Z_SMALL = ['###', '.#.', '###']
const Z_BIG = ['####', '..#.', '.#..', '####']
const HEART = ['##.##', '#####', '.###.', '..#..']
const SPARKLE = ['.#.', '#W#', '.#.']
const CLOUD = ['...##.##...', '.#########.', '###########', '.#########.']
const BANG = ['#', '#', '#', '.', '#']

const ICONS: Readonly<Record<Icon, Gear>> = {
  read: {
    rows: ['WW.WW', 'WWKWW', 'WWKWW', 'BBBBB'],
    colors: { W: 0xf4f1e6, K: 0x6b5b45, B: 0x4d7cff },
    lift: 0,
  },
  edit: {
    rows: ['...PP', '..YY.', '.YY..', 'K....'],
    colors: { P: 0xff8fab, Y: 0xffcf3f, K: 0x333344 },
    lift: 0,
  },
  bash: {
    rows: ['DDDDD', 'DGDDD', 'DDGDD', 'DGDWW'],
    colors: { D: 0x1c2333, G: 0x5cff8a, W: 0xe6e6e6 },
    lift: 0,
  },
  web: {
    rows: ['.BBB.', 'BGBGB', 'BBGBB', '.BBB.'],
    colors: { B: 0x4da3ff, G: 0x5cd67a },
    lift: 0,
  },
  agent: {
    rows: ['O.O..', 'OOO.O', '.O.OO', '...O.'],
    colors: { O: 0xffa64d },
    lift: 0,
  },
  test: {
    rows: ['.W.', '.W.', 'WGW', 'GGG'],
    colors: { W: 0xd8e6ff, G: 0x5cff8a },
    lift: 0,
  },
}

const CONFETTI = [0xff5fa2, 0xffe14d, 0x5ad1ff, 0x6fdc8c, 0xc77dff, 0xff8a3d]

const drawZzz = (p: Pixels, ox: number, oy: number, s: Species, t: number): void => {
  const [hx, hy] = s.head
  const baseX = ox + hx + 4
  const baseY = oy + hy + 1
  const cycle = 2600
  for (let i = 0; i < 2; i++) {
    const local = (t + i * (cycle / 2)) % cycle
    const rise = Math.floor((local / cycle) * 6)
    const color = local < cycle * 0.8 ? 0xcfe3ff : 0x7d93b8
    stamp(p, baseX + Math.floor(rise / 2), baseY - rise, i === 0 ? Z_BIG : Z_SMALL, { '#': color })
  }
}

const drawSparkles = (p: Pixels, ox: number, t: number, colors: readonly number[]): void => {
  const spots: Point[] = [
    [1, 3],
    [18, 2],
    [0, 11],
    [19, 9],
    [17, 15],
    [2, 15],
  ]
  spots.forEach(([sx, y], i) => {
    const x = sx + ox - SPRITE_X
    const phase = (step(t, 110) + i * 2) % 6
    const color = pick(colors, i)
    if (phase < 2) put(p, x + 1, y + 1, color)
    else if (phase < 4) stamp(p, x, y, SPARKLE, { '#': color, W: WHITE })
  })
}

const drawConfetti = (p: Pixels, t: number): void => {
  for (let i = 0; i < Math.round(14 * (p.w / CANVAS_W)); i++) {
    const speed = 60 + Math.floor(hash(i * 7) * 60)
    const x = Math.floor(hash(i * 13 + 1) * p.w)
    const y = (step(t, speed) + Math.floor(hash(i * 31) * p.h)) % (p.h + 4)
    put(p, x + (step(t, 300) % 2), y - 2, pick(CONFETTI, i))
  }
}

const drawHearts = (p: Pixels, ox: number, oy: number, s: Species, t: number): void => {
  const [hx, hy] = s.head
  const cycle = 1800
  for (let i = 0; i < 2; i++) {
    const local = (t + i * (cycle / 2)) % cycle
    const rise = Math.floor((local / cycle) * 7)
    const x = ox + hx + (i === 0 ? 3 : -8)
    stamp(p, x, oy + hy + 2 - rise, HEART, { '#': i === 0 ? 0xff4d8d : 0xff8fb8 })
  }
}

const drawRain = (p: Pixels, ox: number, s: Species, t: number): void => {
  const [hx] = s.head
  const x = ox + hx - 6
  for (let i = 0; i < 5; i++) {
    const fall = (step(t, 80) + i * 5) % 7
    put(p, x + 1 + i * 2, 4 + fall, TEAR)
  }
  stamp(p, x, 0, CLOUD, { '#': 0x9aa5bd })
}

const drawBang = (p: Pixels, ox: number, oy: number, s: Species, t: number, color: number): void => {
  if (step(t, 260) % 4 === 3) return
  const [hx, hy] = s.head
  stamp(p, ox + hx + 6, Math.max(0, oy + hy - 2), BANG, { '#': color })
}

const drawSweat = (p: Pixels, ox: number, oy: number, s: Species, t: number): void => {
  const [hx, hy] = s.head
  const slide = step(t, 160) % 3
  stamp(p, ox + hx - 8, oy + hy + 2 + slide, ['.#', '##', '##'], { '#': TEAR })
}

const drawStars = (p: Pixels, ox: number, oy: number, s: Species, t: number): void => {
  const [hx, hy] = s.head
  for (let i = 0; i < 3; i++) {
    const angle = t / 260 + (i * Math.PI * 2) / 3
    const x = ox + hx + Math.round(Math.cos(angle) * 6)
    const y = oy + hy - 1 + Math.round(Math.sin(angle) * 1.5)
    put(p, x, y, 0xffe14d)
  }
}

const drawBloom = (p: Pixels, ox: number, oy: number, s: Species): void => {
  const [hx, hy] = s.head
  stamp(p, ox + hx - 2, oy + hy - 2, ['.P.P.', 'PPYPP', '.P.P.'], { P: 0xff6fae, Y: 0xffe14d })
}

// ---------------------------------------------------------------------------------------------
// Reactions: the thinking cap, context sweat, the compaction press, the subagent squad

/**
 * Plan mode's propeller beanie. Three rows above the head at most, so it fits the headroom every
 * species already has: putting it on never makes the band taller.
 */
const CAP_LIFT = 3
const CAP_DOME = ['..RYB..', '.RRYBB.', 'RRRYBBB']
/** The propeller seen from the side as it turns: one blade light, one dark, swapping. */
const CAP_SPIN = ['LLLYDDD', '.LLYDD.', '...Y...', '.DDYLL.', 'DDDYLLL', '.DDYLL.', '...Y...', '.LLYDD.']
const CAP_COLORS: Readonly<Record<string, number>> = { R: 0xff5a6e, Y: 0xffd23f, B: 0x4dc3ff, L: 0xe9f7ff, D: 0x7d8aa3 }

const drawCap = (p: Pixels, s: Species, ox: number, oy: number, t: number): void => {
  const [hx, hy] = s.head
  stamp(p, ox + hx - 3, oy + hy - CAP_LIFT, [pick(CAP_SPIN, step(t, 90)), ...CAP_DOME], CAP_COLORS)
}

const BEAD = ['.D', 'DW', 'DD']

/** A bead of sweat forms at the brow beside the far eye, runs down, and comes again. */
const drawBead = (p: Pixels, s: Species, ox: number, oy: number, t: number): void => {
  const eye = s.eyes[s.eyes.length - 1]
  if (!eye) return
  const local = t % 2400
  if (local >= 2000) return
  const x = eye[0] + s.eyeSize[0]
  // It forms on the brow, never in the air above a head that slopes away (the turtle's).
  const brow = s.art.findIndex(row => [x, x + 1, x + 2].some(c => (row[c] ?? '.') !== '.'))
  const y = Math.max(eye[1] - 2, brow - 1)
  const slide = Math.min(3, Math.floor(local / 500))
  stamp(p, ox + x, oy + y + slide, BEAD, { D: 0x4aa8ff, W: 0xe6f6ff })
}

/** How long a compaction's end springs the pixling back up. */
export const SPRING_MS = 480

/** The squish and the spring as scale factors about the feet: [across, up]. */
const squashOf = (squishT: number | null, springT: number | null): readonly [number, number] => {
  if (squishT !== null) return step(squishT, 380) % 2 === 0 ? [1.22, 0.6] : [1.18, 0.66]
  if (springT !== null && springT < 160) return [0.88, 1.12]
  return [1, 1]
}

/** Copies the sprite layer onto the canvas scaled about its feet (`cx`, `floor`). */
const scaleInto = (p: Pixels, layer: Pixels, cx: number, floor: number, sx: number, sy: number): void => {
  for (let y = 0; y < p.h; y++) {
    const from = Math.round(floor - (floor - y) / sy)
    if (from < 0 || from >= layer.h) continue
    for (let x = 0; x < p.w; x++) {
      const color = get(layer, Math.floor(cx + (x + 0.5 - cx) / sx), from)
      if (color !== TRANSPARENT) put(p, x, y, color)
    }
  }
}

const topOf = (p: Pixels): number => {
  for (let i = 0; i < p.px.length; i++) if (p.px[i] !== TRANSPARENT) return Math.floor(i / p.w)
  return p.h
}

const PRESS_HI = 0xdfe6f2
const PRESS = 0x9aa5bd
const PRESS_LO = 0x5d6a80

/** The compactor: a plate resting on the squished head, on a rod from the top of the band. */
const drawPress = (p: Pixels, cx: number, top: number): void => {
  const plate = top - 2
  for (let x = cx - 9; x < cx + 9; x++) {
    put(p, x, plate, PRESS_HI)
    put(p, x, plate + 1, x === cx - 9 || x === cx + 8 ? PRESS_LO : PRESS)
  }
  for (let y = 0; y < plate; y++) {
    put(p, cx - 1, y, PRESS_LO)
    put(p, cx, y, PRESS)
  }
}

/** Squeezed tight: >_< at where the eyes and mouth land on the squished body. */
const drawStrain = (p: Pixels, s: Species, ox: number, oy: number, map: (x: number, y: number) => Point): void => {
  const [w, h] = s.eyeSize
  s.eyes.forEach(([ex, ey], i) => {
    const [x, y] = map(ox + ex + (w - 1) / 2, oy + ey + (h - 1) / 2)
    // The left eye points right (>), the right eye left (<).
    const back = i === 0 ? -1 : 1
    put(p, x + back, y - 1, s.eyeColor)
    put(p, x, y, s.eyeColor)
    put(p, x + back, y + 1, s.eyeColor)
  })
  if (s.mouth) {
    const [mx, my] = map(ox + s.mouth[0] + 1.5, oy + s.mouth[1])
    put(p, mx - 1, my, s.eyeColor)
    put(p, mx, my, s.eyeColor)
  }
}

/** Mid-tones that hold on a dark terminal and a light one alike. */
const PUFF = 0xb4bfd0

// The squad: one mini per running subagent, on a strip right of the pixling's own canvas.

/**
 * A mini's art: a little critter on two feet with two feelers, `a` and `b` their tips (which
 * blink in turn while it works). The face is drawn on top. Two feelers, not one: a single stalk
 * with a lit tip reads as a bomb's fuse at this size.
 */
const MINI_ART = [
  '.a....b.',
  '..k..k..',
  '..KKKK..',
  '.KLLBBK.',
  'KLBBBBBK',
  'KBBBBBBK',
  'KSBBBBSK',
  '.KSSSSK.',
  '.KK..KK.',
]
export const MINI_W = 8
export const MINI_H = MINI_ART.length
/** A mini and the gap after it. */
export const MINI_SLOT = MINI_W + 1
/** How many minis stand on the strip; the rest are counted. */
export const SQUAD_CAP = 4
/** A finished mini celebrates, then poofs away this long after its agent stopped. */
export const MINI_LEAVE_MS = 3000
/** When the celebration gives way to the poof. */
export const MINI_POOF_MS = 2400
/** Working: tall eyes and a small smile, the whole face glancing left or right now and then. */
const MINI_FACE: readonly Point[] = [
  [2, 4],
  [2, 5],
  [5, 4],
  [5, 5],
  [3, 6],
  [4, 6],
]
/** Done: eyes shut with joy and a wide-open mouth. */
const MINI_JOY: readonly Point[] = [
  [1, 4],
  [2, 4],
  [5, 4],
  [6, 4],
  [3, 5],
  [4, 5],
]
const MINI_GLANCE = [0, -1, 0, 1]
const MINI_INK = 0x1b1424
const MINI_LIT = 0xffe14d

/** Agent types the engine ships, each in its own color; any other type hashes into the set. */
const MINI_TINTS = [0xffa64d, 0x4fd1c5, 0xb18cff, 0x6fdc8c, 0xff7eb6, 0x5aa9ff, 0xffd23f, 0xff6b6b]
const KNOWN_TINT: Readonly<Record<string, number>> = {
  'general-purpose': 0,
  Explore: 1,
  Plan: 2,
  'statusline-setup': 3,
  'claude-code-guide': 5,
}

/** The body color a subagent of this type wears. */
export const miniTint = (agentType: string): number => {
  const known = KNOWN_TINT[agentType]
  if (known !== undefined) return MINI_TINTS[known] ?? MINI_TINTS[0]!
  let h = 0
  for (const ch of agentType) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return pick(MINI_TINTS, h)
}

const mix = (a: number, b: number, k: number): number => {
  const ch = (shift: number): number => {
    const x = (a >> shift) & 255
    const y = (b >> shift) & 255
    return Math.round(x + (y - x) * k) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

/** The tips stay the body color unless lit: pale tips vanish on a light terminal. */
const miniPalette = (tint: number, lit: 'a' | 'b' | 'both'): Readonly<Record<string, number>> => ({
  K: mix(tint, 0x000000, 0.6),
  B: tint,
  L: mix(tint, 0xffffff, 0.5),
  S: mix(tint, 0x000000, 0.25),
  k: mix(tint, 0x000000, 0.6),
  a: lit === 'b' ? tint : MINI_LIT,
  b: lit === 'a' ? tint : MINI_LIT,
})

const MINI_HOP = [-3, -2, -1, 0]
const MINI_JUMP = [0, -1, -2, -3, -3, -2, -1, 0, 0, 0]
const POOF: readonly (readonly string[])[] = [
  ['.##.', '####', '####', '.##.'],
  ['#..#', '.##.', '.##.', '#..#'],
  ['#..#', '....', '....', '#..#'],
]

/** One mini with its feet on row `floor`, its left edge at `x`. */
const drawMini = (p: Pixels, x: number, floor: number, m: MiniView): void => {
  const seed = m.seed ?? 0
  const top = floor - MINI_H + 1
  if (m.doneT !== null && m.doneT >= MINI_POOF_MS) {
    const frame = POOF[Math.min(POOF.length - 1, step(m.doneT - MINI_POOF_MS, 150))] ?? []
    stamp(p, x + 2, floor - 4, frame, { '#': PUFF })
    return
  }
  if (m.doneT !== null) {
    // Its agent is done: a jump with both arms up, eyes shut with joy, a sparkle overhead.
    const t = m.doneT
    const y = top + pick(MINI_JUMP, step(t, 70))
    stamp(p, x, y, MINI_ART, miniPalette(m.tint, 'both'))
    for (const [ax, ay] of [[-1, 4], [-1, 3], [MINI_W, 4], [MINI_W, 3]] as const) put(p, x + ax, y + ay, mix(m.tint, 0x000000, 0.6))
    for (const [fx, fy] of MINI_JOY) put(p, x + fx, y + fy, MINI_INK)
    put(p, x + 3, y + 6, TONGUE)
    put(p, x + 4, y + 6, TONGUE)
    // A twinkle off one shoulder, then the other: clear of the feelers, never a cross on its head.
    const beat = step(t, 200) % 3
    if (beat !== 1) stamp(p, beat === 0 ? x + 6 : x - 1, y - 4, SPARKLE, { '#': 0xffe14d, W: WHITE })
    return
  }
  const dy = m.t < 300 ? pick(MINI_HOP, step(m.t, 75)) : step(m.t + seed * 97, 300) % 2
  const y = top + dy
  stamp(p, x, y, MINI_ART, miniPalette(m.tint, step(m.t + seed * 131, 400) % 2 === 0 ? 'a' : 'b'))
  const glance = pick(MINI_GLANCE, step(m.t + seed * 211, 900))
  for (const [fx, fy] of MINI_FACE) put(p, x + fx + glance, y + fy, MINI_INK)
  if (m.icon) {
    const gear = ICONS[m.icon]
    const width = Math.max(...gear.rows.map(r => r.length))
    stamp(p, x + Math.floor((MINI_W - width) / 2), y - gear.rows.length - 1, gear.rows, gear.colors)
  }
}

/** A 3×5 numeral set for the strip's "+N". */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '+': ['...', '.#.', '###', '.#.', '...'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
}
const COUNT_INK = 0x8b95a8

const countText = (hidden: number): string => `+${Math.min(hidden, 99)}`

/** Columns the strip takes: nothing without minis, so the band is as it was. */
export const squadWidth = (shown: number, hidden = 0): number =>
  shown * MINI_SLOT + (hidden > 0 ? countText(hidden).length * 4 : 0)

const drawSquad = (p: Pixels, x0: number, squad: readonly MiniView[], hidden: number): void => {
  const floor = p.h - 1
  squad.forEach((m, i) => drawMini(p, x0 + i * MINI_SLOT, floor, m))
  if (hidden <= 0) return
  let x = x0 + squad.length * MINI_SLOT
  for (const ch of countText(hidden)) {
    stamp(p, x, floor - 4, DIGITS[ch] ?? [], { '#': COUNT_INK })
    x += 4
  }
}

/** One mini on a canvas of its own, room left for its antenna, icon and jump. */
export const renderMini = (m: MiniView): Pixels => {
  const p = blank(MINI_W + 2, MINI_H + 7)
  drawMini(p, 1, p.h - 1, m)
  return p
}

// ---------------------------------------------------------------------------------------------
// Body

const drawBody = (p: Pixels, s: Species, ox: number, oy: number, palette: Readonly<Record<string, number>>, t: number): void => {
  const beat = step(t, 320) % 2
  s.art.forEach((row, y) => {
    const wiggle = s.wiggle?.find(w => w.row === y)
    const line = wiggle ? (pick(wiggle.frames, beat) ?? row) : row
    for (let x = 0; x < line.length; x++) {
      const ch = line[x] ?? '.'
      const color = palette[ch]
      if (ch !== '.' && color !== undefined) put(p, ox + x, oy + y, color)
    }
  })
}

type Pose = { dx: number; dy: number; eyes: EyeStyle; mouth: MouthStyle; hasCheeks: boolean }

const JUMP = [0, -2, -4, -5, -5, -4, -2, 0, 0, 0, 0]
const HOP = [0, -1, -2, -1, 0, 0, 0, 0]
const BOUNCE = [0, -1, -2, -1]

const blinking = (t: number): boolean => t % 4200 > 4040

/** The moods a calm pixling holds still in; the others are something happening, and move. */
const RESTING: ReadonlySet<Mood> = new Set(['idle', 'working', 'sleep'])

const pose = (mood: Mood, t: number): Pose => {
  switch (mood) {
    case 'idle':
      return {
        dx: 0,
        dy: step(t, 650) % 2,
        eyes: blinking(t) ? 'closed' : 'open',
        mouth: 'smile',
        hasCheeks: false,
      }
    case 'working':
      return {
        dx: 0,
        dy: step(t, 260) % 2,
        eyes: blinking(t) ? 'closed' : step(t, 900) % 2 === 0 ? 'lookLeft' : 'lookRight',
        mouth: 'flat',
        hasCheeks: false,
      }
    case 'happy':
      return { dx: 0, dy: pick(BOUNCE, step(t, 130)), eyes: 'happy', mouth: 'open', hasCheeks: true }
    case 'celebrate':
      return { dx: 0, dy: pick(JUMP, step(t, 70)), eyes: 'happy', mouth: 'open', hasCheeks: true }
    case 'sad':
      return { dx: 0, dy: 1, eyes: 'sad', mouth: 'frown', hasCheeks: false }
    case 'alarmed':
      return {
        dx: t < 1400 ? (step(t, 55) % 2 === 0 ? -1 : 1) : 0,
        dy: 0,
        eyes: 'wide',
        mouth: 'o',
        hasCheeks: false,
      }
    case 'attention':
      return { dx: 0, dy: pick(HOP, step(t, 90)), eyes: 'open', mouth: 'open', hasCheeks: false }
    case 'sleep':
      return { dx: 0, dy: step(t, 1400) % 2, eyes: 'closed', mouth: step(t, 2800) % 2 ? 'o' : 'flat', hasCheeks: false }
    case 'love':
      return { dx: 0, dy: step(t, 400) % 2, eyes: 'happy', mouth: 'smile', hasCheeks: true }
    case 'dizzy':
      return { dx: step(t, 400) % 2, dy: 0, eyes: 'spin', mouth: 'wavy', hasCheeks: false }
    case 'walk':
      return { dx: 0, dy: -(step(t, 140) % 2), eyes: blinking(t) ? 'closed' : 'open', mouth: 'smile', hasCheeks: false }
    case 'unimpressed':
      return { dx: 0, dy: 0, eyes: t < 900 ? 'rolled' : 'lidded', mouth: 'flat', hasCheeks: false }
  }
}

const mirrors = new Map<string, Species>()

/** The species facing the other way: art reversed, anchors moved to match. */
export const mirror = (s: Species): Species => {
  const cached = mirrors.get(s.id)
  if (cached) return cached
  const flip = (row: string): string => [...row].reverse().join('')
  const [w] = s.eyeSize
  const m: Species = {
    ...s,
    art: s.art.map(flip),
    eyes: [...s.eyes].reverse().map(([x, y]) => [16 - x - w, y] as const),
    mouth: s.mouth ? [16 - s.mouth[0] - 4, s.mouth[1]] : null,
    cheeks: [...s.cheeks].reverse().map(([x, y]) => [16 - x - 2, y] as const),
    head: [16 - s.head[0], s.head[1]],
    wiggle: s.wiggle?.map(w2 => ({ row: w2.row, frames: w2.frames.map(flip) })),
  }
  mirrors.set(s.id, m)
  return m
}

/** Composes one frame of a pixling. */
export const renderFrame = (input: FrameInput): Pixels => {
  const { mood, t } = input
  const s = input.isFlipped ? mirror(input.species) : input.species
  const layout = layoutFor(s, input.hat)
  const width = input.width ?? CANVAS_W
  const squad = input.squad ?? []
  const hidden = input.hidden ?? 0
  const p = blank(width + squadWidth(squad.length, hidden), layout.h)
  const spriteX = input.x ?? SPRITE_X
  const palette = input.isShiny ? s.shiny : s.palette
  const squishT = input.squishT ?? null
  const springT = squishT === null && input.reliefT != null && input.reliefT >= 0 && input.reliefT < SPRING_MS ? input.reliefT : null
  const isPressed = squishT !== null
  // Squished or springing back, the body is drawn alone, scaled about its feet, then the face.
  const isScaled = isPressed || springT !== null
  const look: Pose = isPressed
    ? { dx: 0, dy: 0, eyes: 'closed', mouth: 'none', hasCheeks: false }
    : springT !== null
      ? { dx: 0, dy: springT < 160 ? 0 : springT < 320 ? -3 : -1, eyes: 'happy', mouth: 'open', hasCheeks: true }
      : input.isCalm && RESTING.has(mood)
        ? { ...pose(mood, t), dy: 0 }
        : pose(mood, t)
  const { dx, eyes, mouth, hasCheeks } = look
  const dy = Math.max(look.dy, -headroom(s, layout.y, input.hat, input.hasCap))
  const ox = spriteX + dx
  const oy = layout.y + dy
  const eyeColor = (input.isShiny && s.shinyEyeColor) || s.eyeColor
  const body = eyeColor === s.eyeColor ? s : { ...s, eyeColor }

  if (!isScaled && mood === 'sad') drawRain(p, spriteX, s, t)
  if (!isScaled && mood === 'celebrate') drawConfetti(p, t)

  const layer = isScaled ? blank(p.w, p.h) : p
  drawBody(layer, s, ox, oy, palette, t)
  if (!isPressed) {
    if (input.face === 'shades' && mood !== 'sleep' && mood !== 'sad') {
      drawShades(layer, body, ox, oy)
    } else {
      drawEyes(layer, body, ox, oy, eyes, t)
    }
    drawMouth(layer, body, ox, oy, mouth)
    if (hasCheeks) drawCheeks(layer, s, ox, oy)
  }

  // The robot's antenna blinks while it thinks.
  if (!isScaled && s.id === 'robot' && (mood === 'working' || mood === 'attention') && step(t, 300) % 2 === 1) {
    put(p, ox + 7, oy, 0xfff1a8)
    put(p, ox + 8, oy, 0xfff1a8)
  }
  if (input.hasCap) {
    drawCap(layer, s, ox, oy, t)
  } else if (input.isBlooming || (s.id === 'cactus' && (mood === 'celebrate' || mood === 'love'))) {
    drawBloom(layer, ox, oy, s)
  } else if (input.hat) {
    drawHat(layer, s, ox, oy, input.hat, t)
  }

  if (isScaled) {
    const cx = ox + 8
    const floor = oy + 15
    const [sx, stretch] = squashOf(squishT, springT)
    // A stretch never lifts the top of the head (or a tall hat) off the canvas.
    const top = topOf(layer)
    const sy = stretch > 1 && floor > top ? Math.min(stretch, floor / (floor - top)) : stretch
    scaleInto(p, layer, cx, floor, sx, sy)
    if (isPressed) {
      const map = (x: number, y: number): Point => [Math.floor(cx + (x + 0.5 - cx) * sx), Math.round(floor - (floor - y) * sy)]
      drawStrain(p, body, ox, oy, map)
      drawPress(p, cx, topOf(p))
    }
    if (squad.length > 0 || hidden > 0) drawSquad(p, width, squad, hidden)
    return p
  }

  switch (mood) {
    case 'sleep':
      drawZzz(p, ox, oy, s, t)
      break
    case 'celebrate':
      drawSparkles(p, ox, t, [0xffe14d, 0xffffff, 0x5ad1ff])
      break
    case 'happy':
      drawSparkles(p, ox, t + 300, [0xffe14d])
      break
    case 'love':
      drawHearts(p, ox, oy, s, t)
      break
    case 'alarmed':
      drawBang(p, ox, oy, s, t, 0xff4d4d)
      drawSweat(p, ox, oy, s, t)
      break
    case 'attention':
      drawBang(p, ox, oy, s, t, 0xffd23f)
      break
    case 'dizzy':
      drawStars(p, ox, oy, s, t)
      break
    default:
      break
  }
  // The alarmed face sweats already; asleep, nothing worries it.
  if (input.isSweating && mood !== 'alarmed' && mood !== 'sleep') drawBead(p, body, ox, oy, t)
  if (input.icon && (mood === 'working' || mood === 'idle' || mood === 'walk')) {
    const gear = ICONS[input.icon]
    stamp(p, Math.min(width - 5, ox + s.head[0] + 5), Math.max(0, oy + s.head[1] - 3), gear.rows, gear.colors)
  }
  if (input.isShiny && step(t, 1700) % 3 === 0) {
    put(p, ox - 2, oy + 1 + (step(t, 200) % 2), 0xfff6a8)
  }
  if (squad.length > 0 || hidden > 0) drawSquad(p, width, squad, hidden)
  return p
}

// ---------------------------------------------------------------------------------------------
// The egg

const EGG = [
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

const CRACKS: readonly Point[][] = [
  [
    [6, 6],
    [7, 7],
    [8, 6],
  ],
  [
    [5, 7],
    [9, 7],
    [10, 6],
    [4, 8],
  ],
  [
    [11, 7],
    [3, 8],
    [12, 8],
    [7, 8],
  ],
]

export const HATCH_MS = 4600

/**
 * The hatching sequence: the egg wobbles, cracks, flashes in the rarity's color, and the
 * creature appears in a celebration. `t` runs from 0; past HATCH_MS the creature celebrates.
 */
export const renderHatch = (input: FrameInput, rarityColor: number): Pixels => {
  const { t } = input
  if (t >= 4300) {
    return renderFrame({ ...input, mood: 'celebrate', t: t - 4300 })
  }
  const p = blank()
  if (t >= 4000) {
    const fade = (t - 4000) / 300
    const color = fade < 0.5 ? WHITE : rarityColor
    const r = Math.floor(3 + fade * 14)
    for (let y = 0; y < CANVAS_H; y++) {
      for (let x = 0; x < CANVAS_W; x++) {
        const d = Math.hypot((x - 11) * 0.8, (y - 10) * 1.2)
        if (d < r) put(p, x, y, color)
      }
    }
    return p
  }
  const urgency = t < 1500 ? 400 : t < 3000 ? 240 : 110
  const isShaking = t % urgency < urgency * 0.35
  const dx = isShaking ? (step(t, 60) % 2 === 0 ? -1 : 1) : 0
  stamp(p, SPRITE_X + dx, SPRITE_Y, EGG, { K: 0x5d4a3a, W: 0xfaf3e3, L: 0xffffff, S: 0xd9c9a8 })
  const stages = t < 1500 ? 0 : t < 2500 ? 1 : t < 3300 ? 2 : 3
  for (let i = 0; i < stages; i++) {
    for (const [x, y] of CRACKS[i] ?? []) put(p, SPRITE_X + dx + x, SPRITE_Y + y, 0x5d4a3a)
  }
  if (t > 3300) {
    // Light leaks through the cracks.
    for (const [x, y] of CRACKS.flat()) {
      if (step(t, 80) % 2 === 0) put(p, SPRITE_X + dx + x, SPRITE_Y + y - 1, rarityColor)
    }
  }
  return p
}

/** A dark silhouette of a species, for the dex's undiscovered entries. */
export const renderSilhouette = (s: Species): Pixels => {
  const p = blank()
  drawBody(p, s, SPRITE_X, SPRITE_Y, Object.fromEntries(Object.keys(s.palette).map(k => [k, 0x3a3f4b])), 0)
  return p
}

/** True when two frames are pixel-identical (lets the animation loop skip a blit). */
export const samePixels = (a: Pixels | null, b: Pixels): boolean => {
  if (!a || a.w !== b.w || a.h !== b.h) return false
  for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) return false
  return true
}

export { get as pixelAt }
