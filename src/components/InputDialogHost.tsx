import { useEffect, useRef, useState } from 'react'
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
  const dialog = useAppSelector((state) => state.ui.inputDialog)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!dialog.open) return
    setValue(dialog.defaultValue ?? '')
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dialog])

  function close(result: string | null) {
    resolveInputDialog(result)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    close(value.trim() || null)
  }

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) close(null)
      }}
    >
      {dialog.open && (
        <DialogContent className="titlebar-no-drag">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              {dialog.description && <DialogDescription>{dialog.description}</DialogDescription>}
            </DialogHeader>
            <Input
              ref={inputRef}
              type="text"
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
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
                {dialog.cancelLabel ?? 'Zrušiť'}
              </Button>
              <Button type="submit" variant="default" size="sm">
                {dialog.confirmLabel ?? 'Potvrdiť'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
