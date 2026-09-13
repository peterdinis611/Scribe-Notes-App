import { useTranslation } from 'react-i18next'

/**
 * Quiet stationery empty-state for print layout when the page has no content.
 * Decorative only (sits under the caret) — must stay pointer-events: none.
 */
export function PrintEmptyHero() {
  const { t } = useTranslation()

  return (
    <div className="print-empty" aria-hidden="true">
      <div className="print-empty__stage">
        <div className="print-empty__mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none" className="print-empty__mark-svg">
            <rect
              x="16"
              y="10"
              width="32"
              height="42"
              rx="4"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M24 22h16M24 30h16M24 38h10"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              opacity="0.45"
            />
            <circle cx="44" cy="46" r="9" fill="var(--print-empty-paper)" />
            <path
              d="M40.2 49.2l10.4-10.4a2 2 0 0 1 2.8 2.8L43 52l-3.6.9.8-3.7z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="color-mix(in srgb, var(--color-accent) 22%, transparent)"
            />
          </svg>
        </div>

        <p className="print-empty__eyebrow">{t('editor.printEmptyEyebrow')}</p>
        <p className="print-empty__title">{t('editor.printEmptyHero')}</p>
        <p className="print-empty__hint">
          <span>{t('editor.printEmptyHintLead')}</span>
          <kbd className="print-empty__kbd">/</kbd>
          <span>{t('editor.printEmptyHintTrail')}</span>
        </p>

        <ul className="print-empty__tips">
          <li className="print-empty__tip">
            <kbd className="print-empty__kbd print-empty__kbd--sm">/</kbd>
            <span>{t('editor.printEmptyTipSlash')}</span>
          </li>
          <li className="print-empty__tip">
            <kbd className="print-empty__kbd print-empty__kbd--sm">[[</kbd>
            <span>{t('editor.printEmptyTipWiki')}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
