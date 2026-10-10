import { colorForTagNative } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

/** Sync JS fallback — mirrored in `scribe-ui::color_for_tag`. */
export function colorForTagLocal(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash << 5) - hash + tag.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 52% 52%)`
}

/** Sync path for React render (library/graph). Prefer `colorForTagNative` under Tauri when async is OK. */
export function colorForTag(tag: string): string {
  return colorForTagLocal(tag)
}

/** Prefer Rust `scribe-ui` when running under Tauri; otherwise JS fallback. */
export async function colorForTagAsync(tag: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await colorForTagNative(tag)
    } catch {
      // Fall through.
    }
  }
  return colorForTagLocal(tag)
}
