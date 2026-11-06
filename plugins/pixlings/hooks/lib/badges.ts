// Badges, the daily streak and the morning recap. A badge is earned from the person's record, once
// per step: a single badge has one step, a tiered one three (bronze, silver, gold). Tier 1 is kept
// under the badge's own id, so a badge from before tiers is bronze; the others under `id:2`, `id:3`.
// A badge or a tier added in a later version is awarded the first time its test passes.

import type { Day, Pixling } from './progress.ts'
import { emptyDay, levelOf } from './progress.ts'
import { totalTics } from './tics.ts'

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
  | 'heardItAll'
  | 'regular'

export type Badge = {
  readonly id: BadgeId
  readonly name: string
  readonly emoji: string
  /** What each step needs of `count`: one for a single badge, three for bronze, silver and gold. */
  readonly steps: readonly number[]
  readonly count: (p: Pixling) => number
  /** How to earn the step that needs `n`. */
  readonly how: (n: number) => string
  /** A 7×7 icon for the share card; each letter a color of `colors`. */
  readonly icon: readonly string[]
  readonly colors: Readonly<Record<string, number>>
}

export const TIERS = ['Bronze', 'Silver', 'Gold'] as const
export const MEDALS = ['🥉', '🥈', '🥇'] as const

/** 12,345: grouped by hand, as the mod's environment may have no Intl. */
const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const once = (text: string) => () => text

export const BADGES: readonly Badge[] = [
  {
    id: 'hello',
    name: 'Hello, World',
    emoji: '🥚',
    steps: [1],
    count: () => 1,
    how: once('Hatch a pixling'),
    icon: ['..WWW..', '.WWWWW.', '.WKWWW.', 'WWKWKWW', 'WWWKWWW', 'WWWWWWW', '.WWWWW.'],
    colors: { W: 0xf4efe1, K: 0x6b5b45 },
  },
  {
    id: 'exterminator',
    name: 'Exterminator',
    emoji: '🐛',
    steps: [10, 50, 250],
    count: p => p.lifetime.bugsSquashed,
    how: n => `Squash ${grouped(n)} bugs (red tests → green)`,
    // The antennae are a darker green: the near-black of the eyes vanishes on a dark card.
    icon: ['.A...A.', '..A.A..', '.GGGGG.', 'GGKGKGG', '.GGGGG.', 'GG.G.GG', '.......'],
    colors: { G: 0x6fdc8c, K: 0x1b1424, A: 0x3f9a4a },
  },
  {
    id: 'dangerous',
    name: 'Living Dangerously',
    emoji: '💣',
    steps: [10, 50, 200],
    count: p => p.lifetime.risky,
    how: n => `Run ${grouped(n)} risky commands`,
    icon: ['....Y.O', '...O...', '..KK...', '.KKKK..', 'KKWKKK.', 'KKKKKK.', '.KKKK..'],
    colors: { K: 0x4f4870, W: 0xb8c2cc, Y: 0xffe14d, O: 0xff8a3d },
  },
  {
    id: 'nightOwl',
    name: 'Night Owl',
    emoji: '🦉',
    steps: [25, 100, 500],
    count: p => p.lifetime.nights,
    how: n => `Work ${grouped(n)} turns after midnight`,
    icon: ['..YYY..', '.YY...W', 'YY.....', 'YY...W.', 'YY.....', '.YY....', '..YYY..'],
    colors: { Y: 0xffe98a, W: 0xffffff },
  },
  {
    id: 'survivor',
    name: 'Limit Survivor',
    emoji: '⏳',
    steps: [1],
    count: p => p.stats.naps,
    how: once('Sleep through a rate limit'),
    icon: ['BBBBBBB', '.Y...Y.', '..YYY..', '...Y...', '..Y.Y..', '.YYYYY.', 'BBBBBBB'],
    colors: { B: 0x8a6b4a, Y: 0xffd23f },
  },
  {
    id: 'shipper',
    name: 'Shipper',
    emoji: '📦',
    steps: [50, 250, 1000],
    count: p => p.lifetime.commits,
    how: n => `Make ${grouped(n)} commits`,
    icon: ['.......', 'TTTYTTT', 'TTTYTTT', 'DDDDDDD', 'TTTTTTT', 'TTTTTTT', 'TTTTTTT'],
    colors: { T: 0xc98a4b, D: 0x8a5a2b, Y: 0xffe14d },
  },
  {
    id: 'liftoff',
    name: 'Liftoff',
    emoji: '🚀',
    steps: [1],
    count: p => p.stats.prs,
    how: once('Open a pull request'),
    icon: ['...W...', '..WWW..', '..WBW..', '..WWW..', '.RWWWR.', '.R.O.R.', '...Y...'],
    colors: { W: 0xe6e9f0, B: 0x5ad1ff, R: 0xff4d6d, O: 0xff8a3d, Y: 0xffe14d },
  },
  {
    id: 'centurion',
    name: 'Centurion',
    emoji: '🏆',
    steps: [100, 1000, 10000],
    count: p => p.lifetime.turns,
    how: n => `Finish ${grouped(n)} turns`,
    icon: ['YYYYYYY', 'YYYYYYY', '.YYYYY.', '..YYY..', '...Y...', '..YYY..', '.YYYYY.'],
    colors: { Y: 0xffc53d },
  },
  {
    id: 'onFire',
    name: 'On Fire',
    emoji: '🔥',
    steps: [7, 30, 100],
    count: p => p.streak.best,
    how: n => `Code ${grouped(n)} days in a row`,
    icon: ['...R...', '..RR...', '.RORR..', '.ROORR.', 'RROYOR.', '.RYYOR.', '..RRR..'],
    colors: { R: 0xff4d3d, O: 0xff8a3d, Y: 0xffe14d },
  },
  {
    id: 'lucky',
    name: 'Lucky',
    emoji: '✨',
    steps: [1, 2, 4],
    count: p => p.lifetime.shinyEggs,
    how: n => (n === 1 ? 'Lay a shiny egg' : `Lay ${grouped(n)} shiny eggs`),
    icon: ['...Y...', '...Y...', '..YYY..', 'YYYWYYY', '..YYY..', '...Y...', '...Y...'],
    colors: { Y: 0xffe14d, W: 0xffffff },
  },
  {
    id: 'absolutelyRight',
    name: 'Absolutely Right',
    emoji: '🙄',
    steps: [25, 100, 500],
    count: p => p.tics.absolutelyRight ?? 0,
    how: n => `Hear "You're absolutely right" ${grouped(n)} times`,
    icon: ['WWWWWWW', 'WWWWWGW', 'WGWWGWW', 'WWGGWWW', 'WWWWWWW', '.WW....', '.W.....'],
    colors: { W: 0xe6e9f0, G: 0x3fa45a },
  },
  {
    id: 'bestFriends',
    name: 'Best Friends',
    emoji: '💖',
    steps: [100],
    count: p => p.stats.pets,
    how: once('Pet your pixling 100 times'),
    icon: ['.PP.PP.', 'PPPPPPP', 'PWPPPPP', 'PPPPPPP', '.PPPPP.', '..PPP..', '...P...'],
    colors: { P: 0xff4d8d, W: 0xffc2d8 },
  },
  {
    id: 'greenThumb',
    name: 'Green Thumb',
    emoji: '✅',
    steps: [100, 500, 2500],
    count: p => p.lifetime.testsPassed,
    how: n => `Pass ${grouped(n)} test runs`,
    icon: ['......G', '.....GG', 'G...GG.', 'GG.GG..', '.GGG...', '..G....', '.......'],
    colors: { G: 0x5cff8a },
  },
  {
    id: 'collector',
    name: 'Collector',
    emoji: '📖',
    steps: [5, 12, 18],
    count: p => p.dex.length,
    how: n => `Discover ${grouped(n)} species`,
    icon: ['.......', '.RR.BB.', '.RR.BB.', '.......', '.GG.YY.', '.GG.YY.', '.......'],
    colors: { R: 0xff5fa2, B: 0x5ad1ff, G: 0x6fdc8c, Y: 0xffe14d },
  },
  {
    id: 'archmage',
    name: 'Archmage',
    emoji: '🧙',
    steps: [25, 50, 99],
    count: p => levelOf(p.xp).level,
    how: n => `Reach level ${grouped(n)}`,
    icon: ['...P...', '..PP...', '..PYP..', '.PPPP..', '.PPPPP.', 'PPPPPPP', 'BBBBBBB'],
    colors: { P: 0x7b4dff, Y: 0xffe14d, B: 0x4a2fb8 },
  },
  {
    id: 'brainFreeze',
    name: 'Brain Freeze',
    emoji: '🧊',
    steps: [10, 50, 200],
    count: p => p.lifetime.coldStarts,
    how: n => `Let the prompt cache go cold ${grouped(n)} times`,
    icon: ['...C...', '.C.C.C.', '..CCC..', 'CCCWCCC', '..CCC..', '.C.C.C.', '...C...'],
    colors: { C: 0x7fd3ff, W: 0xffffff },
  },
  {
    id: 'heardItAll',
    name: 'Heard It All',
    emoji: '🦜',
    steps: [50, 250, 1000],
    count: p => totalTics(p.tics),
    how: n => `Hear Claude's tics ${grouped(n)} times in all`,
    // A parrot: it repeats what it hears.
    icon: ['..GGG..', '.GGGGG.', 'GGWKGGY', 'GGGGGYY', 'GGGGGY.', '.RGGG..', '.RR....'],
    colors: { G: 0x3fd07a, W: 0xffffff, K: 0x1b1424, Y: 0xffc53d, R: 0xff4d6d },
  },
  {
    id: 'regular',
    name: 'Regular',
    emoji: '☕',
    steps: [100, 500, 2000],
    count: p => p.lifetime.sessions,
    how: n => `Open ${grouped(n)} sessions`,
    icon: ['..S.S..', '.S.S...', 'MCCCCM.', 'MMMMMMM', 'MMMMM.M', 'MMMMMMM', '.MMMM..'],
    colors: { M: 0xe6e9f0, C: 0x8a5a2b, S: 0x8a90a6 },
  },
]

export const badgeById = (id: string): Badge | undefined => BADGES.find(b => b.id === id)

export const isTiered = (b: Badge): boolean => b.steps.length > 1

/** Where tier `tier` (1-based) of a badge is kept in `Pixling.badges`. */
export const tierKey = (id: BadgeId, tier: number): string => (tier === 1 ? id : `${id}:${tier}`)

/** The tiers of `b` earned: 0 for none, up to `b.steps.length`. */
export const tierOf = (b: Badge, p: Pixling): number => {
  let tier = 0
  while (tier < b.steps.length && p.badges[tierKey(b.id, tier + 1)] !== undefined) tier++
  return tier
}

/** The way to the next step: the tier earned so far, and the count against the step's need. Null once all are earned. */
export const progressOf = (b: Badge, p: Pixling): { tier: number; have: number; need: number } | null => {
  const tier = tierOf(b, p)
  const need = b.steps[tier]
  if (need === undefined) return null
  return { tier, have: Math.min(b.count(p), need), need }
}

/** "Exterminator · Silver"; a single badge is its name. */
export const badgeTitle = (b: Badge, tier: number): string =>
  isTiered(b) && tier >= 1 ? `${b.name} · ${TIERS[tier - 1]}` : b.name

/** The medal for a tiered badge's tier, or nothing. */
export const medalOf = (b: Badge, tier: number): string => (isTiered(b) && tier >= 1 ? (MEDALS[tier - 1] ?? '') : '')

/**
 * Awards every step the record now passes; returns the pixling and, per badge, the highest tier
 * new to it, so a record that passes three at once is celebrated once.
 */
export const award = (p: Pixling, now: number): { pixling: Pixling; earned: { badge: Badge; tier: number }[] } => {
  const badges = { ...p.badges }
  const earned: { badge: Badge; tier: number }[] = []
  for (const b of BADGES) {
    const n = b.count(p)
    let top = 0
    b.steps.forEach((need, i) => {
      const key = tierKey(b.id, i + 1)
      if (badges[key] === undefined && n >= need) {
        badges[key] = now
        top = i + 1
      }
    })
    if (top > 0) earned.push({ badge: b, tier: top })
  }
  if (earned.length === 0) return { pixling: p, earned }
  return { pixling: { ...p, badges }, earned }
}

/** The badges earned, at any tier, in the order they first were. */
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
