import { useEffect, useState } from 'react'
import type { Content, Editor } from '@tiptap/react'
import type { SetContentOptions } from '@tiptap/core'

export function getEditorViewDom(editor: Editor | null): HTMLElement | null {
  if (!editor || editor.isDestroyed) return null

  try {
    const dom = editor.view.dom
    return dom instanceof HTMLElement ? dom : null
  } catch {
    return null
  }
}

export function isEditorViewReady(editor: Editor | null): editor is Editor {
  return getEditorViewDom(editor) !== null
}

export function safeEditorCanUndo(editor: Editor): boolean {
  if (!isEditorViewReady(editor)) return false
  try {
    return editor.can().undo()
  } catch {
    return false
  }
}

export function safeEditorCanRedo(editor: Editor): boolean {
  if (!isEditorViewReady(editor)) return false
  try {
    return editor.can().redo()
  } catch {
    return false
  }
}

type SafeSetContentOptions = SetContentOptions

export function setEditorContent(
  editor: Editor | null,
  content: Content | string,
  options?: SafeSetContentOptions,
): boolean {
  if (!isEditorViewReady(editor)) return false

  try {
    editor.commands.setContent(content, options)
    return true
  } catch {
    return false
  }
}

export function runEditorCommand(editor: Editor | null, run: (editor: Editor) => void): boolean {
  if (!isEditorViewReady(editor)) return false

  try {
    run(editor)
    return true
  } catch {
    return false
  }
}

export function useEditorReady(editor: Editor | null): boolean {
  const [ready, setReady] = useState(() => isEditorViewReady(editor))

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      setReady(false)
      return
    }

    const sync = () => setReady(isEditorViewReady(editor))
    sync()
    editor.on('create', sync)
    editor.on('mount', sync)
    editor.on('destroy', () => setReady(false))

    return () => {
      editor.off('create', sync)
      editor.off('mount', sync)
    }
  }, [editor])

  return ready
}

type EditorViewSetup = (editor: Editor, dom: HTMLElement) => void | (() => void)

export function useEditorViewEffect(
  editor: Editor | null,
  setup: EditorViewSetup,
  deps: readonly unknown[] = [],
) {
  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    let cleanup: void | (() => void)

    const attach = () => {
      const dom = getEditorViewDom(editor)
      if (!dom) return
      cleanup?.()
      cleanup = setup(editor, dom)
    }

    const detach = () => {
      if (typeof cleanup === 'function') cleanup()
      cleanup = undefined
    }

    attach()
    editor.on('create', attach)
    editor.on('mount', attach)
    editor.on('unmount', detach)
    editor.on('destroy', detach)

    return () => {
      editor.off('create', attach)
      editor.off('mount', attach)
      editor.off('unmount', detach)
      editor.off('destroy', detach)
      detach()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ...deps])
}
