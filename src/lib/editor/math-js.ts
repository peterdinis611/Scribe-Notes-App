import { all, create, typed, type MathJsStatic, type Parser } from 'mathjs'

const math = create(all, {}) as MathJsStatic

function numericIntegrate(
  fn: (x: number) => number,
  a: number,
  b: number,
  steps = 512,
): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('Integration bounds must be finite numbers')
  }
  if (a === b) return 0
  const n = Math.max(2, Math.floor(steps) % 2 === 0 ? Math.floor(steps) : Math.floor(steps) + 1)
  const h = (b - a) / n
  let sum = fn(a) + fn(b)
  for (let i = 1; i < n; i += 1) {
    const x = a + i * h
    sum += fn(x) * (i % 2 === 0 ? 2 : 4)
  }
  return (h / 3) * sum
}

math.import(
  {
    /**
     * Definite numeric integral (Simpson).
     * - integrate(f, a, b) where f(x) was defined in the script
     * - integrate('x^2', 'x', a, b)
     */
    integrate: typed('integrate', {
      'function, number, number': (fn: (x: number) => number, a: number, b: number) =>
        numericIntegrate((x) => Number(fn(x)), a, b),
      'function, number, number, number': (
        fn: (x: number) => number,
        a: number,
        b: number,
        steps: number,
      ) => numericIntegrate((x) => Number(fn(x)), a, b, steps),
      'string, string, number, number': (expr: string, variable: string, a: number, b: number) => {
        const compiled = math.compile(expr)
        const scope: Record<string, number> = {}
        return numericIntegrate((x) => {
          scope[variable] = x
          return Number(compiled.evaluate(scope))
        }, a, b)
      },
      'string, string, number, number, number': (
        expr: string,
        variable: string,
        a: number,
        b: number,
        steps: number,
      ) => {
        const compiled = math.compile(expr)
        const scope: Record<string, number> = {}
        return numericIntegrate(
          (x) => {
            scope[variable] = x
            return Number(compiled.evaluate(scope))
          },
          a,
          b,
          steps,
        )
      },
    }),
  },
  { override: true },
)

export type MathEvaluation =
  | { ok: true; expression: string; result: string }
  | { ok: false; expression: string; error: string }

export const MATH_JS_EXAMPLES = {
  inline: 'sqrt(2) * sin(pi / 4)',
  block: 'f(x) = x^2\nintegrate(f, 0, 1)',
  chips: [
    '2 + 3 * 4',
    'sqrt(81)',
    'sin(pi / 2)',
    '5 cm + 2 mm',
    'derivative("x^2 + 3x", "x")',
    'simplify("(x^2 + 2x)/x")',
    'det([[1, 2], [3, 4]])',
    'mean([2, 4, 4, 6])',
    'fraction(1, 3) + fraction(1, 6)',
    'sum(1:10)',
    'f(x) = x^2\nintegrate(f, 0, 1)',
    'a = 2\nb = 8\na^b',
  ],
} as const

type ResultSetLike = { entries: unknown[] }

function isResultSet(value: unknown): value is ResultSetLike {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as ResultSetLike).entries)
}

function isMathFunction(value: unknown): value is { syntax?: string; name?: string } {
  return typeof value === 'function'
}

/** Pick the last meaningful value from multi-statement ResultSet. */
export function unwrapMathResult(value: unknown): unknown {
  if (!isResultSet(value)) return value
  for (let i = value.entries.length - 1; i >= 0; i -= 1) {
    const entry = value.entries[i]
    if (entry === undefined) continue
    if (isMathFunction(entry)) continue
    return unwrapMathResult(entry)
  }
  const last = value.entries[value.entries.length - 1]
  return last === undefined ? value : unwrapMathResult(last)
}

export function formatMathResult(value: unknown): string {
  const unwrapped = unwrapMathResult(value)
  if (isMathFunction(unwrapped)) {
    return unwrapped.syntax ?? unwrapped.name ?? 'f'
  }
  if (unwrapped === undefined) return 'undefined'
  if (unwrapped === null) return 'null'
  return math.format(unwrapped, {
    precision: 14,
    lowerExp: -9,
    upperExp: 15,
  })
}

function evaluateWithParser(expression: string, parser: Parser): unknown {
  // Prefer whole-string evaluate so mathjs can parse multi-line scripts / ResultSet.
  try {
    return parser.evaluate(expression)
  } catch (firstError) {
    // Fallback: statement-by-statement (helps some mixed scripts).
    const lines = expression
      .split(/\n|;/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
    if (lines.length <= 1) throw firstError

    let last: unknown
    for (const line of lines) {
      last = parser.evaluate(line)
    }
    return last
  }
}

export function evaluateMathExpression(expression: string): MathEvaluation {
  const trimmed = expression.trim()
  if (!trimmed) {
    return { ok: false, expression: trimmed, error: 'Empty expression' }
  }

  try {
    const parser = math.parser()
    const result = evaluateWithParser(trimmed, parser)
    return {
      ok: true,
      expression: trimmed,
      result: formatMathResult(result),
    }
  } catch (error) {
    return {
      ok: false,
      expression: trimmed,
      error: error instanceof Error ? error.message : 'Invalid expression',
    }
  }
}

export { math }
