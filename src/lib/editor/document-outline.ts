import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

export type DocumentOutlineKind =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'listItem'
  | 'taskItem'
  | 'table'
  | 'image'
  | 'youtube'
  | 'details'
  | 'pageBreak'
  | 'mathInline'
  | 'mathBlock'

export type DocumentOutlineItem = {
  id: string
  pos: number
  kind: DocumentOutlineKind
  label: string
  preview: string
  depth: number
}

const OUTLINE_NODE_TYPES = new Set<string>([
  'heading',
  'paragraph',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'listItem',
  'taskItem',
  'table',
  'image',
  'youtube',
  'details',
  'pageBreak',
  'mathInline',
  'mathBlock',
])

function truncate(text: string, max = 52) {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function getNodeLabel(node: PMNode) {
  switch (node.type.name) {
    case 'heading':
      return `Nadpis ${node.attrs.level}`
    case 'paragraph':
      return 'Odsek'
    case 'blockquote':
      return 'Citácia'
    case 'codeBlock':
      return 'Kód'
    case 'horizontalRule':
      return 'Oddeľovač'
    case 'listItem':
      return 'Položka zoznamu'
    case 'taskItem':
      return node.attrs.checked ? 'Hotová úloha' : 'Úloha'
    case 'table': {
      const rows = node.childCount
      const cols = node.firstChild?.childCount ?? 0
      return `Tabuľka ${rows}×${cols}`
    }
    case 'image':
      return 'Obrázok'
    case 'youtube':
      return 'YouTube'
    case 'details':
      return 'Rozbaľovacia sekcia'
    case 'pageBreak':
      return 'Zlom strany'
    case 'mathInline':
      return 'Vzorec'
    case 'mathBlock':
      return 'Vzorec (blok)'
    default:
      return node.type.name
  }
}

function getNodePreview(node: PMNode) {
  switch (node.type.name) {
    case 'codeBlock':
      return truncate(node.textContent, 44)
    case 'mathInline':
    case 'mathBlock':
      return truncate(String(node.attrs.expression ?? ''), 44)
    case 'image':
      return truncate(String(node.attrs.alt || node.attrs.title || ''), 44) || 'Bez popisu'
    case 'youtube':
      return truncate(String(node.attrs.src ?? ''), 44) || 'Video'
    case 'horizontalRule':
      return 'Horizontálna čiara'
    case 'pageBreak':
      return 'Nová strana'
    case 'table':
      return 'Tabuľka'
    default:
      return truncate(node.textContent, 52)
  }
}

function getOutlineDepth(doc: PMNode, pos: number, node: PMNode) {
  if (node.type.name === 'heading') {
    return Math.max(0, Number(node.attrs.level ?? 1) - 1)
  }

  const $pos = doc.resolve(pos)
  let depth = 0

  for (let level = $pos.depth; level > 0; level -= 1) {
    const parent = $pos.node(level)
    if (['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem'].includes(parent.type.name)) {
      depth += 1
    }
  }

  return Math.min(depth, 5)
}

function isParagraphInsideList(doc: PMNode, pos: number) {
  const $pos = doc.resolve(pos)
  for (let level = $pos.depth; level > 0; level -= 1) {
    const parent = $pos.node(level)
    if (parent.type.name === 'listItem' || parent.type.name === 'taskItem') {
      return true
    }
  }
  return false
}

function shouldIncludeNode(node: PMNode, doc: PMNode, pos: number) {
  if (node.type.name === 'paragraph' && isParagraphInsideList(doc, pos)) {
    return false
  }

  if (
    node.type.name === 'horizontalRule' ||
    node.type.name === 'pageBreak' ||
    node.type.name === 'image' ||
    node.type.name === 'youtube' ||
    node.type.name === 'table' ||
    node.type.name === 'taskItem'
  ) {
    return true
  }

  return node.textContent.trim().length > 0
}

export function collectDocumentOutline(editor: Editor | null): DocumentOutlineItem[] {
  if (!editor) return []

  const items: DocumentOutlineItem[] = []
  const doc = editor.state.doc

  doc.descendants((node, pos) => {
    const name = node.type.name
    if (!OUTLINE_NODE_TYPES.has(name)) return

    if (!shouldIncludeNode(node, doc, pos)) return

    items.push({
      id: `${pos}-${name}`,
      pos,
      kind: name as DocumentOutlineKind,
      label: getNodeLabel(node),
      preview: getNodePreview(node),
      depth: getOutlineDepth(doc, pos, node),
    })
  })

  return items
}

export function getActiveOutlineItemId(items: DocumentOutlineItem[], selectionFrom: number) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (selectionFrom >= item.pos) return item.id
  }
  return null
}

export function focusOutlineItem(editor: Editor, item: DocumentOutlineItem) {
  const node = editor.state.doc.nodeAt(item.pos)
  if (!node) return

  if (node.isTextblock) {
    const inside = Math.min(item.pos + 1, item.pos + node.nodeSize - 1)
    editor.chain().focus().setTextSelection(inside).scrollIntoView().run()
    return
  }

  if (node.isAtom || node.isBlock) {
    const selection = NodeSelection.create(editor.state.doc, item.pos)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    editor.commands.focus()
    editor.commands.scrollIntoView()
  }
}
