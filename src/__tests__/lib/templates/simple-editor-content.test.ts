import { describe, expect, it } from 'vitest'
import {
  collectUnsupportedSimpleEditorTypes,
  hasUnsupportedSimpleEditorNodes,
  parseTemplateContentJson,
} from '@/lib/templates/simple-editor-content'
import { fromStoredTemplate, toStoredTemplate } from '@/lib/db/template-collections'
import { createCustomTemplate } from '@/lib/templates/custom'

describe('simple-editor-content', () => {
  it('accepts starter-kit style documents', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }] }],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }],
            },
          ],
        },
      ],
    }

    expect(hasUnsupportedSimpleEditorNodes(content)).toBe(false)
    expect(collectUnsupportedSimpleEditorTypes(content)).toEqual([])
  })

  it('detects rich nodes the simple editor would strip', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        { type: 'table', content: [] },
        { type: 'mermaidDiagram', content: [] },
        { type: 'callout', content: [] },
      ],
    }

    expect(hasUnsupportedSimpleEditorNodes(content)).toBe(true)
    expect(collectUnsupportedSimpleEditorTypes(content)).toEqual([
      'callout',
      'mermaidDiagram',
      'table',
    ])
  })

  it('marks invalid content_json as corrupt without throwing', () => {
    expect(parseTemplateContentJson('not-json').corrupt).toBe(true)
    expect(parseTemplateContentJson('[]').corrupt).toBe(true)
    expect(parseTemplateContentJson('{"type":"paragraph"}').corrupt).toBe(true)
    expect(parseTemplateContentJson('{"type":"doc"}').corrupt).toBe(false)
  })

  it('preserves raw content_json when round-tripping corrupt templates', () => {
    const raw = '{not-valid-json'
    const template = fromStoredTemplate({
      id: 'custom-1',
      name: 'Broken',
      description: '',
      category: 'general',
      title: 'Broken',
      contentJson: raw,
      createdAt: 1,
    })

    expect(template.contentCorrupt).toBe(true)
    expect(template.contentJsonRaw).toBe(raw)
    expect(toStoredTemplate(template).contentJson).toBe(raw)
  })

  it('serializes normal templates as JSON', () => {
    const template = createCustomTemplate({
      name: 'Ok',
      description: '',
      category: 'general',
      title: 'Ok',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    const row = toStoredTemplate(template)
    expect(JSON.parse(row.contentJson).type).toBe('doc')
  })
})
