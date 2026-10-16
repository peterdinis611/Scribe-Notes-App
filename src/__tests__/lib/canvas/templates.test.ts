import { describe, expect, it } from 'vitest'
import { buildCanvasTemplate } from '@/lib/canvas/templates'

describe('buildCanvasTemplate', () => {
  it('builds nested brainstorm frames', () => {
    const doc = buildCanvasTemplate('brainstorm')
    expect(doc.objects.some((o) => o.kind === 'frame')).toBe(true)
    expect(doc.objects.some((o) => o.parentId)).toBe(true)
  })

  it('builds blank empty doc', () => {
    expect(buildCanvasTemplate('blank').objects).toHaveLength(0)
  })
})
