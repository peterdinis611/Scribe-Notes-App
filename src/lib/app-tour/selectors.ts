/** Stable selectors for the guided product tour (driver.js). */
export const TOUR = {
  sidebarRail: '[data-tour="sidebar-rail"]',
  libraryPanel: '[data-tour="library-panel"]',
  librarySwitcher: '[data-tour="library-switcher"]',
  librarySearch: '[data-tour="library-search"]',
  libraryViews: '[data-tour="library-views"]',
  libraryChat: '[data-tour="library-chat"]',
  libraryFilters: '[data-tour="library-filters"]',
  libraryTree: '[data-tour="library-tree"]',
  libraryCompile: '[data-tour="library-compile"]',
  appHeader: '[data-tour="app-header"]',
  newDocument: '[data-tour="new-document"]',
  documentTabs: '[data-tour="document-tabs"]',
  editorToolbar: '[data-tour="editor-toolbar"]',
  editorCanvas: '[data-tour="editor-canvas"]',
  panelRail: '[data-tour="panel-rail"]',
  panelOutline: '[data-tour="panel-outline"]',
  panelInsights: '[data-tour="panel-insights"]',
  statusBar: '[data-tour="status-bar"]',
  settingsNav: '[data-tour="settings-nav"]',
} as const

export type TourSelector = (typeof TOUR)[keyof typeof TOUR]
