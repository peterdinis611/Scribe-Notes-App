import { useEffect, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import {
  collectHeadingOutline,
  getActiveHeadingAtViewport,
  type DocumentOutlineItem,
} from '@/lib/editor/document-outline'
import { throttle } from '@/lib/utils'

type UseActiveScrollHeadingOptions = {
  editor: Editor | null
  scrollRef: RefObject<HTMLElement | null>
  enabled?: boolean
}

/** Tracks the heading at the scroll viewport reading line. */
export function useActiveScrollHeading({
  editor,
  scrollRef,
  enabled = true,
}: UseActiveScrollHeadingOptions) {
  const [activeHeading, setActiveHeading] = useState<DocumentOutlineItem | null>(null)
  const [headingCount, setHeadingCount] = useState(0)

  useEffect(() => {
    if (!enabled || !editor || editor.isDestroyed) {
      setActiveHeading(null)
      setHeadingCount(0)
      return
    }

    const sync = () => {
      const scrollEl = scrollRef.current
      if (!scrollEl || editor.isDestroyed) return

      const headings = collectHeadingOutline(editor)
      setHeadingCount(headings.length)
      setActiveHeading(getActiveHeadingAtViewport(editor, headings, scrollEl))
    }

    const syncThrottled = throttle(sync, 80)
    sync()

    const scrollEl = scrollRef.current
    scrollEl?.addEventListener('scroll', syncThrottled, { passive: true })
    editor.on('update', syncThrottled)
    window.addEventListener('resize', syncThrottled)

    return () => {
      scrollEl?.removeEventListener('scroll', syncThrottled)
      editor.off('update', syncThrottled)
      window.removeEventListener('resize', syncThrottled)
    }
  }, [editor, enabled, scrollRef])

  return { activeHeading, headingCount }
}
