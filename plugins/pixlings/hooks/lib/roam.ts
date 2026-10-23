// Walking about the band. While Claude works the pixling stands by its speech bubble; when it is
// idle it wanders the free columns beside it, rests a while, and wanders again.

import { CANVAS_W } from './canvas.ts'

export const STEP_MS = 150
const REST_MIN_MS = 4000
const REST_SPAN_MS = 8000
/** A calm pixling rests longer between strolls. */
const CALM_REST_MIN_MS = 30_000
const CALM_REST_SPAN_MS = 60_000
/** Columns the speech bubble and the name need beside the canvas. */
const INFO_COLUMNS = 50
export const MAX_ROAM = 30

export type Walker = {
  /** The sprite's offset from the canvas's left edge, 0..range. */
  readonly x: number
  /** The range `x` was last walked in: a band that changes width keeps the sprite its distance from home. */
  readonly range: number
  readonly target: number | null
  readonly isFlipped: boolean
  readonly restUntil: number
  readonly lastStepAt: number
}

/** stay: hold still (asleep, reacting); home: walk back beside the bubble; wander: stroll. */
export type RoamMode = 'stay' | 'home' | 'wander'

export const roamRange = (bodyColumns: number): number =>
  Math.max(0, Math.min(MAX_ROAM, bodyColumns - CANVAS_W - INFO_COLUMNS))

export const newWalker = (range: number, now: number): Walker => ({
  x: range,
  range,
  target: null,
  isFlipped: false,
  restUntil: now + REST_MIN_MS,
  lastStepAt: now,
})

export const isWalking = (w: Walker): boolean => w.target !== null && w.target !== w.x

/**
 * Moves the walker on to `now`: as many steps as the time since the last one allows, each `stride`
 * pixels (a column of the band, where its pixels are smaller than a cell). Calm, it rests longer.
 */
/**
 * Where `n` (the sprite's x or its target, in the walker's range) is in a band of `range`. Home is
 * the right end, beside the bubble: a band of another width moves it, and the sprite with it.
 */
const inRange = (w: Walker, n: number, range: number): number => Math.max(0, Math.min(n + range - w.range, range))

/** The sprite's x drawn in a band of `range`: it follows the width at once, before the next step. */
export const placeIn = (w: Walker, range: number): number => inRange(w, w.x, range)

/**
 * The walker in a band that walks at another scale (pixels a column): the same columns from home,
 * so a band that changes size keeps the pixling where it was, and heading where it was heading.
 */
export const rescale = (w: Walker, from: number, to: number): Walker => {
  const range = Math.round((w.range / from) * to)
  const fromHome = (n: number): number => Math.max(0, range - Math.round(((w.range - n) / from) * to))
  return { ...w, range, x: fromHome(w.x), target: w.target === null ? null : fromHome(w.target) }
}

export const walk = (w: Walker, range: number, mode: RoamMode, now: number, random: () => number, stride = 1, isCalm = false): Walker => {
  let x = placeIn(w, range)
  let target = w.target === null ? null : inRange(w, w.target, range)
  let { restUntil, isFlipped, lastStepAt } = w

  if (mode === 'stay') return { ...w, x, range, target: null, lastStepAt: now }
  if (mode === 'home') target = range
  else if (target === null && now >= restUntil && range >= 4 * stride) {
    // Somewhere at least a few steps away, so a stroll reads as one.
    const away = 4 * stride
    let pick = x
    for (let tries = 0; tries < 8 && Math.abs(pick - x) < away; tries++) pick = Math.floor(random() * (range + 1))
    target = Math.abs(pick - x) >= away ? pick : null
  }

  // A walk starts now, however long the rest before it was.
  if (target !== null && target !== w.target) lastStepAt = now
  if (target !== null && target !== x) {
    const steps = Math.floor((now - lastStepAt) / STEP_MS)
    if (steps > 0) {
      const dir = Math.sign(target - x)
      isFlipped = dir < 0
      x += dir * Math.min(steps * stride, Math.abs(target - x))
      lastStepAt += steps * STEP_MS
    }
  } else {
    lastStepAt = now
  }

  if (target !== null && x === target) {
    if (mode === 'wander') {
      restUntil = isCalm
        ? now + CALM_REST_MIN_MS + Math.floor(random() * CALM_REST_SPAN_MS)
        : now + REST_MIN_MS + Math.floor(random() * REST_SPAN_MS)
    }
    target = null
    if (mode === 'home') isFlipped = false
  }
  return { x, range, target, isFlipped, restUntil, lastStepAt }
}
