export const EDITOR_PAGE = {
  paddingTop: 56,
  paddingBottom: 72,
  contentHeight: 1032,
  scrollPaddingTop: 20,
} as const

export function getPageCount(contentHeight: number): number {
  if (contentHeight <= 0) return 1
  return Math.max(1, Math.ceil(contentHeight / EDITOR_PAGE.contentHeight))
}

export function getPageScrollTop(page: number, contentStartOffset: number): number {
  return Math.max(
    0,
    contentStartOffset + (page - 1) * EDITOR_PAGE.contentHeight - EDITOR_PAGE.scrollPaddingTop,
  )
}

export function getPageFromScrollTop(
  scrollTop: number,
  contentStartOffset: number,
  pageCount: number,
): number {
  const relative = scrollTop + EDITOR_PAGE.scrollPaddingTop - contentStartOffset
  const page = Math.floor(relative / EDITOR_PAGE.contentHeight) + 1
  return Math.min(pageCount, Math.max(1, page))
}

export function getVisiblePageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
}
