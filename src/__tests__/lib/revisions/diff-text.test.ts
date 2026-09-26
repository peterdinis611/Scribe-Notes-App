import { describe, expect, it } from 'vitest'
import {
  buildSideBySideFromLines,
  countDiffChanges,
  diffLines,
  diffSideBySide,
  diffWords,
  filterDiffLines,
  filterDiffLinesWithContext,
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

  it('pairs adjacent removed/added as replacements with word segments', () => {
    const rows = diffSideBySide('Hello world', 'Hello there')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.paired).toBe(true)
    expect(rows[0]?.left.type).toBe('removed')
    expect(rows[0]?.right.type).toBe('added')
    expect(rows[0]?.left.segments?.some((s) => s.type === 'del')).toBe(true)
    expect(rows[0]?.right.segments?.some((s) => s.type === 'add')).toBe(true)
  })

  it('builds unpaired side-by-side rows when lines do not match', () => {
    const rows = buildSideBySideFromLines([
      { type: 'removed', text: 'gone' },
      { type: 'unchanged', text: 'keep' },
      { type: 'added', text: 'new' },
    ])
    expect(rows).toHaveLength(3)
    expect(rows[0]?.paired).toBeUndefined()
    expect(rows[0]?.right.kind).toBe('gap')
    expect(rows[2]?.left.kind).toBe('gap')
  })

  it('filters changes with context lines', () => {
    const lines = diffLines('A\nB\nC\nD\nE', 'A\nB\nX\nD\nE')
    const withContext = filterDiffLinesWithContext(lines, true, 1)
    expect(withContext.some((line) => line.text === 'B')).toBe(true)
    expect(withContext.some((line) => line.text === 'D')).toBe(true)
    expect(withContext.some((line) => line.text === 'A')).toBe(false)
    expect(filterDiffLines(lines, true).every((line) => line.type !== 'unchanged')).toBe(true)
    expect(filterSideBySideRows(diffSideBySide('A\nB', 'A\nC'), true)).toHaveLength(1)
  })
})

describe('diffWords', () => {
  it('marks changed tokens', () => {
    const segments = diffWords('the quick fox', 'the slow fox')
    expect(segments.some((s) => s.type === 'del' && s.text.includes('quick'))).toBe(true)
    expect(segments.some((s) => s.type === 'add' && s.text.includes('slow'))).toBe(true)
    expect(segments.filter((s) => s.type === 'equal').length).toBeGreaterThan(0)
  })
})
