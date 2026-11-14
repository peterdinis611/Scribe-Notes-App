import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { findWikiGhostMatch, type WikiGhostCandidate } from '@/lib/editor/wiki-ghost'
import { nlpStatus, nlpSuggestWikiLinks } from '@/lib/db/nlp-api'
import { useAppSelector } from '@/store/hooks'

type WikiGhostHintProps = {
  editor: Editor | null
}

type HintState = {
  id: string
  title: string
  from: number
  to: number
  top: number
  left: number
}

export function WikiGhostHint({ editor }: WikiGhostHintProps) {
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const [hint, setHint] = useState<HintState | null>(null)
  const [nlpCandidates, setNlpCandidates] = useState<WikiGhostCandidate[]>([])

  useEffect(() => {
    if (!activeId) {
      setNlpCandidates([])
      return
    }
    let cancelled = false
    // Defer sidecar RPCs off the critical document-open path.
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void nlpStatus()
        .then((status) => {
          if (cancelled || !status.enabled || !status.sidecarOk) return []
          return nlpSuggestWikiLinks(activeId, 8)
        })
        .then((rows) => {
          if (cancelled || !Array.isArray(rows)) return
          setNlpCandidates(
            rows.map((row) => ({
              id: row.documentId,
              title: row.title,
              phrase: row.phrase || row.title,
            })),
          )
        })
        .catch(() => {
          if (!cancelled) setNlpCandidates([])
        })
    }, 1600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeId])

  useEffect(() => {
    if (!editor) return undefined
    const titles: WikiGhostCandidate[] = documents
      .filter((doc) => doc.id !== activeId && doc.deletedAt == null)
      .map((doc) => ({ id: doc.id, title: doc.title, phrase: doc.title }))
    const candidates = [...nlpCandidates, ...titles]

    const shell = editor.view.dom.closest('.editor-shell') as HTMLElement | null

    const placeHint = (from: number, to: number, id: string, title: string) => {
      try {
        const end = editor.view.coordsAtPos(to)
        const origin = shell?.getBoundingClientRect()
        if (!origin) {
          setHint(null)
          return
        }
        const scroller =
          (shell?.querySelector('.editor-scroll') as HTMLElement | null) ?? shell
        const visible = scroller?.getBoundingClientRect()
        if (
          visible &&
          (end.bottom < visible.top + 4 || end.top > visible.bottom - 4)
        ) {
          setHint(null)
          return
        }
        // Keep clear of the footnotes widget / status chrome.
        const footnotes = editor.view.dom.querySelector('.footnotes-section')
        if (footnotes) {
          const fr = footnotes.getBoundingClientRect()
          if (end.bottom >= fr.top - 12) {
            setHint(null)
            return
          }
        }
        setHint({
          id,
          title,
          from,
          to,
          top: end.bottom - origin.top + 6,
          left: Math.min(Math.max(8, end.left - origin.left), Math.max(8, origin.width - 200)),
        })
      } catch {
        setHint(null)
      }
    }

    const scan = () => {
      if (!editor.isEditable || editor.isDestroyed) {
        setHint(null)
        return
      }
      const { $from } = editor.state.selection
      if ($from.parent.type.name === 'doc') {
        setHint(null)
        return
      }
      const paragraph = $from.parent.textContent
      const match = findWikiGhostMatch(paragraph, candidates)
      if (!match) {
        setHint(null)
        return
      }
      const parentStart = $from.start()
      const from = parentStart + match.start
      const to = parentStart + match.end
      // Only offer when the caret is on / next to the matched phrase.
      const caret = editor.state.selection.from
      if (caret < from - 1 || caret > to + 1) {
        setHint(null)
        return
      }
      let alreadyLinked = false
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (node.type.name === 'wikiLink') alreadyLinked = true
      })
      if (alreadyLinked) {
        setHint(null)
        return
      }
      placeHint(from, to, match.id, match.title)
    }

    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(scan, 420)
    }
    schedule()
    editor.on('update', schedule)
    editor.on('selectionUpdate', schedule)
    shell?.addEventListener('scroll', schedule, true)
    return () => {
      window.clearTimeout(timer)
      editor.off('update', schedule)
      editor.off('selectionUpdate', schedule)
      shell?.removeEventListener('scroll', schedule, true)
    }
  }, [activeId, documents, editor, nlpCandidates])

  if (!editor || !hint) return null

  return (
    <button
      type="button"
      className="wiki-ghost-hint titlebar-no-drag"
      style={{ top: hint.top, left: hint.left }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        editor
          .chain()
          .focus()
          .insertContentAt({ from: hint.from, to: hint.to }, [
            { type: 'wikiLink', attrs: { targetId: hint.id, label: hint.title } },
            { type: 'text', text: ' ' },
          ])
          .run()
        setHint(null)
      }}
    >
      {t('wikiGhost.hint', { title: hint.title })}
    </button>
  )
}
