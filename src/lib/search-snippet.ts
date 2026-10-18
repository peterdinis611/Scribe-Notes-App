
/** Sync JS fallback — mirrored in `scribe-ui::sanitize_snippet`. */
export function sanitizeSnippetLocal(html: string): string {
  return html.replace(/<(?!\/?mark>)[^>]+>/gi, '')
}

/** Sync path for search hit render. */
export function sanitizeSnippet(html: string): string {
  return sanitizeSnippetLocal(html)
}

