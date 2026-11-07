// The gate's first guess: the effort saved in the person's settings, per model or by default.

import { describe, expect, test } from 'claude-code/testing'

import { savedEffortFor, savedEffortsOf } from '../hooks/effort/saved.ts'

const SETTINGS = {
  effortLevel: 'high',
  modelSettings: {
    'claude-fable-5-1': { effortLevel: 'medium' },
    'claude-opus-5-5': { effortLevel: 'low' },
    'claude-sonnet-5-5': { effortLevel: 'xhigh' },
    'claude-haiku-5-5': { effortLevel: 'turbo' },
  },
}

describe('the saved effort', () => {
  const saved = savedEffortsOf(SETTINGS.effortLevel, SETTINGS.modelSettings)

  test('keeps the five levels, by default and per model', () => {
    expect(saved).toEqual({ base: 'high', byModel: { 'claude-fable-5-1': 'medium', 'claude-opus-5-5': 'low', 'claude-sonnet-5-5': 'xhigh' } })
  })

  test("a model's own entry wins, by its id, with any [1m] dropped, or by its alias", () => {
    expect(savedEffortFor(saved, 'claude-opus-5-5')).toBe('low')
    expect(savedEffortFor(saved, 'claude-opus-5-5[1m]')).toBe('low')
    expect(savedEffortFor(saved, 'sonnet')).toBe('xhigh')
  })

  test('a model with no entry of its own, or none known, has the default', () => {
    expect(savedEffortFor(saved, 'claude-haiku-5-5')).toBe('high')
    expect(savedEffortFor(saved, undefined)).toBe('high')
    // An alias two entries share is no one model's.
    expect(savedEffortFor(saved, 'claude')).toBe('high')
  })

  test('nothing saved gives no guess', () => {
    const none = savedEffortsOf(undefined, undefined)
    expect(none).toEqual({ byModel: {} })
    expect(savedEffortFor(none, 'opus')).toBeUndefined()
  })
})
