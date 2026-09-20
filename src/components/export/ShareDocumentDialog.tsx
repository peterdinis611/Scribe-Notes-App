import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ClipboardCopy,
  FileCode2,
  FileSymlink,
  FileText,
  FolderOpen,
  Loader2,
  Share2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ShareDocumentAction } from '@/lib/export/share-package'

type ShareDocumentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  hasFilePath: boolean
  onAction: (action: ShareDocumentAction) => Promise<void>
}

type ActionDef = {
  id: ShareDocumentAction
  icon: typeof Share2
  labelKey: string
  hintKey: string
  needsPath?: boolean
}

const ACTIONS: ActionDef[] = [
  {
    id: 'pdf',
    icon: FileText,
    labelKey: 'shareDialog.asPdf',
    hintKey: 'shareDialog.asPdfHint',
  },
  {
    id: 'html-zip',
    icon: Share2,
    labelKey: 'shareDialog.asHtmlZip',
    hintKey: 'shareDialog.asHtmlZipHint',
  },
  {
    id: 'md',
    icon: FileCode2,
    labelKey: 'shareDialog.asMarkdown',
    hintKey: 'shareDialog.asMarkdownHint',
  },
  {
    id: 'copy-markdown',
    icon: ClipboardCopy,
    labelKey: 'shareDialog.copyMarkdown',
    hintKey: 'shareDialog.copyMarkdownHint',
  },
  {
    id: 'copy-path',
    icon: FolderOpen,
    labelKey: 'shareDialog.copyPath',
    hintKey: 'shareDialog.copyPathHint',
    needsPath: true,
  },
  {
    id: 'reveal',
    icon: FileSymlink,
    labelKey: 'shareDialog.reveal',
    hintKey: 'shareDialog.revealHint',
    needsPath: true,
  },
]

export function ShareDocumentDialog({
  open,
  onOpenChange,
  title,
  hasFilePath,
  onAction,
}: ShareDocumentDialogProps) {
  const { t } = useTranslation()
  const [busyId, setBusyId] = useState<ShareDocumentAction | null>(null)

  async function run(action: ShareDocumentAction) {
    if (busyId) return
    setBusyId(action)
    try {
      await onAction(action)
      onOpenChange(false)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shareDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('shareDialog.description', { title: title || t('common.untitled') })}
          </DialogDescription>
        </DialogHeader>

        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {ACTIONS.map((action) => {
            const Icon = action.icon
            const disabled = Boolean(busyId) || (action.needsPath && !hasFilePath)
            const busy = busyId === action.id

            return (
              <li key={action.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void run(action.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2.5 text-left transition-colors',
                    disabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:bg-[var(--color-hover)]',
                  )}
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]">
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[var(--color-foreground)]">
                      {t(action.labelKey)}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--color-muted-foreground)]">
                      {action.needsPath && !hasFilePath
                        ? t('shareDialog.noFilePath')
                        : t(action.hintKey)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
