import { Puzzle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  listPlugins,
  setPluginActive,
  subscribePlugins,
  type RegisteredPlugin,
} from '@/lib/plugins'
import { createPluginStorage } from '@/lib/plugins/storage'
import { isPluginEnabled } from '@/lib/plugins/prefs'
import { toast } from '@/lib/toast'

function pluginStats(plugin: RegisteredPlugin): string | null {
  try {
    const storage = createPluginStorage(plugin.manifest.id)
    if (plugin.manifest.id === 'scribe.daily-journal') {
      const n = storage.get('insert-count')
      if (n && n !== '0') return n
    }
    if (plugin.manifest.id === 'scribe.plaintext-export') {
      const n = storage.get('export-count')
      if (n && n !== '0') return n
    }
  } catch {
    return null
  }
  return null
}

export function PluginsSection() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<RegisteredPlugin[]>(() => listPlugins())
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => subscribePlugins(() => setPlugins(listPlugins())), [])

  async function toggle(plugin: RegisteredPlugin) {
    const next = !isPluginEnabled(plugin.manifest.id, plugin.manifest.defaultEnabled === true)
    setBusyId(plugin.manifest.id)
    try {
      await setPluginActive(plugin.manifest.id, next)
      toast.success(
        next ? t('settings.plugins.enabledToast') : t('settings.plugins.disabledToast'),
        plugin.manifest.name,
      )
    } catch (error) {
      toast.error(t('settings.plugins.toggleError'), String(error))
    } finally {
      setBusyId(null)
      setPlugins(listPlugins())
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
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
              <Puzzle className="h-4 w-4 shrink-0" />
              <span>{t('settings.plugins.bundledHint', { count: plugins.length })}</span>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader title={t('settings.plugins.listTitle')} />
        <SettingsGroup>
          {plugins.length === 0 ? (
            <SettingsRow
              title={t('settings.plugins.emptyTitle')}
              description={t('settings.plugins.emptyBody')}
            />
          ) : (
            plugins.map((plugin) => {
              const enabled = isPluginEnabled(
                plugin.manifest.id,
                plugin.manifest.defaultEnabled === true,
              )
              const stats = pluginStats(plugin)
              const perms = plugin.manifest.permissions.join(', ')
              return (
                <SettingsRow
                  key={plugin.manifest.id}
                  title={plugin.manifest.name}
                  description={
                    <span className="flex flex-col gap-1">
                      <span>
                        {plugin.manifest.description ?? t('settings.plugins.noDescription')}
                      </span>
                      <span className="text-[11px] text-[var(--color-muted-foreground)]">
                        {plugin.manifest.id} · v{plugin.manifest.version}
                        {perms ? ` · ${perms}` : ''}
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
                  <Button
                    type="button"
                    size="sm"
                    variant={enabled ? 'secondary' : 'default'}
                    disabled={busyId === plugin.manifest.id}
                    onClick={() => void toggle(plugin)}
                  >
                    {enabled ? t('settings.plugins.disable') : t('settings.plugins.enable')}
                  </Button>
                </SettingsRow>
              )
            })
          )}
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}
