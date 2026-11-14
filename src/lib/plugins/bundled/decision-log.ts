import type { Editor } from '@tiptap/react'
import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'

function insertDecision(editor: Editor, id: number) {
  const stamp = new Date().toISOString().slice(0, 10)
  editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: `Decision #${id} · ${stamp}` }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'Context: ' },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'Decision: ' },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'Consequences: ' },
          { type: 'text', text: '' },
        ],
      },
      { type: 'paragraph' },
    ])
    .run()
}

export const decisionLogPlugin: PluginModule = {
  manifest: {
    id: 'scribe.decision-log',
    name: 'Decision log',
    version: '1.0.0',
    description: 'Numbered decision entries with context / decision / consequences.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands', 'storage'],
    defaultEnabled: true,
    category: 'writing',
    i18n: {
      en: {
        'manifest.name': 'Decision log',
        'manifest.description': 'Numbered decision entries.',
        'block.label': 'Decision',
        'block.hint': 'Context · decision · consequences',
        'cmd.title': 'Insert decision entry',
      },
      sk: {
        'manifest.name': 'Decision log',
        'manifest.description': 'Číslované rozhodnutia.',
        'block.label': 'Rozhodnutie',
        'block.hint': 'Kontext · rozhodnutie · dôsledky',
        'cmd.title': 'Vložiť rozhodnutie',
      },
    },
  },
  activate(api) {
    const nextId = () => {
      const n = Number(api.storage.get('decision-count') ?? '0') + 1
      api.storage.set('decision-count', String(n))
      return n
    }

    api.blocks.register({
      id: 'decision-entry',
      icon: '⚖️',
      group: 'advanced',
      keywords: ['decision', 'adr', 'log', 'rozhodnutie'],
      label: api.i18n.t('block.label', 'Decision'),
      hint: api.i18n.t('block.hint', 'Context · decision · consequences'),
      insert: (editor) => insertDecision(editor, nextId()),
    })

    api.commands.register({
      id: 'insert',
      title: api.i18n.t('cmd.title', 'Insert decision entry'),
      keywords: ['decision', 'adr'],
      run: () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          api.notify.error('Open a note first')
          return
        }
        insertDecision(editor, nextId())
        api.notify.success(api.i18n.t('manifest.name', 'Decision log'))
      },
    })
  },
}
