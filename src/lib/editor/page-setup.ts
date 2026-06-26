export type PaperSizeId = 'a4' | 'letter' | 'a5'

export type PageSetup = {
  paperSize: PaperSizeId
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
}

export type ResolvedPageLayout = {
  width: number
  paddingTop: number
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
  contentHeight: number
  scrollPaddingTop: number
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

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paperSize: 'a4',
  ...PAGE_MARGIN_PRESETS[0].setup,
}

export function resolvePageLayout(setup: PageSetup): ResolvedPageLayout {
  const paper = PAPER_SIZES[setup.paperSize]
  return {
    width: paper.width,
    paddingTop: setup.marginTop,
    paddingBottom: setup.marginBottom,
    paddingLeft: setup.marginLeft,
    paddingRight: setup.marginRight,
    contentHeight: Math.max(480, paper.height - setup.marginTop - setup.marginBottom),
    scrollPaddingTop: 20,
  }
}

/** @deprecated use resolvePageLayout(DEFAULT_PAGE_SETUP) */
export const EDITOR_PAGE = resolvePageLayout(DEFAULT_PAGE_SETUP)
