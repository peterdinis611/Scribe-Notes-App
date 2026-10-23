import { describe, expect, it } from 'vitest'
import { parseLiveQuery } from '@/lib/editor/live-query-embed'

describe('live query embed', () => {
  it('parses agenda and property queries', () => {
    expect(parseLiveQuery('query:agenda')).toEqual({ kind: 'agenda' })
    expect(parseLiveQuery('query:project:Acme')).toEqual({ kind: 'project', project: 'Acme' })
    expect(parseLiveQuery('query:status:doing')).toEqual({ kind: 'status', status: 'doing' })
    expect(parseLiveQuery('plain')).toBeNull()
  })
})
