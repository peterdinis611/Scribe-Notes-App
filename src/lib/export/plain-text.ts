type TipTapNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

function inlineText(nodes?: TipTapNode[]): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') return node.text ?? ''
      if (node.type === 'hardBreak') return '\n'
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
