import { sanitizeSnippetNative } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

/** Sync JS fallback — mirrored in `scribe-ui::sanitize_snippet`. */
export function sanitizeSnippetLocal(html: string): string {
  return html.replace(/<(?!\/?mark>)[^>]+>/gi, '')
}

/** Sync path for search hit render. */
export function sanitizeSnippet(html: string): string {
  return sanitizeSnippetLocal(html)
}

/** Prefer Rust `scribe-ui` when running under Tauri; otherwise JS fallback. */
export async function sanitizeSnippetAsync(html: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await sanitizeSnippetNative(html)
    } catch {
      // Fall through.
    }
  }
  return sanitizeSnippetLocal(html)
}
