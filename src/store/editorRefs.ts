import type { EditorModeActions } from '@/store/settingsSlice'

export const editorRefs = {
  flushAutoSave: null as (() => Promise<void>) | null,
  printHandler: null as (() => void) | null,
  modeActions: null as EditorModeActions | null,
}
