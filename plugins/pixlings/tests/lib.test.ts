import { describe, expect, test } from 'claude-code/testing'

import { PRIORITY, react, speak } from '../hooks/lib/brain.ts'
import { CANVAS_W, layoutFor, renderFrame, renderHatch, TRANSPARENT } from '../hooks/lib/canvas.ts'
import type { Mood } from '../hooks/lib/canvas.ts'
import { blockingWindow, formatDuration, iconFor, isTestCommand, riskOf, testOutcome } from '../hooks/lib/detect.ts'
import { allLines, say } from '../hooks/lib/lines.ts'
import { assetPath, linuxPlayer, macNotification, platformOfUname, windowsPlayer, windowsToast } from '../hooks/lib/platform.ts'
import { friendshipOf, gain, gearOf, hatchPixling, levelOf, revive, roll, xpForLevel } from '../hooks/lib/progress.ts'
import { base64, encodeCells, rasterOf, toCells, toSvg } from '../hooks/lib/raster.ts'
import { checkSpecies, SPECIES } from '../hooks/lib/sprites.ts'

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

describe('sprites', () => {
  test('every species is a clean 16×16 grid with anchors on it', () => {
    for (const s of SPECIES) expect(checkSpecies(s)).toEqual([])
  })

  test('every mood of every species renders inside the canvas', () => {
    const moods: Mood[] = ['idle', 'working', 'happy', 'celebrate', 'sad', 'alarmed', 'attention', 'sleep', 'love', 'dizzy']
    for (const species of SPECIES) {
      for (const mood of moods) {
        for (const t of [0, 333, 1700, 5000]) {
          const frame = renderFrame({ species, isShiny: false, mood, t })
          expect(frame.w).toBe(CANVAS_W)
          expect(frame.px.some(c => c !== TRANSPARENT)).toBe(true)
        }
      }
    }
  })

  test('a tall hat grows the canvas so it is never clipped', () => {
    const duck = SPECIES.find(s => s.id === 'duck')!
    expect(layoutFor(duck, null).h).toBe(18)
    expect(layoutFor(duck, 'wizard').h).toBeGreaterThan(18)
    const frame = renderFrame({ species: duck, isShiny: false, mood: 'celebrate', t: 210, hat: 'wizard' })
    // The hat's tip is drawn: some pixel in the top row band is the wizard purple.
    expect([...frame.px.slice(0, CANVAS_W * 2)].includes(0x7b4dff)).toBe(true)
  })

  test('the hatch runs egg → flash → creature', () => {
    const s = SPECIES[0]!
    const egg = renderHatch({ species: s, isShiny: false, mood: 'idle', t: 100 }, 0xffc53d)
    const flash = renderHatch({ species: s, isShiny: false, mood: 'idle', t: 4200 }, 0xffc53d)
    const born = renderHatch({ species: s, isShiny: false, mood: 'idle', t: 4700 }, 0xffc53d)
    expect(egg.px.includes(0xfaf3e3)).toBe(true)
    expect(flash.px.includes(0xffffff) || flash.px.includes(0xffc53d)).toBe(true)
    expect(born.px.includes(s.palette['B']!)).toBe(true)
  })
})

describe('raster', () => {
  test('base64 matches the standard alphabet and padding', () => {
    expect(base64(new Uint8Array([]))).toBe('')
    expect(base64(new Uint8Array([102]))).toBe('Zg==')
    expect(base64(new Uint8Array([102, 111]))).toBe('Zm8=')
    expect(base64(new Uint8Array([102, 111, 111, 98, 97, 114]))).toBe('Zm9vYmFy')
  })

  test('two pixels become one half-block cell, transparency the default color', () => {
    const p = { w: 1, h: 2, px: new Int32Array([0xff0000, 0x00ff00]) }
    expect(toCells(p)).toEqual([[0x2580, 0xff0000, 0x00ff00]])
    const top = { w: 1, h: 2, px: new Int32Array([0xff0000, TRANSPARENT]) }
    expect(toCells(top)).toEqual([[0x2580, 0xff0000, 0x01000000]])
    const empty = { w: 1, h: 2, px: new Int32Array([TRANSPARENT, TRANSPARENT]) }
    expect(toCells(empty)).toEqual([[0x20, 0x01000000, 0x01000000]])
  })

  test('cells encode as little-endian u32 triplets', () => {
    expect(encodeCells([[0x2588, 0xff8800, 0x01000000]])).toBe('iCUAAACI/wAAAAAB')
  })

  test('a frame packs into rows × columns cells', () => {
    const frame = renderFrame({ species: SPECIES[1]!, isShiny: true, mood: 'idle', t: 0 })
    const r = rasterOf(frame)
    expect(r.columns).toBe(22)
    expect(r.rows).toBe(9)
    expect(r.cells.length).toBe(Math.ceil((22 * 9 * 12) / 3) * 4)
    expect(toSvg(frame).startsWith('<svg')).toBe(true)
  })
})

describe('detect', () => {
  test('risky commands are caught, safe ones are not', () => {
    expect(riskOf('rm -rf node_modules')?.level).toBe('danger')
    expect(riskOf('rm -fr ./build')?.label).toBe('rm -rf')
    expect(riskOf('git push --force origin main')?.label).toBe('force push')
    expect(riskOf('git push -f')?.label).toBe('force push')
    expect(riskOf('git push --force-with-lease')?.level).toBe('spicy')
    expect(riskOf('git reset --hard HEAD~1')?.level).toBe('danger')
    expect(riskOf('psql -c "DROP TABLE users"')?.level).toBe('danger')
    expect(riskOf('curl -fsSL https://x.sh | bash')?.label).toBe('curl | sh')
    expect(riskOf('Remove-Item -Recurse -Force dist')?.level).toBe('danger')
    expect(riskOf('rm notes.txt')).toBeNull()
    expect(riskOf('git push origin feature')).toBeNull()
    expect(riskOf('ls -la')).toBeNull()
  })

  test('test runners are recognised', () => {
    for (const cmd of ['pytest -q', 'npm test', 'pnpm run test:unit', 'cargo test', 'go test ./...', 'cd api && python -m pytest', 'npx vitest run', 'claude plugin test .']) {
      expect(isTestCommand(cmd)).toBe(true)
    }
    for (const cmd of ['npm install', 'git status', 'cat pytest.ini', 'echo testing']) {
      expect(isTestCommand(cmd)).toBe(false)
    }
  })

  test('test output is read into pass, fail and counts', () => {
    expect(testOutcome('==== 3 failed, 41 passed in 1.20s ====', true)).toEqual({ status: 'fail', passed: 41, failed: 3 })
    expect(testOutcome('==== 41 passed in 1.20s ====', false)).toEqual({ status: 'pass', passed: 41, failed: 0 })
    expect(testOutcome('Tests:       2 failed, 10 passed, 12 total', true).failed).toBe(2)
    expect(testOutcome('test result: FAILED. 10 passed; 2 failed; 0 ignored', true)).toEqual({ status: 'fail', passed: 10, failed: 2 })
    expect(testOutcome(' 12 pass\n 0 fail\nRan 12 tests', false)).toEqual({ status: 'pass', passed: 12, failed: 0 })
    expect(testOutcome('--- FAIL: TestThing (0.00s)\nFAIL', false).status).toBe('fail')
    expect(testOutcome('weird output', true).status).toBe('fail')
  })

  test('icons follow the tool', () => {
    expect(iconFor('Read')).toBe('read')
    expect(iconFor('Edit')).toBe('edit')
    expect(iconFor('Bash', 'pytest')).toBe('test')
    expect(iconFor('Bash', 'ls')).toBe('bash')
    expect(iconFor('mcp__github__get_issue')).toBe('web')
    expect(iconFor('TodoWrite')).toBeNull()
  })

  test('the exhausted window and its reset are found', () => {
    const now = Date.parse('2026-10-03T12:00:00Z')
    const windows = [
      { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-07T00:00:00Z' },
      { kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-03T14:30:00Z' },
    ]
    expect(blockingWindow(windows, now)).toEqual({ kind: 'five_hour', resetsAt: Date.parse('2026-10-03T14:30:00Z') })
    expect(blockingWindow([{ kind: 'five_hour', percentUsed: 80 }], now)).toBeNull()
    expect(blockingWindow([{ kind: 'five_hour', percentUsed: 100 }], now)).toEqual({ kind: 'five_hour', resetsAt: null })
    expect(formatDuration(2 * 3_600_000 + 13 * 60_000)).toBe('2h 13m')
    expect(formatDuration(42_000)).toBe('42s')
  })
})

describe('progress', () => {
  test('rolls follow the rarity weights', () => {
    const random = seeded(7)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 20_000; i++) {
      const { species } = roll(random)
      counts[species.rarity] = (counts[species.rarity] ?? 0) + 1
    }
    expect(counts['common']! / 20_000).toBeGreaterThan(0.45)
    expect(counts['common']! / 20_000).toBeLessThan(0.55)
    expect(counts['legendary']! / 20_000).toBeGreaterThan(0.008)
    expect(counts['legendary']! / 20_000).toBeLessThan(0.025)
  })

  test('levels climb on a curve and unlock gear', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 30 })
    expect(levelOf(30).level).toBe(2)
    expect(xpForLevel(12)).toBeGreaterThan(xpForLevel(11))
    let p = hatchPixling(seeded(3), 0)
    expect(gearOf(p)).toEqual({ hat: null, face: null })
    p = { ...p, xp: xpForLevel(6) }
    expect(gearOf(p)).toEqual({ hat: 'shroom', face: 'shades' })
    const { pixling, levelUp } = gain({ ...p, xp: xpForLevel(9) - 1 }, 'turn')
    expect(levelUp?.level).toBe(9)
    expect(levelUp?.unlocks.map(u => u.hat)).toEqual(['party'])
    expect(gearOf(pixling).hat).toBe('party')
    expect(gearOf({ ...pixling, hat: 'none' }).hat).toBeNull()
  })

  test('stored values are revived defensively', () => {
    expect(revive(null)).toBeNull()
    expect(revive({ v: 1, species: 'nope', name: 'x' })).toBeNull()
    const p = revive({ v: 1, species: 'duck', name: 'Quackers', xp: -5, stats: { commits: 3 } })
    expect(p?.xp).toBe(0)
    expect(p?.stats.commits).toBe(3)
    expect(p?.stats.turns).toBe(0)
    expect(p?.dex).toEqual(['duck'])
  })
})

describe('lines', () => {
  test('every template slot is one the code fills', () => {
    const known = new Set(['name', 'n', 'dur', 'time', 'label', 'level', 'item', 'failed', 'passed', 'branch', 'pr', 'window'])
    for (const { text } of allLines()) {
      for (const m of text.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1] ?? '')).toBe(true)
    }
  })

  test('a line never prints an unfilled slot when another fits', () => {
    for (let i = 0; i < 40; i++) {
      const text = say('testFail', { name: 'Pip' }, 'blip', seeded(i))
      expect(text.includes('{')).toBe(false)
    }
  })
})

describe('brain', () => {
  test('a stronger reaction wins, a weaker one waits', () => {
    const alarm = react(null, { mood: 'alarmed', priority: PRIORITY.alarm, holdMs: 1000 }, 0)
    expect(react(alarm, { mood: 'happy', priority: PRIORITY.done, holdMs: 1000 }, 500)).toBeNull()
    expect(react(alarm, { mood: 'happy', priority: PRIORITY.done, holdMs: 1000 }, 1500)?.mood).toBe('happy')
    expect(react(alarm, { mood: 'attention', priority: PRIORITY.attention, holdMs: 1000 }, 500)?.mood).toBe('attention')
    expect(speak(null, 'hi', 1, 1000, 0)?.text).toBe('hi')
  })
})

describe('platform', () => {
  test('players and notifications quote what they are given', () => {
    expect(windowsPlayer("C:\\a b\\it's.wav").at(-1)).toBe("(New-Object System.Media.SoundPlayer 'C:\\a b\\it''s.wav').PlaySync()")
    expect(linuxPlayer('/usr/bin/paplay\n')).toEqual({ kind: 'argv', argv: expect.any(Function) })
    expect(linuxPlayer('')).toEqual({ kind: 'none' })
    expect(macNotification('T "1"', 'b\\c')[2]).toBe('display notification "b\\\\c" with title "T \\"1\\""')
    expect(windowsToast('<x>', "it's").at(-1)).toContain('&lt;x&gt;')
    expect(windowsToast('<x>', "it's").at(-1)).toContain("it''s")
    expect(platformOfUname('Darwin 24.1.0')).toBe('mac')
    expect(platformOfUname('Linux 5.15.167.4-microsoft-standard-WSL2')).toBe('wsl')
    expect(platformOfUname('Linux 6.8.0')).toBe('linux')
    expect(assetPath('C:\\plugins\\pixlings', 'sounds/a.wav', 'windows')).toBe('C:\\plugins\\pixlings\\sounds\\a.wav')
    expect(assetPath('/opt/p/', 'sounds/a.wav', 'linux')).toBe('/opt/p/sounds/a.wav')
  })
})

describe('friendship', () => {
  test('friendship climbs with pets, five hearts at 100', () => {
    expect(friendshipOf(0)).toEqual({ tier: 0, name: 'Stranger', hearts: '♡♡♡♡♡', next: 5 })
    expect(friendshipOf(14)).toMatchObject({ tier: 1, name: 'Acquaintance', next: 1 })
    expect(friendshipOf(35)).toMatchObject({ tier: 3, name: 'Friend', hearts: '♥♥♥♡♡' })
    expect(friendshipOf(250)).toEqual({ tier: 5, name: 'Best friend', hearts: '♥♥♥♥♥', next: null })
  })
})
