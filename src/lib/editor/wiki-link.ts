import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import type { Range } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { createDocument, findDocumentsByTitle } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { toast } from '@/lib/toast'
import { WikiLinkSuggestionList, type WikiLinkItem } from '@/components/editor/WikiLinkSuggestionList'
import { store } from '@/store/index'
import { updateDocuments } from '@/store/documentsSlice'

export type ParsedWikiLink = {
  title: string
  heading: string | null
  alias: string | null
  displayLabel: string
}

/** Obsidian-style `[[Title#Heading|Alias]]` inner (without brackets). */
export function parseWikiLinkRaw(raw: string): ParsedWikiLink {
  const trimmed = raw.trim()
  const pipeIdx = trimmed.lastIndexOf('|')
  let main = trimmed
  let alias: string | null = null
  if (pipeIdx >= 0) {
    alias = trimmed.slice(pipeIdx + 1).trim() || null
    main = trimmed.slice(0, pipeIdx).trim()
  }
  const hashIdx = main.indexOf('#')
  let title = main
  let heading: string | null = null
  if (hashIdx >= 0) {
    title = main.slice(0, hashIdx).trim()
    heading = main.slice(hashIdx + 1).trim() || null
  }
  const displayLabel = alias ?? (heading ? `${title}#${heading}` : title)
  return { title, heading, alias, displayLabel }
}

export function formatWikiLinkRenderText(attrs: {
  label: string
  linkTitle?: string | null
  heading?: string | null
}): string {
  const linkTitle = (attrs.linkTitle?.trim() || attrs.label.trim()) || ''
  const heading = attrs.heading?.trim() || null
  const label = attrs.label
  const defaultDisplay = heading ? `${linkTitle}#${heading}` : linkTitle
  if (label !== defaultDisplay) {
    const main = heading ? `${linkTitle}#${heading}` : linkTitle
    return `[[${main}|${label}]]`
  }
  if (heading) return `[[${linkTitle}#${heading}]]`
  return `[[${linkTitle}]]`
}

function wikiLinkNodeLabel(parsed: ParsedWikiLink, resolvedTitle: string): string {
  if (parsed.alias || parsed.heading) return parsed.displayLabel
  return resolvedTitle
}

function wikiLinkNodeAttrs(
  targetId: string | null,
  parsed: ParsedWikiLink,
  resolvedTitle: string,
) {
  return {
    targetId,
    label: wikiLinkNodeLabel(parsed, resolvedTitle),
    linkTitle: parsed.title,
    heading: parsed.heading,
  }
}

function wikiLinkLabelMatches(
  node: { attrs: Record<string, unknown> },
  attrs: { label: string; linkTitle?: string },
): boolean {
  if (node.attrs.label === attrs.label) return true
  const linkTitle = attrs.linkTitle?.trim()
  if (!linkTitle) return false
  if (node.attrs.linkTitle === linkTitle) return true
  if (!node.attrs.linkTitle && node.attrs.label === linkTitle) return true
  return false
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      /** Insert a wiki-link node pointing at a document. */
      insertWikiLink: (attrs: {
        targetId: string
        label: string
        linkTitle?: string
        heading?: string | null
      }) => ReturnType
      /** Fill in the target id for every unresolved link with a matching label. */
      resolveWikiLinkLabel: (attrs: {
        label: string
        targetId: string
        linkTitle?: string
      }) => ReturnType
    }
  }
}

/** Local exact match — used when closing `]]` and as offline fallback. */
function resolveTitleLocal(title: string): { targetId: string | null; label: string } {
  const { documents: docs, activeDocumentId: activeId } = store.getState().documents
  const match = docs.find(
    (doc) => doc.id !== activeId && doc.title.toLowerCase() === title.toLowerCase(),
  )
  return match ? { targetId: match.id, label: match.title } : { targetId: null, label: title }
}

async function resolveTitle(title: string): Promise<{ targetId: string | null; label: string }> {
  const local = resolveTitleLocal(title)
  if (local.targetId) return local
  try {
    const { activeDocumentId: activeId } = store.getState().documents
    const hits = await findDocumentsByTitle(title, 5)
    const best = hits.find((hit) => hit.id !== activeId && hit.score >= 0.86)
    if (best) return { targetId: best.id, label: best.title }
  } catch {
    // Offline / invoke failure — keep unresolved.
  }
  return local
}

async function createAndResolveLabel(
  editor: Editor,
  linkTitle: string,
  displayLabel?: string,
) {
  try {
    const doc = await createDocument({ title: linkTitle })
    store.dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
    editor
      .chain()
      .resolveWikiLinkLabel({
        label: displayLabel ?? linkTitle,
        linkTitle,
        targetId: doc.id,
      })
      .run()
  } catch (error) {
    toast.error('Nepodarilo sa vytvoriť dokument', String(error))
  }
}

const MAX_RESULTS = 8

function filterDocumentsLocal(query: string): WikiLinkItem[] {
  const { documents: docs, activeDocumentId: activeId } = store.getState().documents
  const q = query.trim().toLowerCase()

  const items: WikiLinkItem[] = docs
    .filter((doc) => doc.id !== activeId && (!q || doc.title.toLowerCase().includes(q)))
    .slice(0, MAX_RESULTS)
    .map((doc) => ({ id: doc.id, title: doc.title }))

  const trimmed = query.trim()
  if (trimmed && !docs.some((doc) => doc.title.toLowerCase() === trimmed.toLowerCase())) {
    items.push({ id: '__create__', title: trimmed, isCreate: true, query: trimmed })
  }

  return items
}

async function filterDocuments(query: string): Promise<WikiLinkItem[]> {
  const parsedQuery = parseWikiLinkRaw(query)
  const trimmed = parsedQuery.title.trim() || query.trim()
  const { activeDocumentId: activeId, documents: docs } = store.getState().documents

  if (!trimmed) {
    return filterDocumentsLocal(query)
  }

  try {
    const hits = await findDocumentsByTitle(trimmed, MAX_RESULTS)
    const items: WikiLinkItem[] = hits
      .filter((hit) => hit.id !== activeId)
      .slice(0, MAX_RESULTS)
      .map((hit) => ({ id: hit.id, title: hit.title }))

    const hasExact = items.some((item) => item.title.toLowerCase() === trimmed.toLowerCase())
      || docs.some((doc) => doc.title.toLowerCase() === trimmed.toLowerCase())
    if (!hasExact) {
      items.push({ id: '__create__', title: trimmed, isCreate: true, query: trimmed })
    }
    return items
  } catch {
    return filterDocumentsLocal(trimmed)
  }
}

function insertNode(editor: Editor, range: Range, targetId: string, parsed: ParsedWikiLink) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: 'wikiLink',
        attrs: wikiLinkNodeAttrs(targetId, parsed, parsed.title),
      },
      { type: 'text', text: ' ' },
    ])
    .run()
}

async function createAndInsert(editor: Editor, range: Range, title: string) {
  try {
    const doc = await createDocument({ title })
    store.dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
    insertNode(editor, range, doc.id, parseWikiLinkRaw(doc.title))
  } catch (error) {
    toast.error('Nepodarilo sa vytvoriť dokument', String(error))
  }
}

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-target-id'),
        renderHTML: (attributes) =>
          attributes.targetId ? { 'data-target-id': attributes.targetId } : {},
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? element.textContent ?? '',
        renderHTML: (attributes) => ({ 'data-label': attributes.label }),
      },
      linkTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-link-title'),
        renderHTML: (attributes) =>
          attributes.linkTitle ? { 'data-link-title': attributes.linkTitle } : {},
      },
      heading: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-heading'),
        renderHTML: (attributes) =>
          attributes.heading ? { 'data-heading': attributes.heading } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wiki-link]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string) || 'Bez názvu'
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-wiki-link': '',
        class: node.attrs.targetId ? 'wiki-link' : 'wiki-link wiki-link--unresolved',
      }),
      `${label}`,
    ]
  },

  renderText({ node }) {
    return formatWikiLinkRenderText({
      label: (node.attrs.label as string) || '',
      linkTitle: node.attrs.linkTitle as string | null,
      heading: node.attrs.heading as string | null,
    })
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs },
              { type: 'text', text: ' ' },
            ])
            .run(),
      resolveWikiLinkLabel:
        (attrs) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[this.name]
          if (!type) return false
          let changed = false
          state.doc.descendants((node, pos) => {
            if (
              node.type === type &&
              !node.attrs.targetId &&
              wikiLinkLabelMatches(node, attrs)
            ) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, targetId: attrs.targetId })
              changed = true
            }
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },

  addInputRules() {
    const editor = this.editor
    return [
      new InputRule({
        find: /\[\[([^[\]\n]+)]]$/,
        handler: ({ range, match, chain }) => {
          const raw = match[1]?.trim()
          if (!raw) return
          const parsed = parseWikiLinkRaw(raw)
          if (!parsed.title) return
          const local = resolveTitleLocal(parsed.title)
          chain()
            .insertContentAt({ from: range.from, to: range.to }, [
              {
                type: this.name,
                attrs: wikiLinkNodeAttrs(local.targetId, parsed, local.label),
              },
              { type: 'text', text: ' ' },
            ])
            .run()
          if (local.targetId) return
          void resolveTitle(parsed.title).then(({ targetId }) => {
            if (targetId) {
              editor
                .chain()
                .resolveWikiLinkLabel({
                  label: wikiLinkNodeLabel(parsed, parsed.title),
                  linkTitle: parsed.title,
                  targetId,
                })
                .run()
              return
            }
            void createAndResolveLabel(editor, parsed.title, parsed.displayLabel)
          })
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<WikiLinkItem>({
        editor: this.editor,
        pluginKey: new PluginKey('wikiLinkSuggestion'),
        char: '[[',
        startOfLine: false,
        allowSpaces: true,
        items: ({ query }) => filterDocuments(query),
        placement: 'bottom-start',
        floatingUi: {
          strategy: 'fixed',
        },
        command: ({ editor, range, props }) => {
          const typed = parseWikiLinkRaw(
            (editor.state.doc.textBetween(range.from, range.to, '') || '').replace(/^\[\[/, ''),
          )
          if (props.isCreate) {
            const createTitle = props.query ?? props.title
            void createAndInsert(editor, range, createTitle)
            return
          }
          insertNode(
            editor,
            range,
            props.id,
            {
              title: props.title,
              heading: typed.heading,
              alias: typed.alias,
              displayLabel: typed.alias ?? (typed.heading ? `${props.title}#${typed.heading}` : props.title),
            },
          )
        },
        render: () => {
          let component: ReactRenderer | null = null
          let unmount: (() => void) | null = null

          return {
            onStart: (props) => {
              component = new ReactRenderer(WikiLinkSuggestionList, {
                props,
                editor: props.editor,
                className: 'wiki-suggestion-popup',
              })
              unmount = props.mount(component.element as HTMLElement)
            },
            onUpdate: (props: SuggestionProps<WikiLinkItem, WikiLinkItem>) => {
              component?.updateProps(props)
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape' || props.event.key === 'Esc') {
                return false
              }
              return (
                (component?.ref as { onKeyDown?: (props: unknown) => boolean } | null)?.onKeyDown?.(
                  props,
                ) ?? false
              )
            },
            onExit: () => {
              unmount?.()
              unmount = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})
