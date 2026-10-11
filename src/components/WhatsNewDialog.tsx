import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_VERSION, APP_SHORT_VERSION } from '@/lib/app-version'
import { getUiManifest } from '@/lib/db/api'
import { closeScribeUiSurface } from '@/lib/scribe-ui-host'
import { isTauriRuntime } from '@/lib/tauri'
import { persistWhatsNewVersion } from '@/store/persistence'

/** Edition 3.5 release notes — Docs field guide, python-ui chrome, shared catalogs. */
export const WHATS_NEW_35_HIGHLIGHTS = [
  'docsFieldGuide',
  'pythonUiChrome',
  'sharedUiCatalogs',
  'renderUiSurface',
  'welcomeSurfaces',
] as const

export type WhatsNew35HighlightId = (typeof WHATS_NEW_35_HIGHLIGHTS)[number]

/** @deprecated Prefer WHATS_NEW_35_HIGHLIGHTS */
export const WHATS_NEW_34_HIGHLIGHTS = WHATS_NEW_35_HIGHLIGHTS
/** @deprecated Prefer WHATS_NEW_35_HIGHLIGHTS */
export const WHATS_NEW_27_HIGHLIGHTS = WHATS_NEW_35_HIGHLIGHTS
/** @deprecated Prefer WHATS_NEW_35_HIGHLIGHTS */
export const WHATS_NEW_25_HIGHLIGHTS = WHATS_NEW_35_HIGHLIGHTS

type WhatsNewDialogProps = {
  open: boolean
  onClose: () => void
}

export function WhatsNewDialog({ open, onClose }: WhatsNewDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (open) void closeScribeUiSurface()
  }, [open])

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
      <div className="setup-folio setup-folio--news setup-folio--edition-35">
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
              <li>{t('whatsNew.tags.docs')}</li>
              <li>{t('whatsNew.tags.surfaces')}</li>
              <li>{t('whatsNew.tags.python')}</li>
            </ul>
          </header>
          <WhatsNew35Highlights />
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

/** Presentational list of 3.5.0 highlights — hydrated from Rust UiManifest when available. */
export function WhatsNew35Highlights() {
  const { t } = useTranslation()
  const [highlights, setHighlights] = useState<string[]>([...WHATS_NEW_35_HIGHLIGHTS])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    void getUiManifest()
      .then((manifest) => {
        if (cancelled) return
        if (manifest.whatsNewHighlights.length > 0) {
          setHighlights(manifest.whatsNewHighlights)
        }
      })
      .catch(() => {
        // Keep local fallback list.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ol className="setup-folio-points setup-folio-points--edition">
      {highlights.map((id, index) => (
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

/** @deprecated Prefer WhatsNew35Highlights */
export const WhatsNew34Highlights = WhatsNew35Highlights
/** @deprecated Prefer WhatsNew35Highlights */
export const WhatsNew27Highlights = WhatsNew35Highlights
/** @deprecated Prefer WhatsNew35Highlights */
export const WhatsNew25Highlights = WhatsNew35Highlights
