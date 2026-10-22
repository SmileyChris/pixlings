// The prompt cache, watched from outside. Every model request reads the conversation's prefix
// from the cache and restarts its timer; once the timer runs out, the next request pays to write
// the whole context again. The engine reports each request's token counts but names the cache's
// lifetime only at a model switch, so between switches the lifetime is learned: two near-full
// hits after gaps longer than five minutes prove the hour-long TTL, a full miss after one proves
// the five-minute one. A half hit proves nothing: a shared prefix (tools, system prompt) kept warm
// by another session can serve that much of a cache that is otherwise gone.

import type { LimitWindow } from './detect.ts'

export type Ttl = '5m' | '1h'

export const TTL_MS: Readonly<Record<Ttl, number>> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

/** Slack on the five-minute boundary: a request a few seconds late may still have hit. */
const BOUNDARY_SLACK_MS = 30_000
/** Prompts smaller than this are under the API's cacheable minimum; they prove nothing. */
const MIN_PROMPT = 4096
/** A gap past this outlives a five-minute cache. */
const PAST_SHORT_MS = TTL_MS['5m'] + BOUNDARY_SLACK_MS
/** A full miss later than this may be the hour running out, so it does not prove five minutes. */
const RELEARN_BEFORE_MS = 55 * 60_000
/** Shares of the prompt read from the cache that count as a hit that proves, and a full miss. */
const STRONG_HIT = 0.9
const FULL_MISS = 0.1
const HITS_TO_LEARN = 2

const isTtl = (v: unknown): v is Ttl => v === '5m' || v === '1h'

/** One request's counts, in the API's spelling (TurnUsage). */
export type RequestUsage = {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_input_tokens: number
  readonly cache_creation_input_tokens: number
}

export type Cache = {
  /** When the last main-thread request was sent: the cache's timer restarted then. */
  readonly lastAt: number | null
  readonly ttl: Ttl
  /** Learned from a request, or set by the person; an assumed TTL can still be learned. */
  readonly isTtlKnown: boolean
  /** Tokens the next request re-sends. */
  readonly context: number
  readonly read: number
  readonly written: number
  readonly uncached: number
  /** Requests that found the cache gone after a pause, and what re-caching them cost. */
  readonly coldStarts: number
  readonly rewritten: number
  /** Near-full hits in a row after pauses past five minutes; absent on caches from 0.2. */
  readonly longHits?: number
  /** The engine named the TTL at a model switch, and no request overrules it. */
  readonly isTtlFromSwitch?: boolean
}

export const freshCache = (ttl: Ttl = '5m', isTtlKnown = false): Cache => ({
  lastAt: null,
  ttl,
  isTtlKnown,
  context: 0,
  read: 0,
  written: 0,
  uncached: 0,
  coldStarts: 0,
  rewritten: 0,
  longHits: 0,
  isTtlFromSwitch: false,
})

/** `relearned` is set when a cold start overturned a learned hour: the stored TTL is wrong. */
export type CacheNews =
  | { kind: 'cold'; gapMs: number; rewritten: number; relearned?: Ttl }
  | { kind: 'learned'; ttl: Ttl }
  | null

/**
 * A main-thread request was sent at `sentAt` and answered with `usage`. Returns the cache after
 * it and what it revealed: a cold start after a pause, or the TTL proven for the first time.
 */
export const observe = (
  c: Cache,
  usage: RequestUsage,
  sentAt: number,
  isTtlPinned = false,
): { cache: Cache; news: CacheNews } => {
  const read = usage.cache_read_input_tokens
  const write = usage.cache_creation_input_tokens
  const prompt = usage.input_tokens + read + write
  const next: Cache = {
    ...c,
    lastAt: sentAt,
    context: prompt + usage.output_tokens,
    read: c.read + read,
    written: c.written + write,
    uncached: c.uncached + usage.input_tokens,
  }
  const gap = c.lastAt === null ? null : sentAt - c.lastAt
  if (gap === null || prompt < MIN_PROMPT) return { cache: next, news: null }

  const isPastShort = gap > PAST_SHORT_MS
  const canLearn = !isTtlPinned && c.isTtlFromSwitch !== true
  const isMiss = read < prompt * 0.2 && write >= prompt * 0.5
  const streak = c.longHits ?? 0
  const isLongHit = isPastShort && read >= prompt * STRONG_HIT && c.ttl !== '1h'
  // Requests inside five minutes say nothing about the TTL and leave the streak as it was.
  const longHits = isLongHit ? streak + 1 : isPastShort ? 0 : streak

  if (canLearn && c.ttl !== '1h' && longHits >= HITS_TO_LEARN) {
    return {
      cache: { ...next, ttl: '1h', isTtlKnown: true, longHits: 0 },
      news: { kind: 'learned', ttl: '1h' },
    }
  }
  const proves5m =
    canLearn &&
    isMiss &&
    read < prompt * FULL_MISS &&
    isPastShort &&
    gap < RELEARN_BEFORE_MS &&
    (c.ttl === '1h' || !c.isTtlKnown)
  const ttl: Ttl = proves5m ? '5m' : c.ttl
  if (isMiss && gap >= TTL_MS[ttl] - BOUNDARY_SLACK_MS) {
    // A miss after the timer ran out is the cache going cold; a full one also proves five minutes.
    const cold: Cache = {
      ...next,
      longHits,
      coldStarts: c.coldStarts + 1,
      rewritten: c.rewritten + write,
    }
    const news = { kind: 'cold', gapMs: gap, rewritten: write } as const
    if (!proves5m) return { cache: cold, news }
    return {
      cache: { ...cold, ttl, isTtlKnown: true },
      news: c.ttl === ttl ? news : { ...news, relearned: ttl },
    }
  }
  return { cache: { ...next, longHits }, news: null }
}

/**
 * The engine named the TTL (PreModelSwitch / PostModelSwitch `cache_ttl`): it is known, and the
 * miss the switch itself causes is not taken for the cache's lifetime running out.
 */
export const applyKnownTtl = (c: Cache, ttl: Ttl): Cache => ({
  ...c,
  ttl,
  isTtlKnown: true,
  isTtlFromSwitch: true,
  longHits: 0,
})

export type TtlSource = 'learned' | 'switch'

/** A TTL as the store keeps it: what, since when, and from where. */
export type StoredTtl = { readonly ttl: Ttl; readonly learnedAt: number; readonly source: TtlSource }

const DAY_MS = 24 * 60 * 60_000

/** How long a stored TTL is trusted: a learned one is a guess, a switch's is the engine's word. */
export const TTL_SHELF_MS: Readonly<Record<TtlSource, number>> = {
  learned: 14 * DAY_MS,
  switch: 30 * DAY_MS,
}

export const encodeTtl = (ttl: Ttl, learnedAt: number, source: TtlSource): StoredTtl => ({
  ttl,
  learnedAt,
  source,
})

/**
 * The stored TTL if it is still trusted at `now`, else null. 0.2 stored a bare '5m' or '1h':
 * learned on an unknown day, so it is past trusting, as is anything unreadable or from the future.
 */
export const decodeTtl = (stored: unknown, now: number): StoredTtl | null => {
  if (typeof stored !== 'object' || stored === null) return null
  const { ttl, learnedAt, source } = stored as Record<string, unknown>
  if (!isTtl(ttl) || (source !== 'learned' && source !== 'switch')) return null
  if (typeof learnedAt !== 'number' || !Number.isFinite(learnedAt)) return null
  const age = now - learnedAt
  return age >= 0 && age < TTL_SHELF_MS[source] ? { ttl, learnedAt, source } : null
}

export type GuardInput = {
  /** PreModelSwitch `prompt_cache_warm`: the engine knows the TTL, so its word wins. */
  readonly isWarm: boolean
  /** PreModelSwitch `estimated_cache_write_usd`. */
  readonly estimatedUsd: number
  /** What the pixling's countdown says is left, for the reason; null before any request. */
  readonly remainingMs: number | null
  readonly thresholdUsd: number
}

const usd = (n: number): string => `$${n.toFixed(2)}`

/** Whether a model switch should be put to the person first, and why, in a sentence. */
export const guardDecision = (g: GuardInput): { shouldAsk: boolean; reason: string } => {
  if (!g.isWarm) {
    return { shouldAsk: false, reason: 'The cache is already cold; switching costs nothing extra.' }
  }
  if (!Number.isFinite(g.estimatedUsd)) {
    return { shouldAsk: false, reason: 'The cost of re-caching is unknown.' }
  }
  if (g.estimatedUsd < g.thresholdUsd) {
    const reason = `Re-caching costs ~${usd(g.estimatedUsd)}, under the ${usd(g.thresholdUsd)} line.`
    return { shouldAsk: false, reason }
  }
  const ms = g.remainingMs
  const left = ms !== null && ms > 0 ? `, ${countdown(ms)} before it cools` : ''
  const reason = `Switching models now re-writes ~${usd(g.estimatedUsd)} of warm cache${left}.`
  return { shouldAsk: true, reason }
}

/** What one turn took from a rate-limit window, in percentage points. */
export type QuotaDelta = { readonly kind: string; readonly points: number }

/**
 * Each window's rise between two readings, in the order of `after`. A window that fell was reset
 * in between, so all of its use is the turn's; one missing from `before` has no baseline.
 */
export const turnQuota = (
  before: readonly LimitWindow[],
  after: readonly LimitWindow[],
): QuotaDelta[] => {
  const out: QuotaDelta[] = []
  for (const w of after) {
    const was = before.find(b => b.kind === w.kind)
    if (!was) continue
    const rise = w.percentUsed < was.percentUsed ? w.percentUsed : w.percentUsed - was.percentUsed
    out.push({ kind: w.kind, points: Math.round(rise * 10) / 10 })
  }
  return out
}

/** Milliseconds until the cache expires; null before the first request. */
export const remainingMs = (c: Cache, now: number): number | null =>
  c.lastAt === null ? null : c.lastAt + TTL_MS[c.ttl] - now

/** The share of input tokens the cache served this session, 0..100; null before any. */
export const hitPercent = (c: Cache): number | null => {
  const total = c.read + c.written + c.uncached
  return total === 0 ? null : Math.round((c.read / total) * 100)
}

/** "4:07", "59:30"; never negative. */
export const countdown = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "5m" for 4:07 left, "1m" in the last minute: a countdown that ticks once a minute. */
export const minutesLeft = (ms: number): string => `${Math.max(1, Math.ceil(ms / 60_000))}m`

/** "84k", "1.2M", "950". */
export const tokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/**
 * "claude-opus-5-5[1m]" is "opus 5.5", "claude-3-5-sonnet-20241022" is "sonnet 3.5", a Bedrock or
 * Vertex id likewise; an id that names no Claude model is shown as it came.
 */
export const modelLabel = (id: string): string => {
  const at = id.indexOf('claude-')
  if (at < 0) return id
  const parts = id
    .slice(at + 'claude-'.length)
    .replace(/\[[^\]]*\]$/, '')
    .replace(/-v\d+(:\d+)?$/, '')
    .replace(/[-@]\d{8}$/, '')
    .split('-')
  const family = parts.find(p => /^[a-z]+$/.test(p))
  if (!family) return id
  const version = parts.filter(p => /^\d{1,2}$/.test(p)).join('.')
  return version ? `${family} ${version}` : family
}

export type Tone = 'good' | 'warn' | 'bad' | 'cold' | 'dim'

export type Vital = { readonly text: string; readonly tone: Tone }

const LIMIT_LABEL: Readonly<Record<string, string>> = {
  five_hour: '5h',
  seven_day: 'wk',
  spend_limit: '$',
}

/** How close a cache is to going cold, as a tone: the last minute is red. */
export const cacheTone = (left: number, ttl: Ttl): Tone => {
  if (left <= 60_000) return 'bad'
  if (left <= TTL_MS[ttl] * 0.3) return 'warn'
  return 'good'
}

export type VitalsInput = {
  readonly cache: Cache
  readonly now: number
  readonly isWorking: boolean
  readonly contextPercent: number | null
  readonly limits: readonly LimitWindow[]
  /** The model id a request named (turn.step `model`), shown as "opus 5.5". */
  readonly model?: string
  /** turn.step `effort`: a level, or a thinking budget in tokens. */
  readonly effort?: string | number
  /** What the last turn took from the rate limits (turnQuota); the largest rise is shown. */
  readonly turnDelta?: readonly QuotaDelta[]
  /** The cache counts down in minutes, not seconds. */
  readonly isCalm?: boolean
}

/**
 * The vitals row: the cache's countdown, how much of the input it served, the context window's
 * fill, the rate-limit windows, what the last turn took from them, and the model. Each a short
 * piece with a tone for its color.
 */
export const vitals = (v: VitalsInput): Vital[] => {
  const out: Vital[] = []
  const left = remainingMs(v.cache, v.now)
  if (v.isWorking && left !== null) out.push({ text: '⚡ cache live', tone: 'good' })
  else if (left !== null && left > 0) {
    const pin = v.cache.isTtlKnown ? '' : '~'
    out.push({ text: `⏳ cache ${pin}${v.isCalm ? minutesLeft(left) : countdown(left)}`, tone: cacheTone(left, v.cache.ttl) })
  } else if (left !== null) out.push({ text: '❄ cache cold', tone: 'cold' })

  const hit = hitPercent(v.cache)
  if (hit !== null) out.push({ text: `${hit}% cached`, tone: hit >= 80 ? 'dim' : hit >= 50 ? 'warn' : 'bad' })

  if (v.contextPercent !== null) {
    const pct = Math.round(v.contextPercent)
    out.push({ text: `ctx ${pct}%`, tone: pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : 'dim' })
  }

  for (const w of v.limits) {
    const label = LIMIT_LABEL[w.kind] ?? w.kind
    const pct = Math.round(w.percentUsed)
    const tone: Tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'dim'
    out.push({ text: `${label} ${pct}%`, tone })
  }

  const rise = Math.max(0, ...(v.turnDelta ?? []).map(d => d.points))
  if (rise > 0) {
    const pts = rise < 0.95 ? rise.toFixed(1) : String(Math.round(rise))
    out.push({ text: `turn +${pts}%`, tone: rise >= 10 ? 'bad' : rise >= 5 ? 'warn' : 'dim' })
  }

  const effort = typeof v.effort === 'number' ? tokens(v.effort) : v.effort
  const who = [v.model ? modelLabel(v.model) : '', effort ?? ''].filter(s => s !== '').join(' · ')
  if (who !== '') out.push({ text: who, tone: 'dim' })
  return out
}
