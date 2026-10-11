/** Keep in sync with `scribe_ui::DOCS_TOPIC_IDS` / UiManifest.docsTopicIds. */
export const DOCS_TOPIC_IDS = [
  'overview',
  'privacy',
  'documents',
  'library',
  'linkGraph',
  'wikiLinks',
  'editor',
  'search',
  'localAi',
  'revisions',
  'mcp',
  'plugins',
  'journal',
  'backup',
  'shortcuts',
] as const

export type DocsTopicId = (typeof DOCS_TOPIC_IDS)[number]

export type DocsGroupId = 'basics' | 'organize' | 'write' | 'power'

export type DocsGroup = {
  id: DocsGroupId
  topics: DocsTopicId[]
}

/** Keep in sync with `scribe_ui::docs_groups` / python-ui `docs_nav`. */
export const DOCS_GROUPS: DocsGroup[] = [
  { id: 'basics', topics: ['overview', 'privacy', 'documents'] },
  { id: 'organize', topics: ['library', 'linkGraph', 'wikiLinks'] },
  {
    id: 'write',
    topics: ['editor', 'search', 'localAi', 'revisions', 'journal'],
  },
  { id: 'power', topics: ['mcp', 'plugins', 'backup', 'shortcuts'] },
]

/** Quick-jump chips in the Docs hero. */
export const DOCS_QUICK_LINKS: DocsTopicId[] = [
  'library',
  'localAi',
  'revisions',
  'plugins',
]

/** Optional tip copy keys under `settings.docs.*Tip` + shortcut label. */
export const DOCS_TOPIC_TIPS: Partial<
  Record<DocsTopicId, { tipKey: string; shortcut?: string }>
> = {
  search: { tipKey: 'searchTip', shortcut: '⌘K' },
  journal: { tipKey: 'journalTip', shortcut: '⌘J' },
  shortcuts: { tipKey: 'shortcutsTip', shortcut: '⌘,' },
  localAi: { tipKey: 'localAiTip', shortcut: '⌘K' },
  revisions: { tipKey: 'revisionsTip' },
  mcp: { tipKey: 'mcpTip' },
  plugins: { tipKey: 'pluginsTip' },
}
