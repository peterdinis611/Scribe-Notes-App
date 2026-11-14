import type { Editor } from '@tiptap/react'
import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'

function insertZettel(editor: Editor, tagPrefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: `Note ${stamp}` }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Tags: ' },
          { type: 'text', text: `${tagPrefix}inbox` },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '[[Related note]]' }],
      },
      { type: 'paragraph' },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Links' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '[[ ]]' }],
              },
            ],
          },
        ],
      },
      { type: 'paragraph' },
    ])
    .run()
}

export const zettelStubPlugin: PluginModule = {
  manifest: {
    id: 'scribe.zettel-stub',
    name: 'Zettel stub',
    version: '1.0.0',
    description: 'Atomic note stub with tags and wiki-link placeholders.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands', 'storage'],
    defaultEnabled: true,
    category: 'study',
    i18n: {
      en: {
        'manifest.name': 'Zettel stub',
        'manifest.description': 'Atomic note stub with tags and [[wiki]] links.',
        'block.label': 'Zettel stub',
        'block.hint': 'Tags + wiki links',
        'cmd.title': 'Insert zettel stub',
      },
      sk: {
        'manifest.name': 'Zettel stub',
        'manifest.description': 'Atómová poznámka s tagmi a [[wiki]] odkazmi.',
        'block.label': 'Zettel stub',
        'block.hint': 'Tagy + wiki odkazy',
        'cmd.title': 'Vložiť zettel stub',
      },
    },
  },
  activate(api) {
    if (api.storage.get('tag-prefix') == null) {
      api.storage.set('tag-prefix', '#')
    }

    api.blocks.register({
      id: 'zettel-stub',
      icon: '🧩',
      group: 'advanced',
      keywords: ['zettel', 'atomic', 'wiki', 'stub'],
      label: api.i18n.t('block.label', 'Zettel stub'),
      hint: api.i18n.t('block.hint', 'Tags + wiki links'),
      insert: (editor) => insertZettel(editor, api.storage.get('tag-prefix') ?? '#'),
    })

    api.commands.register({
      id: 'insert',
      title: api.i18n.t('cmd.title', 'Insert zettel stub'),
      keywords: ['zettel', 'atomic'],
      run: () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          api.notify.error('Open a note first')
          return
        }
        insertZettel(editor, api.storage.get('tag-prefix') ?? '#')
        api.notify.success(api.i18n.t('manifest.name', 'Zettel stub'))
      },
    })
  },
}
