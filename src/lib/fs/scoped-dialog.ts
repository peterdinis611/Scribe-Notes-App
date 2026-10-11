import { pickAndGrantPath, pickAndGrantSavePath } from '@/lib/db/api'

type OpenFilter = { name: string; extensions: string[] }

/**
 * Open a file via the Rust native picker (grants PathAccessGate).
 * Prefer this over `@tauri-apps/plugin-dialog` + path string grants.
 */
export async function openScopedFile(options?: {
  title?: string
  /** Filters are advisory for callers; Rust picker currently uses OS defaults. */
  filters?: OpenFilter[]
}): Promise<string | null> {
  return pickAndGrantPath({ title: options?.title })
}

export async function saveScopedFile(options?: {
  title?: string
  defaultPath?: string
}): Promise<string | null> {
  return pickAndGrantSavePath({
    title: options?.title,
    defaultPath: options?.defaultPath,
  })
}
