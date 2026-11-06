// askHaiku asks Haiku 5.5 for an effort verdict through a `complete` it is handed, so a plain fake stands in for the engine.

import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect } from 'claude-code/testing'

import { askHaiku, HAIKU_MODEL } from '../hooks/effort/haiku.ts'
import { JUDGE_SYSTEM, judgeQuestion } from '../hooks/effort/judge.ts'
import { test } from './kit.ts'

const answer = (text: string) => ({ isAnswered: true, text, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as ModelCompleteResult
const fake = (reply: ModelCompleteResult | Error) => {
  const requests: ModelCompleteRequest[] = []
  const complete = async (request: ModelCompleteRequest) => {
    requests.push(request)
    if (reply instanceof Error) throw reply
    return reply
  }
  return { complete, requests }
}
const VERDICT = '{"model":"opus","effort":"high","why":"multi-file refactor","sure":0.9}'

describe('askHaiku', () => {
  test('asks haiku 5.5 with the judge system', async () => {
    const f = fake(answer(VERDICT))
    await askHaiku(f.complete, 'refactor it', null, 'ctx', 41.4)
    expect(f.requests).toHaveLength(1)
    const r = f.requests[0]!
    expect(HAIKU_MODEL).toBe('claude-haiku-5-5')
    expect(r.model).toBe('claude-haiku-5-5')
    expect(r.system).toBe(JUDGE_SYSTEM)
    expect(r.maxTokens).toBe(160)
    expect(r.effort).toBe('low')
    expect(r.timeoutMs).toBe(6000)
    expect(r.prompt).toBe(`${judgeQuestion('refactor it', null, 'ctx')}\n\nContext used: 41% of the window`)
  })

  test('leaves the context line off when the percent is unknown', async () => {
    const f = fake(answer(VERDICT))
    await askHaiku(f.complete, 'refactor it', null, 'ctx', null)
    expect(f.requests[0]!.prompt).toBe(judgeQuestion('refactor it', null, 'ctx'))
  })

  test('returns the verdict', async () => {
    const f = fake(answer(VERDICT))
    expect(await askHaiku(f.complete, 'p', null, '', null)).toEqual({ effort: 'high', why: 'multi-file refactor', sure: 0.9 })
  })

  test('no fallback model', async () => {
    const f = fake({ isAnswered: false, reason: 'empty-reply' } as unknown as ModelCompleteResult)
    expect(await askHaiku(f.complete, 'p', null, '', null)).toBeNull()
    expect(f.requests).toHaveLength(1)
  })

  test('unparseable or thrown is null', async () => {
    expect(await askHaiku(fake(answer('sure, high')).complete, 'p', null, '', null)).toBeNull()
    expect(await askHaiku(fake(new Error('boom')).complete, 'p', null, '', null)).toBeNull()
  })
})
