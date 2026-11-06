// Badges, the daily streak and the morning recap. A badge is earned once, from the pixling's own
// record, so a badge added in a later version is awarded the first time its test passes.

import type { Day, Pixling } from './progress.ts'
import { emptyDay, levelOf } from './progress.ts'

export type BadgeId =
  | 'hello'
  | 'exterminator'
  | 'dangerous'
  | 'nightOwl'
  | 'survivor'
  | 'shipper'
  | 'liftoff'
  | 'centurion'
  | 'onFire'
  | 'lucky'
  | 'absolutelyRight'
  | 'bestFriends'
  | 'greenThumb'
  | 'collector'
  | 'archmage'
  | 'brainFreeze'

export type Badge = {
  readonly id: BadgeId
  readonly name: string
  readonly emoji: string
  readonly how: string
  /** Progress toward it: [have, need]. */
  readonly progress: (p: Pixling) => readonly [number, number]
  /** A 7×7 icon for the share card; each letter a color of `colors`. */
  readonly icon: readonly string[]
  readonly colors: Readonly<Record<string, number>>
}

const at = (have: number, need: number): readonly [number, number] => [Math.min(have, need), need]

export const BADGES: readonly Badge[] = [
  {
    id: 'hello',
    name: 'Hello, World',
    emoji: '🥚',
    how: 'Hatch a pixling',
    progress: () => at(1, 1),
    icon: ['..WWW..', '.WWWWW.', '.WKWWW.', 'WWKWKWW', 'WWWKWWW', 'WWWWWWW', '.WWWWW.'],
    colors: { W: 0xf4efe1, K: 0x6b5b45 },
  },
  {
    id: 'exterminator',
    name: 'Exterminator',
    emoji: '🐛',
    how: 'Squash 10 bugs (red tests → green)',
    progress: p => at(p.stats.bugsSquashed, 10),
    // The antennae are a darker green: the near-black of the eyes vanishes on a dark card.
    icon: ['.A...A.', '..A.A..', '.GGGGG.', 'GGKGKGG', '.GGGGG.', 'GG.G.GG', '.......'],
    colors: { G: 0x6fdc8c, K: 0x1b1424, A: 0x3f9a4a },
  },
  {
    id: 'dangerous',
    name: 'Living Dangerously',
    emoji: '💣',
    how: 'Run 10 risky commands',
    progress: p => at(p.stats.risky, 10),
    icon: ['....Y.O', '...O...', '..KK...', '.KKKK..', 'KKWKKK.', 'KKKKKK.', '.KKKK..'],
    colors: { K: 0x4f4870, W: 0xb8c2cc, Y: 0xffe14d, O: 0xff8a3d },
  },
  {
    id: 'nightOwl',
    name: 'Night Owl',
    emoji: '🦉',
    how: 'Work 25 turns after midnight',
    progress: p => at(p.stats.nights, 25),
    icon: ['..YYY..', '.YY...W', 'YY.....', 'YY...W.', 'YY.....', '.YY....', '..YYY..'],
    colors: { Y: 0xffe98a, W: 0xffffff },
  },
  {
    id: 'survivor',
    name: 'Limit Survivor',
    emoji: '⏳',
    how: 'Sleep through a rate limit',
    progress: p => at(p.stats.naps, 1),
    icon: ['BBBBBBB', '.Y...Y.', '..YYY..', '...Y...', '..Y.Y..', '.YYYYY.', 'BBBBBBB'],
    colors: { B: 0x8a6b4a, Y: 0xffd23f },
  },
  {
    id: 'shipper',
    name: 'Shipper',
    emoji: '📦',
    how: 'Make 50 commits',
    progress: p => at(p.stats.commits, 50),
    icon: ['.......', 'TTTYTTT', 'TTTYTTT', 'DDDDDDD', 'TTTTTTT', 'TTTTTTT', 'TTTTTTT'],
    colors: { T: 0xc98a4b, D: 0x8a5a2b, Y: 0xffe14d },
  },
  {
    id: 'liftoff',
    name: 'Liftoff',
    emoji: '🚀',
    how: 'Open a pull request',
    progress: p => at(p.stats.prs, 1),
    icon: ['...W...', '..WWW..', '..WBW..', '..WWW..', '.RWWWR.', '.R.O.R.', '...Y...'],
    colors: { W: 0xe6e9f0, B: 0x5ad1ff, R: 0xff4d6d, O: 0xff8a3d, Y: 0xffe14d },
  },
  {
    id: 'centurion',
    name: 'Centurion',
    emoji: '🏆',
    how: 'Finish 100 turns',
    progress: p => at(p.stats.turns, 100),
    icon: ['YYYYYYY', 'YYYYYYY', '.YYYYY.', '..YYY..', '...Y...', '..YYY..', '.YYYYY.'],
    colors: { Y: 0xffc53d },
  },
  {
    id: 'onFire',
    name: 'On Fire',
    emoji: '🔥',
    how: 'Code 7 days in a row',
    progress: p => at(p.streak.best, 7),
    icon: ['...R...', '..RR...', '.RORR..', '.ROORR.', 'RROYOR.', '.RYYOR.', '..RRR..'],
    colors: { R: 0xff4d3d, O: 0xff8a3d, Y: 0xffe14d },
  },
  {
    id: 'lucky',
    name: 'Lucky',
    emoji: '✨',
    how: 'Hatch a shiny',
    progress: p => at(p.isShiny ? 1 : 0, 1),
    icon: ['...Y...', '...Y...', '..YYY..', 'YYYWYYY', '..YYY..', '...Y...', '...Y...'],
    colors: { Y: 0xffe14d, W: 0xffffff },
  },
  {
    id: 'absolutelyRight',
    name: 'Absolutely Right',
    emoji: '🙄',
    how: 'Hear "You\'re absolutely right" 25 times',
    progress: p => at(p.tics.absolutelyRight ?? 0, 25),
    icon: ['WWWWWWW', 'WWWWWGW', 'WGWWGWW', 'WWGGWWW', 'WWWWWWW', '.WW....', '.W.....'],
    colors: { W: 0xe6e9f0, G: 0x3fa45a },
  },
  {
    id: 'bestFriends',
    name: 'Best Friends',
    emoji: '💖',
    how: 'Pet your pixling 100 times',
    progress: p => at(p.stats.pets, 100),
    icon: ['.PP.PP.', 'PPPPPPP', 'PWPPPPP', 'PPPPPPP', '.PPPPP.', '..PPP..', '...P...'],
    colors: { P: 0xff4d8d, W: 0xffc2d8 },
  },
  {
    id: 'greenThumb',
    name: 'Green Thumb',
    emoji: '✅',
    how: 'Pass 100 test runs',
    progress: p => at(p.stats.testsPassed, 100),
    icon: ['......G', '.....GG', 'G...GG.', 'GG.GG..', '.GGG...', '..G....', '.......'],
    colors: { G: 0x5cff8a },
  },
  {
    id: 'collector',
    name: 'Collector',
    emoji: '📖',
    how: 'Discover 5 species',
    progress: p => at(p.dex.length, 5),
    icon: ['.......', '.RR.BB.', '.RR.BB.', '.......', '.GG.YY.', '.GG.YY.', '.......'],
    colors: { R: 0xff5fa2, B: 0x5ad1ff, G: 0x6fdc8c, Y: 0xffe14d },
  },
  {
    id: 'archmage',
    name: 'Archmage',
    emoji: '🧙',
    how: 'Reach level 25',
    progress: p => at(levelOf(p.xp).level, 25),
    icon: ['...P...', '..PP...', '..PYP..', '.PPPP..', '.PPPPP.', 'PPPPPPP', 'BBBBBBB'],
    colors: { P: 0x7b4dff, Y: 0xffe14d, B: 0x4a2fb8 },
  },
  {
    id: 'brainFreeze',
    name: 'Brain Freeze',
    emoji: '🧊',
    how: 'Let the prompt cache go cold 10 times',
    progress: p => at(p.stats.coldStarts, 10),
    icon: ['...C...', '.C.C.C.', '..CCC..', 'CCCWCCC', '..CCC..', '.C.C.C.', '...C...'],
    colors: { C: 0x7fd3ff, W: 0xffffff },
  },
]

export const badgeById = (id: string): Badge | undefined => BADGES.find(b => b.id === id)

export const isEarnedBy = (b: Badge, p: Pixling): boolean => {
  const [have, need] = b.progress(p)
  return have >= need
}

/** Awards every badge the record now earns; returns the pixling and the badges new to it. */
export const award = (p: Pixling, now: number): { pixling: Pixling; earned: Badge[] } => {
  const earned = BADGES.filter(b => p.badges[b.id] === undefined && isEarnedBy(b, p))
  if (earned.length === 0) return { pixling: p, earned }
  const badges = { ...p.badges }
  for (const b of earned) badges[b.id] = now
  return { pixling: { ...p, badges }, earned }
}

/** The badges earned, in the order they were. */
export const earnedBadges = (p: Pixling): Badge[] =>
  BADGES.filter(b => p.badges[b.id] !== undefined).sort((a, b) => (p.badges[a.id] ?? 0) - (p.badges[b.id] ?? 0))

// The day ----------------------------------------------------------------------------------------

/** "2026-10-03", by local time. */
export const localDate = (at: number): string => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const dayBefore = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1, 12).getTime())
}

/**
 * The pixling's first sight of `at`'s day: moves the streak and starts a new day record.
 * `recap` is yesterday's (or the last active day's) work, handed back once, on the day's first turn.
 */
export const touchDay = (p: Pixling, at: number): { pixling: Pixling; recap: Day | null; isNewDay: boolean } => {
  const today = localDate(at)
  if (p.day.date === today) return { pixling: p, recap: null, isNewDay: false }
  const { last, days, best } = p.streak
  const run = last === today ? days : last === dayBefore(today) ? days + 1 : 1
  const recap = p.day.date !== '' && p.day.turns > 0 ? p.day : null
  return {
    pixling: { ...p, streak: { last: today, days: run, best: Math.max(best, run) }, day: emptyDay(today) },
    recap,
    isNewDay: true,
  }
}

export const countDay = (p: Pixling, field: Exclude<keyof Day, 'date' | 'xp'>, by = 1): Pixling => ({
  ...p,
  day: { ...p.day, [field]: p.day[field] + by },
})

/** "Yesterday: 41 turns · 6 commits · 2 bugs squashed · +212 XP". */
export const recapLine = (recap: Day, today: string): string => {
  const when = recap.date === dayBefore(today) ? 'Yesterday' : `On ${recap.date}`
  const parts = [
    `${recap.turns} turn${recap.turns === 1 ? '' : 's'}`,
    recap.commits ? `${recap.commits} commit${recap.commits === 1 ? '' : 's'}` : '',
    recap.squashed ? `${recap.squashed} bug${recap.squashed === 1 ? '' : 's'} squashed` : '',
    recap.tests ? `${recap.tests} green test run${recap.tests === 1 ? '' : 's'}` : '',
    recap.xp ? `+${recap.xp} XP` : '',
  ].filter(Boolean)
  return `${when}: ${parts.join(' · ')}`
}
