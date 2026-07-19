import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
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
import i18n from '@/i18n'

type SlashCommandDef = {
  id: string
  icon?: string
}

export const SLASH_COMMAND_DEFS: SlashCommandDef[] = [
  { id: 'h1', icon: 'H1' },
  { id: 'h2', icon: 'H2' },
  { id: 'h3', icon: 'H3' },
  { id: 'h4', icon: 'H4' },
  { id: 'h5', icon: 'H5' },
  { id: 'h6', icon: 'H6' },
  { id: 'bullet', icon: '•' },
  { id: 'ordered', icon: '1.' },
  { id: 'task', icon: '☑' },
  { id: 'quote', icon: '❝' },
  { id: 'inline-code', icon: '‹›' },
  { id: 'code', icon: '</>' },
  { id: 'table', icon: '⊞' },
  { id: 'image', icon: '🖼' },
  { id: 'math-inline', icon: 'ƒ' },
  { id: 'math-block', icon: '∑' },
  { id: 'hr', icon: '—' },
  { id: 'callout-info', icon: 'ℹ️' },
  { id: 'callout-tip', icon: '💡' },
  { id: 'callout-warning', icon: '⚠️' },
  { id: 'callout-danger', icon: '🛑' },
  { id: 'footnote', icon: '⁽¹⁾' },
  { id: 'comment', icon: '💬' },
  { id: 'wiki-link', icon: '🔗' },
  { id: 'toc', icon: '≡' },
]

function localizeSlashCommand(def: SlashCommandDef): SlashCommandItem {
  return {
    id: def.id,
    icon: def.icon,
    label: i18n.t(`slash.${def.id}.label`),
    hint: i18n.t(`slash.${def.id}.hint`),
  }
}

export const SLASH_COMMANDS: SlashCommandItem[] = SLASH_COMMAND_DEFS.map(localizeSlashCommand)

function filterCommands(query: string) {
  const commands = SLASH_COMMAND_DEFS.map(localizeSlashCommand)
  const q = query.toLowerCase().trim()
  if (!q) return commands
  return commands.filter(
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
        pluginKey: new PluginKey('slashCommandsSuggestion'),
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
