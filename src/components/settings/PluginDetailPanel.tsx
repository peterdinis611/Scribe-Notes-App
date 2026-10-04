import { Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SettingsToggle } from '@/components/settings/SettingsPrimitives'
import {
  clearPluginLogs,
  getInstalledPluginRecord,
  listPluginContributions,
  listPluginLogs,
  listPluginMcpTools,
  listPluginNlpSkills,
  listPluginSettingsPanels,
  listPluginVersionHistory,
  localizeManifestField,
  sandboxPolicyFor,
  type RegisteredPlugin,
} from '@/lib/plugins'
import { createPluginStorage } from '@/lib/plugins/storage'
import { isPluginEnabled } from '@/lib/plugins/prefs'
import { categoryForPluginId } from '@/lib/plugins/presets'
import { cn } from '@/lib/utils'

type DetailTab = 'details' | 'contributions' | 'versions' | 'runtime'

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

function pluginStats(plugin: RegisteredPlugin): string | null {
  try {
    const storage = createPluginStorage(plugin.manifest.id)
    for (const key of ['insert-count', 'export-count']) {
      const n = storage.get(key)
      if (n && n !== '0') return n
    }
  } catch {
    return null
  }
  return null
}

function ContributionGroup({
  title,
  items,
}: {
  title: string
  items: Array<{ primary: string; secondary?: string }>
}) {
  if (items.length === 0) return null
  return (
    <div className="plugin-ext-contrib-group">
      <h4>
        {title}
        <span>{items.length}</span>
      </h4>
      <ul>
        {items.map((item) => (
          <li key={`${item.primary}-${item.secondary ?? ''}`}>
            <strong>{item.primary}</strong>
            {item.secondary ? <span>{item.secondary}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PluginDetailPanel({
  plugin,
  busy,
  settingsPanels,
  nlpSkills,
  mcpTools,
  logsTick,
  onToggle,
  onReload,
  onUninstall,
  onEdit,
}: {
  plugin: RegisteredPlugin
  busy: boolean
  settingsPanels: ReturnType<typeof listPluginSettingsPanels>
  nlpSkills: ReturnType<typeof listPluginNlpSkills>
  mcpTools: ReturnType<typeof listPluginMcpTools>
  logsTick: number
  onToggle: () => void
  onReload: () => void
  onUninstall: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<DetailTab>('details')
  const enabled = isPluginEnabled(plugin.manifest.id, plugin.manifest.defaultEnabled === true)
  const name = localizeManifestField(plugin.manifest, 'name')
  const description =
    localizeManifestField(plugin.manifest, 'description') || t('settings.plugins.noDescription')
  const category = plugin.manifest.category ?? categoryForPluginId(plugin.manifest.id)
  const stats = pluginStats(plugin)
  const contributions = useMemo(
    () => listPluginContributions(plugin.manifest.id),
    [plugin.manifest.id, plugin.active, logsTick],
  )
  const runtimeLogs = useMemo(
    () => listPluginLogs(plugin.manifest.id).slice(0, 40),
    [plugin.manifest.id, logsTick],
  )
  const policy = sandboxPolicyFor(plugin.source)
  const pluginSettings = settingsPanels.filter((p) => p.pluginId === plugin.manifest.id)
  const pluginNlp = nlpSkills.filter((s) => s.pluginId === plugin.manifest.id)
  const pluginMcp = mcpTools.filter((m) => m.pluginId === plugin.manifest.id)
  const installedRecord =
    plugin.source === 'installed' ? getInstalledPluginRecord(plugin.manifest.id) : null
  const versionHistory =
    plugin.source === 'installed' ? listPluginVersionHistory(plugin.manifest.id) : []

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'details', label: t('settings.plugins.detailTabs.details') },
    {
      id: 'contributions',
      label: t('settings.plugins.detailTabs.contributions', { count: contributions.total }),
    },
    ...(plugin.source === 'installed'
      ? [{ id: 'versions' as const, label: t('settings.plugins.detailTabs.versions') }]
      : []),
    { id: 'runtime', label: t('settings.plugins.detailTabs.runtime') },
  ]

  return (
    <div className="plugin-ext-detail-inner">
      <div className="plugin-ext-detail-hero">
        <span
          className="plugin-ext-icon is-lg"
          style={{ background: toneForId(plugin.manifest.id) }}
          aria-hidden
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="plugin-ext-detail-name">{name}</h2>
          <p className="plugin-ext-detail-publisher">
            {plugin.manifest.author ?? 'Scribe'}
            <span className="plugin-ext-dot" aria-hidden>
              ·
            </span>
            {t(`settings.plugins.categories.${category}`)}
            {plugin.active ? null : (
              <>
                <span className="plugin-ext-dot" aria-hidden>
                  ·
                </span>
                {t('settings.plugins.inactive')}
              </>
            )}
          </p>
          <div className="plugin-ext-detail-toolbar">
            <Button
              type="button"
              size="sm"
              variant={enabled ? 'outline' : 'default'}
              disabled={busy}
              onClick={onToggle}
            >
              {enabled ? t('settings.plugins.disable') : t('settings.plugins.enable')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onReload}
              title={t('settings.plugins.reload')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('settings.plugins.reload')}
            </Button>
            {plugin.source === 'installed' && onEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onEdit}
                title={t('settings.plugins.edit.open')}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('settings.plugins.edit.open')}
              </Button>
            )}
            {plugin.source === 'installed' && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={onUninstall}
                title={t('settings.plugins.uninstall')}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('settings.plugins.uninstall')}
              </Button>
            )}
            <SettingsToggle
              checked={enabled}
              disabled={busy}
              onChange={onToggle}
              onLabel={t('settings.plugins.on')}
              offLabel={t('settings.plugins.off')}
            />
          </div>
        </div>
      </div>

      <nav className="plugin-ext-detail-tabs" aria-label={t('settings.plugins.detailTabsLabel')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn('plugin-ext-detail-tab', tab === item.id && 'is-active')}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'details' && (
        <>
          <p className="plugin-ext-detail-desc">{description}</p>

          <dl className="plugin-ext-meta-grid">
            <div>
              <dt>{t('settings.plugins.meta.identifier')}</dt>
              <dd className="font-[family-name:var(--font-mono)]">{plugin.manifest.id}</dd>
            </div>
            <div>
              <dt>{t('settings.plugins.meta.version')}</dt>
              <dd>
                v{plugin.manifest.version}
                {installedRecord?.updatedAt
                  ? ` · ${t('settings.plugins.edit.updatedAt', {
                      date: installedRecord.updatedAt.slice(0, 10),
                    })}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>{t('settings.plugins.meta.source')}</dt>
              <dd>
                {plugin.source === 'installed'
                  ? t('settings.plugins.sourceInstalled')
                  : t('settings.plugins.sourceBundled')}
              </dd>
            </div>
            <div>
              <dt>{t('settings.plugins.meta.api')}</dt>
              <dd>scribeApi {plugin.manifest.scribeApi}</dd>
            </div>
            <div>
              <dt>{t('settings.plugins.meta.sandbox')}</dt>
              <dd>{t(`settings.plugins.sandbox.${policy.mode}`)}</dd>
            </div>
            {plugin.manifest.defaultEnabled === false && (
              <div>
                <dt>{t('settings.plugins.meta.default')}</dt>
                <dd>{t('settings.plugins.optIn')}</dd>
              </div>
            )}
            {stats && (
              <div>
                <dt>{t('settings.plugins.meta.usage')}</dt>
                <dd>{t('settings.plugins.usage', { count: Number(stats) })}</dd>
              </div>
            )}
          </dl>

          {plugin.error && (
            <div className="plugin-ext-error">
              {t('settings.plugins.errorPrefix')}: {plugin.error}
            </div>
          )}

          <div className="plugin-ext-section">
            <h3>{t('settings.plugins.meta.permissions')}</h3>
            <div className="plugin-ext-perm-list">
              {plugin.manifest.permissions.map((permission) => {
                const denied = policy.deny.includes(permission)
                return (
                  <span
                    key={permission}
                    className={cn('plugin-ext-perm', denied && 'is-denied')}
                    title={denied ? t('settings.plugins.sandbox.deniedHint') : undefined}
                  >
                    {permission}
                    {denied ? ' ✕' : ''}
                  </span>
                )
              })}
            </div>
          </div>

          {pluginSettings.length > 0 && (
            <div className="plugin-ext-section">
              <h3>{t('settings.plugins.panelsTitle')}</h3>
              {pluginSettings.map((panel) => (
                <div key={panel.entryId} className="plugin-ext-settings-panel">
                  <p className="plugin-ext-settings-title">{panel.title}</p>
                  {panel.render()}
                </div>
              ))}
            </div>
          )}

          {(pluginNlp.length > 0 || pluginMcp.length > 0) && (
            <div className="plugin-ext-section">
              <h3>{t('settings.plugins.bridgesTitle')}</h3>
              <ul className="plugin-ext-bridge-list">
                {pluginNlp.map((skill) => (
                  <li key={skill.entryId}>
                    <strong>{skill.title}</strong>
                    <span className="plugin-ext-muted">
                      {' '}
                      · NLP · {skill.pluginId}.{skill.id}
                      {skill.description ? ` — ${skill.description}` : ''}
                    </span>
                  </li>
                ))}
                {pluginMcp.map((tool) => (
                  <li key={tool.entryId}>
                    <strong>
                      {tool.pluginId}.{tool.id}
                    </strong>
                    <span className="plugin-ext-muted"> · MCP · {tool.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tab === 'contributions' && (
        <div className="plugin-ext-section">
          {!plugin.active ? (
            <p className="plugin-ext-muted">{t('settings.plugins.contributionsInactive')}</p>
          ) : contributions.total === 0 ? (
            <p className="plugin-ext-muted">{t('settings.plugins.contributionsEmpty')}</p>
          ) : (
            <div className="plugin-ext-contrib-grid">
              <ContributionGroup
                title={t('settings.plugins.contrib.commands')}
                items={contributions.commands.map((item) => ({
                  primary: item.title,
                  secondary: item.commandId,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.blocks')}
                items={contributions.blocks.map((item) => ({
                  primary: item.label || item.id,
                  secondary: item.id,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.nodes')}
                items={contributions.nodes.map((item) => ({
                  primary: item.name,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.exports')}
                items={contributions.exports.map((item) => ({
                  primary: item.label,
                  secondary: item.id,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.imports')}
                items={contributions.imports.map((item) => ({
                  primary: item.label,
                  secondary: item.id,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.sidebar')}
                items={contributions.sidebar.map((item) => ({
                  primary: item.title,
                  secondary: item.id,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.settings')}
                items={contributions.settings.map((item) => ({
                  primary: item.title,
                  secondary: item.id,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.nlp')}
                items={contributions.nlp.map((item) => ({
                  primary: item.title,
                  secondary: item.id,
                }))}
              />
              <ContributionGroup
                title={t('settings.plugins.contrib.mcp')}
                items={contributions.mcp.map((item) => ({
                  primary: item.id,
                  secondary: item.description,
                }))}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'versions' && plugin.source === 'installed' && (
        <div className="plugin-ext-section">
          <div className="plugin-ext-output-head mb-3">
            <div>
              <h3 className="plugin-ext-preset-title">{t('settings.plugins.edit.historyTitle')}</h3>
              <p className="plugin-ext-muted m-0">{t('settings.plugins.edit.versionsHint')}</p>
            </div>
            {onEdit && (
              <Button type="button" size="sm" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
                {t('settings.plugins.edit.open')}
              </Button>
            )}
          </div>
          {versionHistory.length === 0 ? (
            <p className="plugin-ext-muted">{t('settings.plugins.edit.historyEmpty')}</p>
          ) : (
            <ul className="plugin-edit-history-list">
              {versionHistory.map((snap, index) => (
                <li key={`${snap.version}-${snap.savedAt}-${index}`}>
                  <div>
                    <strong>v{snap.version}</strong>
                    {index === 0 ? (
                      <span className="plugin-ext-badge is-on ml-2">
                        {t('settings.plugins.edit.current')}
                      </span>
                    ) : null}
                    <p className="m-0 text-[11px] text-[var(--color-muted-foreground)]">
                      {snap.savedAt.slice(0, 19).replace('T', ' ')}
                      {snap.note ? ` · ${snap.note}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'runtime' && (
        <div className="plugin-ext-section">
          <div className="plugin-ext-output-head mb-3">
            <div>
              <h3 className="plugin-ext-preset-title">{t('settings.plugins.runtimeTitle')}</h3>
              <p className="plugin-ext-muted m-0">
                {t('settings.plugins.runtimeHint', { mode: policy.mode })}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => clearPluginLogs(plugin.manifest.id)}
            >
              {t('settings.plugins.clearLogs')}
            </Button>
          </div>
          {policy.mode === 'installed' && (
            <div className="plugin-ext-callout mb-3">
              <strong>{t('settings.plugins.sandbox.installedTitle')}</strong>
              <p>{t('settings.plugins.sandbox.installedBody')}</p>
            </div>
          )}
          {runtimeLogs.length === 0 ? (
            <p className="plugin-ext-muted">{t('settings.plugins.logsEmpty')}</p>
          ) : (
            <ul className="plugin-ext-log">
              {runtimeLogs.map((entry) => (
                <li key={entry.id}>
                  <span className="plugin-ext-log-meta">
                    {entry.at.slice(11, 19)} [{entry.level}]
                  </span>
                  <div>{entry.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
