type TipTapNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

export type WikiTargetResolver = (label: string) => string | null

function inlineContentFromText(text: string, resolveWikiTarget?: WikiTargetResolver): TipTapNode[] {
  if (!text) return []

  if (!resolveWikiTarget || !text.includes('[[')) {
    return [{ type: 'text', text }]
  }

  const nodes: TipTapNode[] = []
  const pattern = /\[\[([^\]]+)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const label = match[1]!.trim()
    if (label) {
      nodes.push({
        type: 'wikiLink',
        attrs: { targetId: resolveWikiTarget(label), label },
      })
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text }]
}

function paragraphNode(line: string, resolveWikiTarget?: WikiTargetResolver): TipTapNode {
  const text = line.trimEnd()
  if (!text) return { type: 'paragraph' }
  return {
    type: 'paragraph',
    content: inlineContentFromText(text, resolveWikiTarget),
  }
}

function inlineText(nodes?: TipTapNode[]): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') return node.text ?? ''
      if (node.type === 'hardBreak') return '\n'
      if (node.type === 'wikiLink') {
        const label = typeof node.attrs?.label === 'string' ? node.attrs.label : ''
        return label ? `[[${label}]]` : ''
      }
      return inlineText(node.content)
    })
    .join('')
}

function blockToPlain(node: TipTapNode): string {
  switch (node.type) {
    case 'heading':
      return inlineText(node.content)
    case 'paragraph':
      return inlineText(node.content)
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => blockToPlain(child))
        .filter(Boolean)
        .join('\n')
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => {
          const text = (item.content ?? [])
            .map((child) => blockToPlain(child))
            .filter(Boolean)
            .join('\n')
          return `- ${text}`
        })
        .join('\n')
    case 'orderedList':
      return (node.content ?? [])
        .map((item, index) => {
          const text = (item.content ?? [])
            .map((child) => blockToPlain(child))
            .filter(Boolean)
            .join('\n')
          return `${index + 1}. ${text}`
        })
        .join('\n')
    case 'taskList':
      return (node.content ?? [])
        .map((item) => {
          const checked = item.attrs?.checked ? '☑' : '☐'
          const text = (item.content ?? [])
            .map((child) => blockToPlain(child))
            .filter(Boolean)
            .join('\n')
          return `${checked} ${text}`
        })
        .join('\n')
    case 'horizontalRule':
      return '---'
    case 'codeBlock':
      return inlineText(node.content)
    default:
      if (node.content) {
        return node.content.map(blockToPlain).filter(Boolean).join('\n')
      }
      return ''
  }
}

/** Convert TipTap JSON string to plain text suitable for Claude context. */
export function tiptapToPlainText(contentJson: string): string {
  try {
    const doc = JSON.parse(contentJson) as TipTapNode
    const blocks = (doc.content ?? [])
      .map(blockToPlain)
      .filter((block) => block.trim().length > 0)

    return blocks.join('\n\n').trim()
  } catch {
    return ''
  }
}

/** Wrap plain text lines as TipTap doc paragraphs. */
export function plainTextToTipTap(text: string, resolveWikiTarget?: WikiTargetResolver): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const content =
    lines.length === 0 || (lines.length === 1 && lines[0] === '')
      ? [{ type: 'paragraph' }]
      : lines.map((line) => paragraphNode(line, resolveWikiTarget))
  return JSON.stringify({ type: 'doc', content })
}

/** TipTap paragraph nodes for appending plain text (split on newlines). */
export function plainTextToParagraphNodes(
  text: string,
  resolveWikiTarget?: WikiTargetResolver,
): TipTapNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length === 0) return [{ type: 'paragraph' }]
  return lines.map((line) => paragraphNode(line, resolveWikiTarget))
}
