import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import {
  getConfirmDialogState,
  resolveConfirmDialog,
  subscribeConfirmDialog,
} from '@/lib/confirm-dialog'
import { cn } from '@/lib/utils'

export function ConfirmDialogHost() {
  const { t } = useTranslation()
  const dialog = useSyncExternalStore(subscribeConfirmDialog, getConfirmDialogState, getConfirmDialogState)

  return (
    <AlertDialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) resolveConfirmDialog(false)
      }}
    >
      {dialog.open ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConfirmDialog(false)}>
              {dialog.cancelLabel ?? t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                dialog.destructive &&
                  buttonVariants({ variant: 'destructive', size: 'sm' }),
              )}
              onClick={() => resolveConfirmDialog(true)}
            >
              {dialog.okLabel ?? t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  )
}
