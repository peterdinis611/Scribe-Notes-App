import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, PAPER_SIZES } from '@/lib/editor/page-setup'
import {
  computePageSegments,
  getAlignedSheetTop,
  getPageCountForContent,
  getPageMargins,
  getPageNumberAtOffset,
  getPrintStageSize,
  getScrollTopForPage,
  getSheetPosition,
  resolvePageContentHeight,
  resolvePrintStageSize,
  shouldShowHeaderFooter,
} from '@/lib/editor/page-segments'

describe('page segments', () => {
  it('computes multiple pages for long content', () => {
    const setup = DEFAULT_PAGE_SETUP
    const firstPageHeight = computePageSegments(setup, 1)[0]!.height
    expect(getPageCountForContent(firstPageHeight + 200, setup)).toBeGreaterThan(1)
  })

  it('always returns at least one segment for empty content', () => {
    const segments = computePageSegments(DEFAULT_PAGE_SETUP, 0)
    expect(segments).toHaveLength(1)
    expect(segments[0]!.pageNumber).toBe(1)
    expect(segments[0]!.start).toBe(0)
    expect(getPageCountForContent(0, DEFAULT_PAGE_SETUP)).toBe(1)
  })

  it('produces contiguous, non-overlapping segments', () => {
    const segments = computePageSegments(DEFAULT_PAGE_SETUP, 5000)
    expect(segments.length).toBeGreaterThan(1)
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.start).toBe(segments[i - 1]!.start + segments[i - 1]!.height)
      expect(segments[i]!.pageNumber).toBe(segments[i - 1]!.pageNumber + 1)
    }
  })

  it('caps runaway segment generation at 200 pages', () => {
    const segments = computePageSegments(DEFAULT_PAGE_SETUP, 10_000_000)
    expect(segments.length).toBeLessThanOrEqual(201)
  })

  it('uses different first page margins and header rules', () => {
    const setup = {
      ...DEFAULT_PAGE_SETUP,
      headerFooter: { ...DEFAULT_PAGE_SETUP.headerFooter, enabled: true },
      firstPage: {
        different: true,
        hideHeaderFooter: true,
        marginTop: 120,
      },
    }

    expect(getPageMargins(setup, 1).top).toBe(120)
    expect(getPageMargins(setup, 2).top).toBe(setup.marginTop)
    expect(shouldShowHeaderFooter(setup, 1)).toBe(false)
    expect(shouldShowHeaderFooter(setup, 2)).toBe(true)
  })

  it('falls back to base margins when first page has no overrides', () => {
    const setup = {
      ...DEFAULT_PAGE_SETUP,
      firstPage: { different: true, hideHeaderFooter: false },
    }
    expect(getPageMargins(setup, 1)).toEqual(getPageMargins(setup, 2))
  })

  it('never shows header/footer when disabled', () => {
    expect(shouldShowHeaderFooter(DEFAULT_PAGE_SETUP, 1)).toBe(false)
    expect(shouldShowHeaderFooter(DEFAULT_PAGE_SETUP, 3)).toBe(false)
  })

  it('reserves space for header/footer in content height', () => {
    const withHf = {
      ...DEFAULT_PAGE_SETUP,
      headerFooter: { ...DEFAULT_PAGE_SETUP.headerFooter, enabled: true },
    }
    expect(resolvePageContentHeight(withHf, 2)).toBeLessThan(
      resolvePageContentHeight(DEFAULT_PAGE_SETUP, 2),
    )
  })

  it('enforces a minimum content height', () => {
    const tiny = {
      ...DEFAULT_PAGE_SETUP,
      marginTop: 5000,
      marginBottom: 5000,
    }
    expect(resolvePageContentHeight(tiny, 1)).toBe(480)
  })
})

describe('page offset helpers', () => {
  const segments = computePageSegments(DEFAULT_PAGE_SETUP, 5000)

  it('maps offsets to the correct page number', () => {
    expect(getPageNumberAtOffset(-10, segments)).toBe(1)
    expect(getPageNumberAtOffset(0, segments)).toBe(1)
    expect(getPageNumberAtOffset(segments[1]!.start, segments)).toBe(2)
    expect(getPageNumberAtOffset(segments[1]!.start - 1, segments)).toBe(1)
  })

  it('computes scroll top from content start offset', () => {
    expect(getScrollTopForPage(1, 100, segments)).toBe(100)
    expect(getScrollTopForPage(2, 100, segments)).toBe(100 + segments[1]!.start)
  })

  it('returns the content start when the page is missing', () => {
    expect(getScrollTopForPage(999, 42, segments)).toBe(42)
  })
})

describe('print sheet layout', () => {
  const { width, height } = PAPER_SIZES.a4
  const gap = 28

  it('stacks single-column sheets vertically', () => {
    expect(getSheetPosition(0, 1, width, height, gap)).toEqual({ left: 0, top: 0 })
    expect(getSheetPosition(2, 1, width, height, gap)).toEqual({
      left: 0,
      top: 2 * (height + gap),
    })
  })

  it('arranges two-column sheets in a grid', () => {
    expect(getSheetPosition(0, 2, width, height, gap)).toEqual({ left: 0, top: 0 })
    expect(getSheetPosition(1, 2, width, height, gap)).toEqual({ left: width + gap, top: 0 })
    expect(getSheetPosition(2, 2, width, height, gap)).toEqual({ left: 0, top: height + gap })
    expect(getSheetPosition(3, 2, width, height, gap)).toEqual({
      left: width + gap,
      top: height + gap,
    })
  })

  it('sizes the stage for one and two columns', () => {
    expect(getPrintStageSize(3, 1, width, height, gap)).toEqual({
      width,
      height: 3 * height + 2 * gap,
    })
    expect(getPrintStageSize(3, 2, width, height, gap)).toEqual({
      width: width * 2 + gap,
      height: 2 * height + gap,
    })
  })

  it('aligns sheet tops with paginated content offsets', () => {
    const segments = computePageSegments(DEFAULT_PAGE_SETUP, 2000)
    expect(getAlignedSheetTop(0, segments[0]!, 56, 28)).toBe(56 - segments[0]!.margins.top)
    expect(getAlignedSheetTop(1, segments[1]!, 56, 28)).toBeGreaterThan(segments[1]!.start)
  })

  it('never shrinks the print stage below measured content', () => {
    const segments = computePageSegments(DEFAULT_PAGE_SETUP, 2400)
    const stage = resolvePrintStageSize(
      segments,
      { paddingTop: 56, paddingBottom: 72 },
      width,
      height,
      gap,
      1,
    )
    const base = getPrintStageSize(segments.length, 1, width, height, gap)
    expect(stage.width).toBe(base.width)
    expect(stage.height).toBeGreaterThanOrEqual(base.height)
  })

  it('falls back to base size when there are no segments', () => {
    const stage = resolvePrintStageSize(
      [],
      { paddingTop: 56, paddingBottom: 72 },
      width,
      height,
      gap,
      1,
    )
    expect(stage).toEqual(getPrintStageSize(1, 1, width, height, gap))
  })
})
