import CodeBlock from '@tiptap/extension-code-block'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CodeBlockView } from '@/components/editor/CodeBlockView'

export const SyntaxCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})
