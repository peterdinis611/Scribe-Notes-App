import { useEffect, useRef, useState } from 'react'
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
      <input
        ref={inputRef}
        type="text"
        className={cn(
          'doc-title-input',
          variant === 'header' && 'doc-title-input-header',
          variant === 'sidebar' && 'doc-title-input-sidebar',
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
        className={cn('doc-title-button doc-title-button-header', className)}
        onClick={startEditing}
        title="Kliknite pre premenovanie"
      >
        {title}
      </button>
    )
  }

  return (
    <p
      className={cn('doc-item-title doc-title-button-sidebar', className)}
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
