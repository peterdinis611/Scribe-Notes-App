import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SyntaxCodeBlock } from '@/lib/editor/code-block-extension'

function Harness() {
  const editor = useEditor({
    extensions: [StarterKit.configure({ codeBlock: false }), SyntaxCodeBlock],
    content: {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'javascript' },
          content: [{ type: 'text', text: 'const n = 1' }],
        },
      ],
    },
    immediatelyRender: true,
  })

  return (
    <TooltipProvider>
      <EditorContent editor={editor} />
    </TooltipProvider>
  )
}

describe('SyntaxCodeBlock', () => {
  it('renders react-syntax-highlighter over an editable code block', async () => {
    render(<Harness />)

    await waitFor(() => {
      expect(document.querySelector('.scribe-code-block')).toBeTruthy()
      expect(document.querySelector('.scribe-syntax')).toBeTruthy()
      expect(document.body.textContent).toContain('const n = 1')
    })
  })
})
