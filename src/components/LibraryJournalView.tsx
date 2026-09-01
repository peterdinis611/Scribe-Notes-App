import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, Flame, Moon, Sparkles, Sun } from 'lucide-react'
import { nlpJournalSummary } from '@/lib/db/nlp-api'
import {
  computeJournalStreak,
  formatDateKey,
  getJournalFolderId,
  listJournalDailyDates,
  openEveningNote,
  openJournalNoteForDate,
  openMorningNote,
  openThisWeekNote,
  openTodayNote,
} from '@/lib/journal-notes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { Button } from '@/components/ui/button'

type LibraryJournalViewProps = {
  onNavigate?: () => void
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

export function LibraryJournalView({ onNavigate }: LibraryJournalViewProps) {
  const { t, i18n } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null)
  const [weeklyBullets, setWeeklyBullets] = useState<string[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  function currentWeekRange() {
    const start = new Date()
    const mondayOffset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - mondayOffset)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { from: formatDateKey(start), to: formatDateKey(end) }
  }

  async function loadWeeklySummary() {
    const { from, to } = currentWeekRange()
    setSummaryLoading(true)
    try {
      const result = await nlpJournalSummary(from, to)
      setWeeklySummary(result.summary)
      setWeeklyBullets(result.bullets)
    } catch (error) {
      toast.error(t('journal.summaryError'), String(error))
    } finally {
      setSummaryLoading(false)
    }
  }

  const folderId = useMemo(
    () => getJournalFolderId(folders, t('journal.folderName')),
    [folders, t],
  )
  const notedDates = useMemo(
    () => listJournalDailyDates(documents, folderId),
    [documents, folderId],
  )
  const streak = useMemo(() => computeJournalStreak(notedDates), [notedDates])
  const notedDateSet = useMemo(() => new Set(notedDates), [notedDates])

  const journalArgs = {
    documents,
    folders,
    dispatch,
    navigate,
    t: (key: string, options?: Record<string, unknown>) => t(key, options),
  }

  const todayKey = formatDateKey(new Date())
  const monthLabel = cursor.toLocaleDateString(i18n.language === 'sk' ? 'sk-SK' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })

  const cells = useMemo(() => {
    const firstDow = (startOfMonth(cursor).getDay() + 6) % 7 // Monday-first
    const total = daysInMonth(cursor)
    const items: Array<{ date: Date | null; key: string | null }> = []
    for (let i = 0; i < firstDow; i += 1) items.push({ date: null, key: null })
    for (let day = 1; day <= total; day += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), day)
      items.push({ date, key: formatDateKey(date) })
    }
    return items
  }, [cursor])

  async function openDate(date: Date) {
    try {
      await openJournalNoteForDate(date, {
        documents,
        folders,
        dispatch,
        navigate,
        t: (key, options) => t(key, options),
      })
      onNavigate?.()
    } catch (error) {
      toast.error(t('journal.openError'), String(error))
    }
  }

  return (
    <div className="px-2 pb-3 pt-1">
      {streak > 0 && (
        <div className="journal-streak-badge mb-2">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('journal.streak', { count: streak })}</span>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="default"
          className="h-7"
          onClick={() =>
            void openTodayNote(journalArgs)
              .then(() => onNavigate?.())
              .catch((error) => toast.error(t('journal.openError'), String(error)))
          }
        >
          {t('journal.today')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1"
          onClick={() =>
            void openMorningNote(journalArgs)
              .then(() => onNavigate?.())
              .catch((error) => toast.error(t('journal.openError'), String(error)))
          }
        >
          <Sun className="h-3 w-3" />
          {t('journal.morning')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1"
          onClick={() =>
            void openEveningNote(journalArgs)
              .then(() => onNavigate?.())
              .catch((error) => toast.error(t('journal.openError'), String(error)))
          }
        >
          <Moon className="h-3 w-3" />
          {t('journal.evening')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() =>
            void openThisWeekNote(journalArgs)
              .then(() => onNavigate?.())
              .catch((error) => toast.error(t('journal.openError'), String(error)))
          }
        >
          {t('journal.thisWeek')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1"
          disabled={summaryLoading}
          onClick={() => void loadWeeklySummary()}
        >
          <Sparkles className="h-3 w-3" />
          {summaryLoading ? t('journal.summaryLoading') : t('journal.weeklySummary')}
        </Button>
      </div>

      {weeklySummary && (
        <div className="journal-weekly-summary mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {t('journal.weeklySummaryTitle')}
          </p>
          <p className="m-0 text-[12px] leading-relaxed text-[var(--color-foreground)]">{weeklySummary}</p>
          {weeklyBullets.length > 0 && (
            <ul className="mt-2 space-y-1 pl-4 text-[12px] text-[var(--color-muted-foreground)]">
              {weeklyBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)]"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
            aria-label={t('journal.prevMonth')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-semibold capitalize">
            <CalendarDays className="h-3.5 w-3.5 opacity-60" />
            {monthLabel}
          </p>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)]"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
            aria-label={t('journal.nextMonth')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => (
            <span key={day}>{t(`journal.weekday.${day}`)}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, index) => {
            if (!cell.date || !cell.key) {
              return <span key={`empty-${index}`} className="h-8" />
            }
            const hasNote = notedDateSet.has(cell.key)
            const isToday = cell.key === todayKey
            const prevKey = formatDateKey(new Date(cell.date.getTime() - 86_400_000))
            const nextKey = formatDateKey(new Date(cell.date.getTime() + 86_400_000))
            const heat = hasNote
              ? 1 + (notedDateSet.has(prevKey) ? 1 : 0) + (notedDateSet.has(nextKey) ? 1 : 0)
              : 0
            return (
              <button
                key={cell.key}
                type="button"
                className={cn(
                  'journal-heat-day relative flex h-8 items-center justify-center rounded-md text-[12px] transition-colors hover:bg-[var(--color-hover)]',
                  isToday && 'font-semibold text-[var(--color-accent)]',
                  hasNote && 'journal-heat-day--on',
                )}
                data-heat={heat}
                onClick={() => void openDate(cell.date!)}
                title={cell.key}
              >
                {cell.date.getDate()}
              </button>
            )
          })}
        </div>

        <div className="journal-heat-legend mt-2.5 flex items-center justify-between gap-2 px-0.5">
          <span className="text-[10px] text-[var(--color-muted-foreground)]">{t('journal.heatLess')}</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((level) => (
              <span key={level} className="journal-heat-swatch" data-heat={level} />
            ))}
          </div>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">{t('journal.heatMore')}</span>
        </div>
      </div>

      <p className="mt-2 px-0.5 text-[11px] text-[var(--color-muted-foreground)]">
        {t('journal.heatWorkflowHint')}
      </p>
      <p className="mt-1 px-0.5 text-[11px] text-[var(--color-muted-foreground)]">
        {t('journal.calendarHint')}
      </p>
    </div>
  )
}
