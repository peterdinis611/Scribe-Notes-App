import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '@/lib/utils'

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
    return <div className="slash-suggestion-empty">Žiadne príkazy</div>
  }

  return (
    <div className="slash-suggestion-list titlebar-no-drag">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn('slash-suggestion-item', index === selectedIndex && 'is-active')}
          onClick={() => command(item)}
        >
          {item.icon && <span className="slash-suggestion-icon">{item.icon}</span>}
          <span className="slash-suggestion-label">{item.label}</span>
          {item.hint && <span className="slash-suggestion-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  )
})
