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
import { resolveCommentDialog } from '@/lib/comment-dialog'
import { resolveCommentAuthor } from '@/lib/editor/comment-author'
import { useAppSelector } from '@/store/hooks'

export function CommentDialogHost() {
  const { t } = useTranslation()
  const dialog = useAppSelector((state) => state.ui.commentDialog) ?? { open: false as const }
  const nameRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!dialog.open) return
    setAuthor(dialog.defaultAuthor)
    setBody(dialog.defaultBody ?? '')
    const frame = window.requestAnimationFrame(() => {
      if (dialog.defaultAuthor.trim()) {
        bodyRef.current?.focus()
        return
      }
      nameRef.current?.focus()
      nameRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dialog])

  function close(result: { author: string; body: string } | null) {
    resolveCommentDialog(result)
  }

  function submit() {
    const nextBody = body.trim()
    if (!nextBody) return
    close({
      author: resolveCommentAuthor(author),
      body: nextBody,
    })
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    submit()
  }

  if (!dialog.open) return null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close(null)
      }}
    >
      <DialogContent className="titlebar-no-drag">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('editorActions.newComment')}</DialogTitle>
            <DialogDescription>{t('panels.comments.composerHint')}</DialogDescription>
          </DialogHeader>
          {dialog.quote ? (
            <blockquote className="mb-3.5 border-0 border-l-2 border-[var(--color-accent)] py-2 pl-2.5 font-[family-name:var(--font-sans)] text-[12px] italic leading-[1.45] text-[var(--color-muted-foreground)]">
              “{dialog.quote}”
            </blockquote>
          ) : null}

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              {t('panels.comments.authorLabel')}
            </span>
            <Input
              ref={nameRef}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder={t('panels.comments.authorPlaceholder')}
              autoComplete="nickname"
              maxLength={80}
            />
          </label>

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              {t('panels.comments.bodyLabel')}
            </span>
            <textarea
              ref={bodyRef}
              className="min-h-[92px] w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 font-[family-name:var(--font-sans)] text-[13px] leading-[1.45] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-selection)]"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('editorActions.commentPlaceholder')}
              rows={4}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  close(null)
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="default" size="sm" disabled={!body.trim()}>
              {t('editorActions.addComment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
