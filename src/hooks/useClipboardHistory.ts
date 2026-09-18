import { useEffect, useState } from 'react'
import {
  getClipboardHistory,
  rememberClipboardFromEvent,
  subscribeClipboardHistory,
  type ClipboardHistoryItem,
} from '@/lib/editor/clipboard-history'

export function useClipboardHistory(): ClipboardHistoryItem[] {
  const [items, setItems] = useState(getClipboardHistory)

  useEffect(() => {
    return subscribeClipboardHistory(() => {
      setItems(getClipboardHistory())
    })
  }, [])

  return items
}

export function useClipboardHistoryCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    function capture(event: ClipboardEvent) {
      rememberClipboardFromEvent(event)
    }

    document.addEventListener('copy', capture, true)
    document.addEventListener('cut', capture, true)
    return () => {
      document.removeEventListener('copy', capture, true)
      document.removeEventListener('cut', capture, true)
    }
  }, [enabled])
}
