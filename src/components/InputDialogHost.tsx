import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { resolveInputDialog } from '@/lib/input-dialog'
import { useAppSelector } from '@/store/hooks'

export function InputDialogHost() {
  const { t } = useTranslation()
  const dialog = useAppSelector((state) => state.ui.inputDialog)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!dialog.open) return
    setValue(dialog.defaultValue ?? '')
    const frame = window.requestAnimationFrame(() => {
      if (dialog.multiline) {
        textareaRef.current?.focus()
        textareaRef.current?.select()
      } else {
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dialog])

  function close(result: string | null) {
    resolveInputDialog(result)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    close(dialog.multiline ? value : value.trim())
  }

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) close(null)
      }}
    >
      {dialog.open && (
        <DialogContent className={dialog.multiline ? 'titlebar-no-drag max-w-lg' : 'titlebar-no-drag'}>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              {dialog.description && <DialogDescription>{dialog.description}</DialogDescription>}
            </DialogHeader>
            {dialog.multiline ? (
              <textarea
                ref={textareaRef}
                className="input-dialog-textarea titlebar-no-drag flex min-h-[10rem] w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[13px] leading-relaxed text-[var(--color-foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-selection)]"
                value={value}
                placeholder={dialog.placeholder}
                rows={8}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    close(null)
                  }
                  // Cmd/Ctrl+Enter submits multiline.
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    close(value)
                  }
                }}
              />
            ) : (
              <Input
                ref={inputRef}
                type={dialog.password ? 'password' : 'text'}
                autoComplete={dialog.password ? 'current-password' : 'off'}
                value={value}
                placeholder={dialog.placeholder}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    close(null)
                  }
                }}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
                {dialog.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button type="submit" variant="default" size="sm">
                {dialog.confirmLabel ?? t('common.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
