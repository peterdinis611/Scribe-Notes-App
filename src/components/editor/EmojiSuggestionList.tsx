import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { EmojiItem } from '@tiptap/extension-emoji'
import { cn } from '@/lib/utils'

type EmojiSuggestionListProps = {
  items: EmojiItem[]
  command: (item: EmojiItem) => void
}

export const EmojiSuggestionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  EmojiSuggestionListProps
>(function EmojiSuggestionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((index) => (index + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((index) => (index + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (!items.length) {
    return <div className="emoji-suggestion-empty">Žiadne emoji</div>
  }

  return (
    <div className="emoji-suggestion-list titlebar-no-drag">
      {items.map((item, index) => (
        <button
          key={item.name}
          type="button"
          className={cn('emoji-suggestion-item', index === selectedIndex && 'is-active')}
          onClick={() => command(item)}
        >
          <span className="emoji-suggestion-icon">{item.emoji ?? '⬜'}</span>
          <span className="emoji-suggestion-label">:{item.shortcodes[0]}:</span>
        </button>
      ))}
    </div>
  )
})
