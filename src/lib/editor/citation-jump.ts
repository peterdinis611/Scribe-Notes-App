/** First searchable phrase from a citation snippet — long enough to jump, short enough to find. */
export function citationSearchQuery(snippet: string): string {
  const compact = snippet.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  if (compact.length <= 72) return compact
  const cut = compact.slice(0, 72)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 24 ? cut.slice(0, lastSpace) : cut
}
