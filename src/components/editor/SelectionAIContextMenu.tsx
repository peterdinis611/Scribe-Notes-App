import { useState } from 'react'
import {
  Check,
  Languages,
  List,
  LoaderCircle,
  Minimize2,
  PenLine,
  RefreshCw,
  Scissors,
  Sparkles,
  Type,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  nlpRewriteSelection,
  nlpWritingCoach,
  type WritingCoachHint,
} from '@/lib/db/nlp-api'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type SelectionAIContextMenuProps = {
  selectedText: string
  onReplaceText: (next: string) => void
  onInsertBelow: (next: string) => void
}

const MODES = [
  { id: 'rephrase_professional', icon: RefreshCw, labelKey: 'aiRewrite.rephrase' },
  { id: 'shorten', icon: Minimize2, labelKey: 'aiRewrite.shorten' },
  { id: 'simplify', icon: Type, labelKey: 'aiRewrite.simplify' },
  { id: 'summarize_bullets', icon: Scissors, labelKey: 'aiRewrite.summarize' },
  { id: 'expand_bullets', icon: List, labelKey: 'aiRewrite.expand' },
  { id: 'translate_sk', icon: Languages, labelKey: 'aiRewrite.translateSk' },
  { id: 'translate_en', icon: Languages, labelKey: 'aiRewrite.translateEn' },
] as const

export function SelectionAIContextMenu({
  selectedText,
  onReplaceText,
  onInsertBelow,
}: SelectionAIContextMenuProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [coachHints, setCoachHints] = useState<WritingCoachHint[] | null>(null)
  const [coachScore, setCoachScore] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  function resetViews() {
    setResult(null)
    setCoachHints(null)
    setCoachScore(null)
    setCustomOpen(false)
  }

  async function handleRewrite(mode: string, instruction?: string) {
    const text = selectedText.trim()
    if (!text || loading) return
    setLoading(true)
    setCoachHints(null)
    setCoachScore(null)
    try {
      const res = await nlpRewriteSelection(text, mode, instruction)
      setResult(res.output)
      setCustomOpen(false)
    } catch (error) {
      toast.error(t('aiRewrite.error'), String(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleWritingCoach() {
    const text = selectedText.trim()
    if (!text || loading) return
    setLoading(true)
    setResult(null)
    try {
      const res = await nlpWritingCoach({ text, limit: 10 })
      setCoachHints(res.hints ?? [])
      setCoachScore(typeof res.score === 'number' ? res.score : null)
      setCustomOpen(false)
    } catch (error) {
      toast.error(t('aiRewrite.coachError'), String(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="selection-ai">
      <p className="selection-ai__kicker">
        <Sparkles className="h-3 w-3" aria-hidden />
        {t('aiRewrite.title')}
      </p>
      <p className="selection-ai__local">{t('aiRewrite.localHint')}</p>

      {loading ? (
        <p className="selection-ai__status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t('aiRewrite.working')}
        </p>
      ) : coachHints ? (
        <>
          <div className="selection-ai__coach-head">
            <span className="selection-ai__coach-title">{t('aiRewrite.coachTitle')}</span>
            {coachScore != null ? (
              <span className="selection-ai__coach-score">
                {t('aiRewrite.coachScore', { score: Math.round(coachScore) })}
              </span>
            ) : null}
          </div>
          {coachHints.length === 0 ? (
            <p className="selection-ai__preview">{t('aiRewrite.coachEmpty')}</p>
          ) : (
            <ul className="selection-ai__coach-list">
              {coachHints.map((hint, index) => (
                <li key={`${hint.code}-${index}`} className="selection-ai__coach-item">
                  <span
                    className={cn(
                      'selection-ai__coach-dot',
                      hint.severity === 'warn' && 'is-warn',
                      hint.severity === 'ok' && 'is-ok',
                    )}
                    aria-hidden
                  />
                  <div>
                    <p className="selection-ai__coach-msg">{hint.message}</p>
                    {hint.excerpt ? (
                      <p className="selection-ai__coach-excerpt">{hint.excerpt}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="selection-ai__row">
            <button type="button" className="selection-ai__ghost" onClick={resetViews}>
              {t('common.back')}
            </button>
          </div>
        </>
      ) : result ? (
        <>
          <p className="selection-ai__preview">{result}</p>
          <div className="selection-ai__row">
            <button type="button" className="selection-ai__ghost" onClick={resetViews}>
              {t('common.back')}
            </button>
            <button type="button" className="selection-ai__ghost" onClick={() => onInsertBelow(result)}>
              {t('aiRewrite.insertBelow')}
            </button>
            <button type="button" className="selection-ai__primary" onClick={() => onReplaceText(result)}>
              <Check className="h-3 w-3" aria-hidden />
              {t('aiRewrite.replace')}
            </button>
          </div>
        </>
      ) : customOpen ? (
        <div className="selection-ai__custom">
          <input
            className="selection-ai__input"
            value={customPrompt}
            onChange={(event) => setCustomPrompt(event.target.value)}
            placeholder={t('aiRewrite.customPlaceholder')}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter' && customPrompt.trim()) {
                event.preventDefault()
                void handleRewrite('custom_prompt', customPrompt.trim())
              }
            }}
          />
          <div className="selection-ai__row">
            <button type="button" className="selection-ai__ghost" onClick={() => setCustomOpen(false)}>
              {t('common.back')}
            </button>
            <button
              type="button"
              className="selection-ai__primary"
              disabled={!customPrompt.trim()}
              onClick={() => void handleRewrite('custom_prompt', customPrompt.trim())}
            >
              {t('aiRewrite.run')}
            </button>
          </div>
        </div>
      ) : (
        <div className="selection-ai__modes">
          {MODES.map((mode) => {
            const Icon = mode.icon
            return (
              <button
                key={mode.id}
                type="button"
                className="selection-ai__mode"
                onClick={() => void handleRewrite(mode.id)}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t(mode.labelKey)}
              </button>
            )
          })}
          <button
            type="button"
            className="selection-ai__mode"
            onClick={() => void handleWritingCoach()}
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden />
            {t('aiRewrite.coach')}
          </button>
          <button
            type="button"
            className="selection-ai__mode"
            onClick={() => setCustomOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t('aiRewrite.custom')}
          </button>
        </div>
      )}
    </div>
  )
}
