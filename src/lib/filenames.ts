
/** Keep in sync with `crates/scribe-ui/src/filenames.rs`. */

export function sanitizeFileStem(name: string, maxLen = 80): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, Math.max(1, maxLen))
    .trim()
  return cleaned || 'scribe'
}

export function sanitizeFileName(name: string, ext: string): string {
  const stem = sanitizeFileStem(name)
  const cleanExt = ext.trim().replace(/^\.+/, '')
  return cleanExt ? `${stem}.${cleanExt}` : stem
}
