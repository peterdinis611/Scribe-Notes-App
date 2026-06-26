import type { ResolvedPageLayout } from '@/lib/editor/page-setup'
import { DEFAULT_PAGE_SETUP, resolvePageLayout } from '@/lib/editor/page-setup'

export { DEFAULT_PAGE_SETUP, EDITOR_PAGE, resolvePageLayout } from '@/lib/editor/page-setup'
export type { PageSetup, PaperSizeId, ResolvedPageLayout } from '@/lib/editor/page-setup'

export function getPageCount(contentHeight: number, layout: ResolvedPageLayout = resolvePageLayout(DEFAULT_PAGE_SETUP)): number {
  if (contentHeight <= 0) return 1
  return Math.max(1, Math.ceil(contentHeight / layout.contentHeight))
}

export function getPageScrollTop(
  page: number,
  contentStartOffset: number,
  layout: ResolvedPageLayout = resolvePageLayout(DEFAULT_PAGE_SETUP),
): number {
  return Math.max(
    0,
    contentStartOffset + (page - 1) * layout.contentHeight - layout.scrollPaddingTop,
  )
}

export function getPageFromScrollTop(
  scrollTop: number,
  contentStartOffset: number,
  pageCount: number,
  layout: ResolvedPageLayout = resolvePageLayout(DEFAULT_PAGE_SETUP),
): number {
  const relative = scrollTop + layout.scrollPaddingTop - contentStartOffset
  const page = Math.floor(relative / layout.contentHeight) + 1
  return Math.min(pageCount, Math.max(1, page))
}

export function getVisiblePageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
}
