import { convertTiptap, writeTextFile } from '@/lib/db/api'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { sanitizeFileName } from '@/lib/filenames'
import type { PluginModule } from '@/lib/plugins/types'
import { store } from '@/store/index'
import { toast } from '@/lib/toast'
import { isTauriRuntime } from '@/lib/tauri'

async function documentPlainText(contentJson: string): Promise<string> {
  try {
    return await convertTiptap(contentJson, 'plain')
  } catch {
    return tiptapToPlainText(contentJson)
  }
}

export const plaintextExportPlugin: PluginModule = {
  manifest: {
    id: 'scribe.plaintext-export',
    name: 'Plain text export',
    version: '1.0.0',
    description: 'Command palette action to export the open note as .txt.',
    author: 'Scribe',
    scribeApi: 1,
    permissions: ['commands', 'storage'],
    defaultEnabled: true,
    category: 'writing',
  },
  activate(api) {
    api.commands.register({
      id: 'export-txt',
      title: 'Export note as plain text…',
      hint: 'Plain text export plugin',
      keywords: ['export', 'txt', 'plain', 'text'],
      run: async () => {
        const doc = store.getState().documents.activeDocument
        if (!doc) {
          toast.error('Open a note first')
          return
        }

        const plain = await documentPlainText(doc.contentJson)
        const count = Number(api.storage.get('export-count') ?? '0') + 1
        api.storage.set('export-count', String(count))

        if (!isTauriRuntime()) {
          try {
            await navigator.clipboard.writeText(plain)
            toast.success('Copied plain text', doc.title)
          } catch (error) {
            toast.error('Export failed', String(error))
          }
          return
        }

        try {
          const path = await saveScopedFile({
            title: 'Export plain text',
            defaultPath: sanitizeFileName(doc.title.trim() || 'document', 'txt'),
          })
          if (!path) return
          await writeTextFile(path, plain)
          toast.success('Exported plain text', path)
        } catch (error) {
          toast.error('Export failed', String(error))
        }
      },
    })
  },
}
