import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { SettingsSection } from '@/components/settings/SettingsPrimitives'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'
import { ROUTES } from '@/lib/routes'

const ABOUT_META = [
  { labelKey: 'settings.about.platform', value: 'macOS' },
  { labelKey: 'settings.about.fileFormat', value: '.scribe' },
  { labelKey: 'settings.about.export', value: 'PDF, DOCX, TXT, Pages' },
] as const

export function AboutSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <SettingsSection>
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
        <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] px-6 py-8 text-center">
          <h3 className="m-0 text-[28px] font-semibold tracking-[-0.03em] text-[var(--color-foreground)]">
            {t('welcome.brand')}
          </h3>
          <p className="mt-2 text-[14px] text-[var(--color-muted-foreground)]">
            {t('settings.about.tagline', { version: APP_SHORT_VERSION })}
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            {t('common.version', { version: APP_VERSION })}
          </p>
          <Button
            type="button"
            variant="default"
            className="mt-5"
            onClick={() => {
              void import('@/lib/app-tour').then(({ requestAppTour }) => requestAppTour())
            }}
          >
            {t('settings.about.replayTour')}
          </Button>
        </div>

        <dl className="m-0 flex flex-col">
          {ABOUT_META.map((row) => (
            <div
              key={row.labelKey}
              className="flex items-center justify-between gap-3 border-b border-[var(--color-separator,var(--color-border))] px-1 py-2.5 text-[13px]"
            >
              <dt className="m-0 text-[var(--color-muted-foreground)]">{t(row.labelKey)}</dt>
              <dd className="m-0 font-medium text-[var(--color-foreground)]">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate(ROUTES.settingsSection('privacy'))}
          >
            {t('settings.about.privacy')}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
