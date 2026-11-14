import type { Editor } from '@tiptap/react'
import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'

function insertCornell(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Cornell notes' }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Cues' }],
      },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph' }] },
          { type: 'listItem', content: [{ type: 'paragraph' }] },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Notes' }],
      },
      { type: 'paragraph' },
      { type: 'paragraph' },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Summary' }],
      },
      { type: 'paragraph' },
      { type: 'paragraph' },
    ])
    .run()
}

export const cornellNotesPlugin: PluginModule = {
  manifest: {
    id: 'scribe.cornell-notes',
    name: 'Cornell notes',
    version: '1.0.0',
    description: 'Slash template for cue / notes / summary study layout.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands'],
    defaultEnabled: true,
    category: 'study',
    i18n: {
      en: {
        'manifest.name': 'Cornell notes',
        'manifest.description': 'Cue / notes / summary study template.',
        'block.label': 'Cornell notes',
        'block.hint': 'Cues · notes · summary',
        'cmd.title': 'Insert Cornell notes',
      },
      sk: {
        'manifest.name': 'Cornell poznámky',
        'manifest.description': 'Šablóna cues / notes / summary.',
        'block.label': 'Cornell poznámky',
        'block.hint': 'Cues · notes · summary',
        'cmd.title': 'Vložiť Cornell poznámky',
      },
    },
  },
  activate(api) {
    api.blocks.register({
      id: 'cornell-notes',
      icon: '📒',
      group: 'advanced',
      keywords: ['cornell', 'study', 'cues', 'summary'],
      label: api.i18n.t('block.label', 'Cornell notes'),
      hint: api.i18n.t('block.hint', 'Cues · notes · summary'),
      insert: (editor) => insertCornell(editor),
    })

    api.commands.register({
      id: 'insert',
      title: api.i18n.t('cmd.title', 'Insert Cornell notes'),
      keywords: ['cornell', 'study'],
      run: () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          api.notify.error('Open a note first')
          return
        }
        insertCornell(editor)
        api.notify.success(api.i18n.t('manifest.name', 'Cornell notes'))
      },
    })
  },
}
