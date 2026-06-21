import { message, open } from '@tauri-apps/plugin-dialog'
import { cacheDocument } from '@/lib/cache/document-cache'
import { createDocument, importFile, readTextFile, type Document } from '@/lib/db/api'
import {
  parseMarkdownToContentJson,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'

const IMPORT_FILTERS = [
  {
    name: 'Apple Pages',
    extensions: ['pages'],
  },
  {
    name: 'Podporované dokumenty',
    extensions: ['scribe', 'pages', 'md', 'markdown', 'txt', 'docx', 'rtf', 'doc'],
  },
  { name: 'Scribe', extensions: ['scribe'] },
  { name: 'Text a Markdown', extensions: ['md', 'markdown', 'txt'] },
  { name: 'Word', extensions: ['docx', 'doc', 'rtf'] },
]

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path)
}

function fallbackTitleFromPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? 'Importovaný dokument'
  return fileName.replace(/\.(md|markdown)$/i, '').trim() || 'Importovaný dokument'
}

export async function pickAndImportDocument(): Promise<Document | null> {
  const selected = await open({
    multiple: false,
    title: 'Importovať dokument',
    filters: IMPORT_FILTERS,
    fileAccessMode: 'scoped',
  })

  if (!selected || Array.isArray(selected)) {
    return null
  }

  try {
    if (isMarkdownPath(selected)) {
      const markdown = await readTextFile(selected)
      const fallbackTitle = fallbackTitleFromPath(selected)
      const doc = await createDocument({
        title: titleFromMarkdown(markdown, fallbackTitle),
        contentJson: parseMarkdownToContentJson(markdown),
      })
      return cacheDocument(doc)
    }

    return await importFile(selected)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await message(detail, { title: 'Import zlyhal', kind: 'error' })
    return null
  }
}
