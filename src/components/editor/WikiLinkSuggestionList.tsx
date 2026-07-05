import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import {
  suggestionEmptyClass,
  suggestionIconClass,
  suggestionItemClass,
  suggestionLabelClass,
  suggestionListClass,
} from '@/lib/editor/suggestion-list-styles'

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
    return <div className={suggestionEmptyClass}>Žiadne dokumenty</div>
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
          <span className={suggestionIconClass}>
            {item.isCreate ? <Plus className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <span className={suggestionLabelClass}>
            {item.isCreate ? `Vytvoriť „${item.title}“` : item.title}
          </span>
        </button>
      ))}
    </div>
  )
})
