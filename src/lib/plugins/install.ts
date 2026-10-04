import { readZipTextFiles } from '@/lib/plugins/zip'
import {
  SCRIBE_PLUGIN_API,
  type InstalledPluginRecord,
  type PluginCategory,
  type PluginManifest,
  type PluginModule,
  type PluginPermission,
} from '@/lib/plugins/types'
import { kvGetJson, kvSetJson } from '@/lib/storage/kv'

export const INSTALLED_PLUGINS_KEY = 'scribe-plugins-installed'

const PERMISSIONS = new Set<PluginPermission>([
  'editor.blocks',
  'editor.extensions',
  'commands',
  'storage',
  'export',
  'import',
  'ui.sidebar',
  'ui.settings',
  'nlp.skills',
  'mcp.tools',
  'lifecycle',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parsePluginManifest(raw: unknown): PluginManifest {
  if (!isRecord(raw)) throw new Error('manifest.json must be an object')
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const version = typeof raw.version === 'string' ? raw.version.trim() : ''
  if (!id || !name || !version) throw new Error('manifest requires id, name, version')
  if (!/^[a-z][a-z0-9.-]{0,127}$/i.test(id)) throw new Error('Invalid plugin id')

  const scribeApi = Number(raw.scribeApi)
  if (scribeApi !== 1 && scribeApi !== SCRIBE_PLUGIN_API) {
    throw new Error(`Unsupported scribeApi ${String(raw.scribeApi)} (host ${SCRIBE_PLUGIN_API})`)
  }

  const permissions = Array.isArray(raw.permissions)
    ? raw.permissions.filter((item): item is PluginPermission =>
        typeof item === 'string' && PERMISSIONS.has(item as PluginPermission),
      )
    : []

  const i18n =
    isRecord(raw.i18n)
      ? (raw.i18n as PluginManifest['i18n'])
      : undefined

  const categories = new Set<PluginCategory>(['writing', 'study', 'workspace', 'other'])
  const category =
    typeof raw.category === 'string' && categories.has(raw.category as PluginCategory)
      ? (raw.category as PluginCategory)
      : undefined

  return {
    id,
    name,
    version,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    scribeApi,
    permissions,
    defaultEnabled: raw.defaultEnabled === true,
    category,
    i18n,
    main: typeof raw.main === 'string' ? raw.main : 'index.js',
  }
}

export function listInstalledPluginRecords(): InstalledPluginRecord[] {
  const stored = kvGetJson<InstalledPluginRecord[]>(INSTALLED_PLUGINS_KEY)
  return Array.isArray(stored) ? stored : []
}

function persistInstalled(records: InstalledPluginRecord[]) {
  kvSetJson(INSTALLED_PLUGINS_KEY, records)
}

export function saveInstalledPluginRecord(record: InstalledPluginRecord) {
  const next = listInstalledPluginRecords().filter((item) => item.manifest.id !== record.manifest.id)
  next.push(record)
  persistInstalled(next)
}

export function removeInstalledPluginRecord(pluginId: string) {
  persistInstalled(listInstalledPluginRecords().filter((item) => item.manifest.id !== pluginId))
}

/** Load activate() from ESM source text via blob URL. */
export async function loadPluginModuleFromCode(
  manifest: PluginManifest,
  code: string,
): Promise<PluginModule> {
  const blob = new Blob([code], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const mod = (await import(/* @vite-ignore */ url)) as {
      default?: PluginModule['activate'] | PluginModule
      activate?: PluginModule['activate']
      manifest?: PluginManifest
    }

    if (mod.default && typeof mod.default === 'object' && 'activate' in mod.default) {
      return {
        manifest: mod.default.manifest ?? manifest,
        activate: mod.default.activate,
      }
    }

    const activate =
      typeof mod.default === 'function'
        ? mod.default
        : typeof mod.activate === 'function'
          ? mod.activate
          : null

    if (!activate) {
      throw new Error('Plugin must export default function activate(api) or { activate }')
    }

    return { manifest: mod.manifest ?? manifest, activate }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function parseScribeExtBytes(
  bytes: Uint8Array,
  pathHint?: string,
): Promise<InstalledPluginRecord> {
  // JSON package fallback (tests / web): { manifest, code, i18n? }
  const asText = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 32)))
  if (asText.trimStart().startsWith('{')) {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    const manifest = parsePluginManifest(json.manifest ?? json)
    const code = typeof json.code === 'string' ? json.code : null
    if (!code) throw new Error('JSON plugin package requires code string')
    if (isRecord(json.i18n)) {
      manifest.i18n = json.i18n as PluginManifest['i18n']
    }
    return {
      manifest,
      code,
      installedAt: new Date().toISOString(),
      path: pathHint,
    }
  }

  const files = await readZipTextFiles(bytes)
  const manifestRaw = files['manifest.json'] ?? files['./manifest.json']
  if (!manifestRaw) throw new Error('manifest.json missing from .scribe-ext')
  const manifest = parsePluginManifest(JSON.parse(manifestRaw))
  const main = (manifest.main ?? 'index.js').replace(/^\.\//, '')
  const code = files[main] ?? files[`./${main}`]
  if (!code) throw new Error(`${main} missing from .scribe-ext`)

  // Optional locale files: i18n/en.json, i18n/sk.json
  const i18n: NonNullable<PluginManifest['i18n']> = { ...(manifest.i18n ?? {}) }
  for (const [path, content] of Object.entries(files)) {
    const match = path.match(/^i18n\/([a-z]{2})\.json$/i)
    if (!match) continue
    try {
      const table = JSON.parse(content) as Record<string, string>
      if (isRecord(table)) i18n[match[1].toLowerCase()] = table as Record<string, string>
    } catch {
      // ignore bad locale file
    }
  }
  if (Object.keys(i18n).length) manifest.i18n = i18n

  return {
    manifest,
    code,
    installedAt: new Date().toISOString(),
    path: pathHint,
  }
}
