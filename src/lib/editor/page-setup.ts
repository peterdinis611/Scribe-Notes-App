export type PaperSizeId = 'a4' | 'letter' | 'a5'

export type PageHeaderFooter = {
  enabled: boolean
  headerText: string
  footerText: string
  showPageNumber: boolean
}

export type PageWatermark = {
  enabled: boolean
  text: string
  opacity: number
  angle: number
}

export type FirstPageSetup = {
  different: boolean
  hideHeaderFooter: boolean
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
}

export type PageSetup = {
  paperSize: PaperSizeId
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  headerFooter: PageHeaderFooter
  watermark: PageWatermark
  firstPage: FirstPageSetup
}

export type ResolvedPageLayout = {
  width: number
  paddingTop: number
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
  contentHeight: number
  scrollPaddingTop: number
  paperHeight: number
}

export const PAPER_SIZES: Record<PaperSizeId, { label: string; width: number; height: number }> = {
  a4: { label: 'A4', width: 794, height: 1123 },
  letter: { label: 'Letter (US)', width: 816, height: 1056 },
  a5: { label: 'A5', width: 559, height: 794 },
}

export const PAGE_MARGIN_PRESETS: Array<{ id: string; label: string; setup: Pick<PageSetup, 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight'> }> = [
  {
    id: 'normal',
    label: 'Normálne',
    setup: { marginTop: 56, marginBottom: 72, marginLeft: 64, marginRight: 64 },
  },
  {
    id: 'narrow',
    label: 'Úzke',
    setup: { marginTop: 40, marginBottom: 48, marginLeft: 40, marginRight: 40 },
  },
  {
    id: 'wide',
    label: 'Široké',
    setup: { marginTop: 72, marginBottom: 88, marginLeft: 96, marginRight: 96 },
  },
]

export const DEFAULT_PAGE_WATERMARK: PageWatermark = {
  enabled: false,
  text: 'Koncept',
  opacity: 0.12,
  angle: -35,
}

export const DEFAULT_FIRST_PAGE: FirstPageSetup = {
  different: false,
  hideHeaderFooter: false,
}

export const DEFAULT_PAGE_HEADER_FOOTER: PageHeaderFooter = {
  enabled: false,
  headerText: '{title}',
  footerText: '',
  showPageNumber: true,
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paperSize: 'a4',
  ...PAGE_MARGIN_PRESETS[0].setup,
  headerFooter: DEFAULT_PAGE_HEADER_FOOTER,
  watermark: DEFAULT_PAGE_WATERMARK,
  firstPage: DEFAULT_FIRST_PAGE,
}

export function normalizePageSetup(setup: PageSetup): PageSetup {
  return {
    ...DEFAULT_PAGE_SETUP,
    ...setup,
    headerFooter: {
      ...DEFAULT_PAGE_HEADER_FOOTER,
      ...setup.headerFooter,
    },
    watermark: {
      ...DEFAULT_PAGE_WATERMARK,
      ...setup.watermark,
    },
    firstPage: {
      ...DEFAULT_FIRST_PAGE,
      ...setup.firstPage,
    },
  }
}

export function resolvePageLayout(setup: PageSetup): ResolvedPageLayout {
  const normalized = normalizePageSetup(setup)
  const paper = PAPER_SIZES[normalized.paperSize]
  const margins =
    normalized.firstPage.different
      ? {
          top: normalized.firstPage.marginTop ?? normalized.marginTop,
          bottom: normalized.firstPage.marginBottom ?? normalized.marginBottom,
          left: normalized.firstPage.marginLeft ?? normalized.marginLeft,
          right: normalized.firstPage.marginRight ?? normalized.marginRight,
        }
      : {
          top: normalized.marginTop,
          bottom: normalized.marginBottom,
          left: normalized.marginLeft,
          right: normalized.marginRight,
        }
  const headerFooterReserve =
    normalized.headerFooter.enabled &&
    !(normalized.firstPage.different && normalized.firstPage.hideHeaderFooter)
      ? 48
      : 0
  const contentHeight = Math.max(
    480,
    paper.height - margins.top - margins.bottom - headerFooterReserve,
  )

  return {
    width: paper.width,
    paddingTop: normalized.marginTop,
    paddingBottom: normalized.marginBottom,
    paddingLeft: normalized.marginLeft,
    paddingRight: normalized.marginRight,
    contentHeight,
    scrollPaddingTop: 20,
    paperHeight: paper.height,
  }
}

/** @deprecated use resolvePageLayout(DEFAULT_PAGE_SETUP) */
export const EDITOR_PAGE = resolvePageLayout(DEFAULT_PAGE_SETUP)
