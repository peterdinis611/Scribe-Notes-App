import { ReactRenderer, type Editor } from '@tiptap/react'
import type { EmojiItem } from '@tiptap/extension-emoji'
import type { SuggestionProps } from '@tiptap/suggestion'
import { gitHubEmojis } from '@tiptap/extension-emoji'
import { EmojiSuggestionList } from '@/components/editor/EmojiSuggestionList'

function filterEmojis(query: string) {
  const q = query.toLowerCase().trim()
  if (!q) return gitHubEmojis.slice(0, 10)

  return gitHubEmojis
    .filter((item) => {
      if (item.shortcodes.some((code) => code.toLowerCase().includes(q))) return true
      if (item.tags?.some((tag) => tag.toLowerCase().includes(q))) return true
      if (item.name.toLowerCase().includes(q)) return true
      return false
    })
    .slice(0, 10)
}

export function createEmojiSuggestion() {
  return {
    char: ':',
    items: ({ query }: { query: string }) => filterEmojis(query),
    render: () => {
      let component: ReactRenderer | null = null
      let unmount: (() => void) | null = null

      return {
        onStart: (props: { editor: unknown; mount: (element: HTMLElement) => () => void }) => {
          component = new ReactRenderer(EmojiSuggestionList, {
            props,
            editor: props.editor as never,
          })
          unmount = props.mount(component.element)
        },
        onUpdate: (props: SuggestionProps<EmojiItem, EmojiItem>) => {
          component?.updateProps(props)
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            component?.destroy()
            return true
          }
          return (component?.ref as { onKeyDown?: (props: unknown) => boolean } | null)?.onKeyDown?.(props) ?? false
        },
        onExit: () => {
          unmount?.()
          component?.destroy()
        },
      }
    },
  }
}

export function insertEmojiCharacter(editor: Editor, emoji: string) {
  editor.chain().focus().insertContent(emoji).run()
}
