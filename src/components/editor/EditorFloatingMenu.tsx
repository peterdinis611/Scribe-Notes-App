import { FloatingMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shouldShowInsertMenu } from '@/lib/editor/list-commands'
import { openSlashPalette } from '@/lib/editor/slash-commands'

type EditorFloatingMenuProps = {
  editor: Editor | null
}

export function EditorFloatingMenu({ editor }: EditorFloatingMenuProps) {
  const { t } = useTranslation()
  if (!editor) return null

  return (
    <FloatingMenu
      editor={editor}
      className="titlebar-no-drag flex items-center"
      options={{
        placement: 'left',
        offset: 6,
        flip: { padding: 12 },
        shift: { padding: 12 },
      }}
      shouldShow={({ editor: currentEditor }) => {
        // Empty document already has the placeholder / print hero — keep the + for later empty lines.
        if (currentEditor.isEmpty) return false
        return shouldShowInsertMenu(currentEditor, null)
      }}
    >
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-[var(--color-muted-foreground)] opacity-55 transition-[opacity,background,color,border-color] duration-120 hover:border-[var(--color-border)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] hover:opacity-100 focus-visible:border-[var(--color-border)] focus-visible:bg-[var(--color-hover)] focus-visible:text-[var(--color-foreground)] focus-visible:opacity-100"
        aria-label={t('editorActions.insertBlock')}
        title={t('editorActions.insertBlockHint')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => openSlashPalette(editor)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </FloatingMenu>
  )
}
