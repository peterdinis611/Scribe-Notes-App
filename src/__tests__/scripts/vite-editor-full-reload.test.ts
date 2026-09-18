import { describe, expect, it } from 'vitest'
import { shouldFullReloadEditor } from '../../../scripts/vite-editor-full-reload'

describe('shouldFullReloadEditor', () => {
  it('reloads TipTap / editor module changes', () => {
    expect(shouldFullReloadEditor('/Users/me/scribe/src/lib/editor/tauri-input-fix.ts')).toBe(true)
    expect(shouldFullReloadEditor('/Users/me/scribe/src/components/editor/ClipboardHistoryPanel.tsx')).toBe(true)
    expect(shouldFullReloadEditor('/Users/me/scribe/src/components/editor-toolbar/ToolbarRibbon.tsx')).toBe(true)
    expect(shouldFullReloadEditor('/Users/me/scribe/src/components/DocumentEditor.tsx')).toBe(true)
    expect(shouldFullReloadEditor('/Users/me/scribe/src/hooks/useEditorHotkeys.ts')).toBe(true)
  })

  it('leaves unrelated files to normal HMR', () => {
    expect(shouldFullReloadEditor('/Users/me/scribe/src/components/Sidebar.tsx')).toBe(false)
    expect(shouldFullReloadEditor('/Users/me/scribe/src/i18n/locales/sk.json')).toBe(false)
    expect(shouldFullReloadEditor('/Users/me/scribe/src-tauri/src/lib.rs')).toBe(false)
  })
})
