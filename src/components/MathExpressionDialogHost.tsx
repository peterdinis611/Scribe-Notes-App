import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
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
import { evaluateMathExpression, MATH_JS_EXAMPLES } from '@/lib/editor/math-js'
import { resolveMathDialog } from '@/lib/math-dialog'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

export function MathExpressionDialogHost() {
  const { t } = useTranslation()
  const dialog = useAppSelector((state) => state.ui.mathDialog)
  const open = dialog.open
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const [value, setValue] = useState('')
  const deferred = useDeferredValue(value)

  useEffect(() => {
    if (!open || !dialog.open) return
    setValue(dialog.initialExpression)
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dialog, open])

  const evaluation = useMemo(() => evaluateMathExpression(deferred), [deferred])

  function close(result: Parameters<typeof resolveMathDialog>[0]) {
    resolveMathDialog(result)
  }

  function submit() {
    if (!dialog.open) return
    const trimmed = value.trim()
    if (!trimmed) {
      if (dialog.intent === 'edit') {
        close({ expression: '', clear: true })
      }
      return
    }
    if (!evaluation.ok && deferred.trim() === trimmed) return
    close({ expression: trimmed, clear: false })
  }

  const isBlock = open && dialog.mode === 'block'
  const intent = open ? dialog.intent : 'insert'
  const title = open
    ? intent === 'edit'
      ? t(isBlock ? 'math.editBlockTitle' : 'math.editInlineTitle')
      : t(isBlock ? 'math.insertBlockTitle' : 'math.insertInlineTitle')
    : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(null)
      }}
    >
      {open ? (
        <DialogContent className="titlebar-no-drag max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--color-border)] px-5 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t('math.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 px-5 py-4">
            <label className="grid gap-1.5 text-[12px] text-[var(--color-muted-foreground)]" htmlFor={fieldId}>
              {t('math.expressionLabel')}
              <textarea
                id={fieldId}
                ref={textareaRef}
                className={cn(
                  'math-dialog-input titlebar-no-drag w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[13px] leading-relaxed text-[var(--color-foreground)] outline-none',
                  'focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_35%,transparent)]',
                )}
                rows={isBlock ? 6 : 3}
                value={value}
                spellCheck={false}
                placeholder={isBlock ? MATH_JS_EXAMPLES.block : MATH_JS_EXAMPLES.inline}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    close(null)
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
            </label>

            <div
              className={cn(
                'math-dialog-preview rounded-[var(--radius-sm)] border px-3 py-2.5 font-mono text-[13px]',
                evaluation.ok
                  ? 'border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-accent)_8%,var(--color-surface))]'
                  : deferred.trim()
                    ? 'border-[color-mix(in_oklab,#dc2626_35%,var(--color-border))] bg-[color-mix(in_oklab,#dc2626_8%,var(--color-surface))]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]',
              )}
              aria-live="polite"
            >
              {deferred.trim() === '' ? (
                <span className="text-[var(--color-muted-foreground)]">{t('math.previewEmpty')}</span>
              ) : evaluation.ok ? (
                <p className="m-0">
                  <span className="text-[var(--color-muted-foreground)]">{t('math.result')}</span>{' '}
                  <span className="font-semibold text-[var(--color-foreground)]">{evaluation.result}</span>
                </p>
              ) : (
                <p className="m-0 text-[#b91c1c]">{evaluation.error}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MATH_JS_EXAMPLES.chips.slice(0, isBlock ? 12 : 8).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border border-[var(--color-border)] bg-transparent px-2 py-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-foreground)]"
                  onClick={() => setValue(chip)}
                >
                  {chip.includes('\n') ? `${chip.split('\n')[0]}…` : chip}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--color-border)] px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            {intent === 'edit' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => close({ expression: '', clear: true })}
              >
                {t('math.remove')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!value.trim() || (!evaluation.ok && value.trim() === deferred.trim())}
              onClick={submit}
            >
              {intent === 'edit' ? t('common.save') : t('math.insert')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
