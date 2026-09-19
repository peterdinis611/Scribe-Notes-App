import { useTranslation } from 'react-i18next'
import { SettingsSection } from '@/components/settings/SettingsPrimitives'
import { APP_VERSION } from '@/lib/app-version'
import { PRIVACY_ARTICLE_IDS } from '@/lib/privacy'

export function PrivacySection() {
  const { t } = useTranslation()

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
