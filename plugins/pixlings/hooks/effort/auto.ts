// Auto effort: what each prompt's effort should be, and the per-session controller that holds the pick. The flow is
// Effortless's (HeyCubit/effortless 1.72.0, hooks/register.tsx: `prompt.submit`, `turn.step`, `pickEffort`,
// `toggleAutoEffort`, `choose`, the held pick on `turn.complete`), written fresh without `$`: the engine comes in as
// deps, so plain fakes stand in under test. Where Pixlings differs (Haiku not answering turns Auto off for the
// session at medium, one judge call at a time, the app taking the `/effort` Pixlings typed is not the person's
// change), a comment says so.

import type { PixlingsEffortPick, PixlingsEffortShift } from '../../types'
import type { Verdict } from './haiku.ts'
import { bounded, cacheSafe, EFFORTS, helperFloor, keepsEffort, MODELS, namedEffort, tipped, withAttachments, withMidTurn } from './judge.ts'
import type { Effort, ModelKey, Pick as JudgePick } from './judge.ts'

/** How long the gate draws Auto's change of level as arrows (Effortless SWITCHED_MS). */
export const SWITCHED_MS = 2500

const LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max' }

type Chosen = NonNullable<PixlingsEffortPick>

/** Where Haiku not answering leaves the session: medium, as if picked, so it is enforced with Auto off. */
const NO_ANSWER: Chosen = { effort: 'medium', why: "Haiku didn't answer", by: 'manual' }

const STOOD_DOWN = "Pixlings' Auto effort is paused while Effortless is installed. Uninstall Effortless to use it here."

export type AutoConfig = { isOn: boolean; floor: Effort; ceiling: Effort; bias: number }

const isEffort = (v: unknown): v is Effort => EFFORTS.includes(v as Effort)
const rank = (e: Effort) => EFFORTS.indexOf(e)
const keyOf = (modelId: string): ModelKey | undefined => MODELS.find(m => modelId.includes(m.key))?.key

/** The settings as the app stored them (a boolean may come as a string, the bias always does); bad values are defaults. */
export function readAutoConfig(options: Record<string, unknown>): AutoConfig {
  const bias = Number(String(options.effortBias ?? '0'))
  return {
    isOn: options.autoEffort !== false && options.autoEffort !== 'false',
    floor: isEffort(options.effortFloor) ? options.effortFloor : 'low',
    ceiling: isEffort(options.effortCeiling) ? options.effortCeiling : 'max',
    bias: Number.isInteger(bias) && Math.abs(bias) <= 2 ? bias : 0,
  }
}

/** A pick read back from the store, or none when it isn't one (an older or broken save). */
export function readStoredPick(raw: unknown): PixlingsEffortPick {
  if (typeof raw !== 'object' || raw === null) return null
  const { effort, why, by } = raw as Record<string, unknown>
  if (!isEffort(effort) || (by !== 'haiku' && by !== 'named' && by !== 'manual')) return null
  return { effort, why: typeof why === 'string' ? why : '', by }
}

/** What `prompt.submit` knows about a prompt, as Auto needs it. */
export type PromptFacts = {
  text: string
  /** Typed by the person (origin composer, bridge or sdk). */
  isPerson: boolean
  /** The skill or custom command the person added that a typed slash command runs (Effortless typedSkill). */
  skill?: { name: string; description: string }
  isSlash: boolean
  hasAttachments: boolean
  /** The attachments' kinds, so the judge hears "2 images"; without them it hears of one attachment. */
  attachments?: readonly { type: string }[]
  modelId: string
  /** The recent conversation, as judge.ts `contextFrom` gives it. */
  context: string
  /** Typed while a turn was running (`e.turnId` set). */
  midTurn: boolean
}

export type PromptPlan = { kind: 'skip' } | { kind: 'keep' } | { kind: 'named'; effort: Effort } | { kind: 'judge'; question: string }

/** What Auto does with a prompt: leave it, keep the level, take the level it names, or ask the judge this question. */
export function planPrompt(f: PromptFacts, isAuto: boolean, current: PixlingsEffortPick): PromptPlan {
  // Of slash commands only a skill or custom command the person added is judged; the app's own and Pixlings' never.
  if (!f.isPerson || (f.isSlash && !f.skill) || !isAuto) return { kind: 'skip' }
  // On other models an effort change rewrites the cache, and Haiku takes no effort.
  if (!cacheSafe(f.modelId)) return { kind: 'skip' }
  // "go", "ok", "yes" between two steps keep the level Auto chose. A message with an image is new work.
  if (current && current.by !== 'manual' && !f.hasAttachments && !f.isSlash && keepsEffort(f.text, f.context)) return { kind: 'keep' }
  // "max effort", "effort: low": the person said the level, so it runs as said, past the floor and ceiling.
  const named = f.isSlash ? undefined : namedEffort(f.text)
  if (named) return { kind: 'named', effort: named }
  // The judge is told what a skill does, since its name alone says little, and that a message typed mid-turn may steer the task.
  const said = f.skill ? `${f.text}\n\n[This is a slash command that runs a skill: ${f.skill.description || f.skill.name}. Judge the work the skill will do.]` : f.text
  const shown = withAttachments(said, f.attachments ?? (f.hasAttachments ? [{ type: 'attachment' }] : undefined))
  return { kind: 'judge', question: f.midTurn && current ? withMidTurn(shown, current.effort) : shown }
}

/** The level a verdict comes to under the settings, and the reason shown: "your settings" when they moved it. */
export function settle(verdict: Verdict, cfg: AutoConfig): { effort: Effort; why: string } {
  const effort = bounded(tipped(verdict.effort, verdict.sure, cfg.bias), cfg.floor, cfg.ceiling)
  return { effort, why: effort === verdict.effort ? verdict.why : 'your settings' }
}

export type AutoDeps = {
  now(): number
  setState(p: { pick?: PixlingsEffortPick; isAuto?: boolean; shift?: PixlingsEffortShift }): Promise<void>
  /** What the engine's state still holds when the hook module reloads (closure state is lost, state is not); unset slots are undefined. */
  readState(): Promise<{ pick?: PixlingsEffortPick; isAuto?: boolean; shift?: PixlingsEffortShift }>
  store: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> }
  toast(t: string): void
  /** Types `/effort <level>` into the app, so its own setting follows a click. */
  typeEffort(level: Effort): Promise<void>
  /** Haiku's verdict on the next message, or null when it didn't answer. */
  ask(prompt: string, current: JudgePick | null, context: string): Promise<Verdict | null>
  cfg: AutoConfig
}

/** A request as `turn.step` sees it: `effort` is the app's own, and `agentId` is set for a subagent's. */
export type RequestFacts = { modelId: string; effort: string | number | undefined; agentId?: string }

export type Auto = ReturnType<typeof createAuto>

/** One session's Auto effort. No method throws: every dependency call is caught. */
export function createAuto(deps: AutoDeps) {
  const { cfg } = deps
  let pick: PixlingsEffortPick = null
  let isAuto = true
  let shift: PixlingsEffortShift = null
  let isJudging = false
  // A lower level for a message typed mid-turn waits for the turn to end (Effortless heldPick).
  let heldPick: Chosen | null = null
  // The app's own effort as last seen on a main-loop request (Effortless engineEffort). A request reports the app's
  // setting, never the effort Pixlings rewrote it to, so a change is the person's: their pick wins and Auto goes off.
  let engineEffort: Effort | undefined
  let model: ModelKey | undefined
  // The pick came from the store, not this session: the app's effort, which the person may have just set, overrules it.
  let pickCarried = false
  // Effortless is installed and steers effort itself: Auto judges, steers and stores nothing this session (standDown).
  let isStoodDown = false

  const quiet = async (run: () => unknown): Promise<void> => {
    try {
      await run()
    } catch {
      // Never into a turn.
    }
  }
  const now = () => {
    try {
      return deps.now()
    } catch {
      return Date.now()
    }
  }
  const read = async (key: string) => {
    try {
      return await deps.store.get(key)
    } catch {
      return undefined
    }
  }
  /** Auto's switch and the pick carry to the next session in the store, but not from a session where Effortless steers. */
  const keep = (key: 'effortAuto' | 'effortPick', value: unknown): Promise<void> => (isStoodDown ? Promise.resolve() : quiet(() => deps.store.set(key, value)))
  const keepAuto = (on: boolean) => keep('effortAuto', on)

  /** The pick in force from now on. A change of level Auto made is drawn as a shift for a moment (Effortless choose). */
  const choose = async (next: Chosen, also: { isAuto?: boolean } = {}) => {
    pickCarried = false
    const before = pick
    pick = next
    const moved = next.by !== 'manual' && before !== null && before.effort !== next.effort
    if (moved) shift = { from: before.effort, to: next.effort, until: now() + SWITCHED_MS }
    await Promise.all([quiet(() => deps.setState({ ...also, pick: next, ...(moved ? { shift } : {}) })), keep('effortPick', next)])
  }

  /** Mid-turn, a lower level would cut the running task's remaining steps, so it waits; a higher one helps, so it applies. */
  const apply = async (next: Chosen, midTurn: boolean) => {
    if (midTurn && pick && rank(next.effort) < rank(pick.effort)) {
      heldPick = next
      return
    }
    heldPick = null
    await choose(next)
  }

  /** The person changed effort in the app: Auto goes off, their level is the pick, and they are told. */
  const pickedInApp = (level: Effort) => {
    isAuto = false
    void keepAuto(false)
    void choose({ effort: level, why: 'your pick in the app', by: 'manual' }, { isAuto: false })
    void quiet(() => deps.toast(`Auto effort is off. You picked ${LABELS[level]}; turn Auto on to hand it back.`))
  }

  /** The pick this request should carry: none on other models, none for an Auto pick while Auto is off, none while Effortless steers. */
  const enforced = (modelId: string): Chosen | undefined => {
    if (isStoodDown || !pick || !cacheSafe(modelId)) return undefined
    return pick.by === 'manual' || isAuto ? pick : undefined
  }

  /**
   * Whether a request on this model is on another model than the last one Auto saw. The app's effort can differ per
   * model, so the one seen so far was the other model's.
   */
  const isOtherModel = (modelId: string): boolean => {
    const key = keyOf(modelId)
    return key !== undefined && key !== model
  }

  /** The app's own effort on this model as last seen, or undefined when it is not known there yet. */
  const appEffort = (modelId: string): Effort | undefined => (isOtherModel(modelId) ? undefined : engineEffort)

  const steer = (r: RequestFacts): Effort | undefined => {
    // A subagent of a turn Auto picked for runs at that turn's level, but never below medium (Effortless helperFloor).
    // A manual pick leaves subagents as the app sends them.
    if (r.agentId !== undefined) {
      const p = enforced(r.modelId)
      if (!p || p.by === 'manual') return undefined
      const floor = helperFloor(cfg.floor, cfg.ceiling)
      return rank(p.effort) < rank(floor) ? floor : p.effort
    }
    // The app's effort can differ per model, so a change across a model switch is not the person's, and a carried
    // pick has met this session (Effortless modelIs, whose choose clears pickCarried).
    if (isOtherModel(r.modelId)) {
      if (model !== undefined) pickCarried = false
      model = keyOf(r.modelId)
      engineEffort = undefined
    }
    if (isEffort(r.effort)) {
      const seen = r.effort
      const isFirst = engineEffort === undefined
      // The app taking the /effort Pixlings typed for a click lands on the manual pick's level: not a new choice.
      const isTyped = pick?.by === 'manual' && pick.effort === seen
      const isByPerson = !isFirst && seen !== engineEffort && !isTyped
      engineEffort = seen
      // A new session with Auto off starts from the carried pick, but the level the app is on now is the person's.
      const takesApp = isFirst && pickCarried && !isAuto && pick?.effort !== seen
      // The request goes out at the person's level, which is the app's own. Where Effortless steers, the level a
      // request comes at is its own, not the person's: nothing to give way to.
      if (!isStoodDown && (isByPerson || takesApp)) {
        pickedInApp(seen)
        return seen
      }
    }
    return enforced(r.modelId)?.effort
  }

  return {
    /** Auto's switch and, while Auto is off, the pick in force, as the person last left them. */
    async load(): Promise<void> {
      let kept: Awaited<ReturnType<AutoDeps['readState']>> = {}
      try {
        kept = (await deps.readState()) ?? {}
      } catch {
        kept = {}
      }
      const [storedAuto, storedPick] = await Promise.all([read('effortAuto'), read('effortPick')])
      // A reload of the hook keeps the session's own state, which outranks the store: Haiku not answering turned Auto
      // off for this session only, and the store still holds the person's switch.
      if (typeof kept.isAuto === 'boolean') isAuto = kept.isAuto
      else if (typeof storedAuto === 'boolean') isAuto = storedAuto
      const keptPick = readStoredPick(kept.pick)
      if (keptPick) {
        // This session's own pick, met already: not a carried one.
        pick = keptPick
      } else if (!isAuto) {
        // Auto off means the level the person chose should still be the one in force.
        const carried = readStoredPick(storedPick)
        if (carried) {
          pick = carried
          pickCarried = true
        }
      }
      if (kept.shift && typeof kept.shift.until === 'number') shift = kept.shift
      await quiet(() => deps.setState(pick ? { isAuto, pick } : { isAuto }))
    },

    /** Decides the prompt's level before it goes out; the prompt itself is never changed or held back. */
    async onPrompt(f: PromptFacts): Promise<void> {
      // A prompt sent while the judge is still out keeps the level instead of asking again.
      if (!cfg.isOn || isStoodDown || isJudging) return
      let plan: PromptPlan
      try {
        plan = planPrompt(f, isAuto, pick)
      } catch {
        return
      }
      const midTurn = f.midTurn && pick !== null
      if (plan.kind === 'named') return apply({ effort: plan.effort, why: 'you asked for it', by: 'named' }, midTurn)
      if (plan.kind !== 'judge') return
      isJudging = true
      let verdict: Verdict | null = null
      try {
        verdict = await deps.ask(plan.question, { model: keyOf(f.modelId) ?? 'sonnet', effort: pick?.effort ?? 'medium', why: '', by: 'manual' }, f.context)
      } catch {
        verdict = null
      } finally {
        isJudging = false
      }
      // The person turned Auto off or picked a level while the judge was out: their choice stands.
      if (!isAuto) return
      if (verdict && isEffort(verdict.effort)) return apply({ ...settle(verdict, cfg), by: 'haiku' }, midTurn)
      // No answer: medium, enforced as a pick, and Auto off for this session only. The store keeps the person's switch.
      heldPick = null
      isAuto = false
      await choose(NO_ANSWER, { isAuto: false })
      await quiet(() => deps.toast("Auto effort is off: Haiku didn't answer. Click A to try again."))
    },

    /** The turn ended: a lower level held for a message typed during it takes over, if Auto is still on. */
    async onTurnEnd(): Promise<void> {
      const held = heldPick
      heldPick = null
      if (held && isAuto && cfg.isOn) await choose(held)
    },

    /** The effort a request should carry, or undefined to send it as the app made it. */
    requestEffort(r: RequestFacts): Effort | undefined {
      if (!cfg.isOn) return undefined
      try {
        return steer(r)
      } catch {
        return undefined
      }
    },

    /**
     * The level the next main-loop request on this model carries, as `requestEffort` would send it: the pick in force,
     * else the app's own as last seen there. Undefined when that is not known, or not one of the five levels. No side
     * effects: a change the app makes is only seen when its request comes.
     */
    nextEffort(modelId: string): Effort | undefined {
      try {
        return (cfg.isOn ? enforced(modelId)?.effort : undefined) ?? appEffort(modelId)
      } catch {
        return undefined
      }
    },

    /** The person picked a level: Auto goes off, the requests follow at once, and `/effort` is typed for the app. */
    async pickLevel(level: Effort): Promise<void> {
      if (!isEffort(level)) return
      isAuto = false
      await Promise.all([keepAuto(false), choose({ effort: level, why: 'your pick', by: 'manual' }, { isAuto: false })])
      await quiet(() => deps.typeEffort(level))
    },

    /** The person switched Auto on or off. */
    async toggleAuto(): Promise<void> {
      const turnOn = !isAuto
      isAuto = turnOn
      await Promise.all([quiet(() => deps.setState({ isAuto: turnOn })), keepAuto(turnOn)])
    },

    /**
     * Effortless is installed. It steers effort from outside Pixlings, so a request reaches Pixlings at its level, not
     * the app's: Auto would take each of its shifts for the person's, turn itself off for good, and both would judge
     * every prompt. So for this session Auto judges, steers and stores nothing, and says so once.
     */
    standDown(): void {
      if (isStoodDown) return
      isStoodDown = true
      heldPick = null
      void quiet(() => deps.toast(STOOD_DOWN))
    },

    /**
     * What the gate says after `auto:`, which it shows only while Auto is on. While Effortless steers, or on a model
     * Auto does not steer, that Auto is paused; else the reason for the level Auto chose or was told. A level the person
     * picked, or Haiku not answering, gives none: Auto is not the one choosing until Haiku next judges.
     */
    reason(modelId: string | undefined): string {
      if (isStoodDown) return 'paused: Effortless is installed'
      if (modelId !== undefined && !cacheSafe(modelId)) return 'paused on this model'
      return pick && pick.by !== 'manual' ? pick.why : ''
    },

    view(): { pick: PixlingsEffortPick; isAuto: boolean; shift: PixlingsEffortShift; isJudging: boolean } {
      return { pick, isAuto, shift, isJudging }
    },
  }
}
