import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { Clipboard, ClipboardList, PanelRightClose, Trash2 } from 'lucide-react'
import {
  clearClipboardHistory,
  CLIPBOARD_HISTORY_LIMIT,
  previewClipboardText,
  rememberClipboardItem,
  type ClipboardHistoryItem,
} from '@/lib/editor/clipboard-history'
import { useClipboardHistory } from '@/hooks/useClipboardHistory'
import { cn, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  EditorSidePanel,
  EditorSidePanelEmpty,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
  EditorSidePanelList,
} from '@/components/editor/EditorSidePanelPrimitives'

type ClipboardHistoryPanelProps = {
  editor: Editor | null
  onClose: () => void
  onInsertPlain?: (text: string) => void
}

function insertClip(editor: Editor, item: ClipboardHistoryItem) {
  const html = item.html?.trim()
  if (html) {
    editor.chain().focus().insertContent(html).run()
    return
  }
  editor.chain().focus().insertContent(item.text).run()
}

export function ClipboardHistoryPanel({ editor, onClose, onInsertPlain }: ClipboardHistoryPanelProps) {
  const { t } = useTranslation()
  const items = useClipboardHistory()

  const pasteItem = useCallback(
    (item: ClipboardHistoryItem) => {
      if (onInsertPlain) {
        onInsertPlain(item.text)
      } else if (editor && !editor.isDestroyed) {
        insertClip(editor, item)
      } else {
        return
      }
      rememberClipboardItem({ text: item.text, html: item.html })
    },
    [editor, onInsertPlain],
  )

  const copyItem = useCallback(
    async (item: ClipboardHistoryItem) => {
      try {
        await navigator.clipboard.writeText(item.text)
      } catch {
        toast.error(t('panels.clipboard.copyError'))
        return
      }
      rememberClipboardItem({ text: item.text, html: item.html })
      toast.success(t('panels.clipboard.copied'))
    },
    [t],
  )

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label={t('editorPanels.clipboard')}>
      <EditorSidePanelHeader
        title={t('editorPanels.clipboard')}
        subtitle={t('panels.clipboard.subtitle', { count: items.length, limit: CLIPBOARD_HISTORY_LIMIT })}
        actions={
          <div className="flex items-center gap-0.5">
            {items.length > 0 ? (
              <EditorSidePanelIconButton
                aria-label={t('panels.clipboard.clear')}
                title={t('panels.clipboard.clear')}
                onClick={() => clearClipboardHistory()}
              >
                <Trash2 className="h-4 w-4" />
              </EditorSidePanelIconButton>
            ) : null}
            <EditorSidePanelIconButton aria-label={t('panels.clipboard.hide')} onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </EditorSidePanelIconButton>
          </div>
        }
      />

      {items.length === 0 ? (
        <EditorSidePanelEmpty>
          <ClipboardList className="h-7 w-7 text-[var(--color-accent)]" aria-hidden="true" />
          <p className="m-0 font-semibold text-[var(--color-foreground)]">{t('panels.clipboard.empty')}</p>
          <p className="m-0 max-w-[220px]">{t('panels.clipboard.emptyHint')}</p>
        </EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList className="clipboard-history-list">
          {items.map((item, index) => (
            <div key={item.id} className="clipboard-history-slip">
              <span className="clipboard-history-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                className="clipboard-history-paste"
                onClick={() => pasteItem(item)}
              >
                <span className="clipboard-history-preview">{previewClipboardText(item.text)}</span>
                <span className="clipboard-history-meta">
                  {formatRelativeTime(Math.floor(item.copiedAt / 1000))}
                  {item.html ? ` · ${t('panels.clipboard.rich')}` : ''}
                </span>
              </button>
              <button
                type="button"
                className={cn('clipboard-history-copy')}
                aria-label={t('panels.clipboard.copy')}
                title={t('panels.clipboard.copy')}
                onClick={() => void copyItem(item)}
              >
                <Clipboard className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </EditorSidePanelList>
      )}
    </EditorSidePanel>
  )
}
