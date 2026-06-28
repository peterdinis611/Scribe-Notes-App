import { describe, expect, it } from 'vitest'
import {
  countDiffChanges,
  diffLines,
  diffSideBySide,
  filterDiffLines,
  filterSideBySideRows,
} from '@/lib/revisions/diff-text'

describe('diffLines', () => {
  it('detects added and removed lines', () => {
    const result = diffLines('Prvý riadok\nDruhý riadok', 'Prvý riadok\nNový riadok\nTretí riadok')
    expect(result).toEqual([
      { type: 'unchanged', text: 'Prvý riadok' },
      { type: 'removed', text: 'Druhý riadok' },
      { type: 'added', text: 'Nový riadok' },
      { type: 'added', text: 'Tretí riadok' },
    ])
    expect(countDiffChanges(result)).toEqual({ added: 2, removed: 1 })
  })

  it('returns unchanged lines for identical text', () => {
    const text = 'Riadok A\nRiadok B'
    const result = diffLines(text, text)
    expect(result.every((line) => line.type === 'unchanged')).toBe(true)
  })

  it('builds side-by-side rows and filters changes only', () => {
    const rows = diffSideBySide('Starý text\nRiadok B', 'Starý text\nNový riadok')
    expect(rows[0]?.left.type).toBe('unchanged')
    expect(rows[1]?.left.type).toBe('removed')
    expect(rows[2]?.right.type).toBe('added')
    expect(filterSideBySideRows(rows, true)).toHaveLength(2)
    expect(filterDiffLines(diffLines('A\nB', 'A\nC'), true)).toHaveLength(2)
  })
})
