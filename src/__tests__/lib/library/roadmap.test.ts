import { describe, expect, it } from 'vitest'
import { roadmapToMarkdown } from '@/lib/library/roadmap'
import type { RoadmapResult } from '@/lib/db/nlp-api'

describe('roadmapToMarkdown', () => {
  it('formats phases and checklist items', () => {
    const plan: RoadmapResult = {
      phases: [
        {
          id: 'now',
          title: 'Now',
          horizon: 'now',
          order: 1,
          items: [{ text: 'Ship planner', kind: 'task' }],
        },
        {
          id: 'later',
          title: 'Later',
          horizon: 'later',
          order: 2,
          items: [],
        },
      ],
      count: 2,
      itemCount: 1,
      source: 'test',
      strategy: 'headings',
    }
    const md = roadmapToMarkdown(plan)
    expect(md).toContain('## Roadmap')
    expect(md).toContain('### Now')
    expect(md).toContain('- [ ] Ship planner')
    expect(md).toContain('### Later')
  })

  it('returns empty for no phases', () => {
    expect(
      roadmapToMarkdown({
        phases: [],
        count: 0,
        itemCount: 0,
        source: 'test',
        strategy: 'empty',
      }),
    ).toBe('')
  })
})
