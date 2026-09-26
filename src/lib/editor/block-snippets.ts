export type BlockSnippet = {
  id: string
  name: string
  /** TipTap-oriented plain text; converted on insert. */
  plainText: string
  /** True for user-created snippets (persisted). */
  custom?: boolean
}

import { kvGet, kvSet } from '@/lib/storage/kv'

const STORAGE_KEY = 'scribe-block-snippets'
const CUSTOM_ID_PREFIX = 'custom-'

export const DEFAULT_BLOCK_SNIPPETS: BlockSnippet[] = [
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

const DEFAULT_IDS = new Set(DEFAULT_BLOCK_SNIPPETS.map((item) => item.id))

function isValidSnippet(item: unknown): item is BlockSnippet {
  return Boolean(
    item &&
      typeof item === 'object' &&
      typeof (item as BlockSnippet).id === 'string' &&
      typeof (item as BlockSnippet).name === 'string' &&
      typeof (item as BlockSnippet).plainText === 'string',
  )
}

function readStoredSnippets(): BlockSnippet[] {
  try {
    const raw = kvGet(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidSnippet).map((item) => ({
      ...item,
      custom: item.custom ?? !DEFAULT_IDS.has(item.id),
    }))
  } catch {
    return []
  }
}

function persistAll(snippets: BlockSnippet[]) {
  kvSet(STORAGE_KEY, JSON.stringify(snippets))
}

/** Built-in + custom snippets for slash menu / insert. */
export function listBlockSnippets(): BlockSnippet[] {
  const stored = readStoredSnippets()
  const customs = stored.filter((item) => item.custom || !DEFAULT_IDS.has(item.id))
  // Allow overriding default plainText via stored non-custom entries with same id.
  const overrides = new Map(
    stored.filter((item) => DEFAULT_IDS.has(item.id) && !item.custom).map((item) => [item.id, item]),
  )
  const defaults = DEFAULT_BLOCK_SNIPPETS.map((item) => overrides.get(item.id) ?? item)
  return [...defaults, ...customs]
}

export function listCustomBlockSnippets(): BlockSnippet[] {
  return listBlockSnippets().filter((item) => item.custom || item.id.startsWith(CUSTOM_ID_PREFIX))
}

export function saveBlockSnippets(snippets: BlockSnippet[]) {
  persistAll(snippets)
}

export function upsertCustomBlockSnippet(input: {
  id?: string
  name: string
  plainText: string
}): BlockSnippet {
  const name = input.name.trim()
  const plainText = input.plainText.replace(/\r\n/g, '\n')
  if (!name) {
    throw new Error('name is required')
  }
  if (!plainText.trim()) {
    throw new Error('plainText is required')
  }

  const id =
    input.id?.trim() ||
    `${CUSTOM_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  const next: BlockSnippet = { id, name, plainText, custom: true }
  const existing = readStoredSnippets().filter((item) => item.id !== id)
  // Keep only customs + optional overrides in storage; defaults live in code.
  const storedCustoms = existing.filter((item) => item.custom || !DEFAULT_IDS.has(item.id))
  persistAll([...storedCustoms, next])
  return next
}

export function removeCustomBlockSnippet(id: string): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  const existing = readStoredSnippets()
  const next = existing.filter((item) => item.id !== trimmed)
  if (next.length === existing.length) return false
  persistAll(next)
  return true
}

export function slugifySnippetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
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
