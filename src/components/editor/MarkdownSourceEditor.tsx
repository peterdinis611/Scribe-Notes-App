import { forwardRef, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { MarkdownView } from '@/components/MarkdownView'
import { cn } from '@/lib/utils'

type MarkdownSourceEditorProps = {
  value: string
  onChange: (value: string) => void
  spellCheck?: boolean
}

export const MarkdownSourceEditor = forwardRef<HTMLTextAreaElement, MarkdownSourceEditorProps>(
  function MarkdownSourceEditor({ value, onChange, spellCheck = true }, ref) {
    const { t, i18n } = useTranslation()
    const previewId = useId()

    return (
      <div className="markdown-workbench">
        <div className="markdown-workbench__pane markdown-workbench__pane--source">
          <p className="markdown-workbench__label">{t('viewMode.markdownSource')}</p>
          <textarea
            ref={ref}
            className="markdown-source-editor titlebar-no-drag"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={spellCheck}
            lang={i18n.language?.startsWith('sk') ? 'sk' : 'en'}
            aria-label={t('editor.markdownAria', { defaultValue: 'Markdown editor' })}
            aria-describedby={previewId}
            placeholder={t('editor.markdownPlaceholder')}
          />
        </div>
        <div className="markdown-workbench__pane markdown-workbench__pane--preview">
          <p id={previewId} className="markdown-workbench__label">
            {t('viewMode.markdownPreview')}
          </p>
          <div className={cn('markdown-preview-scroll titlebar-no-drag')}>
            <MarkdownView
              source={value}
              deferred
              className="markdown-preview-body"
              emptyFallback={
                <p className="markdown-preview-empty">{t('viewMode.markdownPreviewEmpty')}</p>
              }
            />
          </div>
        </div>
      </div>
    )
  },
)
