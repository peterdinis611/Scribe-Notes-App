import { useHotkeys } from '@tanstack/react-hotkeys'
import type { Editor } from '@tiptap/react'

export function useEditorHotkeys(editor: Editor | null) {
  useHotkeys(
    [
      {
        hotkey: 'Mod+Z',
        callback: () => editor?.chain().focus().undo().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Späť', description: 'Vráti poslednú zmenu v editore' },
        },
      },
      {
        hotkey: 'Mod+Shift+Z',
        callback: () => editor?.chain().focus().redo().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Znovu', description: 'Opakuje zrušenú zmenu v editore' },
        },
      },
      {
        hotkey: 'Mod+Y',
        callback: () => editor?.chain().focus().redo().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Znovu', description: 'Opakuje zrušenú zmenu v editore' },
        },
      },
    ],
    {
      preventDefault: true,
      ignoreInputs: false,
    },
  )
}
