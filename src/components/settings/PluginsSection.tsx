import { Copy, Plus, Puzzle, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { CreatePluginDialog } from '@/components/settings/CreatePluginDialog'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsToggle,
} from '@/components/settings/SettingsPrimitives'
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
  type PluginCategory,
  type PluginPresetId,
  type RegisteredPlugin,
} from '@/lib/plugins'
import { createPluginStorage } from '@/lib/plugins/storage'
import { isPluginEnabled } from '@/lib/plugins/prefs'
import { categoryForPluginId } from '@/lib/plugins/presets'
import { toast } from '@/lib/toast'

const CATEGORY_ORDER: PluginCategory[] = ['writing', 'study', 'workspace', 'other']

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

function groupPlugins(plugins: RegisteredPlugin[]) {
  const groups = new Map<PluginCategory, RegisteredPlugin[]>()
  for (const category of CATEGORY_ORDER) groups.set(category, [])
  for (const plugin of plugins) {
    const category =
      plugin.manifest.category ?? categoryForPluginId(plugin.manifest.id)
    groups.get(category)?.push(plugin)
  }
  return CATEGORY_ORDER.map((id) => ({ id, plugins: groups.get(id) ?? [] })).filter(
    (group) => group.plugins.length > 0,
  )
}

export function PluginsSection() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<RegisteredPlugin[]>(() => listPlugins())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [presetBusy, setPresetBusy] = useState<PluginPresetId | null>(null)
  const [logsTick, setLogsTick] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => subscribePlugins(() => setPlugins(listPlugins())), [])
  useEffect(() => subscribePluginLogs(() => setLogsTick((n) => n + 1)), [])

  const groups = useMemo(() => groupPlugins(plugins), [plugins])
  const settingsPanels = useMemo(() => listPluginSettingsPanels(), [plugins])
  const nlpSkills = useMemo(() => listPluginNlpSkills(), [plugins])
  const mcpTools = useMemo(() => listPluginMcpTools(), [plugins])
  const logs = useMemo(() => listPluginLogs().slice(0, 30), [logsTick, plugins])
  const marketplace = listMarketplaceListings()

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
    } catch (error) {
      toast.error(t('settings.plugins.installError'), String(error))
    } finally {
      setInstalling(false)
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

  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.plugins.title')}
          description={t('settings.plugins.description')}
        />
        <SettingsGroup>
          <SettingsRow
            title={t('settings.plugins.introTitle')}
            description={t('settings.plugins.introBody')}
            layout="stack"
          >
            <div className="flex flex-col gap-2 text-[12px] text-[var(--color-muted-foreground)]">
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 shrink-0" />
                <span>{t('settings.plugins.bundledHint', { count: plugins.length })}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t('settings.plugins.create.open')}
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={installing} asChild>
                    <span>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {installing ? t('settings.plugins.installing') : t('settings.plugins.install')}
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
              <p className="m-0 text-[11px]">{t('settings.plugins.installHint')}</p>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <CreatePluginDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setPlugins(listPlugins())}
      />

      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.plugins.presetsTitle')}
          description={t('settings.plugins.presetsDescription')}
        />
        <SettingsGroup>
          {PLUGIN_PRESETS.filter((preset) => preset.id !== 'all').map((preset) => {
            const { enabled, total } = presetEnabledCount(preset)
            const allOn = total > 0 && enabled === total
            return (
              <SettingsRow
                key={preset.id}
                title={t(`settings.plugins.presets.${preset.id}.label`)}
                description={t(`settings.plugins.presets.${preset.id}.description`, {
                  enabled,
                  total,
                })}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={presetBusy !== null || total === 0}
                    onClick={() => void applyPreset(preset.id, false)}
                  >
                    {t('settings.plugins.presetOff')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={allOn ? 'outline' : 'default'}
                    disabled={presetBusy !== null || total === 0}
                    onClick={() => void applyPreset(preset.id, true)}
                  >
                    {t('settings.plugins.presetOn')}
                  </Button>
                </div>
              </SettingsRow>
            )
          })}
          <SettingsRow
            title={t('settings.plugins.presets.all.label')}
            description={t('settings.plugins.presets.all.description')}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={presetBusy !== null}
                onClick={() => void applyPreset('all', false)}
              >
                {t('settings.plugins.presetOff')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={presetBusy !== null}
                onClick={() => void applyPreset('all', true)}
              >
                {t('settings.plugins.presetOn')}
              </Button>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader title={t('settings.plugins.listTitle')} />
        {plugins.length === 0 ? (
          <SettingsGroup>
            <SettingsRow
              title={t('settings.plugins.emptyTitle')}
              description={t('settings.plugins.emptyBody')}
            />
          </SettingsGroup>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="mb-4 last:mb-0">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
                {t(`settings.plugins.categories.${group.id}`)}
              </p>
              <SettingsGroup>
                {group.plugins.map((plugin) => {
                  const enabled = isPluginEnabled(
                    plugin.manifest.id,
                    plugin.manifest.defaultEnabled === true,
                  )
                  const stats = pluginStats(plugin)
                  const name = localizeManifestField(plugin.manifest, 'name')
                  const description =
                    localizeManifestField(plugin.manifest, 'description') ||
                    t('settings.plugins.noDescription')
                  return (
                    <SettingsRow
                      key={plugin.manifest.id}
                      title={name}
                      description={
                        <span className="flex flex-col gap-1">
                          <span>{description}</span>
                          <span className="text-[11px] text-[var(--color-muted-foreground)]">
                            {plugin.manifest.id} · v{plugin.manifest.version}
                            {plugin.source === 'installed' ? ` · ${t('settings.plugins.sourceInstalled')}` : ''}
                            {plugin.manifest.defaultEnabled === false
                              ? ` · ${t('settings.plugins.optIn')}`
                              : ''}
                            {stats
                              ? ` · ${t('settings.plugins.usage', { count: Number(stats) })}`
                              : ''}
                            {plugin.error
                              ? ` · ${t('settings.plugins.errorPrefix')}: ${plugin.error}`
                              : ''}
                          </span>
                        </span>
                      }
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          title={t('settings.plugins.reload')}
                          disabled={busyId === plugin.manifest.id}
                          onClick={() => {
                            setBusyId(plugin.manifest.id)
                            void reloadPlugin(plugin.manifest.id)
                              .then(() => toast.success(t('settings.plugins.reloadToast'), name))
                              .catch((error) =>
                                toast.error(t('settings.plugins.reloadError'), String(error)),
                              )
                              .finally(() => {
                                setBusyId(null)
                                setPlugins(listPlugins())
                              })
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        {plugin.source === 'installed' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            title={t('settings.plugins.uninstall')}
                            disabled={busyId === plugin.manifest.id}
                            onClick={() => {
                              setBusyId(plugin.manifest.id)
                              void uninstallPlugin(plugin.manifest.id)
                                .then(() =>
                                  toast.success(t('settings.plugins.uninstallToast'), name),
                                )
                                .catch((error) =>
                                  toast.error(t('settings.plugins.uninstallError'), String(error)),
                                )
                                .finally(() => {
                                  setBusyId(null)
                                  setPlugins(listPlugins())
                                })
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <SettingsToggle
                          checked={enabled}
                          disabled={busyId === plugin.manifest.id}
                          onChange={() => void toggle(plugin)}
                          onLabel={t('settings.plugins.on')}
                          offLabel={t('settings.plugins.off')}
                        />
                      </div>
                    </SettingsRow>
                  )
                })}
              </SettingsGroup>
            </div>
          ))
        )}
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.plugins.examplesTitle')}
          description={t('settings.plugins.examplesDescription')}
        />
        <SettingsGroup>
          {PLUGIN_SETUP_EXAMPLES.map((example) => (
            <SettingsRow
              key={example.id}
              title={t(`settings.plugins.examples.${example.id}.title`)}
              description={t(`settings.plugins.examples.${example.id}.hint`)}
              layout="stack"
            >
              <div className="flex flex-col gap-2">
                <pre className="m-0 max-h-48 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-foreground)]">
                  {example.code.trim()}
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => void copyExample(example.code.trim())}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {t('settings.plugins.copyExample')}
                </Button>
              </div>
            </SettingsRow>
          ))}
          <SettingsRow
            title={t('settings.plugins.exampleFilesTitle')}
            description={t('settings.plugins.exampleFilesHint')}
          />
        </SettingsGroup>
      </SettingsSection>

      {settingsPanels.length > 0 && (
        <SettingsSection>
          <SettingsSectionHeader title={t('settings.plugins.panelsTitle')} />
          <SettingsGroup>
            {settingsPanels.map((panel) => (
              <SettingsRow key={panel.entryId} title={panel.title} layout="stack">
                {panel.render()}
              </SettingsRow>
            ))}
          </SettingsGroup>
        </SettingsSection>
      )}

      {(nlpSkills.length > 0 || mcpTools.length > 0) && (
        <SettingsSection>
          <SettingsSectionHeader title={t('settings.plugins.bridgesTitle')} />
          <SettingsGroup>
            {nlpSkills.map((skill) => (
              <SettingsRow
                key={skill.entryId}
                title={skill.title}
                description={`NLP · ${skill.pluginId}.${skill.id}${skill.description ? ` — ${skill.description}` : ''}`}
              />
            ))}
            {mcpTools.map((tool) => (
              <SettingsRow
                key={tool.entryId}
                title={`${tool.pluginId}.${tool.id}`}
                description={`MCP bridge · ${tool.description}`}
              />
            ))}
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection>
        <SettingsSectionHeader
          title={t('settings.plugins.devtoolsTitle')}
          actions={
            <Button type="button" size="sm" variant="outline" onClick={() => clearPluginLogs()}>
              {t('settings.plugins.clearLogs')}
            </Button>
          }
        />
        <SettingsGroup>
          <SettingsRow
            title={t('settings.plugins.logsTitle')}
            description={t('settings.plugins.logsHint')}
            layout="stack"
          >
            {logs.length === 0 ? (
              <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
                {t('settings.plugins.logsEmpty')}
              </p>
            ) : (
              <ul className="m-0 max-h-48 list-none overflow-auto p-0 font-[family-name:var(--font-mono)] text-[11px]">
                {logs.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-b border-[var(--color-border)] py-1 last:border-0"
                  >
                    <span className="text-[var(--color-muted-foreground)]">
                      {entry.at.slice(11, 19)} [{entry.level}] {entry.pluginId}
                    </span>
                    <div>{entry.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader title={t('settings.plugins.marketplaceTitle')} />
        <SettingsGroup>
          <SettingsRow
            title={t('settings.plugins.marketplaceStatus')}
            description={MARKETPLACE_STATUS.reason}
          />
          {marketplace.map((item) => (
            <SettingsRow
              key={item.id}
              title={item.name}
              description={`${item.summary} · ${t('settings.plugins.comingSoon')}`}
            />
          ))}
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}
