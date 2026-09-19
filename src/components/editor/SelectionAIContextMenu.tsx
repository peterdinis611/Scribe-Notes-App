import React, { useState } from 'react'
import { Sparkles, Check, RefreshCw, Languages, FileText } from 'lucide-react'
import { nlpRewriteSelection } from '@/lib/db/nlp-api'
import { useTranslation } from 'react-i18next'

interface SelectionAIContextMenuProps {
  selectedText: string
  onReplaceText: (newText: string) => void
  onInsertBelow: (newText: string) => void
  onClose: () => void
}

export const SelectionAIContextMenu: React.FC<SelectionAIContextMenuProps> = ({
  selectedText,
  onReplaceText,
  onInsertBelow,
  onClose,
}) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const handleRewrite = async (mode: string, instruction?: string) => {
    setLoading(true)
    try {
      const res = await nlpRewriteSelection(selectedText, mode, instruction)
      setResult(res.output)
    } catch (err) {
      console.error('Failed to rewrite selection', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="z-50 min-w-[260px] rounded-lg border border-border bg-popover p-2 shadow-md text-popover-foreground animate-in fade-in zoom-in-95">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground border-b border-border/50 mb-1">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span>{t('aiRewrite.title', 'Local RAG Extender')}</span>
      </div>

      {!result ? (
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => handleRewrite('rephrase_professional')}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-left transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
            <span>{t('aiRewrite.rephrase', 'Rephrase professionally')}</span>
          </button>

          <button
            onClick={() => handleRewrite('summarize_bullets')}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-left transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('aiRewrite.summarize', 'Summarize to bullets')}</span>
          </button>

          <button
            onClick={() => handleRewrite('translate_sk')}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-left transition-colors"
          >
            <Languages className="h-3.5 w-3.5 text-purple-500" />
            <span>{t('aiRewrite.translateSk', 'Translate to Slovak')}</span>
          </button>

          <button
            onClick={() => handleRewrite('translate_en')}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-left transition-colors"
          >
            <Languages className="h-3.5 w-3.5 text-indigo-500" />
            <span>{t('aiRewrite.translateEn', 'Translate to English')}</span>
          </button>

          {showCustom ? (
            <div className="mt-1 flex flex-col gap-1 p-1 border-t border-border/50">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={t('aiRewrite.customPlaceholder', 'e.g. shorten, uppercase...')}
                className="w-full px-2 py-1 text-xs border rounded bg-background"
                autoFocus
              />
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setShowCustom(false)}
                  className="px-2 py-0.5 text-[10px] rounded hover:bg-muted"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={() => handleRewrite('custom_prompt', customPrompt)}
                  disabled={!customPrompt.trim()}
                  className="px-2 py-0.5 text-[10px] bg-primary text-primary-foreground rounded"
                >
                  {t('aiRewrite.run', 'Run')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCustom(true)}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-left transition-colors border-t border-border/40 mt-0.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>{t('aiRewrite.custom', 'Custom prompt...')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-1">
          <div className="max-h-[140px] overflow-y-auto text-xs bg-muted/50 p-2 rounded border border-border/50 font-sans whitespace-pre-wrap">
            {result}
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setResult(null)}
              className="px-2 py-1 text-[11px] rounded hover:bg-muted text-muted-foreground"
            >
              {t('common.back', 'Back')}
            </button>
            <button
              onClick={() => {
                onInsertBelow(result)
                onClose()
              }}
              className="px-2 py-1 text-[11px] rounded border border-border hover:bg-accent"
            >
              {t('aiRewrite.insertBelow', 'Insert Below')}
            </button>
            <button
              onClick={() => {
                onReplaceText(result)
                onClose()
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-primary-foreground rounded hover:opacity-90 font-medium"
            >
              <Check className="h-3 w-3" />
              <span>{t('aiRewrite.replace', 'Replace')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
