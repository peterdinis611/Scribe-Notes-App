/** Keep in sync with `crates/scribe-ui` / `scribe-video` counterparts. */
import type { JSONContent } from '@tiptap/core'
import { promoteMarkdownSpecialBlocksNative } from '@/lib/db/api'
import { D3_CHART_DEFAULT_SOURCE } from '@/lib/editor/d3-chart'
import { MAP_DEFAULT_SOURCE } from '@/lib/editor/map'
import { parseVideoFence } from '@/lib/editor/video'
import { isTauriRuntime } from '@/lib/tauri'

function codeBlockText(node: JSONContent): string {
  return (node.content ?? []).map((child) => child.text ?? '').join('')
}

function promoteNode(node: JSONContent): JSONContent {
  if (node.type === 'codeBlock') {
    const language = String(node.attrs?.language ?? '')
      .toLowerCase()
      .trim()
    const text = codeBlockText(node)

    if (language === 'mermaid') {
      return {
        type: 'mermaidDiagram',
        attrs: { source: text.trim() || 'flowchart TD\n  A --> B' },
      }
    }

    if (language === 'chart' || language === 'd3' || language === 'd3chart') {
      return {
        type: 'd3Chart',
        attrs: { source: text.trim() || D3_CHART_DEFAULT_SOURCE },
      }
    }

    if (language === 'math') {
      return {
        type: 'mathBlock',
        attrs: { expression: text.trim() },
      }
    }

    if (language === 'video') {
      const attrs = parseVideoFence(text)
      return {
        type: 'video',
        attrs: {
          src: attrs.src ?? null,
          caption: attrs.caption ?? null,
        },
      }
    }

    if (language === 'map' || language === 'leaflet') {
      return {
        type: 'leafletMap',
        attrs: { source: text.trim() || MAP_DEFAULT_SOURCE },
      }
    }
  }

  if (!node.content?.length) return node

  return {
    ...node,
    content: node.content.map(promoteNode),
  }
}

/**
 * After TipTap Markdown parse, promote fenced ```mermaid / ```chart / ```video / ```map / ```math code blocks
 * into first-class editor nodes so import/source mode round-trips.
 */
export function promoteMarkdownSpecialBlocks(doc: JSONContent): JSONContent {
  if (!doc || doc.type !== 'doc') {
    return { type: 'doc', content: [] }
  }
  return promoteNode(doc)
}

/** Prefer Rust `scribe-ui` under Tauri; otherwise JS fallback. */
export async function promoteMarkdownSpecialBlocksAsync(
  doc: JSONContent,
): Promise<JSONContent> {
  if (isTauriRuntime()) {
    try {
      return (await promoteMarkdownSpecialBlocksNative(doc)) as JSONContent
    } catch {
      /* fall through */
    }
  }
  return promoteMarkdownSpecialBlocks(doc)
}
