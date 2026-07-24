import type { Editor } from '@tiptap/react'
import i18n from '@/i18n'
import { runAiAction } from '@/lib/ai/actions'
import { isAiAvailable } from '@/lib/ai/config'
import {
  openAiResultDialog,
  resolveAiResultDialog,
  updateAiResultDialog,
} from '@/lib/ai/ai-result-dialog'
import type { AiActionId } from '@/lib/ai/types'
import { toast } from '@/lib/toast'

function getSelectedPlainText(editor: Editor): { from: number; to: number; text: string } | null {
  const { from, to, empty } = editor.state.selection
  if (empty) return null
  const text = editor.state.doc.textBetween(from, to, ' ').trim()
  if (!text) return null
  return { from, to, text }
}

export async function runAiEditorAction(editor: Editor | null, action: AiActionId): Promise<void> {
  if (!editor || editor.isDestroyed) return
  if (!isAiAvailable()) return

  const selection = getSelectedPlainText(editor)
  if (!selection) {
    toast.error(i18n.t('ai.noSelection'))
    return
  }

  const controller = new AbortController()
  const title = i18n.t(`ai.actions.${action}`)

  const dialogPromise = openAiResultDialog({
    title,
    loading: true,
    onCancel: () => controller.abort(),
  })

  try {
    const result = await runAiAction(action, selection.text, controller.signal)
    updateAiResultDialog({ loading: false, result })
    const choice = await dialogPromise

    if (choice === 'apply') {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: selection.from, to: selection.to }, result)
        .run()
    }
  } catch (error) {
    resolveAiResultDialog('cancel')
    if (controller.signal.aborted) return
    toast.error(
      i18n.t('ai.error'),
      error instanceof Error ? error.message : String(error),
    )
  }
}
