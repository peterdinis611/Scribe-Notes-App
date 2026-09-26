import { message, open } from '@tauri-apps/plugin-dialog'
import { cacheDocument } from '@/lib/cache/document-cache'
import { createDocument, importFile, readTextFileDecoded, type Document } from '@/lib/db/api'
import {
  parseMarkdownToContentJson,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'
import {
  importPagesDocumentFromPath,
  isPagesPath,
} from '@/lib/import/pages'
import {
  importExcelDocumentFromPath,
  isExcelPath,
  isLegacyExcelPath,
} from '@/lib/import/excel-xlsx'
import { isWordDocxPath } from '@/lib/import/word-docx'
import { toast } from '@/lib/toast'
import i18n from '@/i18n'

const IMPORT_FILTERS = [
  {
    name: 'Apple Pages',
    extensions: ['pages'],
  },
  {
    name: 'Podporované dokumenty',
    extensions: [
      'scribe',
      'pages',
      'md',
      'markdown',
      'txt',
      'docx',
      'rtf',
      'doc',
      'xlsx',
      'xlsm',
      'csv',
      'xls',
    ],
  },
  { name: 'Scribe', extensions: ['scribe'] },
  { name: 'Text a Markdown', extensions: ['md', 'markdown', 'txt'] },
  { name: 'Word', extensions: ['docx', 'doc', 'rtf'] },
  { name: 'Excel', extensions: ['xlsx', 'xlsm', 'csv', 'xls'] },
]

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path)
}

function fallbackTitleFromPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? 'Importovaný dokument'
  return fileName.replace(/\.(md|markdown)$/i, '').trim() || 'Importovaný dokument'
}

function isLegacyWordPath(path: string) {
  return /\.(doc|rtf)$/i.test(path) && !isWordDocxPath(path)
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
      const decoded = await readTextFileDecoded(selected)
      if (decoded.converted && decoded.encoding.toLowerCase() !== 'utf-8') {
        toast.info(
          i18n.t('import.encodingConverted', { encoding: decoded.encoding }),
        )
      }
      const markdown = decoded.text
      const fallbackTitle = fallbackTitleFromPath(selected)
      const doc = await createDocument({
        title: titleFromMarkdown(markdown, fallbackTitle),
        contentJson: parseMarkdownToContentJson(markdown),
      })
      return cacheDocument(doc)
    }

    if (isLegacyExcelPath(selected)) {
      return await importExcelDocumentFromPath(selected)
    }

    if (isExcelPath(selected) && /\.csv$/i.test(selected)) {
      return await importExcelDocumentFromPath(selected)
    }

    if (isPagesPath(selected)) {
      return await importPagesDocumentFromPath(selected)
    }

    // .docx / .xlsx / text / .scribe — Rust import_file (office_import for Office).
    if (
      isWordDocxPath(selected) ||
      isExcelPath(selected) ||
      isLegacyWordPath(selected)
    ) {
      return await importFile(selected)
    }

    return await importFile(selected)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await message(detail, { title: 'Import zlyhal', kind: 'error' })
    return null
  }
}
