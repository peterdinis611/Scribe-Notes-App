import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { PageSetup, ResolvedPageLayout } from '@/lib/editor/page-setup'
import {
  computePageSegments,
  getPageCountForContent,
  getPageNumberAtOffset,
  getScrollTopForPage,
  type PageSegment,
} from '@/lib/editor/page-segments'
import { throttle } from '@/lib/utils'
import { getEditorViewDom } from '@/lib/editor/view-ready'

type UseDocumentPaginationOptions = {
  editor: Editor | null
  documentId: string | null
  pageSetup: PageSetup
  pageLayout: ResolvedPageLayout
}

export function useDocumentPagination({
  editor,
  documentId,
  pageSetup,
  pageLayout,
}: UseDocumentPaginationOptions) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const isProgrammaticScrollRef = useRef(false)
  const measureFrameRef = useRef<number | null>(null)

  const [pageCount, setPageCount] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [contentHeight, setContentHeight] = useState(0)
  const [pageSegments, setPageSegments] = useState<PageSegment[]>([])

  const measureNow = useCallback(() => {
    const content = contentRef.current
    const canvas = canvasRef.current
    if (!content || !canvas) return

    const nextHeight = content.scrollHeight
    const segments = computePageSegments(pageSetup, nextHeight)
    const nextPageCount = getPageCountForContent(nextHeight, pageSetup)

    setContentHeight(nextHeight)
    setPageSegments(segments)
    setPageCount(nextPageCount)

    const scrollEl = scrollRef.current
    if (scrollEl) {
      const contentStart = canvas.offsetTop + pageLayout.paddingTop
      const relative = scrollEl.scrollTop + pageLayout.scrollPaddingTop - contentStart
      const page = getPageNumberAtOffset(Math.max(0, relative), segments)
      setCurrentPage(page)
    }
  }, [pageLayout.paddingTop, pageLayout.scrollPaddingTop, pageSetup])

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

  const scrollToPage = useCallback(
    (page: number) => {
      const scrollEl = scrollRef.current
      const canvas = canvasRef.current
      if (!scrollEl || !canvas || pageSegments.length === 0) return

      const boundedPage = Math.min(pageCount, Math.max(1, page))
      const contentStart = canvas.offsetTop + pageLayout.paddingTop
      const targetTop = Math.max(
        0,
        getScrollTopForPage(boundedPage, contentStart, pageSegments) - pageLayout.scrollPaddingTop,
      )

      isProgrammaticScrollRef.current = true
      scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' })
      setCurrentPage(boundedPage)

      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 350)
    },
    [pageCount, pageLayout.paddingTop, pageLayout.scrollPaddingTop, pageSegments],
  )

  useEffect(() => {
    setCurrentPage(1)
    setPageCount(1)
    setContentHeight(0)
    setPageSegments([])

    const scrollEl = scrollRef.current
    if (scrollEl) {
      scrollEl.scrollTop = 0
    }
  }, [documentId])

  useEffect(() => {
    scheduleMeasure()
  }, [pageLayout, pageSetup, scheduleMeasure])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    let cleanup: (() => void) | undefined

    const attach = () => {
      const root = getEditorViewDom(editor)
      if (!root) return

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

      cleanup = () => {
        resizeObserver.disconnect()
        editor.off('update', onUpdate)
      }
    }

    const detach = () => {
      cleanup?.()
      cleanup = undefined
      contentRef.current = null
    }

    attach()
    editor.on('create', attach)
    editor.on('mount', attach)
    editor.on('unmount', detach)
    editor.on('destroy', detach)

    return () => {
      editor.off('create', attach)
      editor.off('mount', attach)
      editor.off('unmount', detach)
      editor.off('destroy', detach)
      detach()
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
      if (isProgrammaticScrollRef.current || pageSegments.length === 0) return

      const canvas = canvasRef.current
      if (!canvas) return

      const contentStart = canvas.offsetTop + pageLayout.paddingTop
      const relative = scrollEl.scrollTop + pageLayout.scrollPaddingTop - contentStart
      const page = getPageNumberAtOffset(Math.max(0, relative), pageSegments)
      setCurrentPage(page)
    }, 80)

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [pageLayout.paddingTop, pageLayout.scrollPaddingTop, pageSegments])

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
    pageSegments,
    scrollToPage,
  }
}
