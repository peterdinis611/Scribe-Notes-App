import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { openScribeUiSurface } from '@/lib/scribe-ui-host'
import { isTauriRuntime } from '@/lib/tauri'
import { APP_SHORT_VERSION } from '@/lib/app-version'

/** Keep in sync with `scribe_ui::DOCS_TOPIC_IDS` / UiManifest.docsTopicIds. */
export const DOCS_TOPIC_IDS = [
  'overview',
  'privacy',
  'documents',
  'library',
  'linkGraph',
  'wikiLinks',
  'editor',
  'search',
  'localAi',
  'revisions',
  'mcp',
  'plugins',
  'journal',
  'backup',
  'shortcuts',
] as const

export type DocsTopicId = (typeof DOCS_TOPIC_IDS)[number]

/** Docs chrome — Dioxus surface under Tauri. */
export function DocsView() {
  const { t } = useTranslation()

  useEffect(() => {
    if (!isTauriRuntime()) return
    void openScribeUiSurface('docs')
  }, [])

  return (
    <div className="docs-page flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-8">
      <div className="max-w-lg text-center">
        <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {t('welcome.brandWithEdition', { version: APP_SHORT_VERSION })}
        </p>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.03em]">
          {t('settings.docs.pageTitle', { version: APP_SHORT_VERSION })}
        </h1>
        <p className="mt-2 text-[14px] text-[var(--color-muted-foreground)]">
          {isTauriRuntime()
            ? t('common.loading')
            : t('settings.docs.pageDescription', { version: APP_SHORT_VERSION })}
        </p>
        {isTauriRuntime() ? (
          <button
            type="button"
            className="mt-6 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-[13px]"
            onClick={() => void openScribeUiSurface('docs')}
          >
            {t('settings.docs.pageTitle', { version: APP_SHORT_VERSION })}
          </button>
        ) : (
          <ul className="mt-6 space-y-2 text-left text-[13px] text-[var(--color-muted-foreground)]">
            {DOCS_TOPIC_IDS.map((id) => (
              <li key={id}>{t(`settings.docs.topics.${id}.title`, { version: APP_SHORT_VERSION })}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
