import en from '@/i18n/locales/en.json'

/** Keep group catalog in sync with `crates/scribe-ui/src/locale_sections.rs`. */

/** Top-level keys of the built-in English catalog — each may appear under `messages`. */
export const LOCALE_TOP_LEVEL_SECTIONS = Object.keys(en)

export type LocaleSectionGroupId =
  | 'core'
  | 'editor'
  | 'library'
  | 'panels'
  | 'media'
  | 'system'

export type LocaleSectionGroup = {
  id: LocaleSectionGroupId
  /** Top-level keys from en.json belonging to this group. */
  sections: string[]
}

/**
 * Human-oriented grouping for the settings “which keys” list.
 * Unknown keys (if the catalog grows) are appended under `other`.
 */
export const LOCALE_SECTION_GROUPS: LocaleSectionGroup[] = [
  {
    id: 'core',
    sections: [
      'common',
      'nav',
      'welcome',
      'settings',
      'toasts',
      'errors',
      'setup',
      'onboarding',
      'appTour',
      'whatsNew',
      'demoGuide',
      'fileMenu',
      'commandPalette',
      'shortcuts',
    ],
  },
  {
    id: 'editor',
    sections: [
      'editor',
      'toolbar',
      'editorActions',
      'slash',
      'floatingMenu',
      'findReplace',
      'viewMode',
      'focusMode',
      'readingMode',
      'printLayout',
      'pageStyles',
      'pagination',
      'tableOfContents',
      'footnotes',
      'math',
      'lorem',
      'aiRewrite',
      'wikiLink',
      'wikiNav',
      'wikiEmbed',
      'wikiGhost',
      'emojiPicker',
      'codeBlock',
      'templates',
      'templateCoach',
    ],
  },
  {
    id: 'library',
    sections: [
      'library',
      'libraryChat',
      'documentChat',
      'agent',
      'libraryFindReplace',
      'libraries',
      'trash',
      'journal',
      'linkGraph',
      'compile',
      'tabs',
      'split',
      'quickNote',
    ],
  },
  {
    id: 'panels',
    sections: ['editorPanels', 'panels', 'nlp', 'diagnostics', 'pdfPreview', 'structuredPdf'],
  },
  {
    id: 'media',
    sections: [
      'image',
      'map',
      'video',
      'lottie',
      'model3d',
      'canvas',
      'mermaid',
      'd3Chart',
      'invoiceDialog',
      'capture',
    ],
  },
  {
    id: 'system',
    sections: ['storageAccess', 'diskSync', 'syncConflicts', 'vault'],
  },
]

/** Short blurbs for the catalog — i18n key suffix under `settings.language.sections.*`. */
export const LOCALE_SECTION_BLURB_KEYS = [
  'common',
  'nav',
  'welcome',
  'settings',
  'toasts',
  'errors',
  'setup',
  'onboarding',
  'appTour',
  'whatsNew',
  'demoGuide',
  'fileMenu',
  'commandPalette',
  'shortcuts',
  'editor',
  'toolbar',
  'editorActions',
  'slash',
  'floatingMenu',
  'findReplace',
  'viewMode',
  'focusMode',
  'readingMode',
  'printLayout',
  'pageStyles',
  'pagination',
  'tableOfContents',
  'footnotes',
  'math',
  'lorem',
  'aiRewrite',
  'wikiLink',
  'wikiNav',
  'wikiEmbed',
  'wikiGhost',
  'emojiPicker',
  'codeBlock',
  'templates',
  'templateCoach',
  'library',
  'libraryChat',
  'documentChat',
  'agent',
  'libraryFindReplace',
  'libraries',
  'trash',
  'journal',
  'linkGraph',
  'compile',
  'tabs',
  'split',
  'quickNote',
  'editorPanels',
  'panels',
  'nlp',
  'diagnostics',
  'pdfPreview',
  'structuredPdf',
  'image',
  'map',
  'video',
  'lottie',
  'model3d',
  'canvas',
  'mermaid',
  'd3Chart',
  'invoiceDialog',
  'capture',
  'storageAccess',
  'diskSync',
  'syncConflicts',
  'vault',
] as const

export type LocaleSectionBlurbKey = (typeof LOCALE_SECTION_BLURB_KEYS)[number]

export function hasLocaleSectionBlurb(section: string): section is LocaleSectionBlurbKey {
  return (LOCALE_SECTION_BLURB_KEYS as readonly string[]).includes(section)
}

/** Sections present in en.json but not listed above (keeps the UI complete). */
export function orphanLocaleSections(): string[] {
  const listed = new Set(LOCALE_SECTION_GROUPS.flatMap((group) => group.sections))
  return LOCALE_TOP_LEVEL_SECTIONS.filter((key) => !listed.has(key))
}
