import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import { getActiveBlockRange } from '@/lib/editor/block-move'
import { moveBlock, NoOpMove } from '@/lib/editor/block-drag'

function createEditor(content: object) {
  return new Editor({
    extensions: [StarterKit],
    content,
  })
}

function getBlockStarts(editor: Editor) {
  const starts: number[] = []
  editor.state.doc.forEach((_node, offset) => {
    starts.push(offset)
  })
  return starts
}

function runMove(editor: Editor, fromStart: number, insertPos: number) {
  return pipe(
    moveBlock(editor, fromStart, insertPos),
    Effect.match({
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: () => ({ ok: true as const }),
    }),
    Effect.runSync,
  )
}

describe('block-drag domain', () => {
  it('moves a paragraph down in the document', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
      ],
    })

    editor.commands.setTextSelection(2)
    const block = getActiveBlockRange(editor)
    expect(block).not.toBeNull()

    const thirdBlockStart = getBlockStarts(editor)[2]
    const result = runMove(editor, block!.start, thirdBlockStart)
    expect(result.ok).toBe(true)
    expect(editor.getJSON().content?.map((node: { content?: { text?: string }[] }) => node.content?.[0]?.text)).toEqual([
      'Second',
      'First',
      'Third',
    ])

    editor.destroy()
  })

  it('moves a paragraph up in the document', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    })

    editor.commands.setTextSelection(10)
    const block = getActiveBlockRange(editor)
    expect(block).not.toBeNull()

    const firstBlockStart = getBlockStarts(editor)[0]
    const result = runMove(editor, block!.start, firstBlockStart)
    expect(result.ok).toBe(true)
    expect(editor.getJSON().content?.map((node: { content?: { text?: string }[] }) => node.content?.[0]?.text)).toEqual([
      'Second',
      'First',
    ])

    editor.destroy()
  })

  it('returns NoOpMove for drops on the same block', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only' }] }],
    })

    editor.commands.setTextSelection(2)
    const block = getActiveBlockRange(editor)
    expect(block).not.toBeNull()

    const result = runMove(editor, block!.start, block!.end)
    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(NoOpMove)
    expect(editor.getText()).toBe('Only')

    editor.destroy()
  })
})

describe('block-drag-handle compatibility', () => {
  it('keeps boolean moveBlockToPosition API', async () => {
    const { moveBlockToPosition } = await import('@/lib/editor/block-drag-handle')
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    })

    editor.commands.setTextSelection(2)
    const block = getActiveBlockRange(editor)
    expect(block).not.toBeNull()

    const secondStart = getBlockStarts(editor)[1]
    const secondNode = editor.state.doc.nodeAt(secondStart)
    expect(secondNode).not.toBeNull()

    const moved = moveBlockToPosition(editor, block!.start, secondStart + secondNode!.nodeSize)
    expect(moved).toBe(true)
    expect(editor.getJSON().content?.map((node: { content?: { text?: string }[] }) => node.content?.[0]?.text)).toEqual([
      'B',
      'A',
    ])

    editor.destroy()
  })
})
