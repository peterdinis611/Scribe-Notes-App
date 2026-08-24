export type BlockSnippet = {
  id: string
  name: string
  /** TipTap-oriented plain text; converted on insert. */
  plainText: string
}

const STORAGE_KEY = 'scribe-block-snippets'

const DEFAULT_SNIPPETS: BlockSnippet[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    plainText: '## Agenda\n\n- \n\n## Notes\n\n\n\n## Actions\n\n- [ ] ',
  },
  {
    id: 'decision',
    name: 'Decision',
    plainText: '### Decision\n\n**Context:**\n\n**Decision:**\n\n**Next steps:**\n\n- [ ] ',
  },
]

export function listBlockSnippets(): BlockSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SNIPPETS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SNIPPETS
    return parsed.filter(
      (item): item is BlockSnippet =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as BlockSnippet).id === 'string' &&
        typeof (item as BlockSnippet).name === 'string' &&
        typeof (item as BlockSnippet).plainText === 'string',
    )
  } catch {
    return DEFAULT_SNIPPETS
  }
}

export function saveBlockSnippets(snippets: BlockSnippet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
}

export function plainTextToTipTapContent(text: string): Array<Record<string, unknown>> {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const content: Array<Record<string, unknown>> = []
  for (const line of lines) {
    if (line.startsWith('### ')) {
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.slice(4) }],
      })
    } else if (line.startsWith('## ')) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.slice(3) }],
      })
    } else if (line.startsWith('- [ ] ')) {
      content.push({
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: line.slice(6) ? [{ type: 'text', text: line.slice(6) }] : [],
              },
            ],
          },
        ],
      })
    } else if (line.startsWith('- ')) {
      content.push({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: line.slice(2) ? [{ type: 'text', text: line.slice(2) }] : [],
              },
            ],
          },
        ],
      })
    } else if (line.trim() === '') {
      content.push({ type: 'paragraph' })
    } else {
      const parts: Array<{ type: string; text?: string; marks?: Array<{ type: string }> }> = []
      const regex = /\*\*([^*]+)\*\*/g
      let last = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(line))) {
        if (match.index > last) {
          parts.push({ type: 'text', text: line.slice(last, match.index) })
        }
        parts.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] })
        last = match.index + match[0].length
      }
      if (last < line.length) parts.push({ type: 'text', text: line.slice(last) })
      content.push({ type: 'paragraph', content: parts.length ? parts : undefined })
    }
  }
  return content
}
