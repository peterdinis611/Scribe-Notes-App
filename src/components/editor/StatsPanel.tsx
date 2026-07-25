import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { PanelRightClose, Target } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useAppSelector } from '@/store/hooks'
import {
  EditorSidePanel,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
} from '@/components/editor/EditorSidePanelPrimitives'

type StatsPanelProps = {
  editor: Editor | null
  onClose: () => void
}

const WORDS_PER_MINUTE = 200
const GOAL_KEY_PREFIX = 'scribe-word-goal-'

function readGoal(documentId: string | null): number {
  if (!documentId) return 0
  const raw = localStorage.getItem(`${GOAL_KEY_PREFIX}${documentId}`)
  const value = raw ? Number(raw) : 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function StatsPanel({ editor, onClose }: StatsPanelProps) {
  const { t, i18n } = useTranslation()
  const numberLocale = i18n.language === 'sk' ? 'sk-SK' : 'en-US'
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const [goal, setGoal] = useState(() => readGoal(activeId))

  useEffect(() => {
    setGoal(readGoal(activeId))
  }, [activeId])

  const stats = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return { words: 0, characters: 0, charactersNoSpaces: 0, paragraphs: 0, sentences: 0 }
      }
      const storage = currentEditor.storage.characterCount as
        | { characters: () => number; words: () => number }
        | undefined
      const text = currentEditor.getText()
      const words = storage?.words() ?? text.split(/\s+/).filter(Boolean).length
      const characters = storage?.characters() ?? text.length
      const charactersNoSpaces = text.replace(/\s+/g, '').length
      let paragraphs = 0
      currentEditor.state.doc.descendants((node) => {
        if (node.type.name === 'paragraph' && node.textContent.trim()) paragraphs += 1
      })
      const sentences = text.split(/[.!?]+/).filter((part) => part.trim()).length
      return { words, characters, charactersNoSpaces, paragraphs, sentences }
    },
  })

  const data = stats ?? {
    words: 0,
    characters: 0,
    charactersNoSpaces: 0,
    paragraphs: 0,
    sentences: 0,
  }

  const handleGoalChange = useCallback(
    (value: number) => {
      const safe = Number.isFinite(value) && value > 0 ? Math.round(value) : 0
      setGoal(safe)
      if (!activeId) return
      if (safe > 0) localStorage.setItem(`${GOAL_KEY_PREFIX}${activeId}`, String(safe))
      else localStorage.removeItem(`${GOAL_KEY_PREFIX}${activeId}`)
    },
    [activeId],
  )

  const progress = useMemo(() => {
    if (goal <= 0) return 0
    return Math.min(100, Math.round((data.words / goal) * 100))
  }, [data.words, goal])

  const formatReadingTime = useCallback(
    (words: number): string => {
      if (words === 0) return t('panels.stats.readingTimeZero')
      const minutes = words / WORDS_PER_MINUTE
      if (minutes < 1) return t('panels.stats.readingTimeUnderOne')
      return t('panels.stats.readingTimeMinutes', { count: Math.round(minutes) })
    },
    [t],
  )

  const formatNumber = useCallback(
    (value: number) => value.toLocaleString(numberLocale),
    [numberLocale],
  )

  const rows: Array<{ label: string; value: string }> = [
    { label: t('panels.stats.words'), value: formatNumber(data.words) },
    { label: t('panels.stats.characters'), value: formatNumber(data.characters) },
    { label: t('panels.stats.charactersNoSpaces'), value: formatNumber(data.charactersNoSpaces) },
    { label: t('panels.stats.paragraphs'), value: formatNumber(data.paragraphs) },
    { label: t('panels.stats.sentences'), value: formatNumber(data.sentences) },
    { label: t('panels.stats.readingTime'), value: formatReadingTime(data.words) },
  ]

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label={t('editorPanels.stats')}>
      <EditorSidePanelHeader
        title={t('editorPanels.stats')}
        subtitle={t('panels.stats.subtitle')}
        actions={
          <EditorSidePanelIconButton aria-label={t('panels.stats.hide')} onClick={onClose}>
            <PanelRightClose className="h-4 w-4" />
          </EditorSidePanelIconButton>
        }
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-0.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5"
          >
            <span className="text-[18px] font-bold tabular-nums">{row.value}</span>
            <span className="text-[10px] text-[var(--color-muted-foreground)]">{row.label}</span>
          </div>
        ))}
      </div>

      <div className="mx-3 mb-4 mt-1 flex flex-col gap-2 rounded-[10px] border border-[var(--color-border)] p-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-muted-foreground)]">
          <Target className="h-4 w-4" />
          <span>{t('panels.stats.wordGoal')}</span>
        </div>
        <Input
          type="number"
          min={0}
          step={50}
          className="h-8 text-[13px]"
          placeholder={t('panels.stats.goalPlaceholder')}
          value={goal || ''}
          onChange={(event) => handleGoalChange(Number(event.target.value))}
        />
        {goal > 0 && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-hover)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-250"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="m-0 text-[11px] text-[var(--color-muted-foreground)]">
              {t('panels.stats.goalProgress', {
                current: formatNumber(data.words),
                goal: formatNumber(goal),
                percent: progress,
              })}
              {data.words >= goal ? t('panels.stats.goalComplete') : ''}
            </p>
          </>
        )}
      </div>
    </EditorSidePanel>
  )
}
