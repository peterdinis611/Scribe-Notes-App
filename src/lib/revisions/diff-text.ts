export type DiffLine = {
  type: 'unchanged' | 'added' | 'removed'
  text: string
}

export type DiffSegment = {
  type: 'equal' | 'add' | 'del'
  text: string
}

export type SideBySideCell = {
  kind: 'text' | 'gap'
  type?: 'unchanged' | 'removed' | 'added'
  text: string
  /** Inline word-level segments when this cell is part of a replacement pair. */
  segments?: DiffSegment[]
}

export type SideBySideRow = {
  left: SideBySideCell
  right: SideBySideCell
  /** True when a removed line was paired with the following added line. */
  paired?: boolean
}

export type DiffViewMode = 'split' | 'unified'

export const CURRENT_REVISION_ID = '__current__'

const WORD_SPLIT = /(\s+)/

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1])
      }
    }
  }

  return matrix
}

function backtrackDiff(a: string[], b: string[], matrix: number[][]): DiffLine[] {
  const result: DiffLine[] = []
  let i = a.length
  let j = b.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'unchanged', text: a[i - 1] })
      i -= 1
      j -= 1
      continue
    }

    if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.push({ type: 'added', text: b[j - 1] })
      j -= 1
      continue
    }

    if (i > 0) {
      result.push({ type: 'removed', text: a[i - 1] })
      i -= 1
    }
  }

  return result.reverse()
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const matrix = longestCommonSubsequence(oldLines, newLines)
  return backtrackDiff(oldLines, newLines, matrix)
}

/** Word / whitespace-aware inline diff for a single line pair. */
export function diffWords(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) {
    return oldText ? [{ type: 'equal', text: oldText }] : []
  }
  const a = oldText.split(WORD_SPLIT).filter((part) => part.length > 0)
  const b = newText.split(WORD_SPLIT).filter((part) => part.length > 0)
  if (a.length === 0 && b.length === 0) return []
  if (a.length * b.length > 40_000) {
    // Avoid quadratic blow-ups on huge lines — fall back to whole-line replace.
    return [
      ...(oldText ? [{ type: 'del' as const, text: oldText }] : []),
      ...(newText ? [{ type: 'add' as const, text: newText }] : []),
    ]
  }
  const matrix = longestCommonSubsequence(a, b)
  const lines = backtrackDiff(a, b, matrix)
  return lines.map((line) => ({
    type: line.type === 'unchanged' ? 'equal' : line.type === 'added' ? 'add' : 'del',
    text: line.text,
  }))
}

export function countDiffChanges(lines: DiffLine[]): { added: number; removed: number } {
  return lines.reduce(
    (acc, line) => {
      if (line.type === 'added') acc.added += 1
      if (line.type === 'removed') acc.removed += 1
      return acc
    },
    { added: 0, removed: 0 },
  )
}

/** Build side-by-side rows, pairing adjacent removed→added as replacements. */
export function diffSideBySide(oldText: string, newText: string): SideBySideRow[] {
  return buildSideBySideFromLines(diffLines(oldText, newText))
}

export function buildSideBySideFromLines(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const next = lines[index + 1]

    if (line.type === 'unchanged') {
      rows.push({
        left: { kind: 'text', type: 'unchanged', text: line.text },
        right: { kind: 'text', type: 'unchanged', text: line.text },
      })
      index += 1
      continue
    }

    if (line.type === 'removed' && next?.type === 'added') {
      const segments = diffWords(line.text, next.text)
      const leftSegments = segments.filter((segment) => segment.type !== 'add')
      const rightSegments = segments.filter((segment) => segment.type !== 'del')
      rows.push({
        paired: true,
        left: {
          kind: 'text',
          type: 'removed',
          text: line.text,
          segments: leftSegments.length ? leftSegments : undefined,
        },
        right: {
          kind: 'text',
          type: 'added',
          text: next.text,
          segments: rightSegments.length ? rightSegments : undefined,
        },
      })
      index += 2
      continue
    }

    if (line.type === 'removed') {
      rows.push({
        left: { kind: 'text', type: 'removed', text: line.text },
        right: { kind: 'gap', text: '' },
      })
      index += 1
      continue
    }

    rows.push({
      left: { kind: 'gap', text: '' },
      right: { kind: 'text', type: 'added', text: line.text },
    })
    index += 1
  }
  return rows
}

export function filterDiffLines(lines: DiffLine[], changesOnly: boolean): DiffLine[] {
  if (!changesOnly) return lines
  return lines.filter((line) => line.type !== 'unchanged')
}

/**
 * Keep change hunks plus `contextLines` of surrounding unchanged lines.
 * When `contextLines` is 0 and `changesOnly` is true, only changed lines remain.
 */
export function filterDiffLinesWithContext(
  lines: DiffLine[],
  changesOnly: boolean,
  contextLines = 2,
): DiffLine[] {
  if (!changesOnly) return lines
  if (contextLines <= 0) return filterDiffLines(lines, true)

  const keep = new Set<number>()
  lines.forEach((line, index) => {
    if (line.type === 'unchanged') return
    for (let offset = -contextLines; offset <= contextLines; offset += 1) {
      const next = index + offset
      if (next >= 0 && next < lines.length) keep.add(next)
    }
  })

  return lines.filter((_, index) => keep.has(index))
}

export function filterSideBySideRows(rows: SideBySideRow[], changesOnly: boolean): SideBySideRow[] {
  if (!changesOnly) return rows
  return rows.filter(
    (row) => row.left.type !== 'unchanged' || row.right.type !== 'unchanged',
  )
}

export function filterSideBySideWithContext(
  rows: SideBySideRow[],
  changesOnly: boolean,
  contextLines = 2,
): SideBySideRow[] {
  if (!changesOnly) return rows
  if (contextLines <= 0) return filterSideBySideRows(rows, true)

  const keep = new Set<number>()
  rows.forEach((row, index) => {
    const isChange = row.left.type !== 'unchanged' || row.right.type !== 'unchanged'
    if (!isChange) return
    for (let offset = -contextLines; offset <= contextLines; offset += 1) {
      const next = index + offset
      if (next >= 0 && next < rows.length) keep.add(next)
    }
  })
  return rows.filter((_, index) => keep.has(index))
}
