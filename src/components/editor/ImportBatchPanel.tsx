import { FileStack, PanelRightClose, Trash2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  EditorSidePanel,
  EditorSidePanelEmpty,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
  EditorSidePanelList,
} from '@/components/editor/EditorSidePanelPrimitives'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prefetchDocument } from '@/lib/cache/prefetch-document'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearImportBatch,
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
} from '@/store/documentsSlice'

type ImportBatchPanelProps = {
  onClose: () => void
}

export function ImportBatchPanel({ onClose }: ImportBatchPanelProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const batch = useAppSelector((state) => state.documents.importBatch)
  const documents = useAppSelector((state) => state.documents.documents)

  const items = (batch?.items ?? []).filter((item) =>
    documents.some((doc) => doc.id === item.id && doc.deletedAt == null),
  )

  async function openItem(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) {
      dispatch(setActiveDocument(cached))
      dispatch(setSaveStatus('saved'))
    } else {
      prefetchDocument(id, 'high')
    }
    await navigate(ROUTES.document(id))
  }

  function handleClear() {
    dispatch(clearImportBatch())
  }

  return (
    <EditorSidePanel aria-label={t('panels.importBatch.ariaLabel')}>
      <EditorSidePanelHeader
        title={t('panels.importBatch.title')}
        subtitle={
          items.length === 0
            ? t('panels.importBatch.emptySubtitle')
            : t('panels.importBatch.count', { count: items.length })
        }
        actions={
          <>
            {items.length > 0 ? (
              <EditorSidePanelIconButton
                title={t('panels.importBatch.clear')}
                aria-label={t('panels.importBatch.clear')}
                onClick={handleClear}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </EditorSidePanelIconButton>
            ) : null}
            <EditorSidePanelIconButton
              title={t('panels.importBatch.hide')}
              aria-label={t('panels.importBatch.hide')}
              onClick={onClose}
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </EditorSidePanelIconButton>
          </>
        }
      />

      {items.length === 0 ? (
        <EditorSidePanelEmpty>
          <FileStack className="mb-2 h-8 w-8 opacity-40" aria-hidden />
          <p className="m-0 text-[12px] font-medium">{t('panels.importBatch.empty')}</p>
          <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
            {t('panels.importBatch.emptyHint')}
          </p>
        </EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList>
          {items.map((item, index) => {
            const active = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-foreground)]'
                    : 'hover:bg-[var(--color-muted)]/60',
                )}
                onClick={() => void openItem(item.id)}
                aria-current={active ? 'true' : undefined}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                    active
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium leading-snug">
                    {item.title.trim() || t('panels.importBatch.untitled')}
                  </span>
                  {active ? (
                    <span className="mt-0.5 block text-[10px] text-[var(--color-muted-foreground)]">
                      {t('panels.importBatch.openNow')}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </EditorSidePanelList>
      )}

      {items.length > 1 ? (
        <div className="border-t border-[var(--color-border)] px-3 py-2.5">
          <p className="m-0 text-[11px] text-[var(--color-muted-foreground)]">
            {t('panels.importBatch.hint')}
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-[11px]"
              disabled={!activeId || items[0]?.id === activeId}
              onClick={() => {
                const idx = items.findIndex((item) => item.id === activeId)
                const prev = items[Math.max(0, idx <= 0 ? 0 : idx - 1)]
                if (prev) void openItem(prev.id)
              }}
            >
              {t('panels.importBatch.prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-[11px]"
              disabled={!activeId || items[items.length - 1]?.id === activeId}
              onClick={() => {
                const idx = items.findIndex((item) => item.id === activeId)
                const next = items[Math.min(items.length - 1, idx < 0 ? 0 : idx + 1)]
                if (next) void openItem(next.id)
              }}
            >
              {t('panels.importBatch.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </EditorSidePanel>
  )
}
