import { useTranslation } from 'react-i18next'

type MarkdownSourceEditorProps = {
  value: string
  onChange: (value: string) => void
  spellCheck?: boolean
}

export function MarkdownSourceEditor({ value, onChange, spellCheck = true }: MarkdownSourceEditorProps) {
  const { t, i18n } = useTranslation()

  return (
    <textarea
      className="markdown-source-editor titlebar-no-drag"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={spellCheck}
      lang={i18n.language?.startsWith('sk') ? 'sk' : 'en'}
      aria-label={t('editor.markdownAria', { defaultValue: 'Markdown editor' })}
      placeholder={t('editor.markdownPlaceholder')}
    />
  )
}
