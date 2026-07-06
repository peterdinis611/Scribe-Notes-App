import { useHotkeys } from '@tanstack/react-hotkeys'
import type { Editor } from '@tiptap/react'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { useAppDispatch } from '@/store/hooks'
import { setFindReplaceMode, setFindReplaceOpen } from '@/store/documentsSlice'

export function useEditorHotkeys(editor: Editor | null) {
  const dispatch = useAppDispatch()

  useHotkeys(
    [
      {
        hotkey: 'Mod+F',
        callback: () => {
          dispatch(setFindReplaceMode('find'))
          dispatch(setFindReplaceOpen(true))
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Hľadať', description: 'Hľadať v dokumente' },
        },
      },
      {
        hotkey: 'Mod+H',
        callback: () => {
          dispatch(setFindReplaceMode('replace'))
          dispatch(setFindReplaceOpen(true))
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Nahradiť', description: 'Hľadať a nahradiť v dokumente' },
        },
      },
      {
        hotkey: 'Mod+Alt+F',
        callback: () => {
          dispatch(setFindReplaceMode('replace'))
          dispatch(setFindReplaceOpen(true))
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Nahradiť', description: 'Hľadať a nahradiť v dokumente' },
        },
      },
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
        hotkey: 'Mod+Shift+8',
        callback: () => {
          if (!editor) return
          insertBulletList(editor)
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Odrážky', description: 'Vložiť odrážkový zoznam' },
        },
      },
      {
        hotkey: 'Mod+Shift+7',
        callback: () => {
          if (!editor) return
          insertOrderedList(editor)
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Číslovaný zoznam', description: 'Vložiť číslovaný zoznam' },
        },
      },
      {
        hotkey: 'Mod+Shift+9',
        callback: () => {
          if (!editor) return
          insertTaskList(editor)
        },
        options: {
          enabled: !!editor,
          meta: { name: 'Checklist', description: 'Vložiť zoznam úloh' },
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
