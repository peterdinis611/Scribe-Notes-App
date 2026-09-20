import { findWikiGhostMatch } from '@/lib/editor/wiki-ghost'
import { requireOpenEditor } from '@/lib/editor/insert-ai-answer'
import type { WikiLinkSuggestion } from '@/lib/db/nlp-api'

/** Replace the first unbound phrase occurrence with a wiki link, or insert at cursor. */
export function applyWikiSuggestion(suggestion: WikiLinkSuggestion): 'linked' | 'inserted' | 'failed' {
  const editor = requireOpenEditor()
  if (!editor) return 'failed'

  const phrase = (suggestion.phrase || suggestion.title || '').trim()
  const label = (suggestion.title || suggestion.phrase || '').trim()
  if (!phrase || !label || !suggestion.documentId) return 'failed'

  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n')
  const candidates = [
    {
      id: suggestion.documentId,
      title: label,
      phrase,
    },
  ]

  // Prefer matching inside the paragraph under the cursor, then scan whole doc paragraphs.
  const { $from } = editor.state.selection
  const local = findWikiGhostMatch($from.parent.textContent, candidates)
  if (local) {
    const parentStart = $from.start()
    const from = parentStart + local.start
    const to = parentStart + local.end
    const ok = editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, [
        { type: 'wikiLink', attrs: { targetId: suggestion.documentId, label } },
        { type: 'text', text: ' ' },
      ])
      .run()
    return ok ? 'linked' : 'failed'
  }

  // Fallback: find first paragraph containing the phrase.
  let applied = false
  editor.state.doc.descendants((node, pos) => {
    if (applied || !node.isTextblock) return
    const match = findWikiGhostMatch(node.textContent, candidates)
    if (!match) return
    const from = pos + 1 + match.start
    const to = pos + 1 + match.end
    applied = editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, [
        { type: 'wikiLink', attrs: { targetId: suggestion.documentId, label } },
        { type: 'text', text: ' ' },
      ])
      .run()
  })
  if (applied) return 'linked'

  const ok = editor
    .chain()
    .focus()
    .insertContent([
      { type: 'wikiLink', attrs: { targetId: suggestion.documentId, label } },
      { type: 'text', text: ' ' },
    ])
    .run()
  return ok ? 'inserted' : 'failed'
}

export function applySpellSuggestion(word: string, replacement: string): boolean {
  const editor = requireOpenEditor()
  if (!editor || !word.trim() || !replacement.trim()) return false

  // Prefer active Find match if it already points at this word.
  const replaced = editor.commands.replaceCurrent(replacement)
  if (replaced) return true

  // Otherwise find first occurrence of the word and replace that span.
  let done = false
  editor.state.doc.descendants((node, pos) => {
    if (done || !node.isText) return
    const text = node.text ?? ''
    const index = text.toLocaleLowerCase().indexOf(word.toLocaleLowerCase())
    if (index < 0) return
    const from = pos + index
    const to = from + word.length
    done = editor.chain().focus().insertContentAt({ from, to }, replacement).run()
  })
  return done
}
