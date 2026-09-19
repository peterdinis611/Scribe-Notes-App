import { useTranslation } from 'react-i18next'
import { APP_VERSION } from '@/lib/app-version'
import { persistWhatsNewVersion } from '@/store/persistence'

const HIGHLIGHTS = ['clipboardHistory', 'editorCalm', 'editorDelete'] as const

/** Major.minor for “Scribe 1.4” style titles. */
const APP_SHORT_VERSION = APP_VERSION.split('.').slice(0, 2).join('.')

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
    <div className="setup-folio-root titlebar-no-drag" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <button type="button" className="setup-folio-scrim" aria-label={t('whatsNew.gotIt')} onClick={handleClose} />
      <div className="setup-folio setup-folio--news">
        <aside className="setup-folio-margin" aria-hidden="true">
          <p className="setup-folio-brand">{t('welcome.brand')}</p>
          <span className="setup-folio-numeral">{APP_SHORT_VERSION}</span>
          <p className="setup-folio-count">{t('whatsNew.badge', { version: APP_VERSION })}</p>
        </aside>
        <div className="setup-folio-page">
          <header className="setup-folio-head">
            <p className="setup-folio-kicker">{t('whatsNew.kicker')}</p>
            <h1 id="whats-new-title" className="setup-folio-title">
              {t('whatsNew.title', { version: APP_SHORT_VERSION })}
            </h1>
            <p className="setup-folio-lead">{t('whatsNew.subtitle')}</p>
          </header>
          <ol className="setup-folio-points">
            {HIGHLIGHTS.map((id, index) => (
              <li key={id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{t(`whatsNew.${id}.title`)}</strong>
                  <p>{t(`whatsNew.${id}.description`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <footer className="setup-folio-foot">
            <span />
            <button type="button" className="setup-folio-next" onClick={handleClose}>
              {t('whatsNew.gotIt')}
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
