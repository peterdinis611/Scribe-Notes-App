import { pickAndGrantPath, pickAndGrantSavePath } from '@/lib/db/api'

type DialogFilter = { name: string; extensions: string[] }

/**
 * Let React finish a re-render (e.g. Radix `modal={false}`) before a native
 * file panel — otherwise the save/open dialog often cancels immediately.
 */
export function yieldForNativeDialog(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0)
    })
  })
}

/**
 * Open a file via the Rust native picker (grants PathAccessGate).
 * Prefer this over `@tauri-apps/plugin-dialog` + path string grants.
 */
export async function openScopedFile(options?: {
  title?: string
  /** Filters are advisory for callers; Rust picker currently uses OS defaults. */
  filters?: DialogFilter[]
}): Promise<string | null> {
  await yieldForNativeDialog()
  return pickAndGrantPath({ title: options?.title })
}

export async function saveScopedFile(options?: {
  title?: string
  defaultPath?: string
  filters?: DialogFilter[]
}): Promise<string | null> {
  await yieldForNativeDialog()
  return pickAndGrantSavePath({
    title: options?.title,
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  })
}
