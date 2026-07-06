import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, CaseSensitive, Replace, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchPluginKey } from '@/lib/editor/search-extension'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setFindReplaceOpen } from '@/store/documentsSlice'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type FindReplaceBarProps = {
  editor: Editor | null
}

export function FindReplaceBar({ editor }: FindReplaceBarProps) {
  const open = useAppSelector((state) => state.documents.findReplaceOpen)
  const mode = useAppSelector((state) => state.documents.findReplaceMode)
  const dispatch = useAppDispatch()
  const [term, setTerm] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [status, setStatus] = useState({ total: 0, active: -1 })
  const searchInputRef = useRef<HTMLInputElement>(null)

  const scrollToActive = useCallback(() => {
    if (!editor) return
    const search = searchPluginKey.getState(editor.state)
    if (!search || search.activeIndex < 0) return
    const match = search.matches[search.activeIndex]
    if (!match) return
    const dom = editor.view.domAtPos(match.from)?.node as HTMLElement | undefined
    const element = dom?.nodeType === 1 ? dom : dom?.parentElement
    element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const search = searchPluginKey.getState(editor.state)
      setStatus({ total: search?.matches.length ?? 0, active: search?.activeIndex ?? -1 })
    }
    editor.on('transaction', update)
    update()
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  useEffect(() => {
    if (open) {
      setShowReplace(mode === 'replace')
      const selected = editor?.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' ',
      )
      if (selected && selected.length <= 80) {
        setTerm(selected)
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      })
    }
  }, [open, editor])

  useEffect(() => {
    if (!editor) return
    if (!open) {
      editor.commands.clearSearch()
      return
    }
    editor.commands.setSearchTerm(term, { caseSensitive })
    requestAnimationFrame(scrollToActive)
  }, [editor, open, term, caseSensitive, scrollToActive])

  const handleClose = useCallback(() => {
    dispatch(setFindReplaceOpen(false))
    editor?.commands.clearSearch()
    editor?.commands.focus()
  }, [dispatch, editor])

  const goNext = useCallback(() => {
    editor?.commands.findNext()
    requestAnimationFrame(scrollToActive)
  }, [editor, scrollToActive])

  const goPrev = useCallback(() => {
    editor?.commands.findPrevious()
    requestAnimationFrame(scrollToActive)
  }, [editor, scrollToActive])

  if (!open || !editor) return null

  const iconBtnClass =
    'inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] disabled:opacity-35'

  return (
    <div
      className="absolute right-5 top-2 z-30 flex flex-col gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)] titlebar-no-drag"
      role="search"
    >
      <div className="flex items-center gap-1">
        <div className="relative flex min-w-[220px] items-center">
          <Input
            ref={searchInputRef}
            className="h-8 pr-12 text-[13px]"
            placeholder="Hľadať v dokumente…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (event.shiftKey) goPrev()
                else goNext()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                handleClose()
              }
            }}
          />
          <span className="pointer-events-none absolute right-2.5 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
            {status.total === 0 ? (term ? '0' : '') : `${status.active + 1}/${status.total}`}
          </span>
        </div>

        <button
          type="button"
          className={cn(iconBtnClass, caseSensitive && 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]')}
          title="Rozlišovať veľkosť písmen"
          onClick={() => setCaseSensitive((value) => !value)}
        >
          <CaseSensitive className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtnClass}
          title="Predchádzajúca (⇧⏎)"
          onClick={goPrev}
          disabled={status.total === 0}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtnClass}
          title="Ďalšia (⏎)"
          onClick={goNext}
          disabled={status.total === 0}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtnClass, showReplace && 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]')}
          title="Nahradiť"
          onClick={() => setShowReplace((value) => !value)}
        >
          <Replace className="h-4 w-4" />
        </button>
        <button type="button" className={iconBtnClass} title="Zavrieť (Esc)" onClick={handleClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-1">
          <div className="relative flex min-w-[220px] items-center">
            <Input
              className="h-8 text-[13px]"
              placeholder="Nahradiť za…"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  handleClose()
                }
              }}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              editor.commands.replaceCurrent(replacement)
              requestAnimationFrame(scrollToActive)
            }}
            disabled={status.total === 0}
          >
            Nahradiť
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => editor.commands.replaceAll(replacement)}
            disabled={status.total === 0}
          >
            Všetko
          </Button>
        </div>
      )}
    </div>
  )
}
