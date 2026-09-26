import { useTranslation } from 'react-i18next'
import { APP_VERSION, APP_SHORT_VERSION } from '@/lib/app-version'
import { persistWhatsNewVersion } from '@/store/persistence'

/** Edition 2.5 release notes — Local AI, paste, 3D, revision history. */
export const WHATS_NEW_25_HIGHLIGHTS = [
  'continueWriting',
  'smartPaste',
  'models3d',
  'revisionAi',
  'studyAi',
] as const

export type WhatsNew25HighlightId = (typeof WHATS_NEW_25_HIGHLIGHTS)[number]

type WhatsNewDialogProps = {
  open: boolean
  onClose: () => void
}

export function WhatsNewDialog({ open, onClose }: WhatsNewDialogProps) {
  const { t } = useTranslation()

  function handleClose() {
    persistWhatsNewVersion(APP_VERSION)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="setup-folio-root titlebar-no-drag"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <button
        type="button"
        className="setup-folio-scrim"
        aria-label={t('whatsNew.gotIt')}
        onClick={handleClose}
      />
      <div className="setup-folio setup-folio--news setup-folio--edition-25">
        <aside className="setup-folio-margin" aria-hidden="true">
          <p className="setup-folio-brand">
            {t('welcome.brandWithEdition', { version: APP_SHORT_VERSION })}
          </p>
          <div className="setup-folio-margin-mid">
            <span className="setup-folio-numeral">{APP_SHORT_VERSION}</span>
            <p className="setup-folio-edition-mark">{t('whatsNew.editionMark')}</p>
          </div>
          <p className="setup-folio-count">{t('whatsNew.badge', { version: APP_VERSION })}</p>
        </aside>
        <div className="setup-folio-page">
          <header className="setup-folio-head">
            <p className="setup-folio-kicker">{t('whatsNew.kicker')}</p>
            <h1 id="whats-new-title" className="setup-folio-title">
              {t('whatsNew.title', { version: APP_SHORT_VERSION })}
            </h1>
            <p className="setup-folio-lead">{t('whatsNew.subtitle')}</p>
            <ul className="setup-folio-tags" aria-label={t('whatsNew.tagsLabel')}>
              <li>{t('whatsNew.tags.localAi')}</li>
              <li>{t('whatsNew.tags.editor')}</li>
              <li>{t('whatsNew.tags.history')}</li>
            </ul>
          </header>
          <WhatsNew25Highlights />
          <footer className="setup-folio-foot">
            <span className="setup-folio-foot-note">{t('whatsNew.footNote')}</span>
            <button type="button" className="setup-folio-next" onClick={handleClose}>
              {t('whatsNew.gotIt')}
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}

/** Presentational list of 2.5.0 highlights (also reusable in Settings / docs). */
export function WhatsNew25Highlights() {
  const { t } = useTranslation()

  return (
    <ol className="setup-folio-points setup-folio-points--edition">
      {WHATS_NEW_25_HIGHLIGHTS.map((id, index) => (
        <li key={id} style={{ animationDelay: `${80 + index * 55}ms` }}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <strong>{t(`whatsNew.${id}.title`)}</strong>
            <p>{t(`whatsNew.${id}.description`)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
