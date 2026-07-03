import { mergeAttributes, Node } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { getDefaultStore } from 'jotai'
import type { Range } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { createDocument } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { toast } from '@/lib/toast'
import { WikiLinkSuggestionList, type WikiLinkItem } from '@/components/editor/WikiLinkSuggestionList'
import { activeDocumentIdAtom, documentsAtom } from '@/store/documents'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      /** Insert a wiki-link node pointing at a document. */
      insertWikiLink: (attrs: { targetId: string; label: string }) => ReturnType
    }
  }
}

const MAX_RESULTS = 8

function filterDocuments(query: string): WikiLinkItem[] {
  const store = getDefaultStore()
  const docs = store.get(documentsAtom)
  const activeId = store.get(activeDocumentIdAtom)
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

function insertNode(editor: Editor, range: Range, targetId: string, label: string) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: 'wikiLink', attrs: { targetId, label } },
      { type: 'text', text: ' ' },
    ])
    .run()
}

async function createAndInsert(editor: Editor, range: Range, title: string) {
  const store = getDefaultStore()
  try {
    const doc = await createDocument({ title })
    store.set(documentsAtom, (prev) => prependDocumentSummary(prev, doc))
    insertNode(editor, range, doc.id, doc.title)
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
    return `[[${(node.attrs.label as string) || ''}]]`
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
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<WikiLinkItem>({
        editor: this.editor,
        char: '[[',
        startOfLine: false,
        allowSpaces: true,
        items: ({ query }) => filterDocuments(query),
        command: ({ editor, range, props }) => {
          if (props.isCreate) {
            void createAndInsert(editor, range, props.query ?? props.title)
            return
          }
          insertNode(editor, range, props.id, props.title)
        },
        render: () => {
          let component: ReactRenderer | null = null
          let unmount: (() => void) | null = null

          return {
            onStart: (props) => {
              component = new ReactRenderer(WikiLinkSuggestionList, {
                props,
                editor: props.editor,
              })
              unmount = props.mount(component.element)
            },
            onUpdate: (props: SuggestionProps<WikiLinkItem, WikiLinkItem>) => {
              component?.updateProps(props)
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                component?.destroy()
                return true
              }
              return (
                (component?.ref as { onKeyDown?: (props: unknown) => boolean } | null)?.onKeyDown?.(
                  props,
                ) ?? false
              )
            },
            onExit: () => {
              unmount?.()
              component?.destroy()
            },
          }
        },
      }),
    ]
  },
})
