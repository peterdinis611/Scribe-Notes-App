import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAtomValue } from 'jotai'
import { Button } from '@/components/ui/button'
import { inputDialogAtom, resolveInputDialog } from '@/lib/input-dialog'

export function InputDialogHost() {
  const dialog = useAtomValue(inputDialogAtom)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!dialog.open) return
    setValue(dialog.defaultValue ?? '')
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dialog])

  if (!dialog.open || !mounted) return null

  function close(result: string | null) {
    resolveInputDialog(result)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    close(value.trim() || null)
  }

  return createPortal(
    <div className="input-dialog-backdrop titlebar-no-drag" onClick={() => close(null)}>
      <form
        className="input-dialog-card"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="input-dialog-title">{dialog.title}</h2>
        {dialog.description && <p className="input-dialog-desc">{dialog.description}</p>}
        <input
          ref={inputRef}
          type="text"
          className="input-dialog-input"
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
        <div className="input-dialog-actions">
          <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
            {dialog.cancelLabel ?? 'Zrušiť'}
          </Button>
          <Button type="submit" variant="default" size="sm">
            {dialog.confirmLabel ?? 'Potvrdiť'}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
