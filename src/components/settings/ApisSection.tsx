import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe2 } from 'lucide-react'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsToggle,
} from '@/components/settings/SettingsPrimitives'
import { Button } from '@/components/ui/button'
import {
  API_GROUPS,
  API_IDS,
  getApisEnabledSnapshot,
  setAllApisEnabled,
  setApiEnabled,
  type ApiId,
} from '@/lib/apis/prefs'

export function ApisSection() {
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState(() => getApisEnabledSnapshot())
  const counts = useMemo(() => {
    let enabled = 0
    for (const id of API_IDS) {
      if (snapshot[id]) enabled += 1
    }
    return { enabled, total: API_IDS.length }
  }, [snapshot])

  function refresh() {
    setSnapshot(getApisEnabledSnapshot())
  }

  function toggle(id: ApiId) {
    setApiEnabled(id, !snapshot[id])
    refresh()
  }

  function enableAll() {
    setAllApisEnabled(true)
    refresh()
  }

  function disableAll() {
    setAllApisEnabled(false)
    refresh()
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.apis.title')}
        description={t('settings.apis.description')}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={enableAll}>
              {t('settings.apis.enableAll')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={disableAll}>
              {t('settings.apis.disableAll')}
            </Button>
          </div>
        }
      />

      <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {t('settings.apis.intro')}
      </p>

      <SettingsGroup className="mb-4">
        <SettingsRow
          title={t('settings.apis.masterTitle')}
          description={t('settings.apis.masterHint', {
            enabled: counts.enabled,
            total: counts.total,
          })}
        >
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            {counts.enabled === counts.total
              ? t('settings.apis.allOn')
              : counts.enabled === 0
                ? t('settings.apis.allOff')
                : t('settings.apis.partial', {
                    enabled: counts.enabled,
                    total: counts.total,
                  })}
          </div>
        </SettingsRow>
      </SettingsGroup>

      {API_GROUPS.map((group) => (
        <div key={group.id} className="mb-4">
          <h4 className="mb-2 px-0.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
            {t(`settings.apis.groups.${group.id}`)}
          </h4>
          <SettingsGroup>
            {group.apis.map((id) => (
              <SettingsRow
                key={id}
                title={t(`settings.apis.items.${id}.label`)}
                description={t(`settings.apis.items.${id}.hint`)}
              >
                <SettingsToggle
                  checked={snapshot[id]}
                  onChange={() => toggle(id)}
                  onLabel={t('settings.apis.on')}
                  offLabel={t('settings.apis.off')}
                />
              </SettingsRow>
            ))}
          </SettingsGroup>
        </div>
      ))}
    </SettingsSection>
  )
}
