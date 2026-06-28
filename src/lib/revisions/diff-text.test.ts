import { describe, expect, it } from 'vitest'
import { diffLines, countDiffChanges } from '@/lib/revisions/diff-text'

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
})
