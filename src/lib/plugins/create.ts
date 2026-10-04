import { SCRIBE_PLUGIN_API, type InstalledPluginRecord, type PluginCategory, type PluginManifest, type PluginPermission } from '@/lib/plugins/types'
import { listPlugins } from '@/lib/plugins/registry'
import { listInstalledPluginRecords } from '@/lib/plugins/install'

export type PluginCreateTemplateId = 'command' | 'slashBlock' | 'commandAndBlock' | 'activeDoc'

export type PluginCreateInput = {
  name: string
  id?: string
  description?: string
  template: PluginCreateTemplateId
  category?: PluginCategory
  author?: string
  /** Localize command/block titles (EN). */
  titleEn?: string
  titleSk?: string
}

export type PluginCreateResult = {
  manifest: PluginManifest
  code: string
  record: InstalledPluginRecord
  packageJson: string
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9.-]{0,127}$/i

export function slugifyPluginId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const slug = base || 'plugin'
  return `local.${slug}`
}

export function validatePluginId(id: string): { ok: true; id: string } | { ok: false; error: string } {
  const trimmed = id.trim()
  if (!trimmed) return { ok: false, error: 'id_required' }
  if (!PLUGIN_ID_PATTERN.test(trimmed)) return { ok: false, error: 'id_invalid' }
  if (listPlugins().some((plugin) => plugin.manifest.id === trimmed)) {
    return { ok: false, error: 'id_taken' }
  }
  if (listInstalledPluginRecords().some((record) => record.manifest.id === trimmed)) {
    return { ok: false, error: 'id_taken' }
  }
  return { ok: true, id: trimmed }
}

function permissionsForTemplate(template: PluginCreateTemplateId): PluginPermission[] {
  switch (template) {
    case 'slashBlock':
      return ['editor.blocks']
    case 'commandAndBlock':
      return ['editor.blocks', 'commands']
    case 'activeDoc':
      return ['commands']
    case 'command':
    default:
      return ['commands']
  }
}

function buildCode(input: PluginCreateInput, blockId: string): string {
  const titleFallback = input.titleEn?.trim() || input.name.trim() || 'My action'
  const blockLabel = titleFallback

  switch (input.template) {
    case 'slashBlock':
      return `export default function activate(api) {
  api.blocks.register({
    id: ${JSON.stringify(blockId)},
    icon: '✦',
    group: 'advanced',
    label: api.i18n.t('block.label', ${JSON.stringify(blockLabel)}),
    hint: api.i18n.t('block.hint', 'Custom slash block'),
    keywords: [${JSON.stringify(blockId)}, 'custom'],
    insert: (editor) => {
      editor.chain().focus().insertContent({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: ${JSON.stringify(blockLabel)} }],
      }).insertContent({ type: 'paragraph' }).run()
      api.notify.success(api.i18n.t('block.label', ${JSON.stringify(blockLabel)}))
    },
  })
}
`

    case 'commandAndBlock':
      return `export default function activate(api) {
  const insert = (editor) => {
    editor.chain().focus().insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: ${JSON.stringify(blockLabel + ' — ')} }],
    }).run()
  }

  api.blocks.register({
    id: ${JSON.stringify(blockId)},
    icon: '✦',
    group: 'advanced',
    label: api.i18n.t('block.label', ${JSON.stringify(blockLabel)}),
    hint: api.i18n.t('block.hint', 'Slash + command'),
    insert,
  })

  api.commands.register({
    id: 'run',
    title: api.i18n.t('cmd.title', ${JSON.stringify(titleFallback)}),
    run: () => {
      const doc = api.app.getActiveDocument()
      if (!doc) {
        api.notify.error('Open a note first')
        return
      }
      // Tip: use slash /${blockId} in the editor, or extend this command.
      api.notify.success(api.i18n.t('cmd.title', ${JSON.stringify(titleFallback)}), doc.title)
      api.log('Ran on ' + doc.title)
    },
  })
}
`

    case 'activeDoc':
      return `export default function activate(api) {
  api.commands.register({
    id: 'show-active',
    title: api.i18n.t('cmd.title', ${JSON.stringify(titleFallback)}),
    run: () => {
      const doc = api.app.getActiveDocument()
      if (!doc) {
        api.notify.error('No note open')
        return
      }
      api.notify.success(doc.title, doc.id)
      api.log('Active document: ' + doc.title)
    },
  })
}
`

    case 'command':
    default:
      return `export default function activate(api) {
  api.commands.register({
    id: 'run',
    title: api.i18n.t('cmd.title', ${JSON.stringify(titleFallback)}),
    run: () => {
      api.notify.success(api.i18n.t('cmd.title', ${JSON.stringify(titleFallback)}))
      api.log('Command ran')
    },
  })
}
`
  }
}

export function buildCreatedPlugin(input: PluginCreateInput): PluginCreateResult {
  const name = input.name.trim()
  if (!name) throw new Error('name_required')

  const idCheck = validatePluginId(input.id?.trim() || slugifyPluginId(name))
  if (!idCheck.ok) throw new Error(idCheck.error)
  const id = idCheck.id

  const blockId = id
    .replace(/^local\./, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'custom-block'

  const titleEn = input.titleEn?.trim() || name
  const titleSk = input.titleSk?.trim() || titleEn

  const manifest: PluginManifest = {
    id,
    name,
    version: '1.0.0',
    description: input.description?.trim() || undefined,
    author: input.author?.trim() || undefined,
    scribeApi: SCRIBE_PLUGIN_API,
    permissions: permissionsForTemplate(input.template),
    defaultEnabled: true,
    category: input.category ?? 'other',
    i18n: {
      en: {
        'manifest.name': name,
        'cmd.title': titleEn,
        'block.label': titleEn,
        'block.hint': input.description?.trim() || titleEn,
      },
      sk: {
        'manifest.name': name,
        'cmd.title': titleSk,
        'block.label': titleSk,
        'block.hint': input.description?.trim() || titleSk,
      },
    },
    main: 'index.js',
  }

  const code = buildCode({ ...input, name, titleEn, titleSk }, blockId)
  const record: InstalledPluginRecord = {
    manifest,
    code,
    installedAt: new Date().toISOString(),
    path: `created:${id}`,
  }
  const packageJson = JSON.stringify({ manifest, code }, null, 2) + '\n'

  return { manifest, code, record, packageJson }
}

export const PLUGIN_CREATE_TEMPLATES: Array<{
  id: PluginCreateTemplateId
  /** i18n: settings.plugins.create.templates.<id> */
}> = [
  { id: 'command' },
  { id: 'slashBlock' },
  { id: 'commandAndBlock' },
  { id: 'activeDoc' },
]
