import type { Editor } from '@tiptap/react'
import type { EditorModeActions } from '@/store/settingsSlice'

export const editorRefs = {
  editor: null as Editor | null,
  flushAutoSave: null as (() => Promise<void>) | null,
  printHandler: null as (() => void) | null,
  modeActions: null as EditorModeActions | null,
}
