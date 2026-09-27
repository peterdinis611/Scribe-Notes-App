import { Check, ChevronDown, Copy, FileJson, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LOCALE_SECTION_GROUPS,
  hasLocaleSectionBlurb,
  orphanLocaleSections,
  type LocaleSectionGroupId,
} from '@/lib/i18n/locale-sections'
import { cn } from '@/lib/utils'

type ExampleId = 'minimal' | 'nested' | 'partial'

const EXAMPLES: Record<
  ExampleId,
  { labelKey: string; captionKey: string; snippet: string }
> = {
  minimal: {
    labelKey: 'settings.language.exampleMinimal',
    captionKey: 'settings.language.exampleMinimalCaption',
    snippet: `{
  "code": "cs",
  "name": "Čeština",
  "messages": {
    "common": {
      "save": "Uložit",
      "cancel": "Zrušit",
      "close": "Zavřít"
    }
  }
}`,
  },
  nested: {
    labelKey: 'settings.language.exampleNested',
    captionKey: 'settings.language.exampleNestedCaption',
    snippet: `{
  "code": "cs",
  "name": "Čeština",
  "messages": {
    "settings": {
      "language": {
        "title": "Jazyk",
        "customTitle": "Vlastní jazyk"
      }
    },
    "library": {
      "title": "Knihovna",
      "searchPlaceholder": "Hledat dokumenty…"
    }
  }
}`,
  },
  partial: {
    labelKey: 'settings.language.examplePartial',
    captionKey: 'settings.language.examplePartialCaption',
    snippet: `{
  "code": "pl",
  "name": "Polski",
  "messages": {
    "nav": {
      "home": "Start",
      "settings": "Ustawienia",
      "library": "Biblioteka"
    },
    "welcome": {
      "brand": "Scribe",
      "newDocument": "Nowy dokument"
    }
  }
}`,
  },
}

function groupTitleKey(id: LocaleSectionGroupId | 'other') {
  return `settings.language.keysGroup.${id}` as const
}

function groupHintKey(id: LocaleSectionGroupId | 'other') {
  return `settings.language.keysGroupHint.${id}` as const
}

/** Educational catalog for Settings → Language custom packs. */
export function LocaleKeysReference() {
  const { t } = useTranslation()
  const orphans = useMemo(() => orphanLocaleSections(), [])
  const [example, setExample] = useState<ExampleId>('minimal')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ core: true })

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((group) => ({
        ...group,
        sections: group.sections.filter((section) => {
          const blurb = hasLocaleSectionBlurb(section)
            ? t(`settings.language.sections.${section}`).toLowerCase()
            : ''
          return section.toLowerCase().includes(q) || blurb.includes(q)
        }),
      }))
      .filter((group) => group.sections.length > 0)
  }, [groups, query, t])

  const active = EXAMPLES[example]

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(active.snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* ignore */
    }
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="locale-guide">
      <ol className="locale-guide-steps">
        {([1, 2, 3] as const).map((step) => (
          <li key={step} className="locale-guide-step">
            <span className="locale-guide-step-num" aria-hidden="true">
              {step}
            </span>
            <div>
              <p className="locale-guide-step-title">{t(`settings.language.step${step}Title`)}</p>
              <p className="locale-guide-step-body">{t(`settings.language.step${step}Body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="locale-guide-examples">
        <div className="locale-guide-examples-head">
          <div>
            <p className="locale-guide-kicker">
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              {t('settings.language.examplesTitle')}
            </p>
            <p className="locale-guide-lede">{t('settings.language.examplesLede')}</p>
          </div>
          <div className="locale-guide-tabs" role="tablist" aria-label={t('settings.language.examplesTitle')}>
            {(Object.keys(EXAMPLES) as ExampleId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={example === id}
                className={cn('locale-guide-tab', example === id && 'is-active')}
                onClick={() => setExample(id)}
              >
                {t(EXAMPLES[id].labelKey)}
              </button>
            ))}
          </div>
        </div>

        <p className="locale-guide-caption">{t(active.captionKey)}</p>

        <div className="locale-guide-snippet-wrap">
          <button
            type="button"
            className="locale-guide-copy"
            onClick={() => void copyExample()}
            aria-label={t('settings.language.copyExample')}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('settings.language.copied') : t('settings.language.copyExample')}
          </button>
          <pre className="locale-guide-snippet">{active.snippet}</pre>
        </div>
      </div>

      <div className="locale-guide-catalog">
        <div className="locale-guide-catalog-head">
          <div>
            <p className="locale-guide-kicker">{t('settings.language.catalogTitle')}</p>
            <p className="locale-guide-lede">{t('settings.language.catalogLede')}</p>
          </div>
          <label className="locale-guide-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t('settings.language.catalogSearch')}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t('settings.language.catalogSearch')}
            />
          </label>
        </div>

        <div className="locale-guide-groups">
          {filtered.length === 0 ? (
            <p className="locale-guide-empty">{t('settings.language.catalogEmpty')}</p>
          ) : (
            filtered.map((group) => {
              const open = Boolean(openGroups[group.id]) || Boolean(query.trim())
              return (
                <section key={group.id} className="locale-guide-group">
                  <button
                    type="button"
                    className="locale-guide-group-toggle"
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span>
                      <span className="locale-guide-group-title">{t(groupTitleKey(group.id))}</span>
                      <span className="locale-guide-group-hint">{t(groupHintKey(group.id))}</span>
                    </span>
                    <span className="locale-guide-group-meta">
                      {group.sections.length}
                      <ChevronDown className={cn('h-3.5 w-3.5', open && 'is-open')} />
                    </span>
                  </button>
                  {open ? (
                    <ul className="locale-guide-keys">
                      {group.sections.map((section) => (
                        <li key={section}>
                          <code>{section}</code>
                          <span>
                            {hasLocaleSectionBlurb(section)
                              ? t(`settings.language.sections.${section}`)
                              : t('settings.language.sectionFallback', { key: section })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              )
            })
          )}
        </div>

        <p className="locale-guide-foot">{t('settings.language.keysHint')}</p>
      </div>
    </div>
  )
}
