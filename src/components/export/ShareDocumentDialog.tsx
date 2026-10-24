import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  Braces,
  ClipboardCopy,
  Code2,
  FileCode2,
  FileSpreadsheet,
  FileSymlink,
  FileText,
  FileType,
  FolderOpen,
  ListTree,
  Loader2,
  Share2,
  Sparkles,
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
  group: 'convert' | 'share' | 'local'
}

const ACTIONS: ActionDef[] = [
  {
    id: 'md',
    icon: FileCode2,
    labelKey: 'shareDialog.asMarkdown',
    hintKey: 'shareDialog.asMarkdownHint',
    group: 'convert',
  },
  {
    id: 'md-llm',
    icon: Sparkles,
    labelKey: 'shareDialog.asMarkdownLlm',
    hintKey: 'shareDialog.asMarkdownLlmHint',
    group: 'convert',
  },
  {
    id: 'pdf',
    icon: FileText,
    labelKey: 'shareDialog.asPdf',
    hintKey: 'shareDialog.asPdfHint',
    group: 'convert',
  },
  {
    id: 'docx',
    icon: FileType,
    labelKey: 'shareDialog.asDocx',
    hintKey: 'shareDialog.asDocxHint',
    group: 'convert',
  },
  {
    id: 'xlsx',
    icon: FileSpreadsheet,
    labelKey: 'shareDialog.asExcel',
    hintKey: 'shareDialog.asExcelHint',
    group: 'convert',
  },
  {
    id: 'csv',
    icon: FileSpreadsheet,
    labelKey: 'shareDialog.asCsv',
    hintKey: 'shareDialog.asCsvHint',
    group: 'convert',
  },
  {
    id: 'html',
    icon: FileCode2,
    labelKey: 'shareDialog.asHtml',
    hintKey: 'shareDialog.asHtmlHint',
    group: 'convert',
  },
  {
    id: 'epub',
    icon: BookOpen,
    labelKey: 'shareDialog.asEpub',
    hintKey: 'shareDialog.asEpubHint',
    group: 'convert',
  },
  {
    id: 'json',
    icon: Braces,
    labelKey: 'shareDialog.asJson',
    hintKey: 'shareDialog.asJsonHint',
    group: 'convert',
  },
  {
    id: 'opml',
    icon: ListTree,
    labelKey: 'shareDialog.asOpml',
    hintKey: 'shareDialog.asOpmlHint',
    group: 'convert',
  },
  {
    id: 'source',
    icon: Code2,
    labelKey: 'shareDialog.asSource',
    hintKey: 'shareDialog.asSourceHint',
    group: 'convert',
  },
  {
    id: 'txt',
    icon: FileText,
    labelKey: 'shareDialog.asTxt',
    hintKey: 'shareDialog.asTxtHint',
    group: 'convert',
  },
  {
    id: 'html-zip',
    icon: Share2,
    labelKey: 'shareDialog.asHtmlZip',
    hintKey: 'shareDialog.asHtmlZipHint',
    group: 'share',
  },
  {
    id: 'copy-markdown',
    icon: ClipboardCopy,
    labelKey: 'shareDialog.copyMarkdown',
    hintKey: 'shareDialog.copyMarkdownHint',
    group: 'local',
  },
  {
    id: 'copy-path',
    icon: FolderOpen,
    labelKey: 'shareDialog.copyPath',
    hintKey: 'shareDialog.copyPathHint',
    needsPath: true,
    group: 'local',
  },
  {
    id: 'reveal',
    icon: FileSymlink,
    labelKey: 'shareDialog.reveal',
    hintKey: 'shareDialog.revealHint',
    needsPath: true,
    group: 'local',
  },
]

const GROUPS: Array<{ id: ActionDef['group']; labelKey: string }> = [
  { id: 'convert', labelKey: 'shareDialog.groupConvert' },
  { id: 'share', labelKey: 'shareDialog.groupShare' },
  { id: 'local', labelKey: 'shareDialog.groupLocal' },
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

        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => {
            const items = ACTIONS.filter((a) => a.group === group.id)
            if (items.length === 0) return null
            return (
              <section key={group.id} className="flex flex-col gap-1.5">
                <h3 className="m-0 px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
                  {t(group.labelKey)}
                </h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {items.map((action) => {
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
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
