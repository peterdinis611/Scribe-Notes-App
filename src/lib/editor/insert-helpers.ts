import type { Editor } from '@tiptap/react'
import { MATH_JS_EXAMPLES, promptMathExpression } from '@/lib/editor/math-js'

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

export function insertYoutubeVideo(editor: Editor) {
  const url = window.prompt('YouTube URL', 'https://www.youtube.com/watch?v=')
  if (!url?.trim()) return
  editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run()
}

export function insertDetailsBlock(editor: Editor) {
  editor.chain().focus().setDetails().run()
}
