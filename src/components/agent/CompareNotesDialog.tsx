import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/store/hooks'

type CompareNotesDialogProps = {
  open: boolean
  excludeDocumentId?: string | null
  onClose: () => void
  onSelect: (documentId: string, title: string) => void
}

export function CompareNotesDialog({
  open,
  excludeDocumentId,
  onClose,
  onSelect,
}: CompareNotesDialogProps) {
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents
      .filter((doc) => doc.id !== excludeDocumentId)
      .filter((doc) => !needle || (doc.title || '').toLowerCase().includes(needle))
      .slice(0, 40)
  }, [documents, excludeDocumentId, query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('agent.comparePickerTitle')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="m-0 text-[15px] font-semibold text-[var(--color-foreground)]">
          {t('agent.comparePickerTitle')}
        </h2>
        <p className="mt-1 mb-3 text-[12px] text-[var(--color-muted-foreground)]">
          {t('agent.comparePickerHint')}
        </p>
        <input
          className="mb-3 w-full rounded-md border border-[var(--color-border)] bg-transparent px-2.5 py-1.5 text-[13px]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('agent.comparePickerSearch')}
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-[var(--color-muted-foreground)]">
              {t('agent.comparePickerEmpty')}
            </p>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0">
              {options.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[var(--color-muted)]/50"
                    onClick={() => onSelect(doc.id, doc.title || t('common.untitled'))}
                  >
                    {doc.title || t('common.untitled')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
