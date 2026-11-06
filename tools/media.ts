// Renders the README animations, frame by frame, with the plugin's own canvas code.
// Writes raw frames for tools/make_gifs.py to label and assemble.
// Usage: node tools/media.ts <frames-dir>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderFrame, renderHatch, SHINE_MS, TRANSPARENT } from '../plugins/pixlings/hooks/lib/canvas.ts'
import type { Face, Hat, Mood, Neck, Pixels } from '../plugins/pixlings/hooks/lib/canvas.ts'
import { FACE_IDS, NECK_IDS } from '../plugins/pixlings/hooks/lib/gear.ts'
import { UNLOCKS } from '../plugins/pixlings/hooks/lib/progress.ts'
import { RARITY_COLOR, SPECIES } from '../plugins/pixlings/hooks/lib/sprites.ts'

const BG = 0x1a1b26

type Clip = { name: string; frames: number; ms: number; cells: { label: string; at: (t: number) => Pixels }[]; columns: number }

const species = (id: string) => SPECIES.find(s => s.id === id)!

const MOODS: { mood: Mood; label: string }[] = [
  { mood: 'idle', label: 'idle' },
  { mood: 'working', label: 'working' },
  { mood: 'happy', label: 'tests pass' },
  { mood: 'celebrate', label: 'bug squashed' },
  { mood: 'sad', label: 'tests fail' },
  { mood: 'alarmed', label: 'rm -rf?!' },
  { mood: 'attention', label: 'needs you' },
  { mood: 'sleep', label: 'rate limit nap' },
  { mood: 'love', label: 'petted' },
  { mood: 'dizzy', label: 'API error' },
  { mood: 'unimpressed', label: '"absolutely right"' },
  { mood: 'walk', label: 'strolling' },
]

// The hats at their levels, then the face gear and neckwear found between them.
const GEAR: { hat?: Hat; face?: Face; neck?: Neck; label: string }[] = [
  ...UNLOCKS.map(u => ({ hat: u.hat, label: `Lv ${u.level}` })),
  ...FACE_IDS.map(face => ({ face, label: 'found' })),
  ...NECK_IDS.map(neck => ({ neck, label: 'found' })),
]

const clips: Clip[] = [
  {
    name: 'moods',
    frames: 40,
    ms: 100,
    columns: 6,
    cells: MOODS.map(({ mood, label }) => ({
      label,
      at: t => renderFrame({ species: species('blip'), isShiny: false, mood, t }),
    })),
  },
  {
    name: 'roster',
    frames: 30,
    ms: 100,
    columns: 6,
    cells: SPECIES.map(s => ({
      label: s.name,
      at: t => renderFrame({ species: s, isShiny: false, mood: 'idle', t: t + s.id.length * 300 }),
    })),
  },
  {
    name: 'shiny',
    // One shine beat, the species staggered evenly across it, so each glints once, in turn.
    frames: SHINE_MS / 100,
    ms: 100,
    columns: 6,
    cells: SPECIES.map((s, i) => ({
      label: s.name,
      at: t => renderFrame({ species: s, isShiny: true, mood: 'happy', t: t + (i * SHINE_MS) / SPECIES.length }),
    })),
  },
  {
    name: 'gear',
    frames: 30,
    ms: 100,
    columns: 6,
    cells: GEAR.map(({ hat, face, neck, label }) => ({
      label,
      at: t => renderFrame({ species: species('duck'), isShiny: false, mood: 'idle', t, hat, face, neck }),
    })),
  },
  {
    name: 'hatch',
    frames: 75,
    ms: 100,
    columns: 1,
    cells: [
      {
        label: 'LEGENDARY',
        at: t => renderHatch({ species: species('dragon'), isShiny: false, mood: 'celebrate', t }, RARITY_COLOR.legendary),
      },
    ],
  },
]

const main = (): void => {
  const out = process.argv[2] ?? 'frames'
  for (const clip of clips) {
    const dir = join(out, clip.name)
    mkdirSync(dir, { recursive: true })
    const meta = { ms: clip.ms, columns: clip.columns, labels: clip.cells.map(c => c.label), frames: clip.frames }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta))
    for (let f = 0; f < clip.frames; f++) {
      const t = f * clip.ms
      const pictures = clip.cells.map(c => c.at(t))
      const h = Math.max(...pictures.map(p => p.h))
      const buf = Buffer.alloc(8 + pictures.length * 22 * h * 3)
      buf.writeUInt32LE(22, 0)
      buf.writeUInt32LE(h, 4)
      pictures.forEach((p, i) => {
        const base = 8 + i * 22 * h * 3
        const top = h - p.h
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < 22; x++) {
            const c = y >= top ? (p.px[(y - top) * p.w + x] ?? TRANSPARENT) : TRANSPARENT
            const color = c === TRANSPARENT ? BG : c
            const o = base + (y * 22 + x) * 3
            buf[o] = (color >> 16) & 255
            buf[o + 1] = (color >> 8) & 255
            buf[o + 2] = color & 255
          }
        }
      })
      writeFileSync(join(dir, `${String(f).padStart(3, '0')}.bin`), buf)
    }
    console.log(`${clip.name}: ${clip.frames} frames`)
  }
}

main()
