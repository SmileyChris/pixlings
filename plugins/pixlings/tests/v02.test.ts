import { describe, expect, test } from 'claude-code/testing'

import { award, BADGES, earnedBadges, recapLine, touchDay } from '../hooks/lib/badges.ts'
import { CARD_BG, CARD_H, CARD_SCALE, CARD_W, renderCard, REPO, shareText } from '../hooks/lib/card.ts'
import { CANVAS_W, renderFrame, TRANSPARENT } from '../hooks/lib/canvas.ts'
import { print, textWidth } from '../hooks/lib/font.ts'
import { linuxSpeaker, openArgv, speakable, windowsSpeech, writeBytesArgv } from '../hooks/lib/platform.ts'
import { adler32, crc32, deflate, encodePng } from '../hooks/lib/png.ts'
import { emptyDay, hatchPixling, revive } from '../hooks/lib/progress.ts'
import type { Pixling } from '../hooks/lib/progress.ts'
import { isWalking, MAX_ROAM, newWalker, roamRange, STEP_MS, walk } from '../hooks/lib/roam.ts'
import { SPECIES } from '../hooks/lib/sprites.ts'
import { addTics, isEyeRoll, ticsIn, topTics } from '../hooks/lib/tics.ts'
import { countdown, freshCache, hitPercent, minutesLeft, observe, remainingMs, tokens, TTL_MS, vitals } from '../hooks/lib/vitals.ts'

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

const T0 = Date.parse('2026-10-03T12:00:00Z')
const MIN = 60_000

/** A request over a 60k-token prompt: `read` of it from the cache, the rest written. */
const usage = (read: number, prompt = 60_000) => ({
  input_tokens: 0,
  output_tokens: 500,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: prompt - read,
})

describe('the prompt cache', () => {
  test('the countdown runs from the last request', () => {
    const { cache, news } = observe(freshCache(), usage(0), T0)
    expect(news).toBeNull()
    expect(remainingMs(cache, T0 + MIN)).toBe(4 * MIN)
    expect(countdown(4 * MIN + 7_000)).toBe('4:07')
    expect(countdown(-5)).toBe('0:00')
    expect(remainingMs(freshCache(), T0)).toBeNull()
  })

  test('calm, the countdown ticks in minutes: never 0m while it is warm', () => {
    expect(minutesLeft(4 * MIN + 7_000)).toBe('5m')
    expect(minutesLeft(4 * MIN)).toBe('4m')
    expect(minutesLeft(20_000)).toBe('1m')
    const { cache } = observe(freshCache(), usage(0), T0)
    const at = T0 + MIN + 30_000
    const input = { cache, now: at, isWorking: false, contextPercent: null, limits: [] }
    expect(vitals(input)[0]?.text).toMatch(/cache ~?3:30/)
    expect(vitals({ ...input, isCalm: true })[0]?.text).toMatch(/cache ~?4m$/)
  })

  test('calm, it holds still at rest and still moves when something happens', () => {
    const duck = SPECIES.find(s => s.id === 'duck')!
    // The rows its head tops out at over a few seconds: one when it holds still. Glances and blinks
    // change the face, not where it stands; the sleeper's floating z's are left out.
    const Z = [0xcfe3ff, 0x7d93b8]
    const top = (f: { w: number; px: Int32Array }) => Math.floor(f.px.findIndex(c => c !== TRANSPARENT && !Z.includes(c)) / f.w)
    const frames = (mood: 'idle' | 'working' | 'sleep' | 'happy', isCalm: boolean) =>
      new Set([0, 700, 1400, 2100, 2800].map(t => top(renderFrame({ species: duck, isShiny: false, mood, t: t + 100, isCalm }))))
    for (const mood of ['idle', 'working', 'sleep'] as const) {
      expect(frames(mood, false).size, mood).toBeGreaterThan(1)
      expect(frames(mood, true).size, mood).toBe(1)
    }
    expect(frames('happy', true).size).toBeGreaterThan(1)
  })

  test('two hits after more than five minutes prove the hour-long TTL', () => {
    const first = observe(freshCache(), usage(0), T0).cache
    const once = observe(first, usage(58_000), T0 + 7 * MIN)
    expect(once.news).toBeNull()
    const { cache, news } = observe(once.cache, usage(58_000), T0 + 14 * MIN)
    expect(news).toEqual({ kind: 'learned', ttl: '1h' })
    expect(cache.ttl).toBe('1h')
    expect(cache.isTtlKnown).toBe(true)
    expect(remainingMs(cache, T0 + 15 * MIN)).toBe(59 * MIN)
  })

  test('a miss after the timer ran out is a cold start, and proves the five-minute TTL', () => {
    const first = observe(freshCache(), usage(0), T0).cache
    const { cache, news } = observe(first, usage(0), T0 + 9 * MIN)
    expect(news).toEqual({ kind: 'cold', gapMs: 9 * MIN, rewritten: 60_000 })
    expect(cache.coldStarts).toBe(1)
    expect(cache.rewritten).toBe(60_000)
    expect(cache.ttl).toBe('5m')
    expect(cache.isTtlKnown).toBe(true)
  })

  test('a miss inside the timer is not blamed on the pause; a pinned TTL is never relearned', () => {
    const first = observe(freshCache(), usage(0), T0).cache
    expect(observe(first, usage(0), T0 + 2 * MIN).news).toBeNull()
    const pinned = observe(freshCache('5m', true), usage(0), T0).cache
    const later = observe(pinned, usage(58_000), T0 + 7 * MIN, true)
    expect(later.news).toBeNull()
    expect(later.cache.ttl).toBe('5m')
    // Small prompts are under the cacheable minimum and prove nothing.
    const tiny = observe(first, usage(0, 1000), T0 + 9 * MIN)
    expect(tiny.news).toBeNull()
  })

  test('the vitals row: countdown, hit rate, context and limits, each with a tone', () => {
    let cache = observe(freshCache(), usage(0), T0).cache
    cache = observe(cache, usage(57_000), T0 + MIN).cache
    expect(hitPercent(cache)).toBe(48)
    const row = vitals({
      cache,
      now: T0 + MIN + 4 * MIN + 30_000,
      isWorking: false,
      contextPercent: 41.4,
      limits: [{ kind: 'five_hour', percentUsed: 93 }],
    })
    expect(row.map(v => v.text)).toEqual(['⏳ cache ~0:30', '48% cached', 'ctx 41%', '5h 93%'])
    expect(row.map(v => v.tone)).toEqual(['bad', 'bad', 'dim', 'bad'])
    const working = vitals({ cache, now: T0 + 2 * MIN, isWorking: true, contextPercent: null, limits: [] })
    expect(working[0]?.text).toBe('⚡ cache live')
    const cold = vitals({ cache, now: T0 + 30 * MIN, isWorking: false, contextPercent: null, limits: [] })
    expect(cold[0]).toEqual({ text: '❄ cache cold', tone: 'cold' })
    expect(tokens(84_213)).toBe('84k')
    expect(tokens(1_250_000)).toBe('1.3M')
    expect(tokens(1500)).toBe('1.5k')
    expect(TTL_MS['1h']).toBe(60 * MIN)
  })
})

describe('tics', () => {
  test('the sycophantic phrases are counted, code is not', () => {
    const found = ticsIn(
      "You're absolutely right! Great question.\nPerfect! I see the issue: the robust, production-ready fix.\n" +
        '```\n// You are absolutely right\n```\n`comprehensive`',
    )
    expect(found).toEqual({ absolutelyRight: 1, greatQuestion: 1, perfect: 1, issue: 1, robust: 1, productionReady: 1 })
    expect(ticsIn('You are totally correct, I apologize for the confusion.')).toEqual({ absolutelyRight: 1, apology: 1 })
    expect(ticsIn('All tests pass.')).toEqual({})
    expect(ticsIn('You’re absolutely right.')).toEqual({ absolutelyRight: 1 })
    const total = addTics({ absolutelyRight: 2 }, { absolutelyRight: 1, robust: 4 })
    expect(total).toEqual({ absolutelyRight: 3, robust: 4 })
    expect(topTics(total, 1)[0]?.tic).toBe('robust')
    expect(isEyeRoll('absolutelyRight')).toBe(true)
    expect(isEyeRoll('robust')).toBe(false)
  })
})

describe('badges and the day', () => {
  test('a badge is earned once, when the record first passes it', () => {
    let p: Pixling = { ...hatchPixling(seeded(1), T0), isShiny: false }
    let r = award(p, T0)
    expect(r.earned.map(b => b.id)).toContain('hello')
    p = r.pixling
    expect(award(p, T0 + 1).earned).toEqual([])
    p = { ...p, stats: { ...p.stats, bugsSquashed: 10 } }
    r = award(p, T0 + 2)
    expect(r.earned.map(b => b.id)).toEqual(['exterminator'])
    expect(earnedBadges(r.pixling).map(b => b.id).slice(0, 2)).toEqual(['hello', 'exterminator'])
    expect(new Set(BADGES.map(b => b.id)).size).toBe(BADGES.length)
    for (const b of BADGES) {
      expect(b.icon.length).toBe(7)
      for (const row of b.icon) {
        expect(row.length).toBe(7)
        for (const ch of row) expect(ch === '.' || b.colors[ch] !== undefined).toBe(true)
      }
    }
  })

  test('the streak counts days in a row and starts over after a gap', () => {
    const day = (iso: string) => Date.parse(`${iso}T10:00:00`)
    let p: Pixling = hatchPixling(seeded(2), day('2026-10-01'))
    p = touchDay(p, day('2026-10-01')).pixling
    expect(p.streak).toEqual({ last: '2026-10-01', days: 1, best: 1 })
    p = { ...p, day: { ...p.day, turns: 12, commits: 2 } }
    const next = touchDay(p, day('2026-10-02'))
    expect(next.pixling.streak.days).toBe(2)
    expect(next.recap?.turns).toBe(12)
    expect(recapLine(next.recap!, '2026-10-02')).toBe('Yesterday: 12 turns · 2 commits')
    expect(touchDay(next.pixling, day('2026-10-02') + 3_600_000).isNewDay).toBe(false)
    const gap = touchDay(next.pixling, day('2026-10-05')).pixling
    expect(gap.streak).toEqual({ last: '2026-10-05', days: 1, best: 2 })
  })

  test('an old save gains the new fields with safe defaults', () => {
    const p = revive({ v: 1, species: 'cat', name: 'Miso', tics: { absolutelyRight: 3, bogus: 'x' }, badges: { hello: 5 } })
    expect(p?.tics).toEqual({ absolutelyRight: 3 })
    expect(p?.badges).toEqual({ hello: 5 })
    expect(p?.streak).toEqual({ last: null, days: 0, best: 0 })
    expect(p?.day).toEqual(emptyDay(''))
    expect(p?.stats.coldStarts).toBe(0)
  })
})

describe('walking', () => {
  test('the walkable range is what the band has to spare', () => {
    expect(roamRange(60)).toBe(0)
    expect(roamRange(100)).toBe(28)
    expect(roamRange(400)).toBe(MAX_ROAM)
  })

  test('home walks back to the bubble a step at a time; stay holds still', () => {
    let w = { ...newWalker(20, 0), x: 5 }
    w = walk(w, 20, 'home', 0, seeded(1))
    w = walk(w, 20, 'home', STEP_MS * 3, seeded(1))
    expect(w.x).toBe(8)
    expect(w.isFlipped).toBe(false)
    expect(isWalking(w)).toBe(true)
    w = walk(w, 20, 'home', STEP_MS * 100, seeded(1))
    expect(w.x).toBe(20)
    expect(isWalking(w)).toBe(false)
    const still = walk({ ...w, x: 3, target: 9 }, 20, 'stay', STEP_MS * 200, seeded(1))
    expect(still.x).toBe(3)
    expect(still.target).toBeNull()
    // A narrower band pulls the walker in.
    expect(walk(w, 10, 'stay', 0, seeded(1)).x).toBe(10)
  })

  test('a stride moves that many pixels a step, and never past the target', () => {
    let w = { ...newWalker(40, 0), x: 0 }
    w = walk(w, 40, 'home', 0, seeded(1), 3)
    w = walk(w, 40, 'home', STEP_MS * 2, seeded(1), 3)
    expect(w.x).toBe(6)
    w = walk(w, 40, 'home', STEP_MS * 100, seeded(1), 3)
    expect(w.x).toBe(40)
  })

  test('wandering picks a spot, walks there, rests, and faces where it goes', () => {
    let w = newWalker(30, 0)
    w = walk(w, 30, 'wander', 10_000, seeded(4))
    expect(w.target).not.toBeNull()
    const target = w.target!
    w = walk(w, 30, 'wander', 10_000 + STEP_MS, seeded(4))
    expect(w.isFlipped).toBe(target < 30)
    w = walk(w, 30, 'wander', 10_000 + STEP_MS * 40, seeded(4))
    expect(w.x).toBe(target)
    expect(w.target).toBeNull()
    expect(w.restUntil).toBeGreaterThan(10_000 + STEP_MS * 40)
  })

  test('calm, it rests half a minute to a minute and a half between strolls', () => {
    const arrive = (isCalm: boolean) => {
      let w = walk(newWalker(30, 0), 30, 'wander', 10_000, seeded(4), 1, isCalm)
      w = walk(w, 30, 'wander', 10_000 + STEP_MS * 40, seeded(4), 1, isCalm)
      return w.restUntil - (10_000 + STEP_MS * 40)
    }
    expect(arrive(false)).toBeLessThan(12_000)
    expect(arrive(true)).toBeGreaterThanOrEqual(30_000)
    expect(arrive(true)).toBeLessThan(90_000)
  })

  test('a flipped pixling is the mirror image, wherever it stands on a wide canvas', () => {
    for (const species of SPECIES) {
      const a = renderFrame({ species, isShiny: false, mood: 'idle', t: 0 })
      const b = renderFrame({ species, isShiny: false, mood: 'idle', t: 0, isFlipped: true })
      for (let y = 0; y < a.h; y++) {
        for (let x = 0; x < a.w; x++) {
          const left = (a.px[y * a.w + x] ?? TRANSPARENT) !== TRANSPARENT
          const right = (b.px[y * b.w + (a.w - 1 - x)] ?? TRANSPARENT) !== TRANSPARENT
          expect(left).toBe(right)
        }
      }
      const wide = renderFrame({ species, isShiny: false, mood: 'walk', t: 140, width: CANVAS_W + 20, x: 20 })
      expect(wide.w).toBe(CANVAS_W + 20)
      expect([...wide.px.slice(0, 20)].every(c => c === TRANSPARENT)).toBe(true)
    }
    for (const mood of ['walk', 'unimpressed'] as const) {
      for (const t of [0, 300, 2000]) {
        expect(renderFrame({ species: SPECIES[0]!, isShiny: true, mood, t }).px.some(c => c !== TRANSPARENT)).toBe(true)
      }
    }
  })
})

/** Inflates the zlib stream `deflate` writes: one fixed-Huffman block, distance-1 matches. */
const inflate = (z: Uint8Array): Uint8Array => {
  let pos = 16 // past the two-byte zlib header
  const bit = (): number => {
    const b = ((z[pos >> 3] ?? 0) >> (pos & 7)) & 1
    pos++
    return b
  }
  const bits = (n: number): number => {
    let v = 0
    for (let i = 0; i < n; i++) v |= bit() << i
    return v
  }
  const code = (n: number, start = 0): number => {
    let v = start
    for (let i = 0; i < n; i++) v = (v << 1) | bit()
    return v
  }
  expect(bits(1)).toBe(1)
  expect(bits(2)).toBe(1)
  const base = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
  const extra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
  const out: number[] = []
  for (;;) {
    let sym: number
    const c7 = code(7)
    if (c7 <= 23) sym = 256 + c7
    else {
      const c8 = code(1, c7)
      if (c8 >= 0x30 && c8 <= 0xbf) sym = c8 - 0x30
      else if (c8 >= 0xc0 && c8 <= 0xc7) sym = 280 + c8 - 0xc0
      else sym = 144 + code(1, c8) - 0x190
    }
    if (sym < 256) out.push(sym)
    else if (sym === 256) break
    else {
      const i = sym - 257
      const length = (base[i] ?? 0) + bits(extra[i] ?? 0)
      const dist = code(5) + 1
      expect(dist).toBe(1)
      for (let k = 0; k < length; k++) out.push(out[out.length - dist] ?? 0)
    }
  }
  return new Uint8Array(out)
}

describe('the share card', () => {
  test('checksums match their reference values', () => {
    const bytes = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)))
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(adler32(bytes('Wikipedia'))).toBe(0x11e60398)
  })

  test('deflate round-trips runs, literals and every length bucket', () => {
    const data = new Uint8Array(5000)
    let at = 0
    for (let run = 1; at < data.length; run = (run % 300) + 1) {
      const value = (run * 37) & 255
      for (let k = 0; k < run && at < data.length; k++) data[at++] = value
    }
    const z = deflate(data)
    expect(z[0]).toBe(0x78)
    expect(((z[0] ?? 0) * 256 + (z[1] ?? 0)) % 31).toBe(0)
    expect([...inflate(z)]).toEqual([...data])
    const view = new DataView(z.buffer, z.byteOffset, z.byteLength)
    expect(view.getUint32(z.length - 4)).toBe(adler32(data))
  })

  test('the card is a 1200×675 PNG whose pixels decode back to the drawing', () => {
    const p = { ...hatchPixling(seeded(5), T0), name: 'Mochi' }
    const card = renderCard(p, T0)
    expect(card.w).toBe(CARD_W)
    expect(card.h).toBe(CARD_H)
    const png = encodePng(card, CARD_SCALE, CARD_BG)
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    expect(view.getUint32(16)).toBe(1200)
    expect(view.getUint32(20)).toBe(675)
    // Walk the chunks: each CRC holds, and the image data inflates to the scaled rows.
    let at = 8
    const palette: number[] = []
    let idat = new Uint8Array(0)
    while (at < png.length) {
      const length = view.getUint32(at)
      const type = String.fromCharCode(...png.slice(at + 4, at + 8))
      expect(view.getUint32(at + 8 + length)).toBe(crc32(png, at + 4, at + 8 + length))
      const data = png.slice(at + 8, at + 8 + length)
      if (type === 'PLTE') for (let i = 0; i < length; i += 3) palette.push(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0))
      if (type === 'IDAT') idat = data
      at += 12 + length
    }
    const raw = inflate(idat)
    const stride = 1200 + 1
    expect(raw.length).toBe(stride * 675)
    // Undo the filters as a viewer does (None and Up are the two written), then every output
    // pixel, the in-between rows included, is its source pixel's color.
    const rows: Uint8Array[] = []
    for (let r = 0; r < 675; r++) {
      const line = raw.slice(r * stride + 1, (r + 1) * stride)
      const filter = raw[r * stride]
      if (filter === 2) for (let i = 0; i < line.length; i++) line[i] = ((line[i] ?? 0) + (rows[r - 1]?.[i] ?? 0)) & 255
      else expect(filter).toBe(0)
      rows.push(line)
    }
    for (const [x, y] of [[0, 0], [1, 1], [40, 60], [120, 7], [200, 120], [37, 101]] as const) {
      const drawn = card.px[y * CARD_W + x] ?? TRANSPARENT
      for (const [dx, dy] of [[0, 0], [4, 3], [2, 4]] as const) {
        const index = rows[y * CARD_SCALE + dy]?.[x * CARD_SCALE + dx] ?? -1
        expect(palette[index]).toBe(drawn === TRANSPARENT ? CARD_BG : drawn)
      }
    }
    expect(png.length).toBeLessThan(60_000)
  })

  test('the font measures and prints; the post names the pixling and the repo', () => {
    expect(textWidth('ABC')).toBe(17)
    expect(textWidth('🔥', 2)).toBe(10)
    const p = { w: 12, h: 7, px: new Int32Array(84).fill(TRANSPARENT) }
    print(p, 0, 0, 'I~', 0xffffff)
    expect(p.px[1]).toBe(0xffffff)
    const pix = { ...hatchPixling(seeded(6), T0), name: 'Mochi', tics: { absolutelyRight: 4 } }
    const post = shareText(pix)
    expect(post).toContain('Mochi')
    expect(post).toContain(`https://${REPO}`)
    expect(post).toContain('4×')
    const one = shareText({ ...pix, stats: { ...pix.stats, turns: 1, bugsSquashed: 1 } })
    expect(one).toContain('1 turn, 1 bug squashed')
    expect(shareText({ ...pix, stats: { ...pix.stats, turns: 2 } })).toContain('2 turns, 0 bugs squashed')
  })
})

describe('files and voice', () => {
  test('bytes are written from base64 on standard input, never in the argv', () => {
    const win = writeBytesArgv('windows')
    expect(win.at(-1)).toContain('FromBase64String([Console]::In.ReadToEnd())')
    expect(win.at(-1)).toContain('$env:PIXLING_OUT')
    expect(writeBytesArgv('linux')).toEqual(['sh', '-c', 'base64 --decode > "$PIXLING_OUT"'])
    expect(openArgv('mac', '/x.png')).toEqual(['open', '/x.png'])
    expect(openArgv('wsl', '/x.png')).toBeNull()
  })

  test('speech reads plain text from standard input or argv', () => {
    expect(windowsSpeech().at(-1)).toContain('[Console]::In.ReadToEnd()')
    expect(linuxSpeaker('/usr/bin/spd-say\n')?.('hi')).toEqual(['/usr/bin/spd-say', '--wait', '--', 'hi'])
    // A line that looks like an option is said, never obeyed.
    expect(linuxSpeaker('/usr/bin/espeak-ng\n')?.('-w /tmp/x hi')).toEqual(['/usr/bin/espeak-ng', '--', '-w /tmp/x hi'])
    expect(linuxSpeaker('')).toBeNull()
    expect(speakable('Day 4 in a row. 🔥  *bows*')).toBe('Day 4 in a row. bows')
  })
})
