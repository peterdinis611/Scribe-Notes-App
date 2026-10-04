import type { Editor } from '@tiptap/react'
import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'

function insertStandup(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Standup' }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Yesterday' }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Today' }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Blockers' }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      { type: 'paragraph' },
    ])
    .run()
}

/** Opt-in example: off by default — enable from Settings → Plugins. */
export const standupPlugin: PluginModule = {
  manifest: {
    id: 'scribe.standup',
    name: 'Standup notes',
    version: '1.0.0',
    description: 'Slash template for daily standup (yesterday / today / blockers).',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands'],
    defaultEnabled: false,
    category: 'writing',
    i18n: {
      en: {
        'manifest.name': 'Standup notes',
        'manifest.description': 'Daily standup slash template.',
        'block.label': 'Standup',
        'block.hint': 'Yesterday / today / blockers',
        'cmd.title': 'Insert standup template',
      },
      sk: {
        'manifest.name': 'Standup poznámky',
        'manifest.description': 'Šablóna denného standup-u.',
        'block.label': 'Standup',
        'block.hint': 'Včera / dnes / blokery',
        'cmd.title': 'Vložiť standup šablónu',
      },
    },
  },
  activate(api) {
    api.blocks.register({
      id: 'standup',
      icon: '🗓',
      group: 'advanced',
      keywords: ['standup', 'scrum', 'daily'],
      label: api.i18n.t('block.label', 'Standup'),
      hint: api.i18n.t('block.hint', 'Yesterday / today / blockers'),
      insert: (editor) => insertStandup(editor),
    })

    api.commands.register({
      id: 'insert',
      title: api.i18n.t('cmd.title', 'Insert standup template'),
      keywords: ['standup'],
      run: () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          api.notify.error('Open a note first')
          return
        }
        insertStandup(editor)
        api.notify.success(api.i18n.t('manifest.name', 'Standup notes'))
      },
    })
  },
}
