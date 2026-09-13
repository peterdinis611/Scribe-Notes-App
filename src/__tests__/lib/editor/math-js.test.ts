import { describe, expect, it } from 'vitest'
import {
  evaluateMathExpression,
  formatMathResult,
  unwrapMathResult,
} from '@/lib/editor/math-js'

describe('evaluateMathExpression', () => {
  it('evaluates numeric expressions', () => {
    const result = evaluateMathExpression('2 + 3 * 4')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result).toBe('14')
    }
  })

  it('evaluates sqrt and trig', () => {
    const sqrt = evaluateMathExpression('sqrt(9)')
    expect(sqrt.ok).toBe(true)
    if (sqrt.ok) expect(sqrt.result).toBe('3')

    const trig = evaluateMathExpression('sin(pi / 2)')
    expect(trig.ok).toBe(true)
    if (trig.ok) expect(trig.result).toBe('1')
  })

  it('evaluates units, matrices, fractions', () => {
    const units = evaluateMathExpression('5 cm + 2 mm')
    expect(units.ok).toBe(true)
    if (units.ok) expect(units.result).toContain('cm')

    const matrix = evaluateMathExpression('det([[1, 2], [3, 4]])')
    expect(matrix.ok).toBe(true)
    if (matrix.ok) expect(matrix.result).toBe('-2')

    const fraction = evaluateMathExpression('fraction(1, 3) + fraction(1, 6)')
    expect(fraction.ok).toBe(true)
    if (fraction.ok) expect(fraction.result).toBe('1/2')
  })

  it('evaluates multi-line scripts and returns the last result', () => {
    const result = evaluateMathExpression('a = 2\nb = 8\na^b')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result).toBe('256')
  })

  it('evaluates symbolic derivative and simplify', () => {
    const derivative = evaluateMathExpression('derivative("x^2 + 3x", "x")')
    expect(derivative.ok).toBe(true)
    if (derivative.ok) expect(derivative.result).toContain('x')

    const simplified = evaluateMathExpression('simplify("(x^2 + 2x)/x")')
    expect(simplified.ok).toBe(true)
    if (simplified.ok) expect(simplified.result).toMatch(/x/)
  })

  it('integrates functions numerically', () => {
    const viaFn = evaluateMathExpression('f(x) = x^2\nintegrate(f, 0, 1)')
    expect(viaFn.ok).toBe(true)
    if (viaFn.ok) {
      expect(Number(viaFn.result)).toBeCloseTo(1 / 3, 5)
    }

    const viaString = evaluateMathExpression('integrate("x^2", "x", 0, 1)')
    expect(viaString.ok).toBe(true)
    if (viaString.ok) {
      expect(Number(viaString.result)).toBeCloseTo(1 / 3, 5)
    }
  })

  it('sums ranges', () => {
    const result = evaluateMathExpression('sum(1:10)')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result).toBe('55')
  })

  it('rejects empty expressions', () => {
    const result = evaluateMathExpression('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Empty expression')
    }
  })

  it('returns error for invalid syntax', () => {
    const result = evaluateMathExpression('2 +* 3')
    expect(result.ok).toBe(false)
  })
})

describe('unwrapMathResult / formatMathResult', () => {
  it('unwraps ResultSet-like values', () => {
    expect(unwrapMathResult({ entries: [1, 2, 3] })).toBe(3)
    expect(formatMathResult(14)).toBe('14')
  })
})
