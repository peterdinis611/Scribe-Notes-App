type TipTapNode = {
  type?: string
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

function renderMarks(text: string, marks?: TipTapNode['marks']): string {
  if (!marks?.length) return text

  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return `**${acc}**`
      case 'italic':
        return `*${acc}*`
      case 'strike':
        return `~~${acc}~~`
      case 'code':
        return `\`${acc}\``
      case 'link': {
        const href = String(mark.attrs?.href ?? '#')
        return `[${acc}](${href})`
      }
      default:
        return acc
    }
  }, text)
}

function renderInline(nodes?: TipTapNode[]): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') return renderMarks(node.text ?? '', node.marks)
      if (node.type === 'hardBreak') return '\n'
      if (node.type === 'mathInline') {
        const expr = String(node.attrs?.expression ?? '')
        return `\`${expr}\``
      }
      return renderNodes(node.content)
    })
    .join('')
}

function renderNodes(nodes?: TipTapNode[]): string {
  return (nodes ?? [])
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return `${renderInline(node.content)}\n\n`
        case 'heading': {
          const level = Number(node.attrs?.level ?? 1)
          return `${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${renderInline(node.content)}\n\n`
        }
        case 'bulletList':
          return (node.content ?? [])
            .map((item) => `- ${renderInline(item.content?.[0]?.content)}\n`)
            .join('')
            .concat('\n')
        case 'orderedList':
          return (node.content ?? [])
            .map((item, index) => `${index + 1}. ${renderInline(item.content?.[0]?.content)}\n`)
            .join('')
            .concat('\n')
        case 'blockquote':
          return (node.content ?? [])
            .map((child) => `> ${renderInline(child.content)}\n`)
            .join('')
            .concat('\n')
        case 'codeBlock': {
          const lang = String(node.attrs?.language ?? '')
          const raw = (node.content ?? []).map((n) => n.text ?? '').join('')
          return `\`\`\`${lang}\n${raw}\n\`\`\`\n\n`
        }
        case 'horizontalRule':
          return '---\n\n'
        case 'mathBlock': {
          const expr = String(node.attrs?.expression ?? '')
          return `\`\`\`math\n${expr}\n\`\`\`\n\n`
        }
        case 'image': {
          const alt = String(node.attrs?.alt ?? 'image')
          const src = String(node.attrs?.src ?? '')
          return `![${alt}](${src})\n\n`
        }
        case 'table':
          return renderTable(node)
        default:
          return renderNodes(node.content)
      }
    })
    .join('')
}

function renderTable(node: TipTapNode): string {
  const rows = node.content ?? []
  const lines: string[] = []

  rows.forEach((row, rowIndex) => {
    const cells = (row.content ?? []).map((cell) => renderInline(cell.content).replace(/\n/g, ' ').trim())
    lines.push(`| ${cells.join(' | ')} |`)
    if (rowIndex === 0) {
      lines.push(`| ${cells.map(() => '---').join(' | ')} |`)
    }
  })

  return `${lines.join('\n')}\n\n`
}

export function tiptapJsonToMarkdown(contentJson: string, title: string): string {
  let doc: TipTapNode = { type: 'doc', content: [] }
  try {
    doc = JSON.parse(contentJson) as TipTapNode
  } catch {
    // empty
  }

  const body = renderNodes(doc.content).trim()
  return `# ${title}\n\n${body}\n`
}
