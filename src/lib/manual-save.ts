/**
 * Manual save (⌘S / Ctrl+S): flush autosave and report success to the UI.
 * Returns whether the in-app save completed successfully.
 */
export async function runManualSave(options: {
  flush: (() => Promise<boolean>) | null | undefined
  onSaved: () => void
  onError: () => void
}): Promise<boolean> {
  if (!options.flush) return false

  try {
    const ok = await options.flush()
    if (ok) options.onSaved()
    return ok
  } catch {
    options.onError()
    return false
  }
}
