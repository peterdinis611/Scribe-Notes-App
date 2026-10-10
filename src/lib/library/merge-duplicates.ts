import { mergeDocuments, mergeDuplicateContentNative } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

/** Keep in sync with `crates/scribe-ui/src/merge_duplicates.rs`. */

function parseDoc(contentJson: string): { type: string; content: unknown[] } {
  try {
    const parsed = JSON.parse(contentJson) as { type?: string; content?: unknown[] }
    return { type: parsed.type ?? 'doc', content: Array.isArray(parsed.content) ? parsed.content : [] }
  } catch {
    return { type: 'doc', content: [] }
  }
}

export function mergeDuplicateContent(keepJson: string, dropJson: string, dropTitle: string): string {
  const keepDoc = parseDoc(keepJson)
  const dropDoc = parseDoc(dropJson)
  const heading = {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: dropTitle.trim() || 'Untitled' }],
  }
  return JSON.stringify({
    type: 'doc',
    content: [...keepDoc.content, { type: 'horizontalRule' }, heading, ...dropDoc.content],
  })
}

/** Prefer Rust `scribe-ui` under Tauri; otherwise JS fallback. */
export async function mergeDuplicateContentAsync(
  keepJson: string,
  dropJson: string,
  dropTitle: string,
): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await mergeDuplicateContentNative(keepJson, dropJson, dropTitle)
    } catch {
      /* fall through */
    }
  }
  return mergeDuplicateContent(keepJson, dropJson, dropTitle)
}

/** Append the dropped note under a heading, then move it to trash. */
export async function mergeDuplicateNotes(keepId: string, dropId: string): Promise<void> {
  if (keepId === dropId) return
  await mergeDocuments(keepId, dropId)
}
