import type { PageSetup } from '@/lib/editor/page-setup'
import { normalizePageSetup, PAPER_SIZES } from '@/lib/editor/page-setup'

export type PageMargins = {
  top: number
  bottom: number
  left: number
  right: number
}

export type PageSegment = {
  pageNumber: number
  start: number
  height: number
  margins: PageMargins
}

export function getPageMargins(setup: PageSetup, pageNumber: number): PageMargins {
  const normalized = normalizePageSetup(setup)

  if (pageNumber === 1 && normalized.firstPage.different) {
    return {
      top: normalized.firstPage.marginTop ?? normalized.marginTop,
      bottom: normalized.firstPage.marginBottom ?? normalized.marginBottom,
      left: normalized.firstPage.marginLeft ?? normalized.marginLeft,
      right: normalized.firstPage.marginRight ?? normalized.marginRight,
    }
  }

  return {
    top: normalized.marginTop,
    bottom: normalized.marginBottom,
    left: normalized.marginLeft,
    right: normalized.marginRight,
  }
}

export function shouldShowHeaderFooter(setup: PageSetup, pageNumber: number): boolean {
  const normalized = normalizePageSetup(setup)
  if (!normalized.headerFooter.enabled) return false
  if (pageNumber === 1 && normalized.firstPage.different && normalized.firstPage.hideHeaderFooter) {
    return false
  }
  return true
}

export function resolvePageContentHeight(setup: PageSetup, pageNumber: number): number {
  const normalized = normalizePageSetup(setup)
  const paper = PAPER_SIZES[normalized.paperSize]
  const margins = getPageMargins(setup, pageNumber)
  const headerFooterReserve = shouldShowHeaderFooter(setup, pageNumber) ? 48 : 0

  return Math.max(
    480,
    paper.height - margins.top - margins.bottom - headerFooterReserve,
  )
}

export function computePageSegments(setup: PageSetup, contentHeight: number): PageSegment[] {
  if (contentHeight <= 0) {
    return [
      {
        pageNumber: 1,
        start: 0,
        height: resolvePageContentHeight(setup, 1),
        margins: getPageMargins(setup, 1),
      },
    ]
  }

  const segments: PageSegment[] = []
  let consumed = 0
  let pageNumber = 1

  while (consumed < contentHeight || segments.length === 0) {
    const height = resolvePageContentHeight(setup, pageNumber)
    segments.push({
      pageNumber,
      start: consumed,
      height,
      margins: getPageMargins(setup, pageNumber),
    })
    consumed += height
    pageNumber += 1

    if (segments.length > 200) break
  }

  return segments
}

export function getPageCountForContent(contentHeight: number, setup: PageSetup): number {
  return computePageSegments(setup, contentHeight).length
}

export function getPageNumberAtOffset(offset: number, segments: PageSegment[]): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (offset >= segments[index]!.start) {
      return segments[index]!.pageNumber
    }
  }
  return 1
}

export function getScrollTopForPage(page: number, contentStartOffset: number, segments: PageSegment[]): number {
  const segment = segments.find((item) => item.pageNumber === page)
  if (!segment) return contentStartOffset
  return contentStartOffset + segment.start
}

export function getSheetPosition(
  pageIndex: number,
  columns: 1 | 2,
  paperWidth: number,
  paperHeight: number,
  gap: number,
): { left: number; top: number } {
  if (columns === 1) {
    return { left: 0, top: pageIndex * (paperHeight + gap) }
  }

  const column = pageIndex % 2
  const row = Math.floor(pageIndex / 2)
  return {
    left: column * (paperWidth + gap),
    top: row * (paperHeight + gap),
  }
}

export function getPrintStageSize(
  pageCount: number,
  columns: 1 | 2,
  paperWidth: number,
  paperHeight: number,
  gap: number,
): { width: number; height: number } {
  if (columns === 1) {
    return {
      width: paperWidth,
      height: pageCount * paperHeight + Math.max(0, pageCount - 1) * gap,
    }
  }

  const rows = Math.ceil(pageCount / 2)
  return {
    width: paperWidth * 2 + gap,
    height: rows * paperHeight + Math.max(0, rows - 1) * gap,
  }
}
