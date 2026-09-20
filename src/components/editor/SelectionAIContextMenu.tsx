import { useState } from 'react'
import {
  Check,
  Languages,
  List,
  LoaderCircle,
  Minimize2,
  RefreshCw,
  Scissors,
  Sparkles,
  Type,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { nlpRewriteSelection } from '@/lib/db/nlp-api'
import { toast } from '@/lib/toast'

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
  const [customOpen, setCustomOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  async function handleRewrite(mode: string, instruction?: string) {
    const text = selectedText.trim()
    if (!text || loading) return
    setLoading(true)
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
      ) : result ? (
        <>
          <p className="selection-ai__preview">{result}</p>
          <div className="selection-ai__row">
            <button type="button" className="selection-ai__ghost" onClick={() => setResult(null)}>
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
