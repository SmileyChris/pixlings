// Asking Haiku for an effort verdict, adapted from Effortless's `askHaiku` (HeyCubit/effortless, MIT). The engine's
// `complete` is passed in, so this holds no `$` and a plain fake can stand in for it under test.

import type { EngineInterface } from 'claude-code'

import { JUDGE_SYSTEM, judgeQuestion, parseVerdict } from './judge.ts'
import type { Effort, Pick } from './judge.ts'

export type Verdict = { effort: Effort; why: string; sure?: number }

// Haiku 5.5 by name: Claude Code builds that predate it map the plain `haiku` alias to Haiku 4.5, at ten times the
// price. Where 5.5 does not answer there is no fallback: the judge simply gives no verdict.
export const HAIKU_MODEL = 'claude-haiku-5-5'

/** Haiku's verdict on the next message, or null when it did not answer. Never throws. */
export async function askHaiku(
  complete: EngineInterface['model']['complete'],
  prompt: string,
  current: Pick | null,
  context: string,
  contextPercent: number | null,
): Promise<Verdict | null> {
  const used = contextPercent === null ? '' : `Context used: ${Math.round(contextPercent)}% of the window`
  const asked = [judgeQuestion(prompt, current, context), used].filter(Boolean).join('\n\n')
  try {
    const r = await complete({ model: HAIKU_MODEL, system: JUDGE_SYSTEM, prompt: asked, maxTokens: 160, effort: 'low', timeoutMs: 6000 })
    const verdict = r.isAnswered ? parseVerdict(r.text) : undefined
    return verdict ? { effort: verdict.effort, why: verdict.why, ...(verdict.sure === undefined ? {} : { sure: verdict.sure }) } : null
  } catch {
    return null
  }
}
