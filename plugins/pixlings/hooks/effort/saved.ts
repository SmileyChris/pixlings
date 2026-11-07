// The effort the person saved in their settings: the gate's first guess at the level in use, before any request has
// said what it is. A level started with `--effort`, or changed in the app since, is not in the settings, so the first
// request's own level always replaces this guess.

import { EFFORTS } from './judge.ts'
import type { Effort } from './judge.ts'

const isEffort = (v: unknown): v is Effort => EFFORTS.includes(v as Effort)

/** What the settings say about effort: the top-level `effortLevel`, and `modelSettings.<model id>.effortLevel`. */
export type SavedEfforts = { readonly base?: Effort; readonly byModel: Readonly<Record<string, Effort>> }

/** Reads the effort parts of a settings object, keeping only the five levels. */
export function savedEffortsOf(effortLevel: unknown, modelSettings: unknown): SavedEfforts {
  const byModel: Record<string, Effort> = {}
  if (modelSettings && typeof modelSettings === 'object') {
    for (const [id, entry] of Object.entries(modelSettings as Record<string, unknown>)) {
      const level = entry && typeof entry === 'object' ? (entry as { effortLevel?: unknown }).effortLevel : undefined
      if (isEffort(level)) byModel[id] = level
    }
  }
  return { ...(isEffort(effortLevel) ? { base: effortLevel } : {}), byModel }
}

/**
 * The saved level for `model`: its own entry, found by its id (`claude-opus-5-5`, with any `[1m]` dropped) or by an
 * alias the session may name it by (`opus`); else the saved default; else undefined.
 */
export function savedEffortFor(saved: SavedEfforts, model: string | undefined): Effort | undefined {
  if (model) {
    const id = model.replace(/\[[^\]]*\]$/, '').toLowerCase()
    const exact = saved.byModel[id]
    if (exact) return exact
    const ids = Object.keys(saved.byModel).filter(key => key.toLowerCase().includes(id))
    if (ids.length === 1) return saved.byModel[ids[0]!]
  }
  return saved.base
}
