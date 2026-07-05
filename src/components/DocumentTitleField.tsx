import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRenameDocument } from '@/hooks/useRenameDocument'

interface DocumentTitleFieldProps {
  documentId: string
  title: string
  variant: 'header' | 'sidebar'
  className?: string
}

export function DocumentTitleField({
  documentId,
  title,
  variant,
  className,
}: DocumentTitleFieldProps) {
  const renameDocument = useRenameDocument()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

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
    setDraft(title)
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    if (draft.trim() === title.trim()) return
    await renameDocument(documentId, draft)
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
          className,
        )}
        onClick={startEditing}
        title="Kliknite pre premenovanie"
      >
        {title}
      </button>
    )
  }

  return (
    <p
      className={cn(
        'm-0 truncate text-[13px] font-medium leading-snug text-[var(--color-foreground)]',
        className,
      )}
      onDoubleClick={(event) => {
        event.stopPropagation()
        startEditing()
      }}
      title="Dvojklik pre premenovanie"
    >
      {title}
    </p>
  )
}
