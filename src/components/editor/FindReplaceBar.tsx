import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, CaseSensitive, Regex, Replace, WholeWord, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchPluginKey } from '@/lib/editor/search-extension'
import { isEditorViewReady, runEditorCommand } from '@/lib/editor/view-ready'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setFindReplaceMode,
  setFindReplaceOpen,
  setPendingEditorSearch,
} from '@/store/documentsSlice'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function clearEditorSearch(editor: Editor | null) {
  if (!editor || editor.isDestroyed) return
  try {
    editor.commands.clearSearch()
  } catch {
    // view not mounted
  }
}

function focusEditor(editor: Editor | null) {
  if (!editor || editor.isDestroyed) return
  try {
    editor.commands.focus()
  } catch {
    // view not mounted
  }
}

type FindReplaceBarProps = {
  editor: Editor | null
}

export function FindReplaceBar({ editor }: FindReplaceBarProps) {
  const { t } = useTranslation()
  const open = useAppSelector((state) => state.documents.findReplaceOpen)
  const mode = useAppSelector((state) => state.documents.findReplaceMode)
  const pendingEditorSearch = useAppSelector((state) => state.documents.pendingEditorSearch)
  const dispatch = useAppDispatch()
  const [term, setTerm] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [status, setStatus] = useState({ total: 0, active: -1, regexError: null as string | null })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pendingTermRef = useRef<string | null>(null)

  const scrollToActive = useCallback(() => {
    if (!editor) return
    const search = searchPluginKey.getState(editor.state)
    if (!search || search.activeIndex < 0) return
    const match = search.matches[search.activeIndex]
    if (!match) return
    try {
      const dom = editor.view.domAtPos(match.from)?.node as HTMLElement | undefined
      const element = dom?.nodeType === 1 ? dom : dom?.parentElement
      element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    } catch {
      // view not mounted yet
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const search = searchPluginKey.getState(editor.state)
      setStatus({
        total: search?.matches.length ?? 0,
        active: search?.activeIndex ?? -1,
        regexError: search?.regexError ?? null,
      })
    }
    editor.on('transaction', update)
    update()
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  useEffect(() => {
    if (!editor || !pendingEditorSearch || !isEditorViewReady(editor)) return

    const searchTerm = pendingEditorSearch
    pendingTermRef.current = searchTerm
    dispatch(setPendingEditorSearch(null))
    setTerm(searchTerm)
    dispatch(setFindReplaceMode('find'))
    dispatch(setFindReplaceOpen(true))
  }, [dispatch, editor, pendingEditorSearch])

  useEffect(() => {
    if (!open) return

    setShowReplace(mode === 'replace')
    const pendingTerm = pendingTermRef.current
    if (pendingTerm) {
      pendingTermRef.current = null
      setTerm(pendingTerm)
    } else if (editor && !editor.isDestroyed) {
      const selected = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' ',
      )
      if (selected && selected.length <= 80) {
        setTerm(selected)
      }
    }
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [open, editor, mode])

  useEffect(() => {
    if (!editor || !open) {
      if (!open) clearEditorSearch(editor)
      return
    }
    if (!isEditorViewReady(editor)) return

    runEditorCommand(editor, (currentEditor) => {
      currentEditor.commands.setSearchTerm(term, { caseSensitive, wholeWord, regex })
    })
    requestAnimationFrame(scrollToActive)
  }, [editor, open, term, caseSensitive, wholeWord, regex, scrollToActive])

  const handleClose = useCallback(() => {
    dispatch(setFindReplaceOpen(false))
    clearEditorSearch(editor)
    focusEditor(editor)
  }, [dispatch, editor])

  const goNext = useCallback(() => {
    runEditorCommand(editor, (currentEditor) => {
      currentEditor.commands.findNext()
    })
    requestAnimationFrame(scrollToActive)
  }, [editor, scrollToActive])

  const goPrev = useCallback(() => {
    runEditorCommand(editor, (currentEditor) => {
      currentEditor.commands.findPrevious()
    })
    requestAnimationFrame(scrollToActive)
  }, [editor, scrollToActive])

  if (!open) return null

  const iconBtnClass =
    'inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] disabled:opacity-35'

  const toggleActive = (active: boolean) =>
    active && 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]'

  return (
    <div
      className="absolute right-5 top-2 z-30 flex flex-col gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)] titlebar-no-drag"
      role="search"
    >
      <div className="flex items-center gap-1">
        <div className="relative flex min-w-[220px] items-center">
          <Input
            ref={searchInputRef}
            className={cn('h-8 pr-12 text-[13px]', status.regexError && 'border-[var(--color-danger,#c44)]')}
            placeholder={regex ? t('findReplace.regexPlaceholder') : t('findReplace.findPlaceholder')}
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
            aria-invalid={Boolean(status.regexError)}
            title={status.regexError ?? undefined}
          />
          <span className="pointer-events-none absolute right-2.5 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
            {status.regexError
              ? '!'
              : status.total === 0
                ? term
                  ? '0'
                  : ''
                : `${status.active + 1}/${status.total}`}
          </span>
        </div>

        <button
          type="button"
          className={cn(iconBtnClass, toggleActive(caseSensitive))}
          title={t('findReplace.matchCase')}
          onClick={() => setCaseSensitive((value) => !value)}
        >
          <CaseSensitive className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtnClass, toggleActive(wholeWord))}
          title={t('findReplace.wholeWord')}
          onClick={() => setWholeWord((value) => !value)}
        >
          <WholeWord className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtnClass, toggleActive(regex))}
          title={t('findReplace.regex')}
          onClick={() => setRegex((value) => !value)}
        >
          <Regex className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtnClass}
          title={t('findReplace.previous')}
          onClick={goPrev}
          disabled={status.total === 0}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtnClass}
          title={t('findReplace.next')}
          onClick={goNext}
          disabled={status.total === 0}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtnClass, toggleActive(showReplace))}
          title={t('findReplace.replace')}
          onClick={() => setShowReplace((value) => !value)}
        >
          <Replace className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtnClass}
          title={t('findReplace.close')}
          aria-label={t('findReplace.closeAria')}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleClose()
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {status.regexError && (
        <p className="m-0 max-w-[420px] px-1 text-[11px] text-[var(--color-danger,#c44)]">
          {t('findReplace.invalidRegex')}
        </p>
      )}

      {showReplace && (
        <div className="flex items-center gap-1">
          <div className="relative flex min-w-[220px] items-center">
            <Input
              className="h-8 text-[13px]"
              placeholder={
                regex ? t('findReplace.replaceWithRegex') : t('findReplace.replaceWith')
              }
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
              runEditorCommand(editor, (currentEditor) => {
                currentEditor.commands.replaceCurrent(replacement)
              })
              requestAnimationFrame(scrollToActive)
            }}
            disabled={status.total === 0}
          >
            {t('findReplace.replace')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              runEditorCommand(editor, (currentEditor) => {
                currentEditor.commands.replaceAll(replacement)
              })
            }}
            disabled={status.total === 0}
          >
            {t('findReplace.replaceAll')}
          </Button>
        </div>
      )}
    </div>
  )
}
