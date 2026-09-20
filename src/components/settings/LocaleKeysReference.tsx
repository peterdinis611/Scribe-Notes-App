import { FileJson } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LOCALE_SECTION_GROUPS,
  orphanLocaleSections,
  type LocaleSectionGroupId,
} from '@/lib/i18n/locale-sections'

const FORMAT_SNIPPET = `{
  "code": "cs",
  "name": "Čeština",
  "messages": {
    "common": { "save": "Uložit", "cancel": "Zrušit" },
    "nav": { "home": "Domů", "settings": "Nastavení" }
  }
}`

function groupTitleKey(id: LocaleSectionGroupId | 'other') {
  return `settings.language.keysGroup.${id}` as const
}

/** Lists editable locale JSON sections for Settings → Language. */
export function LocaleKeysReference() {
  const { t } = useTranslation()
  const orphans = useMemo(() => orphanLocaleSections(), [])

  const groups = useMemo(() => {
    const base = LOCALE_SECTION_GROUPS.map((group) => ({
      id: group.id as LocaleSectionGroupId | 'other',
      sections: group.sections,
    }))
    if (orphans.length > 0) {
      base.push({ id: 'other', sections: orphans })
    }
    return base
  }, [orphans])

  return (
    <div className="locale-keys-reference flex w-full max-w-xl flex-col gap-3">
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
        <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-foreground)]">
          <FileJson className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          {t('settings.language.keysFormatTitle')}
        </p>
        <p className="m-0 mb-2 text-[11.5px] leading-snug text-[var(--color-muted-foreground)]">
          {t('settings.language.keysFormatBody')}
        </p>
        <pre className="locale-keys-snippet m-0 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--color-foreground)]">
          {FORMAT_SNIPPET}
        </pre>
      </div>

      <div className="flex flex-col gap-2.5">
        {groups.map((group) => (
          <div key={group.id}>
            <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
              {t(groupTitleKey(group.id))}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.sections.map((section) => (
                <code
                  key={section}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--color-foreground)]"
                >
                  {section}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="m-0 text-[11.5px] leading-snug text-[var(--color-muted-foreground)]">
        {t('settings.language.keysHint')}
      </p>
    </div>
  )
}
