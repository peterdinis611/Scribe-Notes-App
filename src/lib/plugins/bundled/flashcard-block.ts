import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'
import { toast } from '@/lib/toast'

function selectionAsFlashcardTsv(): string | null {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return null
  const { from, to, empty } = editor.state.selection
  if (empty) return null
  const text = editor.state.doc.textBetween(from, to, '\n').trim()
  if (!text) return null

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const cards: string[] = []
  for (const line of lines) {
    const qa = line.match(/^(?:Q[:：]\s*)?(.+?)\s*(?:→|->|—|–|:)\s*(.+)$/i)
    if (qa) {
      const front = qa[1].replace(/\t/g, ' ')
      const back = qa[2].replace(/\t/g, ' ')
      cards.push(`${front}\t${back}`)
      continue
    }
    if (line.toLowerCase().startsWith('q:') || line.toLowerCase().startsWith('a:')) {
      continue
    }
  }

  // Pair consecutive Q:/A: lines
  for (let i = 0; i < lines.length - 1; i += 1) {
    const q = lines[i].match(/^Q[:：]\s*(.+)$/i)
    const a = lines[i + 1].match(/^A[:：]\s*(.+)$/i)
    if (q && a) {
      cards.push(`${q[1].replace(/\t/g, ' ')}\t${a[1].replace(/\t/g, ' ')}`)
      i += 1
    }
  }

  return cards.length > 0 ? [...new Set(cards)].join('\n') : null
}

export const flashcardBlockPlugin: PluginModule = {
  manifest: {
    id: 'scribe.flashcards',
    name: 'Flashcards',
    version: '1.0.0',
    description: 'Slash flashcard block and copy selection as Anki TSV.',
    author: 'Scribe',
    scribeApi: 1,
    permissions: ['editor.blocks', 'commands'],
    defaultEnabled: true,
    category: 'study',
  },
  activate(api) {
    api.blocks.register({
      id: 'flashcard',
      icon: '🃏',
      group: 'advanced',
      keywords: ['flashcard', 'anki', 'quiz', 'karticka'],
      label: 'Flashcard',
      hint: 'Question / answer study card',
      insert: (editor) => {
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Q: ' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'A: ' }],
                },
              ],
            },
            { type: 'paragraph' },
          ])
          .run()
      },
    })

    api.commands.register({
      id: 'copy-anki-tsv',
      title: 'Copy selection as Anki TSV',
      hint: 'Flashcards plugin',
      keywords: ['anki', 'flashcard', 'tsv', 'export'],
      run: async () => {
        const tsv = selectionAsFlashcardTsv()
        if (!tsv) {
          toast.error('Select Q→A or Q:/A: lines first')
          return
        }
        try {
          await navigator.clipboard.writeText(tsv)
          toast.success('Copied Anki TSV', `${tsv.split('\n').length} card(s)`)
        } catch (error) {
          toast.error('Clipboard failed', String(error))
        }
      },
    })
  },
}
