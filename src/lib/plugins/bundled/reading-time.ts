import { tiptapToPlainText } from '@/lib/export/plain-text'
import type { PluginModule } from '@/lib/plugins/types'
import { store } from '@/store/index'

const WORDS_PER_MINUTE = 200

function estimateReading(contentJson: string): { words: number; minutes: number } {
  const text = tiptapToPlainText(contentJson).trim()
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
  return { words, minutes }
}

export const readingTimePlugin: PluginModule = {
  manifest: {
    id: 'scribe.reading-time',
    name: 'Reading time',
    version: '1.0.0',
    description: 'Estimate reading time for the open note and copy a summary.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['commands', 'export'],
    defaultEnabled: true,
    category: 'writing',
    i18n: {
      en: {
        'manifest.name': 'Reading time',
        'manifest.description': 'Estimate reading time for the open note.',
        'cmd.title': 'Show reading time',
        'cmd.copy': 'Copy reading-time summary',
        'export.label': 'Reading time (.txt)',
      },
      sk: {
        'manifest.name': 'Čas čítania',
        'manifest.description': 'Odhad času čítania otvorenej poznámky.',
        'cmd.title': 'Zobraziť čas čítania',
        'cmd.copy': 'Kopírovať súhrn času čítania',
        'export.label': 'Čas čítania (.txt)',
      },
    },
  },
  activate(api) {
    const summaryFor = (title: string, contentJson: string) => {
      const { words, minutes } = estimateReading(contentJson)
      return `${title}\n${words} words · ~${minutes} min reading time\n`
    }

    api.commands.register({
      id: 'show',
      title: api.i18n.t('cmd.title', 'Show reading time'),
      keywords: ['reading', 'time', 'words', 'wpm'],
      run: () => {
        const doc = store.getState().documents.activeDocument
        if (!doc) {
          api.notify.error('Open a note first')
          return
        }
        const { words, minutes } = estimateReading(doc.contentJson)
        api.notify.info(`${words} words · ~${minutes} min`, doc.title)
      },
    })

    api.commands.register({
      id: 'copy',
      title: api.i18n.t('cmd.copy', 'Copy reading-time summary'),
      keywords: ['reading', 'copy'],
      run: async () => {
        const doc = store.getState().documents.activeDocument
        if (!doc) {
          api.notify.error('Open a note first')
          return
        }
        try {
          await navigator.clipboard.writeText(summaryFor(doc.title, doc.contentJson))
          api.notify.success(api.i18n.t('cmd.copy', 'Copy reading-time summary'))
        } catch (error) {
          api.notify.error(String(error))
        }
      },
    })

    api.export.register({
      id: 'reading-time-txt',
      label: api.i18n.t('export.label', 'Reading time (.txt)'),
      extensions: ['txt'],
      export: async ({ title, contentJson }) => {
        const body = summaryFor(title, contentJson)
        await navigator.clipboard.writeText(body)
        api.notify.success(api.i18n.t('export.label', 'Reading time (.txt)'))
      },
    })
  },
}
