import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import {
  collectHeadingOutline,
  getActiveHeadingAtViewport,
  type DocumentOutlineItem,
} from '@/lib/editor/document-outline'
import { useThrottledCallback } from '@/lib/pacer'

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

  const sync = useCallback(() => {
    if (!enabled || !editor || editor.isDestroyed) {
      setActiveHeading(null)
      setHeadingCount(0)
      return
    }

    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const headings = collectHeadingOutline(editor)
    setHeadingCount(headings.length)
    setActiveHeading(getActiveHeadingAtViewport(editor, headings, scrollEl))
  }, [editor, enabled, scrollRef])

  const syncThrottled = useThrottledCallback(sync, { wait: 80 })

  useEffect(() => {
    if (!enabled || !editor || editor.isDestroyed) {
      setActiveHeading(null)
      setHeadingCount(0)
      return
    }

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
  }, [editor, enabled, scrollRef, sync, syncThrottled])

  return { activeHeading, headingCount }
}
