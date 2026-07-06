import { describe, expect, it } from 'vitest'
import {
  createCustomTemplate,
  isCustomTemplate,
  mergeTemplates,
  parseStoredCustomTemplates,
} from '@/lib/templates/custom'
import { DOCUMENT_TEMPLATES } from '@/lib/templates'

describe('custom templates', () => {
  it('creates a custom template with stable shape', () => {
    const template = createCustomTemplate({
      name: 'Týždenný report',
      description: 'Interný report',
      category: 'business',
      title: 'Report',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })

    expect(template.isCustom).toBe(true)
    expect(template.id.startsWith('custom-')).toBe(true)
    expect(isCustomTemplate(template)).toBe(true)
  })

  it('merges built-in and custom templates', () => {
    const custom = createCustomTemplate({
      name: 'Moja',
      description: '',
      category: 'general',
      title: 'Moja',
      content: { type: 'doc', content: [] },
    })

    const merged = mergeTemplates(DOCUMENT_TEMPLATES, [custom])
    expect(merged).toHaveLength(DOCUMENT_TEMPLATES.length + 1)
    expect(merged.at(-1)?.name).toBe('Moja')
  })

  it('parses stored templates safely', () => {
    const custom = createCustomTemplate({
      name: 'Test',
      description: 'Popis',
      category: 'creative',
      title: 'Test doc',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })

    const parsed = parseStoredCustomTemplates([custom, { invalid: true }])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.name).toBe('Test')
  })
})
