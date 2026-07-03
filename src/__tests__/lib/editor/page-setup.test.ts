import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  normalizePageSetup,
  resolvePageLayout,
  type PageSetup,
} from '@/lib/editor/page-setup'

describe('normalizePageSetup', () => {
  it('fills missing nested defaults', () => {
    const partial = {
      paperSize: 'a4',
      marginTop: 56,
      marginBottom: 72,
      marginLeft: 64,
      marginRight: 64,
      headerFooter: { enabled: true } as PageSetup['headerFooter'],
      watermark: { text: 'Draft' } as PageSetup['watermark'],
      firstPage: {} as PageSetup['firstPage'],
    } as PageSetup

    const normalized = normalizePageSetup(partial)
    expect(normalized.headerFooter.enabled).toBe(true)
    expect(normalized.headerFooter.showPageNumber).toBe(true)
    expect(normalized.headerFooter.headerText).toBe('{title}')
    expect(normalized.watermark.text).toBe('Draft')
    expect(normalized.watermark.opacity).toBeCloseTo(0.12)
    expect(normalized.firstPage.different).toBe(false)
  })

  it('preserves explicitly provided values', () => {
    const setup: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      marginTop: 999,
      watermark: { ...DEFAULT_PAGE_SETUP.watermark, enabled: true, angle: -10 },
    }
    const normalized = normalizePageSetup(setup)
    expect(normalized.marginTop).toBe(999)
    expect(normalized.watermark.enabled).toBe(true)
    expect(normalized.watermark.angle).toBe(-10)
  })
})

describe('resolvePageLayout', () => {
  it('derives padding and dimensions from the paper size', () => {
    const layout = resolvePageLayout(DEFAULT_PAGE_SETUP)
    expect(layout.width).toBe(PAPER_SIZES.a4.width)
    expect(layout.paperHeight).toBe(PAPER_SIZES.a4.height)
    expect(layout.paddingTop).toBe(DEFAULT_PAGE_SETUP.marginTop)
    expect(layout.paddingBottom).toBe(DEFAULT_PAGE_SETUP.marginBottom)
    expect(layout.scrollPaddingTop).toBe(20)
  })

  it('shrinks content height when header/footer is enabled', () => {
    const withHf: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      headerFooter: { ...DEFAULT_PAGE_SETUP.headerFooter, enabled: true },
    }
    expect(resolvePageLayout(withHf).contentHeight).toBeLessThan(
      resolvePageLayout(DEFAULT_PAGE_SETUP).contentHeight,
    )
  })

  it('keeps full content height when first page hides header/footer', () => {
    const setup: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      headerFooter: { ...DEFAULT_PAGE_SETUP.headerFooter, enabled: true },
      firstPage: { different: true, hideHeaderFooter: true },
    }
    expect(resolvePageLayout(setup).contentHeight).toBe(
      resolvePageLayout(DEFAULT_PAGE_SETUP).contentHeight,
    )
  })

  it('uses first page margins when they differ', () => {
    const setup: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      firstPage: { different: true, hideHeaderFooter: false, marginBottom: 200 },
    }
    const layout = resolvePageLayout(setup)
    const baseline = resolvePageLayout(DEFAULT_PAGE_SETUP)
    expect(layout.contentHeight).toBe(baseline.contentHeight - (200 - DEFAULT_PAGE_SETUP.marginBottom))
  })

  it('adapts width to different paper sizes', () => {
    expect(resolvePageLayout({ ...DEFAULT_PAGE_SETUP, paperSize: 'letter' }).width).toBe(
      PAPER_SIZES.letter.width,
    )
    expect(resolvePageLayout({ ...DEFAULT_PAGE_SETUP, paperSize: 'a5' }).width).toBe(
      PAPER_SIZES.a5.width,
    )
  })
})
