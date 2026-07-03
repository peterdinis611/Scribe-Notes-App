import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionProps } from '@tiptap/suggestion'
import Suggestion from '@tiptap/suggestion'
import type { Editor } from '@tiptap/react'
import {
  SlashSuggestionList,
  type SlashCommandItem,
} from '@/components/editor/SlashSuggestionList'
import { insertBlockMath, insertInlineMath } from '@/lib/editor/insert-helpers'
import { pickImageFiles } from '@/lib/editor/image-utils'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { createCommentForSelection } from '@/lib/editor/comments'

export const SLASH_COMMANDS: SlashCommandItem[] = [
  { id: 'h1', label: 'Nadpis 1', hint: 'Veľký nadpis', icon: 'H1' },
  { id: 'h2', label: 'Nadpis 2', hint: 'Stredný nadpis', icon: 'H2' },
  { id: 'h3', label: 'Nadpis 3', hint: 'Menší nadpis', icon: 'H3' },
  { id: 'h4', label: 'Nadpis 4', hint: 'Podnadpis', icon: 'H4' },
  { id: 'h5', label: 'Nadpis 5', hint: 'Malý nadpis', icon: 'H5' },
  { id: 'h6', label: 'Nadpis 6', hint: 'Najmenší nadpis', icon: 'H6' },
  { id: 'bullet', label: 'Zoznam', hint: 'Odrážky', icon: '•' },
  { id: 'ordered', label: 'Číslovaný zoznam', hint: '1. 2. 3.', icon: '1.' },
  { id: 'task', label: 'Úlohy', hint: 'Checklist', icon: '☑' },
  { id: 'quote', label: 'Citácia', hint: 'Blok citátu', icon: '❝' },
  { id: 'inline-code', label: 'Inline kód', hint: 'Kód v riadku (⌘E)', icon: '‹›' },
  { id: 'code', label: 'Blok kódu', hint: 'Viacriadkový kód', icon: '</>' },
  { id: 'table', label: 'Tabuľka', hint: '3×3', icon: '⊞' },
  { id: 'image', label: 'Obrázok', hint: 'Vložiť obrázok', icon: '🖼' },
  { id: 'math-inline', label: 'Vzorec', hint: 'math.js v riadku', icon: 'ƒ' },
  { id: 'math-block', label: 'Vzorec blok', hint: 'math.js blok', icon: '∑' },
  { id: 'hr', label: 'Oddeľovač', hint: 'Horizontálna čiara', icon: '—' },
  { id: 'callout-info', label: 'Callout: Info', hint: 'Informačný blok', icon: 'ℹ️' },
  { id: 'callout-tip', label: 'Callout: Tip', hint: 'Tip / rada', icon: '💡' },
  { id: 'callout-warning', label: 'Callout: Varovanie', hint: 'Upozornenie', icon: '⚠️' },
  { id: 'callout-danger', label: 'Callout: Dôležité', hint: 'Kritická poznámka', icon: '🛑' },
  { id: 'footnote', label: 'Poznámka pod čiarou', hint: 'Číslovaná poznámka', icon: '⁽¹⁾' },
  { id: 'comment', label: 'Komentár', hint: 'Poznámka k textu', icon: '💬' },
  { id: 'wiki-link', label: 'Prepojiť dokument', hint: 'Odkaz [[ na dokument', icon: '🔗' },
  { id: 'toc', label: 'Obsah', hint: 'Automatický TOC', icon: '≡' },
]

function filterCommands(query: string) {
  const q = query.toLowerCase().trim()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.hint?.toLowerCase().includes(q) ||
      item.id.includes(q),
  )
}

export function runSlashCommand(
  editor: Editor,
  item: SlashCommandItem,
  onInsertImages?: (files: File[]) => void | Promise<void>,
) {
  switch (item.id) {
    case 'h1':
      editor.chain().focus().setHeading({ level: 1 }).run()
      break
    case 'h2':
      editor.chain().focus().setHeading({ level: 2 }).run()
      break
    case 'h3':
      editor.chain().focus().setHeading({ level: 3 }).run()
      break
    case 'h4':
      editor.chain().focus().setHeading({ level: 4 }).run()
      break
    case 'h5':
      editor.chain().focus().setHeading({ level: 5 }).run()
      break
    case 'h6':
      editor.chain().focus().setHeading({ level: 6 }).run()
      break
    case 'bullet':
      insertBulletList(editor)
      break
    case 'ordered':
      insertOrderedList(editor)
      break
    case 'task':
      insertTaskList(editor)
      break
    case 'quote':
      editor.chain().focus().toggleBlockquote().run()
      break
    case 'inline-code':
      editor.chain().focus().setMark('code').run()
      break
    case 'code':
      editor.chain().focus().toggleCodeBlock().run()
      break
    case 'table':
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'image':
      void pickImageFiles().then((files) => {
        if (files.length) void onInsertImages?.(files)
      })
      break
    case 'math-inline':
      insertInlineMath(editor)
      break
    case 'math-block':
      insertBlockMath(editor)
      break
    case 'hr':
      editor.chain().focus().setHorizontalRule().run()
      break
    case 'callout-info':
      editor.chain().focus().toggleCallout('info').run()
      break
    case 'callout-tip':
      editor.chain().focus().toggleCallout('tip').run()
      break
    case 'callout-warning':
      editor.chain().focus().toggleCallout('warning').run()
      break
    case 'callout-danger':
      editor.chain().focus().toggleCallout('danger').run()
      break
    case 'footnote':
      editor.chain().focus().insertFootnote().run()
      break
    case 'comment': {
      void createCommentForSelection(editor)
      break
    }
    case 'wiki-link':
      editor.chain().focus().insertContent('[[').run()
      break
    case 'toc':
      editor.chain().focus().insertTableOfContents().run()
      break
    default:
      break
  }
}

type SlashCommandsOptions = {
  onInsertImages?: (files: File[]) => void | Promise<void>
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return { onInsertImages: undefined }
  },

  addProseMirrorPlugins() {
    const onInsertImages = this.options.onInsertImages

    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }) => filterCommands(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          runSlashCommand(editor, props as SlashCommandItem, onInsertImages)
        },
        render: () => {
          let component: ReactRenderer | null = null
          let unmount: (() => void) | null = null

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashSuggestionList, {
                props,
                editor: props.editor,
              })
              unmount = props.mount(component.element)
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) => {
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
