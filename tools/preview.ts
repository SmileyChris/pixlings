// Renders contact sheets of every species × mood with the plugin's own canvas code.
// Usage: node tools/preview.ts [out-dir] [t-ms]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CANVAS_H, CANVAS_W, renderFrame, TRANSPARENT } from '../plugins/pixlings/hooks/lib/canvas.ts'
import type { Face, Hat, Mood, Neck, Pixels } from '../plugins/pixlings/hooks/lib/canvas.ts'
import { FACE_IDS, HAT_IDS, NECK_IDS } from '../plugins/pixlings/hooks/lib/gear.ts'
import { checkSpecies, SPECIES } from '../plugins/pixlings/hooks/lib/sprites.ts'
import { encodePng, fillRect, rgb } from './png.ts'
import type { Rgb } from './png.ts'

const BG = 0x1a1b26
const SCALE = 6
const GAP = 2

export const blitPixels = (img: Rgb, p: Pixels, x0: number, y0: number, scale: number): void => {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const color = p.px[y * p.w + x] ?? TRANSPARENT
      if (color !== TRANSPARENT) fillRect(img, x0 + x * scale, y0 + y * scale, scale, scale, color)
    }
  }
}

const MOODS: Mood[] = ['idle', 'working', 'happy', 'celebrate', 'sad', 'alarmed', 'attention', 'sleep', 'love', 'dizzy']

/** Roaming and the newer moods: [label, input overrides]. */
const MOTION: { mood: Mood; t: number; isFlipped?: boolean; icon?: 'bash' }[] = [
  { mood: 'walk', t: 0 },
  { mood: 'walk', t: 140, isFlipped: true },
  { mood: 'idle', t: 0, isFlipped: true },
  { mood: 'working', t: 0, isFlipped: true, icon: 'bash' },
  { mood: 'unimpressed', t: 300 },
  { mood: 'unimpressed', t: 2000 },
  { mood: 'unimpressed', t: 2000, isFlipped: true },
  { mood: 'celebrate', t: 500, isFlipped: true },
]

const main = (): void => {
  const out = process.argv[2] ?? 'preview'
  const t = Number(process.argv[3] ?? 0)
  mkdirSync(out, { recursive: true })

  const problems = SPECIES.flatMap(checkSpecies)
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exitCode = 1
    return
  }

  const cellW = CANVAS_W * SCALE + GAP * SCALE
  const cellH = CANVAS_H * SCALE + GAP * SCALE
  for (const isShiny of [false, true]) {
    const img = rgb(cellW * MOODS.length, cellH * SPECIES.length, BG)
    SPECIES.forEach((species, row) => {
      MOODS.forEach((mood, col) => {
        const frame = renderFrame({ species, isShiny, mood, t: t + col * 37 })
        blitPixels(img, frame, col * cellW + SCALE, row * cellH + SCALE, SCALE)
      })
    })
    const file = join(out, isShiny ? 'sheet-shiny.png' : 'sheet.png')
    writeFileSync(file, encodePng(img))
    console.log(`wrote ${file} (${img.w}×${img.h})`)
  }

  {
    const img = rgb(cellW * MOTION.length, cellH * SPECIES.length, BG)
    SPECIES.forEach((species, row) => {
      MOTION.forEach((m, col) => {
        const frame = renderFrame({ species, isShiny: false, ...m })
        blitPixels(img, frame, col * cellW + SCALE, row * cellH + SCALE, SCALE)
      })
    })
    const file = join(out, 'sheet-motion.png')
    writeFileSync(file, encodePng(img))
    console.log(`wrote ${file} (${img.w}×${img.h})`)
  }

  // Every hat, then every face piece and neck piece, one to a column.
  const GEAR: { hat?: Hat; face?: Face; neck?: Neck }[] = [
    ...HAT_IDS.map(hat => ({ hat })),
    ...FACE_IDS.map(face => ({ face })),
    ...NECK_IDS.map(neck => ({ neck })),
  ]
  const tall = (CANVAS_H + 6) * SCALE
  const img = rgb(cellW * GEAR.length, tall * SPECIES.length, BG)
  SPECIES.forEach((species, row) => {
    GEAR.forEach(({ hat, face, neck }, col) => {
      const frame = renderFrame({ species, isShiny: false, mood: col % 2 ? 'happy' : 'idle', t, hat, face, neck })
      blitPixels(img, frame, col * cellW + SCALE, row * tall + (tall - frame.h * SCALE) - SCALE, SCALE)
    })
  })
  const file = join(out, 'gear.png')
  writeFileSync(file, encodePng(img))
  console.log(`wrote ${file}`)
}

main()
