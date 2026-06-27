import type { BlockRange } from '@/lib/editor/block-move'
import type { DropTarget } from '@/lib/editor/block-drag/types'

export function cleanupDragArtifacts() {
  document.body.classList.remove('is-block-dragging')
  document.querySelectorAll('.editor-block-drag-ghost, .editor-block-drop-indicator').forEach((node) => {
    node.remove()
  })
  document.querySelectorAll('.is-block-drag-source, .is-block-drag-hover').forEach((node) => {
    node.classList.remove('is-block-drag-source', 'is-block-drag-hover')
  })
}

export function createDragGhost(range: BlockRange): HTMLElement {
  const ghost = document.createElement('div')
  ghost.className = 'editor-block-drag-ghost'

  const preview = document.createElement('div')
  preview.className = 'editor-block-drag-ghost-preview'
  const label = range.node.textContent.trim().replace(/\s+/g, ' ')
  preview.textContent = label.length > 0 ? label.slice(0, 96) : 'Prázdny blok'
  ghost.appendChild(preview)

  document.body.appendChild(ghost)
  return ghost
}

export function positionDragGhost(ghost: HTMLElement, x: number, y: number) {
  ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`
}

export function createDropIndicator(): HTMLElement {
  const line = document.createElement('div')
  line.className = 'editor-block-drop-indicator'
  line.style.position = 'fixed'
  line.style.height = '3px'
  line.style.pointerEvents = 'none'
  line.style.zIndex = '80'
  document.body.appendChild(line)
  return line
}

export function positionDropIndicator(indicator: HTMLElement, target: DropTarget) {
  indicator.style.top = `${target.lineTop - 1}px`
  indicator.style.left = `${target.lineLeft}px`
  indicator.style.width = `${target.lineWidth}px`
  indicator.style.display = 'block'
}

export function hideDropIndicator(indicator: HTMLElement) {
  indicator.style.display = 'none'
}
