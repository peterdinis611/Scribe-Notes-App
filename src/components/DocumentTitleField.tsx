import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRenameDocument } from '@/hooks/useRenameDocument'

interface DocumentTitleFieldProps {
  documentId: string
  title: string
  variant: 'header' | 'sidebar'
  className?: string
}

function displayTitle(title: string, untitled: string) {
  const trimmed = title.trim()
  return trimmed || untitled
}

export function DocumentTitleField({
  documentId,
  title,
  variant,
  className,
}: DocumentTitleFieldProps) {
  const { t } = useTranslation()
  const untitled = t('common.untitled')
  const renameDocument = useRenameDocument()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)
  const label = displayTitle(title, untitled)

  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEditing() {
    setDraft(title.trim() ? title : '')
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    const next = draft.trim() || untitled
    if (next === displayTitle(title, untitled)) return
    await renameDocument(documentId, next)
  }

  function cancel() {
    setDraft(title)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        className={cn(
          'h-auto border-none bg-transparent p-0 shadow-none focus-visible:shadow-none',
          variant === 'header' && 'text-center text-[15px] font-semibold',
          variant === 'sidebar' && 'text-[13px] font-medium',
          className,
        )}
        value={draft}
        placeholder={untitled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
      />
    )
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        className={cn(
          'max-w-full truncate border-none bg-transparent px-2 py-1 text-[15px] font-semibold text-[var(--color-foreground)] transition-colors hover:text-[var(--color-accent)]',
          !title.trim() && 'text-[var(--color-muted-foreground)]',
          className,
        )}
        onClick={startEditing}
        title={t('editor.renameTitleHint', { defaultValue: 'Kliknite pre premenovanie' })}
      >
        {label}
      </button>
    )
  }

  return (
    <p
      className={cn(
        'm-0 truncate text-[13px] font-medium leading-snug text-[var(--color-foreground)]',
        !title.trim() && 'text-[var(--color-muted-foreground)]',
        className,
      )}
      onDoubleClick={(event) => {
        event.stopPropagation()
        startEditing()
      }}
      title={t('editor.renameTitleHintDouble', { defaultValue: 'Dvojklik pre premenovanie' })}
    >
      {label}
    </p>
  )
}
