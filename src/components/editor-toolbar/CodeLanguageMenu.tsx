import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { filterCodeLanguages, getCodeLanguageLabel } from '@/lib/editor/code-languages'
import { cn } from '@/lib/utils'

type CodeLanguageMenuProps = {
  language: string | null
  onSelect: (languageId: string) => void
  triggerClassName?: string
}

export function CodeLanguageMenu({ language, onSelect, triggerClassName }: CodeLanguageMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const languages = useMemo(() => filterCodeLanguages(query), [query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn('toolbar-select', triggerClassName)}
          title={t('toolbar.actions.syntaxLanguage')}
        >
          <span>{getCodeLanguageLabel(language)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="code-lang-menu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="code-lang-menu__search sticky top-0 z-[1] border-b border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('toolbar.actions.syntaxLanguageSearch')}
            className="h-8"
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && languages[0]) {
                event.preventDefault()
                onSelect(languages[0].id)
                setOpen(false)
              }
            }}
          />
        </div>
        <div className="code-lang-menu__list max-h-[280px] overflow-y-auto py-1">
          {languages.length === 0 ? (
            <p className="m-0 px-2 py-2 text-[12px] text-[var(--color-muted-foreground)]">
              {t('toolbar.actions.syntaxLanguageEmpty')}
            </p>
          ) : (
            languages.map(({ id, label }) => (
              <DropdownMenuItem
                key={id}
                className={cn((language ?? 'auto') === id && 'is-selected')}
                onClick={() => onSelect(id)}
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {id !== 'auto' && (
                  <span className="ml-2 shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                    {id}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
