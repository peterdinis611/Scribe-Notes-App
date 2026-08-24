import {
  DEFAULT_PAGE_HEADER_FOOTER,
  DEFAULT_PAGE_SETUP,
  DEFAULT_PAGE_WATERMARK,
  DEFAULT_FIRST_PAGE,
  DEFAULT_DOCUMENT_TYPOGRAPHY,
  type DocumentTypography,
  type PageSetup,
} from '@/lib/editor/page-setup'

export type DocumentStylePresetId =
  | 'default'
  | 'academic'
  | 'letter'
  | 'blog'
  | 'manuscript'

export type DocumentStylePreset = {
  id: DocumentStylePresetId
  /** i18n key under pageStyles.presets.* */
  labelKey: string
  descriptionKey: string
  pageSetup: PageSetup
  typography: DocumentTypography
}

export { DEFAULT_DOCUMENT_TYPOGRAPHY }

export const DOCUMENT_STYLE_PRESETS: DocumentStylePreset[] = [
  {
    id: 'default',
    labelKey: 'pageStyles.presets.default.label',
    descriptionKey: 'pageStyles.presets.default.description',
    pageSetup: DEFAULT_PAGE_SETUP,
    typography: DEFAULT_DOCUMENT_TYPOGRAPHY,
  },
  {
    id: 'academic',
    labelKey: 'pageStyles.presets.academic.label',
    descriptionKey: 'pageStyles.presets.academic.description',
    pageSetup: {
      paperSize: 'a4',
      marginTop: 96,
      marginBottom: 96,
      marginLeft: 104,
      marginRight: 104,
      headerFooter: {
        ...DEFAULT_PAGE_HEADER_FOOTER,
        enabled: true,
        headerText: '{title}',
        footerText: '',
        showPageNumber: true,
      },
      watermark: DEFAULT_PAGE_WATERMARK,
      firstPage: DEFAULT_FIRST_PAGE,
      typography: {
        fontFamily: 'Georgia, "Times New Roman", Times, serif',
        fontSize: 16,
        lineHeight: 1.85,
      },
      stylePresetId: 'academic',
    },
    typography: {
      fontFamily: 'Georgia, "Times New Roman", Times, serif',
      fontSize: 16,
      lineHeight: 1.85,
    },
  },
  {
    id: 'letter',
    labelKey: 'pageStyles.presets.letter.label',
    descriptionKey: 'pageStyles.presets.letter.description',
    pageSetup: {
      paperSize: 'letter',
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 88,
      marginRight: 88,
      headerFooter: {
        enabled: true,
        headerText: '{title}',
        footerText: '{date}',
        showPageNumber: false,
      },
      watermark: DEFAULT_PAGE_WATERMARK,
      firstPage: {
        different: true,
        hideHeaderFooter: true,
      },
      typography: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, Arial, sans-serif',
        fontSize: 15,
        lineHeight: 1.55,
      },
      stylePresetId: 'letter',
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, Arial, sans-serif',
      fontSize: 15,
      lineHeight: 1.55,
    },
  },
  {
    id: 'blog',
    labelKey: 'pageStyles.presets.blog.label',
    descriptionKey: 'pageStyles.presets.blog.description',
    pageSetup: {
      paperSize: 'a4',
      marginTop: 56,
      marginBottom: 64,
      marginLeft: 72,
      marginRight: 72,
      headerFooter: DEFAULT_PAGE_HEADER_FOOTER,
      watermark: DEFAULT_PAGE_WATERMARK,
      firstPage: DEFAULT_FIRST_PAGE,
      typography: {
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: 18,
        lineHeight: 1.75,
      },
      stylePresetId: 'blog',
    },
    typography: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 18,
      lineHeight: 1.75,
    },
  },
  {
    id: 'manuscript',
    labelKey: 'pageStyles.presets.manuscript.label',
    descriptionKey: 'pageStyles.presets.manuscript.description',
    pageSetup: {
      paperSize: 'letter',
      marginTop: 88,
      marginBottom: 88,
      marginLeft: 96,
      marginRight: 96,
      headerFooter: {
        enabled: true,
        headerText: '{title}',
        footerText: '',
        showPageNumber: true,
      },
      watermark: DEFAULT_PAGE_WATERMARK,
      firstPage: DEFAULT_FIRST_PAGE,
      typography: {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 15,
        lineHeight: 2,
      },
      stylePresetId: 'manuscript',
    },
    typography: {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 15,
      lineHeight: 2,
    },
  },
]

export function getDocumentStylePreset(id: DocumentStylePresetId | string | null | undefined) {
  return (
    DOCUMENT_STYLE_PRESETS.find((preset) => preset.id === id) ?? DOCUMENT_STYLE_PRESETS[0]!
  )
}

export function resolveDocumentTypography(setup: PageSetup): DocumentTypography {
  const fromSetup = setup.typography
  if (fromSetup) {
    return {
      fontFamily: fromSetup.fontFamily ?? DEFAULT_DOCUMENT_TYPOGRAPHY.fontFamily,
      fontSize: fromSetup.fontSize ?? DEFAULT_DOCUMENT_TYPOGRAPHY.fontSize,
      lineHeight: fromSetup.lineHeight ?? DEFAULT_DOCUMENT_TYPOGRAPHY.lineHeight,
    }
  }
  return DEFAULT_DOCUMENT_TYPOGRAPHY
}

export function applyDocumentStylePreset(id: DocumentStylePresetId): PageSetup {
  const preset = getDocumentStylePreset(id)
  return {
    ...preset.pageSetup,
    typography: { ...preset.typography },
    stylePresetId: preset.id,
  }
}
