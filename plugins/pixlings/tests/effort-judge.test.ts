// Tests for the judge copied from Effortless (HeyCubit/effortless, MIT). Most are Effortless's own, trimmed to the
// functions effort/judge.ts keeps; the last two cover the pieces Pixlings relies on to ask the judge.

import { describe, expect } from 'claude-code/testing'

import {
  bounded,
  cacheSafe,
  contextFrom,
  endsOnQuestion,
  helperFloor,
  isFollowUp,
  judgeQuestion,
  keepsEffort,
  namedEffort,
  parseVerdict,
  tipped,
  withAttachments,
  withMidTurn,
} from '../hooks/effort/judge.ts'
import { test } from './kit.ts'

describe('helpers', () => {
  test('cacheSafe: effort may change on Opus 5.5 and Sonnet 5.5 only', () => {
    expect(cacheSafe('claude-opus-5-5')).toBe(true)
    expect(cacheSafe('claude-sonnet-5-5[1m]')).toBe(true)
    expect(cacheSafe('claude-fable-5-1')).toBe(false)
    expect(cacheSafe('claude-opus-4-8')).toBe(false)
    expect(cacheSafe('claude-opus-5')).toBe(false)
  })
})

describe('follow-ups', () => {
  test('isFollowUp: short go-aheads yes, real requests no', () => {
    for (const t of ['go', 'ok', ' yes ', 'ok go', 'continue']) expect(isFollowUp(t)).toBe(true)
    for (const t of ['', 'rename x to count in utils', 'go through my whole drive']) expect(isFollowUp(t)).toBe(false)
  })
})

describe('named level', () => {
  test('namedEffort: a level said with the word effort, or xhigh, counts; other senses and negations do not', () => {
    expect(namedEffort('do this with max effort please')).toBe('max')
    expect(namedEffort('Effort: high, then refactor the relay')).toBe('high')
    expect(namedEffort('run it at effort low')).toBe('low')
    expect(namedEffort('use extra high effort for this one')).toBe('xhigh')
    expect(namedEffort('xhigh, review the whole repo')).toBe('xhigh')
    expect(namedEffort('maximum effort on this bug')).toBe('max')
    expect(namedEffort('make a medium sized image')).toBeUndefined()
    expect(namedEffort('this needs a lot of effort, the bug is high up in the stack')).toBeUndefined()
    expect(namedEffort("don't use max effort for this")).toBeUndefined()
    expect(namedEffort('no need for high effort here')).toBeUndefined()
    expect(namedEffort('a high effort job: migrate everything')).toBe('high')
  })
})

describe('context for the judge', () => {
  test("the assistant's last reply goes along, long and from its end, where its question sits", () => {
    const question = 'Which section should I build: A (simple), B (a complicated multi-step layout) or C?'
    const reply = 'x'.repeat(5000) + ' ' + question
    const text = contextFrom([
      { role: 'user', text: 'make me a new section' },
      { role: 'assistant', text: reply },
    ])
    expect(text).toContain(question)
    expect(text).toContain('user: make me a new section')
    expect(text.length).toBeLessThan(2500)
    expect(contextFrom([])).toBe('')
  })
})

describe('short answers to a question', () => {
  test('a short reply after a question goes to the judge; between two steps it keeps the effort', () => {
    const asked = 'user: tidy up\nassistant: Done. Should I archive it?'
    const told = 'user: add export\nassistant: Added the button. Next I wire it up.'
    expect(endsOnQuestion(asked)).toBe(true)
    expect(endsOnQuestion(told)).toBe(false)
    expect(endsOnQuestion('')).toBe(false)
    expect(keepsEffort('yes', asked)).toBe(false)
    expect(keepsEffort('go', told)).toBe(true)
    expect(keepsEffort('build the whole thing', told)).toBe(false)
  })
})

describe('images', () => {
  test('the judge is told what the message carries', () => {
    expect(withAttachments('fix this', [{ type: 'image' }, { type: 'image' }])).toContain('[The message comes with 2 images to look at.]')
    expect(withAttachments('fix this')).toBe('fix this')
  })
})

describe('effort slider', () => {
  test('the slider tips only close calls; floor and ceiling clamp', () => {
    expect(tipped('medium', 0.6, 1)).toBe('high')
    expect(tipped('medium', 0.9, 1)).toBe('medium')
    expect(tipped('medium', 0.8, 1)).toBe('medium')
    expect(tipped('medium', 0.8, 2)).toBe('high')
    expect(tipped('medium', 0.6, -1)).toBe('low')
    expect(tipped('low', 0.3, -2)).toBe('low')
    expect(tipped('medium', undefined, 2)).toBe('medium')
    expect(bounded('low', 'medium', 'max')).toBe('medium')
    expect(bounded('max', 'low', 'high')).toBe('high')
  })

  test("helperFloor: medium, the person's Min when higher, never above their Max", () => {
    expect(helperFloor('low', 'max')).toBe('medium')
    expect(helperFloor('high', 'max')).toBe('high')
    expect(helperFloor('low', 'low')).toBe('low')
  })
})

describe('verdict', () => {
  test('parseVerdict reads the sure value', () => {
    expect(parseVerdict('{"model":"opus","effort":"high","sure":0.7,"why":"x"}')?.sure).toBe(0.7)
  })

  test('parseVerdict keeps only a real handoff reason', () => {
    const base = '"model":"opus","effort":"high","why":"x"'
    expect(parseVerdict(`{${base},"handoff":"Task done"}`)?.handoff).toBe('Task done')
    expect(parseVerdict(`{${base},"handoff":"   "}`)?.handoff).toBeUndefined()
    expect(parseVerdict(`{${base},"handoff":false}`)?.handoff).toBeUndefined()
    expect(parseVerdict(`{${base}}`)?.handoff).toBeUndefined()
  })
})

describe('asking the judge', () => {
  test('withMidTurn tells the judge the running effort', () => {
    expect(withMidTurn('also fix the docs', 'high')).toContain('keep high')
  })

  test('judgeQuestion names current pick, context and message', () => {
    const q = judgeQuestion('refactor auth', { model: 'opus', effort: 'medium', why: '', by: 'haiku' }, 'user: hi')
    expect(q).toContain('Current: opus / medium')
    expect(q).toContain('Recent conversation:\nuser: hi')
    expect(q).toContain('Next message:\nrefactor auth')
    expect(judgeQuestion('x', null, '')).toBe('Current: none\n\nNext message:\nx')
  })
})
