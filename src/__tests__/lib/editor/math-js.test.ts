import { describe, expect, it } from 'vitest'
import { evaluateMathExpression } from '@/lib/editor/math-js'

describe('evaluateMathExpression', () => {
  it('evaluates numeric expressions', () => {
    const result = evaluateMathExpression('2 + 3 * 4')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result).toBe('14')
    }
  })

  it('evaluates sqrt', () => {
    const result = evaluateMathExpression('sqrt(9)')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result).toBe('3')
    }
  })

  it('rejects empty expressions', () => {
    const result = evaluateMathExpression('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Prázdny výraz')
    }
  })

  it('returns error for invalid syntax', () => {
    const result = evaluateMathExpression('2 +* 3')
    expect(result.ok).toBe(false)
  })
})
