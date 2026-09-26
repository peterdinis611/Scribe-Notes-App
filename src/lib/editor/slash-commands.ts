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
import {
  insertBlockMath,
  insertD3Chart,
  insertEmptyVideoBlock,
  insertLeafletMap,
  insertInlineMath,
  insertLoremIpsum,
  insertMermaidDiagram,
} from '@/lib/editor/insert-helpers'
import {
  insertEmptyImageBlock,
  insertEmptyLottieBlock,
  insertImageFromUrl,
  isLikelyImageUrl,
} from '@/lib/editor/image-utils'
import { insertBulletList, insertOrderedList, insertTaskList } from '@/lib/editor/list-commands'
import { createCommentForSelection } from '@/lib/editor/comments'
import {
  listBlockSnippets,
  plainTextToTipTapContent,
  upsertCustomBlockSnippet,
} from '@/lib/editor/block-snippets'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
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
  { id: 'image-url', icon: '🔗🖼' },
  { id: 'lottie', icon: '✦' },
  { id: 'video', icon: '▶' },
  { id: 'map', icon: '◎' },
  { id: 'leaflet', icon: '⌖' },
  { id: 'math-inline', icon: 'ƒ' },
  { id: 'math-block', icon: '∑' },
  { id: 'mermaid', icon: '⬡' },
  { id: 'chart', icon: '▣' },
  { id: 'd3', icon: '◈' },
  { id: 'hr', icon: '—' },
  { id: 'callout-info', icon: 'ℹ️' },
  { id: 'callout-tip', icon: '💡' },
  { id: 'callout-warning', icon: '⚠️' },
  { id: 'callout-danger', icon: '🛑' },
  { id: 'footnote', icon: '⁽¹⁾' },
  { id: 'comment', icon: '💬' },
  { id: 'wiki-link', icon: '🔗' },
  { id: 'wiki-embed', icon: '⧉' },
  { id: 'custom-block', icon: '＋' },
  { id: 'lorem', icon: '¶' },
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

function snippetIcon(id: string, custom?: boolean): string {
  if (custom || id.startsWith('custom-')) return '✦'
  if (id === 'meeting-notes') return '📝'
  if (id === 'decision') return '⚖'
  return '▤'
}

function snippetSlashItems(): SlashCommandItem[] {
  return listBlockSnippets().map((snippet) => {
    const builtinKey =
      snippet.id === 'meeting-notes'
        ? 'snippet-meeting'
        : snippet.id === 'decision'
          ? 'snippet-decision'
          : null
    const custom = Boolean(snippet.custom || !builtinKey)
    return {
      id: `snippet:${snippet.id}`,
      icon: snippetIcon(snippet.id, custom),
      label: custom
        ? i18n.t('slash.customSnippet.label', { name: snippet.name })
        : i18n.t(`slash.${builtinKey}.label`),
      hint: custom
        ? i18n.t('slash.customSnippet.hint')
        : i18n.t(`slash.${builtinKey}.hint`),
    }
  })
}

function allSlashItems(): SlashCommandItem[] {
  const base = SLASH_COMMAND_DEFS.map(localizeSlashCommand)
  const customBlockIndex = base.findIndex((item) => item.id === 'custom-block')
  const snippets = snippetSlashItems()
  if (customBlockIndex < 0) return [...base, ...snippets]
  return [
    ...base.slice(0, customBlockIndex + 1),
    ...snippets,
    ...base.slice(customBlockIndex + 1),
  ]
}

/** @deprecated Static list without live custom snippets — prefer listSlashCommands(). */
export const SLASH_COMMANDS: SlashCommandItem[] = SLASH_COMMAND_DEFS.map(localizeSlashCommand)

export function listSlashCommands(): SlashCommandItem[] {
  return allSlashItems()
}

function filterCommands(query: string) {
  const commands = allSlashItems()
  const q = query.toLowerCase().trim()
  if (!q) return commands
  return commands.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.hint?.toLowerCase().includes(q) ||
      item.id.includes(q),
  )
}

function selectionPlainText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection
  if (empty) return ''
  return editor.state.doc.textBetween(from, to, '\n', '\n').trim()
}

async function createCustomBlockFromEditor(editor: Editor) {
  const selected = selectionPlainText(editor)
  const name = await promptInput({
    title: i18n.t('slash.customBlock.nameTitle'),
    description: i18n.t('slash.customBlock.nameDescription'),
    placeholder: i18n.t('slash.customBlock.namePlaceholder'),
    confirmLabel: i18n.t('common.next'),
  })
  if (!name?.trim()) return

  const body = await promptInput({
    title: i18n.t('slash.customBlock.bodyTitle'),
    description: selected
      ? i18n.t('slash.customBlock.bodyDescriptionSelection')
      : i18n.t('slash.customBlock.bodyDescription'),
    defaultValue: selected || '## \n\n',
    placeholder: i18n.t('slash.customBlock.bodyPlaceholder'),
    confirmLabel: i18n.t('slash.customBlock.save'),
    multiline: true,
  })
  if (body == null || !body.trim()) return

  try {
    const snippet = upsertCustomBlockSnippet({
      name: name.trim(),
      plainText: body,
    })
    editor
      .chain()
      .focus()
      .insertContent(plainTextToTipTapContent(snippet.plainText))
      .run()
    toast.success(i18n.t('slash.customBlock.saved'), snippet.name)
  } catch (error) {
    toast.error(i18n.t('slash.customBlock.saveFailed'), String(error))
  }
}

export function runSlashCommand(
  editor: Editor,
  item: SlashCommandItem,
  _onInsertImages?: (files: File[]) => void | Promise<void>,
) {
  if (item.id.startsWith('snippet:')) {
    const snippetId = item.id.slice('snippet:'.length)
    const snippet = listBlockSnippets().find((entry) => entry.id === snippetId)
    if (snippet) {
      editor
        .chain()
        .focus()
        .insertContent(plainTextToTipTapContent(snippet.plainText))
        .run()
    }
    return
  }

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
      insertEmptyImageBlock(editor)
      break
    case 'image-url': {
      void (async () => {
        const url = await promptInput({
          title: i18n.t('image.urlTitle'),
          description: i18n.t('image.urlHint'),
          defaultValue: 'https://',
          placeholder: 'https://',
          confirmLabel: i18n.t('image.urlInsert'),
        })
        if (url && (isLikelyImageUrl(url) || /^https?:\/\//i.test(url.trim()))) {
          insertImageFromUrl(editor, url.trim())
        }
      })()
      break
    }
    case 'lottie':
      insertEmptyLottieBlock(editor)
      break
    case 'video':
      insertEmptyVideoBlock(editor)
      break
    case 'map':
    case 'leaflet':
      insertLeafletMap(editor)
      break
    case 'math-inline':
      void insertInlineMath(editor)
      break
    case 'math-block':
      void insertBlockMath(editor)
      break
    case 'mermaid':
      insertMermaidDiagram(editor)
      break
    case 'chart':
    case 'd3':
      insertD3Chart(editor)
      break
    case 'lorem':
      void insertLoremIpsum(editor)
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
    case 'wiki-embed':
      editor.chain().focus().insertContent('![[').run()
      break
    case 'custom-block':
      void createCustomBlockFromEditor(editor)
      break
    // Back-compat for older tests / callers
    case 'snippet-meeting':
    case 'snippet-decision': {
      const id = item.id === 'snippet-meeting' ? 'meeting-notes' : 'decision'
      const snippet = listBlockSnippets().find((entry) => entry.id === id)
      if (snippet) {
        editor
          .chain()
          .focus()
          .insertContent(plainTextToTipTapContent(snippet.plainText))
          .run()
      }
      break
    }
    case 'toc':
      editor.chain().focus().insertTableOfContents().run()
      break
    default:
      break
  }
}

export function openSlashPalette(editor: Editor) {
  const { $from } = editor.state.selection
  if (!$from.parent.isTextblock) {
    editor.chain().focus().insertContent('/').run()
    return
  }

  if ($from.parent.textContent.startsWith('/')) {
    editor.commands.focus()
    return
  }

  editor.chain().focus().insertContent('/').run()
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
    const initialItems = allSlashItems()

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommandsSuggestion'),
        char: '/',
        startOfLine: false,
        // Allow `/` at the start of a block and after any character (not only spaces).
        allowedPrefixes: null,
        // Show commands immediately; async fetch then refreshes the filtered list.
        initialItems,
        items: ({ query }) => filterCommands(query),
        placement: 'bottom-start',
        floatingUi: {
          strategy: 'fixed',
        },
        offset: { mainAxis: 6, crossAxis: 0 },
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
                props: {
                  ...props,
                  items: props.items?.length ? props.items : allSlashItems(),
                },
                editor: props.editor,
                className: 'slash-suggestion-popup',
              })
              unmount = props.mount(component.element as HTMLElement)
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) => {
              component?.updateProps({
                ...props,
                items: props.items?.length ? props.items : filterCommands(props.query ?? ''),
              })
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
