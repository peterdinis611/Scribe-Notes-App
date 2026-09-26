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
  getBlockDefinition,
  insertBlock,
  listBlockDefinitions,
  type BlockInsertContext,
} from '@/lib/editor/block-registry'
import { insertBlockSnippet, listBlockSnippets } from '@/lib/editor/block-snippets'
import i18n from '@/i18n'

type SlashCommandDef = {
  id: string
  icon?: string
}

/** Slash-visible static blocks (derived from the block registry). */
export const SLASH_COMMAND_DEFS: SlashCommandDef[] = listBlockDefinitions().map((def) => ({
  id: def.id,
  icon: def.icon,
}))

function localizeSlashCommand(def: SlashCommandDef): SlashCommandItem {
  return {
    id: def.id,
    icon: def.icon,
    label: i18n.t(`slash.${def.id}.label`),
    hint: i18n.t(`slash.${def.id}.hint`),
  }
}

function snippetIcon(snippet: { id: string; icon?: string; custom?: boolean }): string {
  if (snippet.icon) return snippet.icon
  if (snippet.custom || snippet.id.startsWith('custom-')) return '✦'
  if (snippet.id === 'meeting-notes') return '📝'
  if (snippet.id === 'decision') return '⚖'
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
      icon: snippetIcon(snippet),
      label: custom
        ? i18n.t('slash.customSnippet.label', { name: snippet.name })
        : i18n.t(`slash.${builtinKey}.label`),
      hint: custom
        ? snippet.hint || i18n.t('slash.customSnippet.hint')
        : snippet.hint || i18n.t(`slash.${builtinKey}.hint`),
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
  return commands.filter((item) => {
    if (
      item.label.toLowerCase().includes(q) ||
      item.hint?.toLowerCase().includes(q) ||
      item.id.includes(q)
    ) {
      return true
    }
    const def = getBlockDefinition(item.id)
    if (def?.keywords?.some((keyword) => keyword.toLowerCase().includes(q))) return true
    if (item.id.startsWith('snippet:')) {
      const snippet = listBlockSnippets().find(
        (entry) => entry.id === item.id.slice('snippet:'.length),
      )
      return snippet?.keywords?.some((keyword) => keyword.includes(q)) ?? false
    }
    return false
  })
}

export function runSlashCommand(
  editor: Editor,
  item: SlashCommandItem,
  onInsertImages?: BlockInsertContext['onInsertImages'],
) {
  if (item.id.startsWith('snippet:')) {
    insertBlockSnippet(editor, item.id.slice('snippet:'.length))
    return
  }

  insertBlock(editor, item.id, { onInsertImages })
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
