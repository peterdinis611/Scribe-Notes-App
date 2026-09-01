type JsonNode = {
  type?: string
  attrs?: { level?: number }
  content?: JsonNode[]
  text?: string
}

function textFromNode(node: JsonNode): string {
  if (node.text) return node.text
  return (node.content ?? []).map(textFromNode).join('')
}

/** Collect heading labels from stored document JSON (no live editor required). */
export function collectHeadingsFromJson(contentJson: string): string[] {
  try {
    const root = JSON.parse(contentJson) as JsonNode
    const headings: string[] = []
    const walk = (node: JsonNode) => {
      if (node.type === 'heading') {
        const label = textFromNode(node).trim()
        if (label) headings.push(label)
      }
      for (const child of node.content ?? []) walk(child)
    }
    walk(root)
    return headings
  } catch {
    return []
  }
}
