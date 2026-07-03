import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useAtom, useAtomValue } from 'jotai'
import { ArrowDown, ArrowUp, CaseSensitive, Replace, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchPluginKey } from '@/lib/editor/search-extension'
import { findReplaceModeAtom, findReplaceOpenAtom } from '@/store/documents'

type FindReplaceBarProps = {
  editor: Editor | null
}

export function FindReplaceBar({ editor }: FindReplaceBarProps) {
  const [open, setOpen] = useAtom(findReplaceOpenAtom)
  const mode = useAtomValue(findReplaceModeAtom)
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
    setOpen(false)
    editor?.commands.clearSearch()
    editor?.commands.focus()
  }, [editor, setOpen])

  const goNext = useCallback(() => {
    editor?.commands.findNext()
    requestAnimationFrame(scrollToActive)
  }, [editor, scrollToActive])

  const goPrev = useCallback(() => {
    editor?.commands.findPrevious()
    requestAnimationFrame(scrollToActive)
  }, [editor, scrollToActive])

  if (!open || !editor) return null

  return (
    <div className="find-replace-bar titlebar-no-drag" role="search">
      <div className="find-replace-row">
        <div className="find-replace-field">
          <input
            ref={searchInputRef}
            className="find-replace-input"
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
          <span className="find-replace-count">
            {status.total === 0 ? (term ? '0' : '') : `${status.active + 1}/${status.total}`}
          </span>
        </div>

        <button
          type="button"
          className={cn('find-replace-icon-btn', caseSensitive && 'is-active')}
          title="Rozlišovať veľkosť písmen"
          onClick={() => setCaseSensitive((value) => !value)}
        >
          <CaseSensitive className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="find-replace-icon-btn"
          title="Predchádzajúca (⇧⏎)"
          onClick={goPrev}
          disabled={status.total === 0}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="find-replace-icon-btn"
          title="Ďalšia (⏎)"
          onClick={goNext}
          disabled={status.total === 0}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn('find-replace-icon-btn', showReplace && 'is-active')}
          title="Nahradiť"
          onClick={() => setShowReplace((value) => !value)}
        >
          <Replace className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="find-replace-icon-btn"
          title="Zavrieť (Esc)"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showReplace && (
        <div className="find-replace-row">
          <div className="find-replace-field">
            <input
              className="find-replace-input"
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
          <button
            type="button"
            className="find-replace-text-btn"
            onClick={() => {
              editor.commands.replaceCurrent(replacement)
              requestAnimationFrame(scrollToActive)
            }}
            disabled={status.total === 0}
          >
            Nahradiť
          </button>
          <button
            type="button"
            className="find-replace-text-btn"
            onClick={() => editor.commands.replaceAll(replacement)}
            disabled={status.total === 0}
          >
            Všetko
          </button>
        </div>
      )}
    </div>
  )
}
