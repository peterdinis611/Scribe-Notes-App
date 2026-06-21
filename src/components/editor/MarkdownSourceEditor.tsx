type MarkdownSourceEditorProps = {
  value: string
  onChange: (value: string) => void
}

export function MarkdownSourceEditor({ value, onChange }: MarkdownSourceEditorProps) {
  return (
    <textarea
      className="markdown-source-editor titlebar-no-drag"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      aria-label="Markdown editor"
      placeholder={'# Nadpis\n\nPíšte v **Markdown** — nadpisy, zoznamy, `kód`, tabuľky…'}
    />
  )
}
