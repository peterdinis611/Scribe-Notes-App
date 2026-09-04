import { describe, expect, it } from 'vitest'
import {
  buildTemplatePackFromCustoms,
  parseTemplatePack,
  serializeTemplatePack,
} from '@/lib/templates/packs'
import { createCustomTemplate } from '@/lib/templates/custom'
import { BUNDLED_TEMPLATE_PACKS } from '@/lib/templates/bundled-packs'

describe('template packs', () => {
  it('parses and serializes a valid pack', () => {
    const pack = parseTemplatePack({
      version: 1,
      name: 'SK Zápisnice',
      locale: 'sk',
      templates: [
        {
          name: 'Zápisnica',
          title: 'Zápisnica',
          categoryId: 'business',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
      ],
    })

    expect(pack.templates).toHaveLength(1)
    const roundTrip = parseTemplatePack(serializeTemplatePack(pack))
    expect(roundTrip.name).toBe('SK Zápisnice')
    expect(roundTrip.templates[0]?.categoryId).toBe('business')
  })

  it('rejects empty or invalid packs', () => {
    expect(() => parseTemplatePack({ version: 1, name: 'X', templates: [] })).toThrow()
    expect(() => parseTemplatePack({ version: 2, name: 'X', templates: [] })).toThrow()
    expect(() => parseTemplatePack('not-json')).toThrow()
  })

  it('builds a pack from custom templates', () => {
    const custom = createCustomTemplate({
      name: 'Moja',
      description: 'Popis',
      category: 'general',
      title: 'Doc',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    const pack = buildTemplatePackFromCustoms({
      name: 'Export',
      locale: 'sk',
      templates: [custom],
    })
    expect(pack.templates[0]?.name).toBe('Moja')
    expect(pack.templates[0]?.categoryId).toBe('general')
  })

  it('loads bundled SK packs', () => {
    expect(BUNDLED_TEMPLATE_PACKS.length).toBeGreaterThanOrEqual(2)
    for (const item of BUNDLED_TEMPLATE_PACKS) {
      expect(item.pack.locale).toBe('sk')
      expect(item.pack.templates.length).toBeGreaterThan(0)
    }
  })
})
