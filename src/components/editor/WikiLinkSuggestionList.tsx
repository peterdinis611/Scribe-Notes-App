import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WikiLinkItem = {
  id: string
  title: string
  isCreate?: boolean
  query?: string
}

type WikiLinkSuggestionListProps = {
  items: WikiLinkItem[]
  command: (item: WikiLinkItem) => void
}

export const WikiLinkSuggestionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  WikiLinkSuggestionListProps
>(function WikiLinkSuggestionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
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
    return <div className="slash-suggestion-empty">Žiadne dokumenty</div>
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
          <span className="slash-suggestion-icon">
            {item.isCreate ? <Plus className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <span className="slash-suggestion-label">
            {item.isCreate ? `Vytvoriť „${item.title}“` : item.title}
          </span>
        </button>
      ))}
    </div>
  )
})
