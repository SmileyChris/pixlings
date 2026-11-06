// Renders sample share cards with the plugin's own code, for a look before shipping.
// Usage: node tools/card.ts <out-dir>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CARD_BG, CARD_SCALE, renderCard, shareText } from '../plugins/pixlings/hooks/lib/card.ts'
import { encodePng } from '../plugins/pixlings/hooks/lib/png.ts'
import type { Pixling } from '../plugins/pixlings/hooks/lib/progress.ts'
import { emptyDay, emptyStats, revive } from '../plugins/pixlings/hooks/lib/progress.ts'

const NOW = Date.parse('2026-10-03T12:00:00Z')

// Through revive, as an old save loads: fields added since get their defaults.
const base = (over: Partial<Pixling>): Pixling =>
  revive({
    v: 1,
    species: 'blip',
    isShiny: false,
    name: 'Mochi',
    hatchedAt: Date.parse('2026-09-01T10:00:00Z'),
    xp: 0,
    hat: null,
    face: null,
    stats: emptyStats(),
    dex: ['blip'],
    badges: {},
    streak: { last: '2026-10-03', days: 1, best: 1 },
    day: emptyDay('2026-10-03'),
    tics: {},
    ...over,
  })!

const samples: Record<string, Pixling> = {
  fresh: base({ species: 'duck', name: 'Quackers', xp: 12, hatchedAt: NOW - 3_600_000 }),
  veteran: base({
    species: 'robot',
    name: 'Sprocket',
    xp: 4200,
    stats: { ...emptyStats(), turns: 1342, commits: 211, bugsSquashed: 37, testsPassed: 402, prs: 18, pets: 64 },
    streak: { last: '2026-10-03', days: 12, best: 12 },
    dex: ['robot', 'duck', 'blip', 'cat', 'owl'],
    badges: { hello: 1, exterminator: 2, centurion: 3, onFire: 4, shipper: 5, liftoff: 6, collector: 7, greenThumb: 8, absolutelyRight: 9 },
    tics: { absolutelyRight: 87, perfect: 40 },
  }),
  legendary: base({
    species: 'dragon',
    isShiny: true,
    name: 'Ember',
    // The README's card: the wizard hat it has worn there, nothing on its face or neck.
    hat: 'wizard',
    face: 'none',
    neck: 'none',
    xp: 26000,
    stats: { ...emptyStats(), turns: 5120, commits: 640, bugsSquashed: 120, testsPassed: 980, prs: 77 },
    streak: { last: '2026-10-03', days: 41, best: 41 },
    badges: Object.fromEntries(['hello', 'exterminator', 'dangerous', 'nightOwl', 'survivor', 'shipper', 'liftoff', 'centurion', 'onFire', 'lucky', 'absolutelyRight', 'bestFriends', 'greenThumb', 'collector', 'archmage', 'brainFreeze'].map((b, i) => [b, i])),
    tics: { absolutelyRight: 312 },
  }),
  ghost: base({ species: 'ghost', name: 'Boo', xp: 900, stats: { ...emptyStats(), turns: 220, commits: 31 } }),
}

const out = process.argv[2] ?? 'preview'
mkdirSync(out, { recursive: true })
for (const [name, px] of Object.entries(samples)) {
  const started = performance.now()
  const png = encodePng(renderCard(px, NOW), CARD_SCALE, CARD_BG)
  const ms = (performance.now() - started).toFixed(1)
  writeFileSync(join(out, `card-${name}.png`), png)
  console.log(`card-${name}.png ${png.length} bytes in ${ms} ms`)
  console.log(`  ${shareText(px)}`)
}
