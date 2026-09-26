import type { Editor, JSONContent } from '@tiptap/core'
import i18n from '@/i18n'
import { promptInput } from '@/lib/input-dialog'
import { kvGet, kvSet } from '@/lib/storage/kv'
import { toast } from '@/lib/toast'

export type BlockSnippet = {
  id: string
  name: string
  /**
   * TipTap-oriented plain text; used when `content` is missing and for
   * editing / search. Prefer `content` for insert fidelity.
   */
  plainText?: string
  /** TipTap JSON nodes (doc fragment). Preferred over `plainText` on insert. */
  content?: JSONContent[]
  /** True for user-created snippets (persisted). */
  custom?: boolean
}

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

function isJsonContent(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as JSONContent).type === 'string',
  )
}

function normalizeContentField(value: unknown): JSONContent[] | undefined {
  if (Array.isArray(value)) {
    const nodes = value.filter(isJsonContent)
    return nodes.length > 0 ? nodes : undefined
  }
  if (isJsonContent(value)) return [value]
  return undefined
}

function isValidSnippet(item: unknown): item is BlockSnippet {
  if (!item || typeof item !== 'object') return false
  const candidate = item as BlockSnippet
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return false
  const hasPlain = typeof candidate.plainText === 'string'
  const content = normalizeContentField(candidate.content)
  return hasPlain || Boolean(content)
}

function readStoredSnippets(): BlockSnippet[] {
  try {
    const raw = kvGet(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidSnippet).map((item) => ({
      ...item,
      content: normalizeContentField(item.content),
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

export function plainTextFromJsonContent(nodes: JSONContent[]): string {
  const parts: string[] = []

  const walk = (node: JSONContent) => {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text)
      return
    }
    if (node.type === 'hardBreak') {
      parts.push('\n')
      return
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'blockquote' ||
      node.type === 'codeBlock' ||
      node.type === 'horizontalRule'
    ) {
      parts.push('\n')
    }
  }

  for (const node of nodes) walk(node)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function upsertCustomBlockSnippet(input: {
  id?: string
  name: string
  plainText?: string
  content?: JSONContent | JSONContent[]
}): BlockSnippet {
  const name = input.name.trim()
  if (!name) {
    throw new Error('name is required')
  }

  const content = normalizeContentField(input.content)
  const plainText = (input.plainText ?? (content ? plainTextFromJsonContent(content) : '')).replace(
    /\r\n/g,
    '\n',
  )

  if (!content && !plainText.trim()) {
    throw new Error('plainText or content is required')
  }

  const id =
    input.id?.trim() ||
    `${CUSTOM_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  const next: BlockSnippet = {
    id,
    name,
    plainText,
    ...(content ? { content } : {}),
    custom: true,
  }
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

export function plainTextToTipTapContent(text: string): JSONContent[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const content: JSONContent[] = []
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

/** Prefer stored TipTap JSON; fall back to plain-text conversion. */
export function resolveSnippetInsertContent(snippet: BlockSnippet): JSONContent[] {
  const fromJson = normalizeContentField(snippet.content)
  if (fromJson) return normalizeSnippetFragment(fromJson)
  return plainTextToTipTapContent(snippet.plainText ?? '')
}

function isInlineJsonNode(node: JSONContent): boolean {
  return node.type === 'text' || node.type === 'hardBreak' || node.type === 'emoji'
}

/** Wrap bare inline nodes so insertContent gets a valid block fragment. */
export function normalizeSnippetFragment(nodes: JSONContent[]): JSONContent[] {
  if (nodes.length === 0) return [{ type: 'paragraph' }]
  if (nodes.every(isInlineJsonNode)) {
    return [{ type: 'paragraph', content: nodes }]
  }
  return nodes
}

/**
 * Capture the current selection as a reusable snippet fragment.
 * Returns null when the selection is empty.
 */
export function captureSelectionAsSnippet(editor: Editor): {
  plainText: string
  content: JSONContent[]
} | null {
  const { from, to, empty } = editor.state.selection
  if (empty) return null

  const plainText = editor.state.doc.textBetween(from, to, '\n', '\n').replace(/\r\n/g, '\n')
  const slice = editor.state.selection.content()
  const raw = slice.content.toJSON() as JSONContent[] | JSONContent | null
  const content = normalizeContentField(raw)
  if (!content || content.length === 0) return null

  return {
    plainText,
    content: normalizeSnippetFragment(content),
  }
}

export function insertBlockSnippet(editor: Editor, snippetId: string): boolean {
  const snippet = listBlockSnippets().find((entry) => entry.id === snippetId)
  if (!snippet) return false
  editor.chain().focus().insertContent(resolveSnippetInsertContent(snippet)).run()
  return true
}

/**
 * Prompt for a name (and optional body), persist a custom snippet, and insert it.
 * When the editor has a selection, the TipTap slice is stored as JSON.
 */
export async function createCustomBlockFromEditor(editor: Editor): Promise<BlockSnippet | null> {
  const selection = captureSelectionAsSnippet(editor)
  const name = await promptInput({
    title: i18n.t('slash.customBlock.nameTitle'),
    description: i18n.t('slash.customBlock.nameDescription'),
    placeholder: i18n.t('slash.customBlock.namePlaceholder'),
    confirmLabel: i18n.t('common.next'),
  })
  if (!name?.trim()) return null

  let plainText: string
  let content: JSONContent[] | undefined

  if (selection) {
    const body = await promptInput({
      title: i18n.t('slash.customBlock.bodyTitle'),
      description: i18n.t('slash.customBlock.bodyDescriptionSelection'),
      defaultValue: selection.plainText,
      placeholder: i18n.t('slash.customBlock.bodyPlaceholder'),
      confirmLabel: i18n.t('slash.customBlock.save'),
      multiline: true,
    })
    if (body == null) return null
    const trimmed = body.replace(/\r\n/g, '\n')
    if (trimmed.trim() && trimmed.trim() !== selection.plainText.trim()) {
      // User edited the body — treat as plain-text snippet.
      plainText = trimmed
      content = undefined
    } else if (!trimmed.trim()) {
      return null
    } else {
      // Keep rich slice JSON when the body matches the selection.
      plainText = selection.plainText
      content = selection.content
    }
  } else {
    const body = await promptInput({
      title: i18n.t('slash.customBlock.bodyTitle'),
      description: i18n.t('slash.customBlock.bodyDescription'),
      defaultValue: '## \n\n',
      placeholder: i18n.t('slash.customBlock.bodyPlaceholder'),
      confirmLabel: i18n.t('slash.customBlock.save'),
      multiline: true,
    })
    if (body == null || !body.trim()) return null
    plainText = body
    content = undefined
  }

  try {
    const snippet = upsertCustomBlockSnippet({
      name: name.trim(),
      plainText,
      content,
    })
    editor.chain().focus().insertContent(resolveSnippetInsertContent(snippet)).run()
    toast.success(i18n.t('slash.customBlock.saved'), snippet.name)
    return snippet
  } catch (error) {
    toast.error(i18n.t('slash.customBlock.saveFailed'), String(error))
    return null
  }
}
