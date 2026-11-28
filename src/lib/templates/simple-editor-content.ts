import type { JSONContent } from '@tiptap/core'

/** Node types accepted by the custom-template simple TipTap stack. */
export const SIMPLE_EDITOR_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'hardBreak',
  'horizontalRule',
  'code',
])

/** Mark types accepted by the simple TipTap stack. */
export const SIMPLE_EDITOR_MARK_TYPES = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
])

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export function walkJsonContent(
  node: JSONContent | null | undefined,
  visit: (node: JSONContent) => void,
): void {
  if (!node || typeof node !== 'object') return
  visit(node)
  if (Array.isArray(node.content)) {
    for (const child of node.content) walkJsonContent(child, visit)
  }
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (mark && typeof mark === 'object') visit(mark as JSONContent)
    }
  }
}

/** Returns type names that the simple editor cannot round-trip. */
export function collectUnsupportedSimpleEditorTypes(content: JSONContent): string[] {
  const found = new Set<string>()
  walkJsonContent(content, (node) => {
    const type = typeof node.type === 'string' ? node.type : null
    if (!type) return
    if (SIMPLE_EDITOR_NODE_TYPES.has(type) || SIMPLE_EDITOR_MARK_TYPES.has(type)) return
    found.add(type)
  })
  return [...found].sort()
}

export function hasUnsupportedSimpleEditorNodes(content: JSONContent): boolean {
  return collectUnsupportedSimpleEditorTypes(content).length > 0
}

export function parseTemplateContentJson(raw: string): {
  content: JSONContent
  corrupt: boolean
} {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { content: structuredClone(EMPTY_DOC), corrupt: true }
    }
    const content = parsed as JSONContent
    if (content.type !== 'doc') {
      return { content: structuredClone(EMPTY_DOC), corrupt: true }
    }
    return { content, corrupt: false }
  } catch {
    return { content: structuredClone(EMPTY_DOC), corrupt: true }
  }
}
