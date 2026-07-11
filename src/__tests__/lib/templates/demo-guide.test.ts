import { describe, expect, it } from 'vitest'
import {
  SCRIBE_DEMO_GUIDE_TEMPLATE,
  buildScribeDemoContent,
  serializeScribeDemoContent,
  WIKI_TARGET_PLACEHOLDER,
} from '@/lib/templates/demo-guide'
import { getTemplateById } from '@/lib/templates'

describe('scribe demo guide', () => {
  it('is registered as a built-in template', () => {
    const template = getTemplateById('scribe-demo-guide')
    expect(template?.name).toBe('Sprievodca Scribe')
    expect(template?.category).toBe('general')
  })

  it('includes major block types', () => {
    const json = serializeScribeDemoContent()
    expect(json).toContain('"callout"')
    expect(json).toContain('"taskList"')
    expect(json).toContain('"table"')
    expect(json).toContain('"codeBlock"')
    expect(json).toContain('"mathInline"')
    expect(json).toContain('"mathBlock"')
    expect(json).toContain('"wikiLink"')
    expect(json).toContain('"footnote"')
    expect(json).toContain('"details"')
    expect(json).toContain('"tableOfContents"')
  })

  it('embeds wiki target placeholder for database seed', () => {
    const content = buildScribeDemoContent()
    const serialized = JSON.stringify(content)
    expect(serialized).toContain(WIKI_TARGET_PLACEHOLDER)
  })

  it('replaces wiki target id when provided', () => {
    const serialized = serializeScribeDemoContent('doc-123')
    expect(serialized).toContain('doc-123')
    expect(serialized).not.toContain(WIKI_TARGET_PLACEHOLDER)
  })

  it('has a descriptive title', () => {
    expect(SCRIBE_DEMO_GUIDE_TEMPLATE.title).toBe('Sprievodca Scribe — demo')
  })
})
