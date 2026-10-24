import { writeFile } from '@tauri-apps/plugin-fs'
import { sanitizeFileName } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'
import { revealInFinder, type ExportResult } from '@/lib/db/api'

type TipTapNode = {
  type?: string
  text?: string
  attrs?: { language?: string | null }
  content?: TipTapNode[]
}

const EXT_BY_LANG: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  rust: 'rs',
  go: 'go',
  ruby: 'rb',
  php: 'php',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  json: 'json',
  yaml: 'yml',
  toml: 'toml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  bash: 'sh',
  shell: 'sh',
  powershell: 'ps1',
  graphql: 'graphql',
  dockerfile: 'Dockerfile',
  markdown: 'md',
  plaintext: 'txt',
}

function collectText(node: TipTapNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(collectText).join('')
}

/** First code block in the document, if any. */
export function extractFirstCodeBlock(
  contentJson: string,
): { language: string | null; code: string } | null {
  let doc: TipTapNode
  try {
    doc = JSON.parse(contentJson) as TipTapNode
  } catch {
    return null
  }

  function walk(node: TipTapNode): { language: string | null; code: string } | null {
    if (node.type === 'codeBlock') {
      return {
        language: typeof node.attrs?.language === 'string' ? node.attrs.language : null,
        code: collectText(node),
      }
    }
    for (const child of node.content ?? []) {
      const hit = walk(child)
      if (hit) return hit
    }
    return null
  }

  return walk(doc)
}

export function extensionForLanguage(language: string | null | undefined): string {
  if (!language) return 'txt'
  const key = language.trim().toLowerCase()
  return EXT_BY_LANG[key] ?? (key.replace(/[^a-z0-9.+-]/gi, '') || 'txt')
}

/** Export the first TipTap code block as a source file. */
export async function exportDocumentAsSource(args: {
  contentJson: string
  title: string
  dialogTitle?: string
}): Promise<ExportResult | null> {
  const block = extractFirstCodeBlock(args.contentJson)
  if (!block) {
    throw new Error('Document has no code block to export')
  }
  const ext = extensionForLanguage(block.language)
  const defaultPath =
    ext === 'Dockerfile'
      ? 'Dockerfile'
      : sanitizeFileName(args.title || 'source', ext)
  const path = await saveScopedFile({
    title: args.dialogTitle ?? 'Export source',
    defaultPath,
  })
  if (!path) return null
  await writeFile(path, new TextEncoder().encode(block.code))
  await revealInFinder(path)
  return { path }
}
