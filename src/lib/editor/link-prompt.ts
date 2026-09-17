import type { Editor } from '@tiptap/react'
import i18n from '@/i18n'
import { promptInput } from '@/lib/input-dialog'

export async function promptLinkUrl(previous?: string): Promise<string | null> {
  return promptInput({
    title: i18n.t('toolbar.linkDialog.title'),
    description: i18n.t('toolbar.linkDialog.description'),
    defaultValue: previous ?? 'https://',
    placeholder: 'https://',
    confirmLabel: i18n.t('toolbar.linkDialog.confirm'),
  })
}

export function applyEditorLink(editor: Editor, url: string | null) {
  if (url === null) return
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

export async function promptAndApplyEditorLink(editor: Editor) {
  if (editor.isDestroyed) return
  const previous = editor.getAttributes('link').href as string | undefined
  const url = await promptLinkUrl(previous)
  if (editor.isDestroyed) return
  applyEditorLink(editor, url)
}
