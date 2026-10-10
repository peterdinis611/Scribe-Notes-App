import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSection } from '@/components/settings/SettingsPrimitives'
import { openScribeUiSurface, subscribeScribeUiEvents } from '@/lib/scribe-ui-host'
import { isTauriRuntime } from '@/lib/tauri'
import { PRIVACY_ARTICLE_IDS } from '@/lib/privacy'
import { APP_VERSION } from '@/lib/app-version'

export function PrivacySection() {
  const { t } = useTranslation()

  useEffect(() => {
    if (!isTauriRuntime()) return
    void openScribeUiSurface('privacy')
    return subscribeScribeUiEvents(() => {
      // surface manages its own close
    })
  }, [])

  if (isTauriRuntime()) {
    return (
      <SettingsSection className="privacy-notice">
        <header className="privacy-notice-masthead">
          <p className="privacy-notice-kicker">{t('settings.privacy.kicker')}</p>
          <h3 className="privacy-notice-title">{t('settings.privacy.title')}</h3>
          <p className="privacy-notice-lead">{t('common.loading')}</p>
          <button
            type="button"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-[13px]"
            onClick={() => void openScribeUiSurface('privacy')}
          >
            {t('settings.privacy.title')}
          </button>
        </header>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection className="privacy-notice">
      <header className="privacy-notice-masthead">
        <p className="privacy-notice-kicker">{t('settings.privacy.kicker')}</p>
        <h3 className="privacy-notice-title">{t('settings.privacy.title')}</h3>
        <p className="privacy-notice-effective">
          {t('settings.privacy.effective', { version: APP_VERSION })}
        </p>
        <p className="privacy-notice-lead">{t('settings.privacy.lead')}</p>
      </header>
      <ol className="privacy-notice-articles">
        {PRIVACY_ARTICLE_IDS.map((id, index) => {
          const paragraphs = t(`settings.privacy.articles.${id}.paragraphs`, {
            returnObjects: true,
          })
          const list = Array.isArray(paragraphs) ? (paragraphs as string[]) : []
          return (
            <li key={id}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h4>{t(`settings.privacy.articles.${id}.title`)}</h4>
                {list.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
      <footer className="privacy-notice-colophon">{t('settings.privacy.colophon')}</footer>
    </SettingsSection>
  )
}
