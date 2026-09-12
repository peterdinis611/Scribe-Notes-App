import type { Editor } from '@tiptap/react'
import { MATH_JS_EXAMPLES, promptMathExpression } from '@/lib/editor/math-js'
import { MERMAID_DEFAULT_SOURCE } from '@/lib/editor/mermaid'
import { generateLoremIpsum, saveLoremOptions } from '@/lib/editor/lorem-ipsum'
import { promptLoremOptions } from '@/lib/lorem-dialog'

export function insertInlineMath(editor: Editor) {
  const expression = promptMathExpression('Matematický výraz v riadku', '', MATH_JS_EXAMPLES.inline)
  if (!expression) return
  editor.chain().focus().insertMathInline({ expression }).run()
}

export function insertBlockMath(editor: Editor) {
  const expression = promptMathExpression('Matematický blok', '', MATH_JS_EXAMPLES.block)
  if (!expression) return
  editor.chain().focus().insertMathBlock({ expression }).run()
}

export function insertMermaidDiagram(editor: Editor) {
  editor.chain().focus().insertMermaidDiagram({ source: MERMAID_DEFAULT_SOURCE }).run()
}

export function insertYoutubeVideo(editor: Editor) {
  const url = window.prompt('YouTube URL', 'https://www.youtube.com/watch?v=')
  if (!url?.trim()) return
  editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run()
}

/** Opens options dialog, then inserts configured lorem ipsum at the cursor. */
export async function insertLoremIpsum(editor: Editor): Promise<boolean> {
  if (editor.isDestroyed) return false
  const options = await promptLoremOptions()
  if (!options || editor.isDestroyed) return false
  const saved = saveLoremOptions(options)
  const text = generateLoremIpsum(saved)
  if (!text.trim()) return false

  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: block }],
    }))

  if (blocks.length === 0) return false
  editor.chain().focus().insertContent(blocks).run()
  return true
}

export async function insertScannedBarcode(editor: Editor): Promise<boolean> {
  const { scanBarcode } = await import('@/lib/barcode-scanner')
  const scanned = await scanBarcode()
  if (!scanned?.content) return false

  const content = scanned.content
  const looksLikeUrl = /^https?:\/\//i.test(content)
  if (looksLikeUrl) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: content,
        marks: [{ type: 'link', attrs: { href: content, target: '_blank' } }],
      })
      .run()
  } else {
    editor.chain().focus().insertContent(content).run()
  }
  return true
}

export function insertDetailsBlock(editor: Editor) {
  editor.chain().focus().setDetails().run()
}
