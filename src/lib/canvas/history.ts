import type { Edge, Node } from '@xyflow/react'
import type { CanvasObjectData } from '@/lib/canvas/flow'

export type CanvasSnapshot = {
  nodes: Node<CanvasObjectData>[]
  edges: Edge[]
}

const MAX_STACK = 50

export function createCanvasHistory(initial?: CanvasSnapshot) {
  let past: CanvasSnapshot[] = []
  let future: CanvasSnapshot[] = []
  let present: CanvasSnapshot = initial
    ? cloneSnapshot(initial)
    : { nodes: [], edges: [] }

  return {
    get present() {
      return present
    },
    canUndo() {
      return past.length > 0
    },
    canRedo() {
      return future.length > 0
    },
    /** Push current present, then set present to the next snapshot. */
    commit(next: CanvasSnapshot) {
      past.push(cloneSnapshot(present))
      if (past.length > MAX_STACK) past.shift()
      present = cloneSnapshot(next)
      future = []
    },
    /** Replace present without creating history (e.g. document load). */
    reset(snapshot: CanvasSnapshot) {
      present = cloneSnapshot(snapshot)
      past = []
      future = []
    },
    /** Sync present after external apply (live drag) without stacking. */
    sync(snapshot: CanvasSnapshot) {
      present = cloneSnapshot(snapshot)
    },
    undo(): CanvasSnapshot | null {
      const prev = past.pop()
      if (!prev) return null
      future.push(cloneSnapshot(present))
      present = prev
      return cloneSnapshot(present)
    },
    redo(): CanvasSnapshot | null {
      const next = future.pop()
      if (!next) return null
      past.push(cloneSnapshot(present))
      present = next
      return cloneSnapshot(present)
    },
  }
}

export type CanvasHistory = ReturnType<typeof createCanvasHistory>

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
      style: node.style ? { ...node.style } : undefined,
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
  }
}

export const CANVAS_CLIPBOARD_MIME = 'application/x-scribe-canvas-objects'

export type CanvasClipboardPayload = {
  type: typeof CANVAS_CLIPBOARD_MIME
  objects: Array<
    CanvasObjectData & { id: string; x: number; y: number; w: number; h: number }
  >
}

export function buildClipboardPayload(nodes: Node<CanvasObjectData>[]): string {
  const objects = nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    w: node.width ?? 160,
    h: node.height ?? 120,
    ...node.data,
  }))
  return JSON.stringify({ type: CANVAS_CLIPBOARD_MIME, objects })
}

export function parseClipboardPayload(raw: string): CanvasClipboardPayload['objects'] | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasClipboardPayload>
    if (parsed.type !== CANVAS_CLIPBOARD_MIME || !Array.isArray(parsed.objects)) return null
    return parsed.objects as CanvasClipboardPayload['objects']
  } catch {
    return null
  }
}
