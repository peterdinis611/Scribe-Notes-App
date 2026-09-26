/**
 * Diff view helpers for the revision panel.
 * Line / word / side-by-side LCS lives in scribe-core (`diff_lines`).
 * Prefer `diffDocumentRevisions` / `diffPlainTexts` for algorithms.
 */

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

/** Normalize Rust side-by-side cells (optional `type` on gaps) for the React view. */
export function normalizeSideBySideRows(
  rows: Array<{
    left: SideBySideCell
    right: SideBySideCell
    paired?: boolean | null
  }>,
): SideBySideRow[] {
  return rows.map((row) => ({
    left: row.left,
    right: row.right,
    paired: row.paired ?? undefined,
  }))
}
