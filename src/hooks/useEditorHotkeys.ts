import { useHotkeys } from '@tanstack/react-hotkeys'
import type { Editor } from '@tiptap/react'
import i18n from '@/i18n'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setFindReplaceMode, setFindReplaceOpen } from '@/store/documentsSlice'

function hotkeyMeta(key: string) {
  return {
    name: i18n.t(`shortcuts.${key}.label`),
    description: i18n.t(`shortcuts.${key}.description`),
  }
}

export function useEditorHotkeys(editor: Editor | null) {
  const dispatch = useAppDispatch()
  const findReplaceOpen = useAppSelector((state) => state.documents.findReplaceOpen)

  useHotkeys(
    [
      {
        hotkey: 'Mod+F',
        callback: () => {
          if (findReplaceOpen) {
            dispatch(setFindReplaceOpen(false))
            return
          }
          dispatch(setFindReplaceMode('find'))
          dispatch(setFindReplaceOpen(true))
        },
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('find'),
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
          meta: hotkeyMeta('findReplace'),
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
          meta: hotkeyMeta('findReplace'),
        },
      },
      {
        hotkey: 'Escape',
        callback: () => {
          if (!findReplaceOpen) return
          dispatch(setFindReplaceOpen(false))
        },
        options: {
          enabled: !!editor && findReplaceOpen,
          meta: hotkeyMeta('closeFind'),
        },
      },
      {
        hotkey: 'Mod+Z',
        callback: () => editor?.chain().focus().undo().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('undo'),
        },
      },
      {
        hotkey: 'Mod+Shift+Z',
        callback: () => editor?.chain().focus().redo().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('redo'),
        },
      },
      {
        hotkey: 'Mod+Y',
        callback: () => editor?.chain().focus().redo().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('redo'),
        },
      },
      {
        hotkey: 'Mod+B',
        callback: () => editor?.chain().focus().toggleBold().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('bold'),
        },
      },
      {
        hotkey: 'Mod+I',
        callback: () => editor?.chain().focus().toggleItalic().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('italic'),
        },
      },
      {
        hotkey: 'Mod+U',
        callback: () => editor?.chain().focus().toggleUnderline().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('underline'),
        },
      },
      {
        hotkey: 'Mod+Shift+X',
        callback: () => editor?.chain().focus().toggleStrike().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('strike'),
        },
      },
      {
        hotkey: 'Mod+E',
        callback: () => editor?.chain().focus().toggleCode().run(),
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('inlineCode'),
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
          meta: hotkeyMeta('bulletList'),
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
          meta: hotkeyMeta('orderedList'),
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
          meta: hotkeyMeta('taskList'),
        },
      },
      {
        hotkey: 'Mod+K',
        callback: () => {
          if (!editor) return
          const previous = editor.getAttributes('link').href as string | undefined
          const url = window.prompt(i18n.t('editorActions.linkUrlPrompt'), previous ?? 'https://')
          if (url === null) return
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        },
        options: {
          enabled: !!editor,
          meta: hotkeyMeta('link'),
        },
      },
    ],
    {
      preventDefault: true,
      ignoreInputs: false,
    },
  )
}
