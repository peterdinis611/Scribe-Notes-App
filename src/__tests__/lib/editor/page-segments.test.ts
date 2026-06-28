import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP } from '@/lib/editor/page-setup'
import {
  computePageSegments,
  getPageCountForContent,
  getPageMargins,
  shouldShowHeaderFooter,
} from '@/lib/editor/page-segments'

describe('page segments', () => {
  it('computes multiple pages for long content', () => {
    const setup = DEFAULT_PAGE_SETUP
    const firstPageHeight = computePageSegments(setup, 1)[0]!.height
    expect(getPageCountForContent(firstPageHeight + 200, setup)).toBeGreaterThan(1)
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
})
