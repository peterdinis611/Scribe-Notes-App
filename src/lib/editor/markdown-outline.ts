import type { RefObject } from 'react'
import type { DocumentOutlineItem } from '@/lib/editor/document-outline'

export function collectMarkdownHeadingOutline(markdown: string): DocumentOutlineItem[] {
  const lines = markdown.split('\n')
  const items: DocumentOutlineItem[] = []
  let offset = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    offset += line.length + 1
    if (!match) continue

    const depth = match[1]!.length - 1
    const preview = match[2]!.trim()
    const charOffset = offset - line.length - 1

    items.push({
      id: `md-heading-${lineIndex}`,
      pos: charOffset,
      kind: 'heading',
      label: `Nadpis ${depth + 1}`,
      preview,
      depth,
    })
  }

  return items
}

export function jumpToMarkdownOutlineItem(
  textarea: HTMLTextAreaElement,
  scrollRef: RefObject<HTMLElement | null>,
  item: DocumentOutlineItem,
) {
  const value = textarea.value
  const charOffset = Math.max(0, Math.min(item.pos, value.length))
  const lineStart = charOffset === 0 ? 0 : value.lastIndexOf('\n', charOffset - 1) + 1
  const lineEnd = value.indexOf('\n', lineStart)
  const selectionEnd = lineEnd === -1 ? value.length : lineEnd

  textarea.focus()
  textarea.setSelectionRange(lineStart, selectionEnd)

  const scrollEl = scrollRef.current
  if (!scrollEl) return

  const lineIndex = value.slice(0, lineStart).split('\n').length - 1
  const style = window.getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(style.lineHeight) || 24
  const paddingTop = Number.parseFloat(style.paddingTop) || 0
  const targetTop = textarea.offsetTop + paddingTop + lineIndex * lineHeight - scrollEl.clientHeight / 3

  scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
}
