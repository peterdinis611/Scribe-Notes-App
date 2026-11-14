import type { JSONContent } from '@tiptap/react'
import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'
import { store } from '@/store/index'

function collectHeadings(node: JSONContent | undefined, out: string[]) {
  if (!node) return
  if (node.type === 'heading') {
    const text = (node.content ?? [])
      .map((child) => (typeof child.text === 'string' ? child.text : ''))
      .join('')
      .trim()
    if (text) out.push(text)
  }
  for (const child of node.content ?? []) collectHeadings(child, out)
}

function headingsFromActiveDoc(): string[] {
  const doc = store.getState().documents.activeDocument
  if (!doc?.contentJson) return []
  try {
    const parsed = JSON.parse(doc.contentJson) as JSONContent
    const headings: string[] = []
    collectHeadings(parsed, headings)
    return headings.slice(0, 40)
  } catch {
    return []
  }
}

export const outlineChecklistPlugin: PluginModule = {
  manifest: {
    id: 'scribe.outline-checklist',
    name: 'Outline checklist',
    version: '1.0.0',
    description: 'Turn note headings into a task checklist at the cursor.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['commands'],
    defaultEnabled: true,
    category: 'workspace',
    i18n: {
      en: {
        'manifest.name': 'Outline checklist',
        'manifest.description': 'Headings → task checklist.',
        'cmd.title': 'Insert outline checklist',
        'empty': 'No headings in this note',
      },
      sk: {
        'manifest.name': 'Outline checklist',
        'manifest.description': 'Nadpisy → checklist úloh.',
        'cmd.title': 'Vložiť outline checklist',
        'empty': 'V poznámke nie sú nadpisy',
      },
    },
  },
  activate(api) {
    api.commands.register({
      id: 'insert',
      title: api.i18n.t('cmd.title', 'Insert outline checklist'),
      keywords: ['outline', 'checklist', 'headings', 'tasks'],
      run: () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          api.notify.error('Open a note first')
          return
        }
        const headings = headingsFromActiveDoc()
        if (!headings.length) {
          api.notify.info(api.i18n.t('empty', 'No headings in this note'))
          return
        }
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Outline' }],
            },
            {
              type: 'taskList',
              content: headings.map((text) => ({
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text }],
                  },
                ],
              })),
            },
            { type: 'paragraph' },
          ])
          .run()
        api.notify.success(api.i18n.t('manifest.name', 'Outline checklist'))
      },
    })
  },
}
