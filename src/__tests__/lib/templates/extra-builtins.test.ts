import { describe, expect, it } from 'vitest'
import { DOCUMENT_TEMPLATES } from '@/lib/templates'
import { EXTRA_DOCUMENT_TEMPLATES } from '@/lib/templates/extra-builtins'

describe('extra built-in templates', () => {
  it('exports a non-empty set of extras with unique ids', () => {
    expect(EXTRA_DOCUMENT_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    const ids = EXTRA_DOCUMENT_TEMPLATES.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes every extra template in DOCUMENT_TEMPLATES', () => {
    const catalogIds = new Set(DOCUMENT_TEMPLATES.map((item) => item.id))
    for (const extra of EXTRA_DOCUMENT_TEMPLATES) {
      expect(catalogIds.has(extra.id)).toBe(true)
      expect(extra.content.type).toBe('doc')
      expect(Array.isArray(extra.content.content)).toBe(true)
      expect((extra.content.content ?? []).length).toBeGreaterThan(0)
    }
  })
})
