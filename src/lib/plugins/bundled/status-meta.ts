import { createElement } from 'react'
import type { PluginModule } from '@/lib/plugins/types'

const STATUSES = ['draft', 'active', 'blocked', 'done'] as const

export const statusMetaPlugin: PluginModule = {
  manifest: {
    id: 'scribe.status-meta',
    name: 'Status meta',
    version: '1.0.0',
    description: 'Sticky note status in the sidebar, settings, and a custom TipTap node.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: [
      'editor.blocks',
      'editor.extensions',
      'commands',
      'storage',
      'ui.sidebar',
      'ui.settings',
      'lifecycle',
      'mcp.tools',
    ],
    defaultEnabled: false,
    category: 'workspace',
    i18n: {
      en: {
        'manifest.name': 'Status meta',
        'sidebar.title': 'Note status',
        'settings.title': 'Status defaults',
        'cmd.cycle': 'Cycle note status',
      },
      sk: {
        'manifest.name': 'Status poznámky',
        'sidebar.title': 'Status poznámky',
        'settings.title': 'Predvolený status',
        'cmd.cycle': 'Prepnúť status poznámky',
      },
    },
  },
  activate(api) {
    if (!api.storage.get('default-status')) {
      api.storage.set('default-status', 'draft')
    }

    let currentDoc: string | null = null

    const readStatus = (docId: string | null) => {
      if (!docId) return api.storage.get('default-status') ?? 'draft'
      return api.storage.get(`status:${docId}`) ?? api.storage.get('default-status') ?? 'draft'
    }

    const writeStatus = (docId: string | null, status: string) => {
      if (!docId) {
        api.storage.set('default-status', status)
        return
      }
      api.storage.set(`status:${docId}`, status)
    }

    api.editor.registerNode({
      name: 'statusBadge',
      group: 'inline',
      inline: true,
      atom: true,
      parseTag: 'span',
      renderTag: 'span',
      renderClass: 'scribe-status-badge',
      textContent: 'status',
      attrs: { status: { default: 'draft' } },
    })

    api.blocks.register({
      id: 'status-badge',
      icon: '🏷',
      group: 'basic',
      keywords: ['status', 'meta', 'badge'],
      label: 'Status badge',
      hint: 'Inline status marker',
      insert: (editor) => {
        const status = readStatus(currentDoc)
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: `Status: ${status}`,
              },
            ],
          })
          .run()
      },
    })

    api.commands.register({
      id: 'cycle-status',
      title: api.i18n.t('cmd.cycle', 'Cycle note status'),
      keywords: ['status', 'draft', 'done'],
      run: () => {
        const current = readStatus(currentDoc)
        const idx = STATUSES.indexOf(current as (typeof STATUSES)[number])
        const next = STATUSES[(idx + 1 + STATUSES.length) % STATUSES.length]
        writeStatus(currentDoc, next)
        api.log(`Status → ${next}`)
      },
    })

    api.ui.registerSidebarPanel({
      id: 'status',
      title: api.i18n.t('sidebar.title', 'Note status'),
      render: () => {
        const status = readStatus(currentDoc)
        return createElement(
          'div',
          { className: 'px-2 py-1.5 text-[12px]' },
          createElement(
            'div',
            { className: 'font-medium text-[var(--color-foreground)]' },
            api.i18n.t('sidebar.title', 'Note status'),
          ),
          createElement(
            'div',
            { className: 'mt-1 text-[var(--color-muted-foreground)]' },
            status,
          ),
        )
      },
    })

    api.ui.registerSettingsPanel({
      id: 'defaults',
      title: api.i18n.t('settings.title', 'Status defaults'),
      render: () => {
        const current = api.storage.get('default-status') ?? 'draft'
        return createElement(
          'div',
          { className: 'flex flex-wrap gap-1.5' },
          ...STATUSES.map((status) =>
            createElement(
              'button',
              {
                key: status,
                type: 'button',
                className:
                  'rounded border border-[var(--color-border)] px-2 py-1 text-[12px] ' +
                  (status === current
                    ? 'bg-[var(--color-hover)] font-medium'
                    : 'bg-[var(--color-surface)]'),
                onClick: () => {
                  api.storage.set('default-status', status)
                  api.log(`Default status → ${status}`)
                },
              },
              status,
            ),
          ),
        )
      },
    })

    api.lifecycle.on((event) => {
      if (event.type === 'documentOpen') {
        currentDoc = event.documentId
        if (!api.storage.get(`status:${event.documentId}`)) {
          writeStatus(event.documentId, api.storage.get('default-status') ?? 'draft')
        }
      }
    })

    api.mcp.registerTool({
      id: 'get_note_status',
      description: 'Return sticky status for a document id (plugin bridge).',
      handler: (args) => {
        const documentId = typeof args.documentId === 'string' ? args.documentId : currentDoc
        return { documentId, status: readStatus(documentId) }
      },
    })
  },
}
