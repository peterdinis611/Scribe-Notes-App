import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  Layers,
  LoaderCircle,
  PanelRightClose,
  RefreshCw,
} from 'lucide-react'
import {
  nlpExtractFlashcards,
  nlpStatus,
  type Flashcard,
} from '@/lib/db/nlp-api'
import {
  exportFlashcardsAnki,
  exportFlashcardsMarkdown,
} from '@/lib/export/flashcards'
import { toast } from '@/lib/toast'
import { useAppSelector } from '@/store/hooks'
import { Button } from '@/components/ui/button'
import {
  EditorSidePanel,
  EditorSidePanelEmpty,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
  EditorSidePanelList,
} from '@/components/editor/EditorSidePanelPrimitives'

type FlashcardsPanelProps = {
  onClose: () => void
}

export function FlashcardsPanel({ onClose }: FlashcardsPanelProps) {
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nlpEnabled, setNlpEnabled] = useState(true)
  const [exporting, setExporting] = useState<'anki' | 'md' | null>(null)

  const refresh = useCallback(async () => {
    if (!activeId) {
      setCards([])
      setSource(null)
      return
    }
    setLoading(true)
    try {
      const status = await nlpStatus()
      setNlpEnabled(status.enabled)
      if (!status.enabled) {
        setCards([])
        setSource(null)
        return
      }
      const result = await nlpExtractFlashcards({
        documentId: activeId,
        limit: 24,
        includeCloze: true,
      })
      setCards(result.cards ?? [])
      setSource(result.source ?? null)
    } catch (error) {
      toast.error(t('panels.flashcards.loadError'), String(error))
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [activeId, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleExportAnki() {
    if (!cards.length) return
    setExporting('anki')
    try {
      const path = await exportFlashcardsAnki({
        cards,
        baseName: activeDocument?.title || 'flashcards',
        dialogTitle: t('panels.flashcards.exportAnki'),
      })
      if (path) toast.success(t('panels.flashcards.exportDone'))
    } catch (error) {
      toast.error(t('panels.flashcards.exportError'), String(error))
    } finally {
      setExporting(null)
    }
  }

  async function handleExportMarkdown() {
    if (!cards.length) return
    setExporting('md')
    try {
      const path = await exportFlashcardsMarkdown({
        cards,
        baseName: activeDocument?.title || 'flashcards',
        title: activeDocument?.title,
        dialogTitle: t('panels.flashcards.exportMarkdown'),
      })
      if (path) toast.success(t('panels.flashcards.exportDone'))
    } catch (error) {
      toast.error(t('panels.flashcards.exportError'), String(error))
    } finally {
      setExporting(null)
    }
  }

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label={t('editorPanels.flashcards')}>
      <EditorSidePanelHeader
        title={t('editorPanels.flashcards')}
        subtitle={
          cards.length
            ? t('panels.flashcards.subtitleWithCount', { count: cards.length })
            : t('panels.flashcards.subtitle')
        }
        actions={
          <>
            <EditorSidePanelIconButton
              aria-label={t('panels.flashcards.refresh')}
              onClick={() => void refresh()}
              disabled={loading || !activeId}
            >
              {loading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </EditorSidePanelIconButton>
            <EditorSidePanelIconButton aria-label={t('panels.flashcards.hide')} onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </EditorSidePanelIconButton>
          </>
        }
      />

      {!nlpEnabled ? (
        <EditorSidePanelEmpty>{t('panels.flashcards.disabled')}</EditorSidePanelEmpty>
      ) : !activeId ? (
        <EditorSidePanelEmpty>{t('panels.flashcards.noDocument')}</EditorSidePanelEmpty>
      ) : loading && !cards.length ? (
        <EditorSidePanelEmpty>
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            {t('panels.flashcards.loading')}
          </span>
        </EditorSidePanelEmpty>
      ) : !cards.length ? (
        <EditorSidePanelEmpty>{t('panels.flashcards.empty')}</EditorSidePanelEmpty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting !== null}
              onClick={() => void handleExportAnki()}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {exporting === 'anki'
                ? t('panels.flashcards.exporting')
                : t('panels.flashcards.exportAnki')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting !== null}
              onClick={() => void handleExportMarkdown()}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {exporting === 'md'
                ? t('panels.flashcards.exporting')
                : t('panels.flashcards.exportMarkdown')}
            </Button>
            {source ? (
              <span className="ml-auto self-center text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {source}
              </span>
            ) : null}
          </div>
          <EditorSidePanelList>
            <ul className="m-0 list-none space-y-2 p-3">
              {cards.map((card, index) => (
                <li
                  key={`${card.kind}-${index}-${card.question.slice(0, 24)}`}
                  className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <Layers className="h-3 w-3" aria-hidden />
                    {card.kind || 'card'}
                    <span className="ml-auto tabular-nums opacity-70">{index + 1}</span>
                  </div>
                  <p className="m-0 text-[13px] font-semibold leading-snug text-[var(--color-foreground)]">
                    {card.front || card.question}
                  </p>
                  <p className="mt-1.5 m-0 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
                    {card.answer}
                  </p>
                </li>
              ))}
            </ul>
          </EditorSidePanelList>
        </>
      )}
    </EditorSidePanel>
  )
}
