/** Stable HSL color for a tag label (used in library + graph). */
export function colorForTag(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash << 5) - hash + tag.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 52% 52%)`
}
