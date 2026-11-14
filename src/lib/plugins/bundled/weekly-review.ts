import type { Editor } from '@tiptap/react'
import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'

function weekLabel(): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function insertWeeklyReview(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: `Weekly review · ${weekLabel()}` }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Wins' }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Misses' }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Next week' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph' }],
          },
        ],
      },
      { type: 'paragraph' },
    ])
    .run()
}

export const weeklyReviewPlugin: PluginModule = {
  manifest: {
    id: 'scribe.weekly-review',
    name: 'Weekly review',
    version: '1.0.0',
    description: 'Slash template for wins / misses / next week.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands'],
    defaultEnabled: true,
    category: 'writing',
    i18n: {
      en: {
        'manifest.name': 'Weekly review',
        'manifest.description': 'Wins / misses / next week slash template.',
        'block.label': 'Weekly review',
        'block.hint': 'Wins · misses · next week',
        'cmd.title': 'Insert weekly review',
      },
      sk: {
        'manifest.name': 'Týždenná review',
        'manifest.description': 'Šablóna výhry / prehry / budúci týždeň.',
        'block.label': 'Týždenná review',
        'block.hint': 'Výhry · prehry · budúci týždeň',
        'cmd.title': 'Vložiť týždennú review',
      },
    },
  },
  activate(api) {
    api.blocks.register({
      id: 'weekly-review',
      icon: '📅',
      group: 'advanced',
      keywords: ['weekly', 'review', 'retro', 'tyzden'],
      label: api.i18n.t('block.label', 'Weekly review'),
      hint: api.i18n.t('block.hint', 'Wins · misses · next week'),
      insert: (editor) => insertWeeklyReview(editor),
    })

    api.commands.register({
      id: 'insert',
      title: api.i18n.t('cmd.title', 'Insert weekly review'),
      keywords: ['weekly', 'review'],
      run: () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          api.notify.error('Open a note first')
          return
        }
        insertWeeklyReview(editor)
        api.notify.success(api.i18n.t('manifest.name', 'Weekly review'))
      },
    })
  },
}
