import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { findWikiGhostMatch, type WikiGhostCandidate } from '@/lib/editor/wiki-ghost'
import { nlpStatus, nlpSuggestWikiLinks } from '@/lib/db/nlp-api'
import { useAppSelector } from '@/store/hooks'

type WikiGhostHintProps = {
  editor: Editor | null
}

export function WikiGhostHint({ editor }: WikiGhostHintProps) {
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const [hint, setHint] = useState<{ id: string; title: string; from: number; to: number } | null>(null)
  const [nlpCandidates, setNlpCandidates] = useState<WikiGhostCandidate[]>([])

  useEffect(() => {
    if (!activeId) {
      setNlpCandidates([])
      return
    }
    let cancelled = false
    void nlpStatus()
      .then((status) => {
        if (!status.enabled || !status.sidecarOk) return []
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
    return () => {
      cancelled = true
    }
  }, [activeId])

  useEffect(() => {
    if (!editor) return undefined
    const titles: WikiGhostCandidate[] = documents
      .filter((doc) => doc.id !== activeId && doc.deletedAt == null)
      .map((doc) => ({ id: doc.id, title: doc.title, phrase: doc.title }))
    const candidates = [...nlpCandidates, ...titles]

    const scan = () => {
      const { $from } = editor.state.selection
      const paragraph = $from.parent.textContent
      const match = findWikiGhostMatch(paragraph, candidates)
      if (!match) {
        setHint(null)
        return
      }
      const parentStart = $from.start()
      const from = parentStart + match.start
      const to = parentStart + match.end
      let alreadyLinked = false
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (node.type.name === 'wikiLink') alreadyLinked = true
      })
      if (alreadyLinked) {
        setHint(null)
        return
      }
      setHint({
        id: match.id,
        title: match.title,
        from,
        to,
      })
    }

    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(scan, 420)
    }
    schedule()
    editor.on('update', schedule)
    editor.on('selectionUpdate', schedule)
    return () => {
      window.clearTimeout(timer)
      editor.off('update', schedule)
      editor.off('selectionUpdate', schedule)
    }
  }, [activeId, documents, editor, nlpCandidates])

  if (!editor || !hint) return null

  return (
    <button
      type="button"
      className="wiki-ghost-hint titlebar-no-drag"
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
