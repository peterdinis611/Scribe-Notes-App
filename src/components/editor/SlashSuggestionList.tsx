import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import {
  suggestionEmptyClass,
  suggestionHintClass,
  suggestionIconClass,
  suggestionItemClass,
  suggestionLabelClass,
  suggestionListClass,
} from '@/lib/editor/suggestion-list-styles'

export type SlashCommandItem = {
  id: string
  label: string
  hint?: string
  icon?: string
}

type SlashSuggestionListProps = {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export const SlashSuggestionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  SlashSuggestionListProps
>(function SlashSuggestionList({ items, command }, ref) {
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
    return <div className={suggestionEmptyClass}>Žiadne príkazy</div>
  }

  return (
    <div className={`${suggestionListClass} titlebar-no-drag`}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={suggestionItemClass(index === selectedIndex)}
          onClick={() => command(item)}
        >
          {item.icon && <span className={suggestionIconClass}>{item.icon}</span>}
          <span className={suggestionLabelClass}>{item.label}</span>
          {item.hint && <span className={suggestionHintClass}>{item.hint}</span>}
        </button>
      ))}
    </div>
  )
})
