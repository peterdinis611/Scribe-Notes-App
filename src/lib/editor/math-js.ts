import { all, create } from 'mathjs'

const math = create(all, {})

export type MathEvaluation =
  | { ok: true; expression: string; result: string }
  | { ok: false; expression: string; error: string }

export const MATH_JS_EXAMPLES = {
  inline: 'sqrt(2) * 3',
  block: 'integrate(x^2, x)',
} as const

export function evaluateMathExpression(expression: string): MathEvaluation {
  const trimmed = expression.trim()
  if (!trimmed) {
    return { ok: false, expression: trimmed, error: 'Prázdny výraz' }
  }

  try {
    const result = math.evaluate(trimmed)
    return {
      ok: true,
      expression: trimmed,
      result: math.format(result, { precision: 14 }),
    }
  } catch (error) {
    return {
      ok: false,
      expression: trimmed,
      error: error instanceof Error ? error.message : 'Neplatný výraz',
    }
  }
}

export function promptMathExpression(
  label: string,
  initialValue = '',
  placeholder = MATH_JS_EXAMPLES.inline,
): string | null {
  const value = window.prompt(`${label}\n(math.js syntax, napr. ${placeholder})`, initialValue)
  if (value === null) return null
  return value.trim()
}
