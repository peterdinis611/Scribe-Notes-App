/** Strip FTS snippet HTML except `<mark>` highlight tags. */
export function sanitizeSnippet(html: string): string {
  return html.replace(/<(?!\/?mark>)[^>]+>/gi, '')
}
