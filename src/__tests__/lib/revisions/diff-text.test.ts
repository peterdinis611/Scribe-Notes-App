import { describe, expect, it } from 'vitest'
import {
  countDiffChanges,
  filterDiffLinesWithContext,
  filterSideBySideRows,
  normalizeSideBySideRows,
  type DiffLine,
  type SideBySideRow,
} from '@/lib/revisions/diff-text'

describe('diff-text view helpers', () => {
  it('counts added/removed', () => {
    const lines: DiffLine[] = [
      { type: 'unchanged', text: 'A' },
      { type: 'removed', text: 'B' },
      { type: 'added', text: 'C' },
    ]
    expect(countDiffChanges(lines)).toEqual({ added: 1, removed: 1 })
  })

  it('keeps context around changes', () => {
    const lines: DiffLine[] = [
      { type: 'unchanged', text: 'A' },
      { type: 'unchanged', text: 'B' },
      { type: 'added', text: 'X' },
      { type: 'unchanged', text: 'D' },
      { type: 'unchanged', text: 'E' },
    ]
    const filtered = filterDiffLinesWithContext(lines, true, 1)
    expect(filtered.map((l) => l.text)).toEqual(['B', 'X', 'D'])
  })

  it('filters unchanged side-by-side rows', () => {
    const rows: SideBySideRow[] = [
      {
        left: { kind: 'text', type: 'unchanged', text: 'A' },
        right: { kind: 'text', type: 'unchanged', text: 'A' },
      },
      {
        left: { kind: 'text', type: 'removed', text: 'B' },
        right: { kind: 'text', type: 'added', text: 'C' },
        paired: true,
      },
    ]
    expect(filterSideBySideRows(rows, true)).toHaveLength(1)
    expect(normalizeSideBySideRows(rows)[1]?.paired).toBe(true)
  })
})
