import type { Editor } from '@tiptap/react'
import i18n from '@/i18n'
import { runAiAction } from '@/lib/ai/actions'
import { isAiAvailable } from '@/lib/ai/config'
import {
  openAiResultDialog,
  resolveAiResultDialog,
  updateAiResultDialog,
} from '@/lib/ai/ai-result-dialog'
import { DOCUMENT_AI_ACTION_IDS, type AiActionId } from '@/lib/ai/types'
import { toast } from '@/lib/toast'

function getSelectedPlainText(editor: Editor): { from: number; to: number; text: string } | null {
  const { from, to, empty } = editor.state.selection
  if (empty) return null
  const text = editor.state.doc.textBetween(from, to, ' ').trim()
  if (!text) return null
  return { from, to, text }
}

function isDocumentAction(action: AiActionId) {
  return DOCUMENT_AI_ACTION_IDS.includes(action)
}

export async function runAiEditorAction(editor: Editor | null, action: AiActionId): Promise<void> {
  if (!editor || editor.isDestroyed) return
  if (!isAiAvailable()) return

  const selection = getSelectedPlainText(editor)
  const allowDocumentScope = isDocumentAction(action)

  let sourceText = selection?.text ?? ''
  let applyMode: 'replace-selection' | 'insert-at-end' | 'insert-at-cursor' = 'replace-selection'

  if (!selection) {
    if (!allowDocumentScope) {
      toast.error(i18n.t('ai.noSelection'))
      return
    }
    sourceText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n').trim()
    if (!sourceText) {
      toast.error(i18n.t('ai.noDocumentText'))
      return
    }
    applyMode = action === 'continueWriting' ? 'insert-at-cursor' : 'insert-at-end'
  }

  const controller = new AbortController()
  const title = i18n.t(`ai.actions.${action}`)

  const dialogPromise = openAiResultDialog({
    title,
    loading: true,
    onCancel: () => controller.abort(),
  })

  try {
    const result = await runAiAction(action, sourceText, controller.signal)
    updateAiResultDialog({ loading: false, result })
    const choice = await dialogPromise

    if (choice !== 'apply') return

    if (applyMode === 'replace-selection' && selection) {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: selection.from, to: selection.to }, result)
        .run()
      return
    }

    if (applyMode === 'insert-at-cursor') {
      editor.chain().focus().insertContent(result).run()
      return
    }

    const end = editor.state.doc.content.size
    editor
      .chain()
      .focus()
      .insertContentAt(end, [
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: title }] },
        { type: 'paragraph', content: [{ type: 'text', text: result }] },
      ])
      .run()
  } catch (error) {
    resolveAiResultDialog('cancel')
    if (controller.signal.aborted) return
    toast.error(
      i18n.t('ai.error'),
      error instanceof Error ? error.message : String(error),
    )
  }
}
