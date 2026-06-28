export type DiffLine = {
  type: 'unchanged' | 'added' | 'removed'
  text: string
}

export type SideBySideCell = {
  kind: 'text' | 'gap'
  type?: 'unchanged' | 'removed' | 'added'
  text: string
}

export type SideBySideRow = {
  left: SideBySideCell
  right: SideBySideCell
}

export type DiffViewMode = 'split' | 'unified'

export const CURRENT_REVISION_ID = '__current__'

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

export function diffSideBySide(oldText: string, newText: string): SideBySideRow[] {
  return diffLines(oldText, newText).map((line) => {
    if (line.type === 'unchanged') {
      return {
        left: { kind: 'text', type: 'unchanged', text: line.text },
        right: { kind: 'text', type: 'unchanged', text: line.text },
      }
    }

    if (line.type === 'removed') {
      return {
        left: { kind: 'text', type: 'removed', text: line.text },
        right: { kind: 'gap', text: '' },
      }
    }

    return {
      left: { kind: 'gap', text: '' },
      right: { kind: 'text', type: 'added', text: line.text },
    }
  })
}

export function filterDiffLines(lines: DiffLine[], changesOnly: boolean): DiffLine[] {
  if (!changesOnly) return lines
  return lines.filter((line) => line.type !== 'unchanged')
}

export function filterSideBySideRows(rows: SideBySideRow[], changesOnly: boolean): SideBySideRow[] {
  if (!changesOnly) return rows
  return rows.filter(
    (row) => row.left.type !== 'unchanged' || row.right.type !== 'unchanged',
  )
}
