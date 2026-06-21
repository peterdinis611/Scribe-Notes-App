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
      {
        hotkey: 'Mod+B',
        callback: () => editor?.chain().focus().toggleBold().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Tučné', description: 'Prepnúť tučné písmo' },
        },
      },
      {
        hotkey: 'Mod+I',
        callback: () => editor?.chain().focus().toggleItalic().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Kurzíva', description: 'Prepnúť kurzívu' },
        },
      },
      {
        hotkey: 'Mod+U',
        callback: () => editor?.chain().focus().toggleUnderline().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Podčiarknutie', description: 'Prepnúť podčiarknutie' },
        },
      },
      {
        hotkey: 'Mod+Shift+X',
        callback: () => editor?.chain().focus().toggleStrike().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Prečiarknuté', description: 'Prepnúť prečiarknutie' },
        },
      },
      {
        hotkey: 'Mod+E',
        callback: () => editor?.chain().focus().toggleCode().run(),
        options: {
          enabled: !!editor,
          meta: { name: 'Inline kód', description: 'Prepnúť inline kód' },
        },
      },
      {
        hotkey: 'Mod+K',
        callback: () => {
          if (!editor) return
          const previous = editor.getAttributes('link').href as string | undefined
          const url = window.prompt('URL odkazu', previous ?? 'https://')
          if (url === null) return
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Odkaz', description: 'Vložiť alebo upraviť odkaz' },
        },
      },
    ],
    {
      preventDefault: true,
      ignoreInputs: false,
    },
  )
}
