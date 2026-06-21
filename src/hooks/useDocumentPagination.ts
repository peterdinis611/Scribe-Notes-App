import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  EDITOR_PAGE,
  getPageCount,
  getPageFromScrollTop,
  getPageScrollTop,
} from '@/lib/editor/page-layout'
import { throttle } from '@/lib/utils'

type UseDocumentPaginationOptions = {
  editor: Editor | null
  documentId: string | null
}

export function useDocumentPagination({ editor, documentId }: UseDocumentPaginationOptions) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const isProgrammaticScrollRef = useRef(false)
  const measureFrameRef = useRef<number | null>(null)

  const [pageCount, setPageCount] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [contentHeight, setContentHeight] = useState(0)

  const measureNow = useCallback(() => {
    const content = contentRef.current
    const canvas = canvasRef.current
    if (!content || !canvas) return

    const nextHeight = content.scrollHeight
    const nextPageCount = getPageCount(nextHeight)
    setContentHeight(nextHeight)
    setPageCount(nextPageCount)

    const scrollEl = scrollRef.current
    if (scrollEl) {
      const contentStart = canvas.offsetTop + EDITOR_PAGE.paddingTop
      const page = getPageFromScrollTop(scrollEl.scrollTop, contentStart, nextPageCount)
      setCurrentPage(page)
    }
  }, [])

  const scheduleMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null
      measureNow()
    })
  }, [measureNow])

  const measureThrottled = useMemo(
    () => throttle(scheduleMeasure, 120),
    [scheduleMeasure],
  )

  const scrollToPage = useCallback((page: number) => {
    const scrollEl = scrollRef.current
    const canvas = canvasRef.current
    if (!scrollEl || !canvas) return

    const boundedPage = Math.min(pageCount, Math.max(1, page))
    const contentStart = canvas.offsetTop + EDITOR_PAGE.paddingTop
    const targetTop = getPageScrollTop(boundedPage, contentStart)

    isProgrammaticScrollRef.current = true
    scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' })
    setCurrentPage(boundedPage)

    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, 350)
  }, [pageCount])

  useEffect(() => {
    setCurrentPage(1)
    setPageCount(1)
    setContentHeight(0)

    const scrollEl = scrollRef.current
    if (scrollEl) {
      scrollEl.scrollTop = 0
    }
  }, [documentId])

  useEffect(() => {
    if (!editor) return

    const root = editor.view.dom as HTMLElement
    contentRef.current = root

    scheduleMeasure()

    const resizeObserver = new ResizeObserver(() => {
      measureThrottled()
    })
    resizeObserver.observe(root)

    const onUpdate = () => {
      measureThrottled()
    }

    editor.on('update', onUpdate)

    return () => {
      resizeObserver.disconnect()
      editor.off('update', onUpdate)
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current)
        measureFrameRef.current = null
      }
    }
  }, [editor, measureThrottled, scheduleMeasure])

  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const handleScroll = throttle(() => {
      if (isProgrammaticScrollRef.current) return

      const canvas = canvasRef.current
      if (!canvas) return

      const contentStart = canvas.offsetTop + EDITOR_PAGE.paddingTop
      const page = getPageFromScrollTop(scrollEl.scrollTop, contentStart, pageCount)
      setCurrentPage(page)
    }, 80)

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [pageCount])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  return {
    scrollRef,
    canvasRef,
    pageCount,
    currentPage,
    contentHeight,
    scrollToPage,
  }
}
