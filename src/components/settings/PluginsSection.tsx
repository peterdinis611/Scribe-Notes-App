import { Copy, Filter, Package, Plus, Puzzle, Search, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CreatePluginDialog } from '@/components/settings/CreatePluginDialog'
import { EditPluginDialog } from '@/components/settings/EditPluginDialog'
import { PluginCreateDemo } from '@/components/settings/PluginCreateDemo'
import { PluginDetailPanel } from '@/components/settings/PluginDetailPanel'
import { PluginLogsTable } from '@/components/settings/PluginLogsTable'
import {
  applyPluginPreset,
  clearPluginLogs,
  installPluginFromBytes,
  listMarketplaceListings,
  listPluginLogs,
  listPluginMcpTools,
  listPluginNlpSkills,
  listPluginSettingsPanels,
  listPlugins,
  localizeManifestField,
  MARKETPLACE_STATUS,
  PLUGIN_PRESETS,
  PLUGIN_SETUP_EXAMPLES,
  presetEnabledCount,
  reloadPlugin,
  setPluginActive,
  subscribePluginLogs,
  subscribePlugins,
  uninstallPlugin,
  type MarketplaceKind,
  type MarketplaceListing,
  type PluginCategory,
  type PluginPresetId,
  type RegisteredPlugin,
} from '@/lib/plugins'
import { isPluginEnabled } from '@/lib/plugins/prefs'
import { categoryForPluginId } from '@/lib/plugins/presets'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type ExtView = 'installed' | 'marketplace' | 'recommended' | 'build' | 'output'
type ListFilter = 'all' | 'enabled' | 'disabled' | PluginCategory
type MarketFilter = 'all' | MarketplaceKind
type LogLevelFilter = 'all' | 'info' | 'warn' | 'error'

const CATEGORY_ORDER: PluginCategory[] = ['writing', 'study', 'workspace', 'other']

const ICON_TONES = [
  'var(--ext-tone-a)',
  'var(--ext-tone-b)',
  'var(--ext-tone-c)',
  'var(--ext-tone-d)',
  'var(--ext-tone-e)',
] as const

function toneForId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ICON_TONES[hash % ICON_TONES.length]
}

function initials(name: string) {
  const parts = name.trim().split(/[\s.-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

function ExtIcon({ id, name, size = 'md' }: { id: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn('plugin-ext-icon', size === 'sm' && 'is-sm', size === 'lg' && 'is-lg')}
      style={{ background: toneForId(id) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function PluginsSection() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<RegisteredPlugin[]>(() => listPlugins())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [presetBusy, setPresetBusy] = useState<PluginPresetId | null>(null)
  const [logsTick, setLogsTick] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [marketBusyId, setMarketBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [view, setView] = useState<ExtView>('installed')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all')
  const [logLevel, setLogLevel] = useState<LogLevelFilter>('all')
  const [logPluginId, setLogPluginId] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => subscribePlugins(() => setPlugins(listPlugins())), [])
  useEffect(() => subscribePluginLogs(() => setLogsTick((n) => n + 1)), [])

  const settingsPanels = useMemo(() => listPluginSettingsPanels(), [plugins])
  const nlpSkills = useMemo(() => listPluginNlpSkills(), [plugins])
  const mcpTools = useMemo(() => listPluginMcpTools(), [plugins])
  const logs = useMemo(() => {
    let entries = listPluginLogs()
    if (logPluginId !== 'all') entries = entries.filter((entry) => entry.pluginId === logPluginId)
    if (logLevel !== 'all') entries = entries.filter((entry) => entry.level === logLevel)
    return entries
  }, [logsTick, plugins, logLevel, logPluginId])
  const marketplace = useMemo(() => listMarketplaceListings(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plugins
      .filter((plugin) => {
        const enabled = isPluginEnabled(
          plugin.manifest.id,
          plugin.manifest.defaultEnabled === true,
        )
        const category =
          plugin.manifest.category ?? categoryForPluginId(plugin.manifest.id)
        if (listFilter === 'enabled' && !enabled) return false
        if (listFilter === 'disabled' && enabled) return false
        if (
          listFilter !== 'all' &&
          listFilter !== 'enabled' &&
          listFilter !== 'disabled' &&
          category !== listFilter
        ) {
          return false
        }
        if (!q) return true
        const name = localizeManifestField(plugin.manifest, 'name').toLowerCase()
        const description = (localizeManifestField(plugin.manifest, 'description') ?? '').toLowerCase()
        return (
          name.includes(q) ||
          description.includes(q) ||
          plugin.manifest.id.toLowerCase().includes(q) ||
          (plugin.manifest.author ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) =>
        localizeManifestField(a.manifest, 'name').localeCompare(
          localizeManifestField(b.manifest, 'name'),
        ),
      )
  }, [plugins, query, listFilter])

  const marketFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return marketplace.filter((item) => {
      if (marketFilter !== 'all' && item.kind !== marketFilter) return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.includes(q))
      )
    })
  }, [marketplace, marketFilter, query])

  const selected =
    filtered.find((p) => p.manifest.id === selectedId) ??
    plugins.find((p) => p.manifest.id === selectedId) ??
    filtered[0] ??
    null

  useEffect(() => {
    if (view !== 'installed') return
    if (selected && filtered.some((p) => p.manifest.id === selected.manifest.id)) return
    setSelectedId(filtered[0]?.manifest.id ?? null)
  }, [filtered, selected, view])

  const enabledCount = plugins.filter((p) =>
    isPluginEnabled(p.manifest.id, p.manifest.defaultEnabled === true),
  ).length

  async function toggle(plugin: RegisteredPlugin) {
    const next = !isPluginEnabled(plugin.manifest.id, plugin.manifest.defaultEnabled === true)
    setBusyId(plugin.manifest.id)
    try {
      await setPluginActive(plugin.manifest.id, next)
      toast.success(
        next ? t('settings.plugins.enabledToast') : t('settings.plugins.disabledToast'),
        localizeManifestField(plugin.manifest, 'name'),
      )
    } catch (error) {
      toast.error(t('settings.plugins.toggleError'), String(error))
    } finally {
      setBusyId(null)
      setPlugins(listPlugins())
    }
  }

  async function applyPreset(id: PluginPresetId, enabled: boolean) {
    setPresetBusy(id)
    try {
      const count = await applyPluginPreset(id, enabled)
      toast.success(
        enabled ? t('settings.plugins.presetEnabledToast') : t('settings.plugins.presetDisabledToast'),
        t(`settings.plugins.presets.${id}.label`, { count }),
      )
      setPlugins(listPlugins())
    } catch (error) {
      toast.error(t('settings.plugins.presetError'), String(error))
    } finally {
      setPresetBusy(null)
    }
  }

  async function handleInstall(file: File) {
    setInstalling(true)
    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const entry = await installPluginFromBytes(buffer, file.name)
      toast.success(t('settings.plugins.installToast'), entry.manifest.name)
      setPlugins(listPlugins())
      setSelectedId(entry.manifest.id)
      setView('installed')
    } catch (error) {
      toast.error(t('settings.plugins.installError'), String(error))
    } finally {
      setInstalling(false)
    }
  }

  async function installMarketSample(item: MarketplaceListing) {
    if (!item.packageJson) return
    setMarketBusyId(item.id)
    try {
      const bytes = new TextEncoder().encode(item.packageJson)
      const entry = await installPluginFromBytes(bytes, `${item.id}.scribe-ext.json`)
      toast.success(t('settings.plugins.installToast'), entry.manifest.name)
      setPlugins(listPlugins())
      setSelectedId(entry.manifest.id)
      setView('installed')
    } catch (error) {
      toast.error(t('settings.plugins.installError'), String(error))
    } finally {
      setMarketBusyId(null)
    }
  }

  async function enableOfficial(item: MarketplaceListing) {
    if (!item.bundledPluginId) return
    const plugin = plugins.find((entry) => entry.manifest.id === item.bundledPluginId)
    if (!plugin) {
      toast.error(t('settings.plugins.toggleError'), item.bundledPluginId)
      return
    }
    setMarketBusyId(item.id)
    try {
      await setPluginActive(plugin.manifest.id, true)
      toast.success(
        t('settings.plugins.enabledToast'),
        localizeManifestField(plugin.manifest, 'name'),
      )
      setPlugins(listPlugins())
      setSelectedId(plugin.manifest.id)
      setView('installed')
    } catch (error) {
      toast.error(t('settings.plugins.toggleError'), String(error))
    } finally {
      setMarketBusyId(null)
    }
  }

  async function copyExample(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(t('settings.plugins.exampleCopied'))
    } catch (error) {
      toast.error(t('settings.plugins.exampleCopyError'), String(error))
    }
  }

  const views: { id: ExtView; label: string }[] = [
    { id: 'installed', label: t('settings.plugins.views.installed') },
    { id: 'marketplace', label: t('settings.plugins.views.marketplace') },
    { id: 'recommended', label: t('settings.plugins.views.recommended') },
    { id: 'build', label: t('settings.plugins.views.build') },
    { id: 'output', label: t('settings.plugins.views.output') },
  ]

  const filters: { id: ListFilter; label: string }[] = [
    { id: 'all', label: t('settings.plugins.filters.all') },
    { id: 'enabled', label: t('settings.plugins.filters.enabled') },
    { id: 'disabled', label: t('settings.plugins.filters.disabled') },
    ...CATEGORY_ORDER.map((id) => ({
      id,
      label: t(`settings.plugins.categories.${id}`),
    })),
  ]

  const marketFilters: { id: MarketFilter; label: string }[] = [
    { id: 'all', label: t('settings.plugins.filters.all') },
    { id: 'sample', label: t('settings.plugins.marketFilters.sample') },
    { id: 'official', label: t('settings.plugins.marketFilters.official') },
    { id: 'community', label: t('settings.plugins.marketFilters.community') },
  ]

  return (
    <div className="plugin-ext titlebar-no-drag">
      <header className="plugin-ext-chrome">
        <div className="plugin-ext-title-row">
          <div className="plugin-ext-title-block">
            <Puzzle className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            <div>
              <h1 className="plugin-ext-title">{t('settings.plugins.title')}</h1>
              <p className="plugin-ext-subtitle">
                {t('settings.plugins.chromeHint', {
                  enabled: enabledCount,
                  total: plugins.length,
                })}
              </p>
            </div>
          </div>
          <div className="plugin-ext-actions">
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t('settings.plugins.create.open')}
            </Button>
            <label className="inline-flex cursor-pointer">
              <Button type="button" size="sm" variant="outline" disabled={installing} asChild>
                <span>
                  <Upload className="h-3.5 w-3.5" />
                  {installing ? t('settings.plugins.installing') : t('settings.plugins.installShort')}
                </span>
              </Button>
              <input
                type="file"
                accept=".scribe-ext,.zip,.json,application/zip,application/json"
                className="sr-only"
                disabled={installing}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void handleInstall(file)
                }}
              />
            </label>
          </div>
        </div>

        <div className="plugin-ext-search">
          <Search className="plugin-ext-search-icon" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.plugins.searchPlaceholder')}
            className="plugin-ext-search-input"
            aria-label={t('settings.plugins.searchPlaceholder')}
          />
        </div>

        <nav className="plugin-ext-views" aria-label={t('settings.plugins.viewsLabel')}>
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn('plugin-ext-view', view === item.id && 'is-active')}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <CreatePluginDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setPlugins(listPlugins())
          if (id) {
            setSelectedId(id)
            setView('installed')
          }
        }}
      />

      <EditPluginDialog
        pluginId={selected?.source === 'installed' ? selected.manifest.id : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={(id) => {
          setPlugins(listPlugins())
          setSelectedId(id)
        }}
      />

      {view === 'installed' && (
        <div className="plugin-ext-split">
          <aside className="plugin-ext-list" aria-label={t('settings.plugins.listTitle')}>
            <div className="plugin-ext-filters">
              <Filter className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
              <div className="plugin-ext-filter-scroll">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn('plugin-ext-chip', listFilter === item.id && 'is-active')}
                    onClick={() => setListFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="plugin-ext-empty">
                <p className="m-0 font-medium">{t('settings.plugins.emptyTitle')}</p>
                <p className="m-0 mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                  {t('settings.plugins.emptyBody')}
                </p>
              </div>
            ) : (
              <ul className="plugin-ext-rows">
                {filtered.map((plugin, index) => {
                  const enabled = isPluginEnabled(
                    plugin.manifest.id,
                    plugin.manifest.defaultEnabled === true,
                  )
                  const name = localizeManifestField(plugin.manifest, 'name')
                  const description =
                    localizeManifestField(plugin.manifest, 'description') ||
                    t('settings.plugins.noDescription')
                  const active = selected?.manifest.id === plugin.manifest.id
                  return (
                    <li key={plugin.manifest.id} style={{ animationDelay: `${index * 28}ms` }}>
                      <button
                        type="button"
                        className={cn('plugin-ext-row', active && 'is-selected')}
                        onClick={() => setSelectedId(plugin.manifest.id)}
                      >
                        <ExtIcon id={plugin.manifest.id} name={name} />
                        <span className="plugin-ext-row-body">
                          <span className="plugin-ext-row-top">
                            <span className="plugin-ext-row-name">{name}</span>
                            {enabled ? (
                              <span className="plugin-ext-badge is-on">{t('settings.plugins.on')}</span>
                            ) : (
                              <span className="plugin-ext-badge">{t('settings.plugins.off')}</span>
                            )}
                          </span>
                          <span className="plugin-ext-row-meta">
                            {plugin.manifest.author ?? 'Scribe'} · v{plugin.manifest.version}
                            {plugin.source === 'installed'
                              ? ` · ${t('settings.plugins.sourceInstalled')}`
                              : ''}
                            {plugin.error ? ` · ${t('settings.plugins.errorPrefix')}` : ''}
                          </span>
                          <span className="plugin-ext-row-desc">{description}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          <section className="plugin-ext-detail" aria-live="polite">
            {!selected ? (
              <div className="plugin-ext-empty is-detail">
                <Package className="mb-3 h-8 w-8 opacity-40" aria-hidden />
                <p className="m-0">{t('settings.plugins.selectHint')}</p>
              </div>
            ) : (
              <PluginDetailPanel
                plugin={selected}
                busy={busyId === selected.manifest.id}
                settingsPanels={settingsPanels}
                nlpSkills={nlpSkills}
                mcpTools={mcpTools}
                logsTick={logsTick}
                onEdit={
                  selected.source === 'installed' ? () => setEditOpen(true) : undefined
                }
                onToggle={() => void toggle(selected)}
                onReload={() => {
                  setBusyId(selected.manifest.id)
                  void reloadPlugin(selected.manifest.id)
                    .then(() =>
                      toast.success(
                        t('settings.plugins.reloadToast'),
                        localizeManifestField(selected.manifest, 'name'),
                      ),
                    )
                    .catch((error) =>
                      toast.error(t('settings.plugins.reloadError'), String(error)),
                    )
                    .finally(() => {
                      setBusyId(null)
                      setPlugins(listPlugins())
                    })
                }}
                onUninstall={() => {
                  setBusyId(selected.manifest.id)
                  void uninstallPlugin(selected.manifest.id)
                    .then(() =>
                      toast.success(
                        t('settings.plugins.uninstallToast'),
                        localizeManifestField(selected.manifest, 'name'),
                      ),
                    )
                    .catch((error) =>
                      toast.error(t('settings.plugins.uninstallError'), String(error)),
                    )
                    .finally(() => {
                      setBusyId(null)
                      setPlugins(listPlugins())
                      setSelectedId(null)
                    })
                }}
              />
            )}
          </section>
        </div>
      )}

      {view === 'marketplace' && (
        <div className="plugin-ext-pane">
          <div className="plugin-ext-callout">
            <strong>{t('settings.plugins.marketplaceStatus')}</strong>
            <p>{t('settings.plugins.marketplaceLocalBody')}</p>
            <p className="plugin-ext-muted">{MARKETPLACE_STATUS.reason}</p>
          </div>

          <div className="plugin-ext-filters mb-3">
            <Filter className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
            <div className="plugin-ext-filter-scroll">
              {marketFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn('plugin-ext-chip', marketFilter === item.id && 'is-active')}
                  onClick={() => setMarketFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="plugin-ext-market-list">
            {marketFiltered.map((item, index) => {
              const installed =
                item.kind === 'sample' &&
                plugins.some((plugin) => plugin.manifest.id === item.id)
              const bundled = item.bundledPluginId
                ? plugins.find((plugin) => plugin.manifest.id === item.bundledPluginId)
                : null
              const bundledEnabled = bundled
                ? isPluginEnabled(bundled.manifest.id, bundled.manifest.defaultEnabled === true)
                : false

              return (
                <li
                  key={item.id}
                  className="plugin-ext-market-card"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <ExtIcon id={item.id} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <div className="plugin-ext-row-top">
                      <span className="plugin-ext-row-name">{item.name}</span>
                      <span className="plugin-ext-badge">
                        {item.comingSoon
                          ? t('settings.plugins.comingSoon')
                          : t(`settings.plugins.marketFilters.${item.kind}`)}
                      </span>
                    </div>
                    <p className="plugin-ext-row-meta m-0">
                      {item.author} · {item.id} · v{item.version}
                      {item.verified ? ` · ${t('settings.plugins.verified')}` : ''}
                    </p>
                    <p className="plugin-ext-row-desc m-0 mt-1">{item.summary}</p>
                    {item.tags.length > 0 && (
                      <div className="plugin-ext-tag-row">
                        {item.tags.map((tag) => (
                          <span key={tag} className="plugin-ext-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {item.kind === 'sample' && (
                    <Button
                      type="button"
                      size="sm"
                      variant={installed ? 'outline' : 'default'}
                      disabled={marketBusyId === item.id || item.comingSoon}
                      onClick={() => {
                        if (installed) {
                          setSelectedId(item.id)
                          setView('installed')
                          return
                        }
                        void installMarketSample(item)
                      }}
                    >
                      {installed
                        ? t('settings.plugins.marketOpen')
                        : marketBusyId === item.id
                          ? t('settings.plugins.installing')
                          : t('settings.plugins.installShort')}
                    </Button>
                  )}
                  {item.kind === 'official' && bundled && (
                    <Button
                      type="button"
                      size="sm"
                      variant={bundledEnabled ? 'outline' : 'default'}
                      disabled={marketBusyId === item.id}
                      onClick={() => {
                        if (bundledEnabled) {
                          setSelectedId(bundled.manifest.id)
                          setView('installed')
                          return
                        }
                        void enableOfficial(item)
                      }}
                    >
                      {bundledEnabled
                        ? t('settings.plugins.marketOpen')
                        : t('settings.plugins.enable')}
                    </Button>
                  )}
                  {item.kind === 'community' && (
                    <Button type="button" size="sm" variant="outline" disabled>
                      {t('settings.plugins.comingSoon')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {view === 'recommended' && (
        <div className="plugin-ext-pane">
          <p className="plugin-ext-pane-lead">{t('settings.plugins.presetsDescription')}</p>
          <ul className="plugin-ext-preset-list">
            {PLUGIN_PRESETS.map((preset, index) => {
              const { enabled, total } = presetEnabledCount(preset)
              const allOn = total > 0 && enabled === total
              return (
                <li
                  key={preset.id}
                  className="plugin-ext-preset"
                  style={{ animationDelay: `${index * 36}ms` }}
                >
                  <div>
                    <h2 className="plugin-ext-preset-title">
                      {t(`settings.plugins.presets.${preset.id}.label`)}
                    </h2>
                    <p className="plugin-ext-muted m-0">
                      {t(`settings.plugins.presets.${preset.id}.description`, { enabled, total })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={presetBusy !== null || (preset.id !== 'all' && total === 0)}
                      onClick={() => void applyPreset(preset.id, false)}
                    >
                      {t('settings.plugins.presetOff')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={allOn ? 'outline' : 'default'}
                      disabled={presetBusy !== null || (preset.id !== 'all' && total === 0)}
                      onClick={() => void applyPreset(preset.id, true)}
                    >
                      {t('settings.plugins.presetOn')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {view === 'build' && (
        <div className="plugin-ext-pane">
          <PluginCreateDemo
            onOpenCreate={() => setCreateOpen(true)}
            onInstalled={(pluginId) => {
              setPlugins(listPlugins())
              setSelectedId(pluginId)
              setView('installed')
            }}
          />
          <p className="plugin-ext-pane-lead mt-6">{t('settings.plugins.examplesDescription')}</p>
          <ul className="plugin-ext-example-list">
            {PLUGIN_SETUP_EXAMPLES.map((example) => (
              <li key={example.id} className="plugin-ext-example">
                <div className="plugin-ext-example-head">
                  <div>
                    <h2 className="plugin-ext-preset-title">
                      {t(`settings.plugins.examples.${example.id}.title`)}
                    </h2>
                    <p className="plugin-ext-muted m-0">
                      {t(`settings.plugins.examples.${example.id}.hint`)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyExample(example.code.trim())}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t('settings.plugins.copyExample')}
                  </Button>
                </div>
                <pre className="plugin-ext-code">{example.code.trim()}</pre>
              </li>
            ))}
          </ul>
          <p className="plugin-ext-muted mt-4 text-[12px]">
            {t('settings.plugins.exampleFilesHint')}
          </p>
        </div>
      )}

      {view === 'output' && (
        <div className="plugin-ext-pane">
          <div className="plugin-ext-output-head">
            <div>
              <h2 className="plugin-ext-preset-title">{t('settings.plugins.logsTitle')}</h2>
              <p className="plugin-ext-muted m-0">{t('settings.plugins.logsHint')}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => clearPluginLogs()}>
              {t('settings.plugins.clearLogs')}
            </Button>
          </div>

          <div className="plugin-ext-filters mb-3">
            <div className="plugin-ext-filter-scroll">
              {(['all', 'info', 'warn', 'error'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={cn('plugin-ext-chip', logLevel === level && 'is-active')}
                  onClick={() => setLogLevel(level)}
                >
                  {t(`settings.plugins.logLevels.${level}`)}
                </button>
              ))}
            </div>
            <select
              value={logPluginId}
              onChange={(event) => setLogPluginId(event.target.value)}
              className="plugin-ext-log-select"
              aria-label={t('settings.plugins.logPluginFilter')}
            >
              <option value="all">{t('settings.plugins.filters.all')}</option>
              {plugins.map((plugin) => (
                <option key={plugin.manifest.id} value={plugin.manifest.id}>
                  {localizeManifestField(plugin.manifest, 'name')}
                </option>
              ))}
            </select>
          </div>

          <PluginLogsTable logs={logs} pageSize={120} />
        </div>
      )}
    </div>
  )
}
