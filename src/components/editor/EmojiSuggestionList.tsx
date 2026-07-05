import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { EmojiItem } from '@tiptap/extension-emoji'
import {
  suggestionEmptyClass,
  suggestionItemClass,
  suggestionLabelClass,
  suggestionListClass,
} from '@/lib/editor/suggestion-list-styles'

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
    return <div className={suggestionEmptyClass}>Žiadne emoji</div>
  }

  return (
    <div className={`${suggestionListClass} titlebar-no-drag`}>
      {items.map((item, index) => (
        <button
          key={item.name}
          type="button"
          className={suggestionItemClass(index === selectedIndex)}
          onClick={() => command(item)}
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[16px]">
            {item.emoji ?? '⬜'}
          </span>
          <span className={suggestionLabelClass}>:{item.shortcodes[0]}:</span>
        </button>
      ))}
    </div>
  )
})
