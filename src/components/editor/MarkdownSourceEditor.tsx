import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

type MarkdownSourceEditorProps = {
  value: string
  onChange: (value: string) => void
  spellCheck?: boolean
}

export const MarkdownSourceEditor = forwardRef<HTMLTextAreaElement, MarkdownSourceEditorProps>(
  function MarkdownSourceEditor({ value, onChange, spellCheck = true }, ref) {
    const { t, i18n } = useTranslation()

    return (
      <textarea
        ref={ref}
        className="markdown-source-editor titlebar-no-drag"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={spellCheck}
        lang={i18n.language?.startsWith('sk') ? 'sk' : 'en'}
        aria-label={t('editor.markdownAria', { defaultValue: 'Markdown editor' })}
        placeholder={t('editor.markdownPlaceholder')}
      />
    )
  },
)
