import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resolveAiResultDialog } from '@/lib/ai/ai-result-dialog'
import { useAppSelector } from '@/store/hooks'

export function AiResultDialogHost() {
  const { t } = useTranslation()
  const dialog = useAppSelector((state) => state.ui.aiResultDialog)

  function handleCancel() {
    dialog.open && dialog.onCancel?.()
    resolveAiResultDialog('cancel')
  }

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) handleCancel()
      }}
    >
      {dialog.open && (
        <DialogContent className="titlebar-no-drag max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.title}</DialogTitle>
            <DialogDescription>
              {dialog.loading ? t('ai.dialog.loading') : t('ai.dialog.preview')}
            </DialogDescription>
          </DialogHeader>

          {dialog.loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--color-muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('ai.dialog.working')}
            </div>
          ) : (
            <textarea
              readOnly
              className="min-h-[160px] w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-foreground)] outline-none"
              value={dialog.result}
            />
          )}

          <DialogFooter>
            {dialog.loading ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => resolveAiResultDialog('discard')}>
                  {t('ai.dialog.discard')}
                </Button>
                <Button type="button" variant="default" size="sm" onClick={() => resolveAiResultDialog('apply')}>
                  {t('ai.dialog.apply')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
