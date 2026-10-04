import { highlightCode } from '@/lib/editor/lowlight'
import { resolveCodeLanguage } from '@/lib/editor/code-languages'
import { invoke, isTauriRuntime } from '@/lib/tauri'

export type CodeHighlightBlock = {
  language?: string | null
  code: string
}

function blockKey(language: string | undefined | null, code: string): string {
  return `${language ?? ''}\u0000${code}`
}

/**
 * Prefer Rust syntect highlighting (same engine as `export_document_by_id`).
 * Falls back to highlight.js / lowlight when IPC is unavailable.
 */
export async function buildCodeHighlightMap(
  blocks: CodeHighlightBlock[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (blocks.length === 0) return map

  const unique = new Map<string, CodeHighlightBlock>()
  for (const block of blocks) {
    unique.set(blockKey(block.language, block.code), block)
  }

  await Promise.all(
    [...unique.entries()].map(async ([key, block]) => {
      if (isTauriRuntime()) {
        try {
          const rustHtml = await invoke<string | null>('highlight_code', {
            language: block.language ?? '',
            code: block.code,
          })
          if (rustHtml) {
            map.set(key, rustHtml)
            return
          }
        } catch {
          // Fall through to lowlight.
        }
      }

      const resolved = resolveCodeLanguage(block.language)
      const className = resolved ? `hljs language-${resolved}` : 'hljs'
      map.set(
        key,
        `<pre><code class="${className}">${highlightCode(block.code, block.language)}</code></pre>`,
      )
    }),
  )

  return map
}

export function codeHighlightKey(language: string | undefined | null, code: string): string {
  return blockKey(language, code)
}
