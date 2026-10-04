import type { PluginModule } from '@/lib/plugins/types'

function todayLabel(): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export const dailyJournalPlugin: PluginModule = {
  manifest: {
    id: 'scribe.daily-journal',
    name: 'Daily journal',
    version: '1.0.0',
    description: 'Slash block that inserts a dated journal template.',
    author: 'Scribe',
    scribeApi: 1,
    permissions: ['editor.blocks', 'storage'],
    defaultEnabled: true,
    category: 'writing',
  },
  activate(api) {
    if (api.storage.get('insert-count') == null) {
      api.storage.set('insert-count', '0')
    }

    api.blocks.register({
      id: 'journal-entry',
      icon: '📔',
      group: 'advanced',
      keywords: ['journal', 'daily', 'diary', 'dennik'],
      label: 'Journal entry',
      hint: 'Dated daily journal template',
      insert: (editor) => {
        const date = todayLabel()
        const count = Number(api.storage.get('insert-count') ?? '0') + 1
        api.storage.set('insert-count', String(count))
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: date }],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Gratitude' }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Highlights' }],
            },
            { type: 'paragraph' },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Tomorrow' }],
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
      },
    })
  },
}
