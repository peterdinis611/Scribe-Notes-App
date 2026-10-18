import { describe, expect, it } from 'vitest'
import {
  parseNoteProperties,
  serializeNoteProperties,
  setNoteProperty,
} from '@/lib/library/document-properties'

describe('document properties', () => {
  it('parses status/project/due/priority tags', () => {
    const props = parseNoteProperties(['status:doing', 'project:Acme', 'due:2026-10-20', 'work'])
    expect(props.status).toBe('doing')
    expect(props.project).toBe('Acme')
    expect(props.due).toBe('2026-10-20')
    expect(props.labels).toEqual(['work'])
  })

  it('round-trips via setNoteProperty', () => {
    const next = setNoteProperty(['status:inbox', 'legacy'], 'status', 'done')
    expect(parseNoteProperties(next).status).toBe('done')
    expect(serializeNoteProperties(parseNoteProperties(next))).toContain('legacy')
  })
})
