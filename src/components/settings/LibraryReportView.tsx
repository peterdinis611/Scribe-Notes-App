import { Folder, FileText, Languages, Sparkles, Tag, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { NlpLibraryReport } from '@/lib/db/nlp-api'

type CountRow = { label: string; count: number }
type DocFolder = {
  id: string | null
  name: string
  documentCount: number
  isVault?: boolean
}

type ParsedStats = {
  documentCount: number
  taggedCount: number
  folderCount: number
  languages: CountRow[]
  sentiments: CountRow[]
  topTerms: CountRow[]
  topTags: CountRow[]
  documentation: DocFolder[]
  recentTitles: string[]
  untaggedSample: string[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numberOf(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseStats(stats: Record<string, unknown>): ParsedStats {
  const languageLabel = (code: string) => {
    if (code === 'sk') return 'slovenčina'
    if (code === 'en') return 'angličtina'
    return code || 'unknown'
  }
  const sentimentLabel = (code: string) => {
    const map: Record<string, string> = {
      positive: 'pozitívny',
      negative: 'negatívny',
      mixed: 'zmiešaný',
      neutral: 'neutrálny',
    }
    return map[code] ?? code
  }

  const documentation = asArray(stats.documentation).map((item) => {
    const row = asRecord(item)
    return {
      id: typeof row.id === 'string' ? row.id : null,
      name: String(row.name ?? '—'),
      documentCount: numberOf(row.documentCount),
      isVault: Boolean(row.isVault),
    }
  })

  return {
    documentCount: numberOf(stats.documentCount),
    taggedCount: numberOf(stats.taggedCount),
    folderCount: numberOf(stats.folderCount, documentation.filter((row) => row.id).length),
    languages: asArray(stats.languages).map((item) => {
      const row = asRecord(item)
      return {
        label: languageLabel(String(row.language ?? 'unknown')),
        count: numberOf(row.count),
      }
    }),
    sentiments: asArray(stats.sentiments).map((item) => {
      const row = asRecord(item)
      return {
        label: sentimentLabel(String(row.label ?? 'neutral')),
        count: numberOf(row.count),
      }
    }),
    topTerms: asArray(stats.topTerms).map((item) => {
      const row = asRecord(item)
      return { label: String(row.term ?? ''), count: numberOf(row.count) }
    }),
    topTags: asArray(stats.topTags).map((item) => {
      const row = asRecord(item)
      return { label: String(row.tag ?? ''), count: numberOf(row.count) }
    }),
    documentation,
    recentTitles: asArray(stats.recentTitles).map((item) => String(item)),
    untaggedSample: asArray(stats.untaggedSample).map((item) => String(item)),
  }
}

function MeterList({ rows, accent = false }: { rows: CountRow[]; accent?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <ul className="library-report-meters">
      {rows.map((row) => (
        <li key={`${row.label}-${row.count}`} className="library-report-meter">
          <div className="library-report-meter__head">
            <span className="library-report-meter__label">{row.label}</span>
            <span className="library-report-meter__count">{row.count}</span>
          </div>
          <div className="library-report-meter__track" aria-hidden="true">
            <span
              className={cn('library-report-meter__fill', accent && 'is-accent')}
              style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

type LibraryReportViewProps = {
  report: NlpLibraryReport
}

export function LibraryReportView({ report }: LibraryReportViewProps) {
  const { t } = useTranslation()
  const [showMarkdown, setShowMarkdown] = useState(false)
  const stats = useMemo(() => parseStats(asRecord(report.stats)), [report.stats])
  const untagged = Math.max(0, stats.documentCount - stats.taggedCount)

  return (
    <div className="library-report">
      <div className="library-report__hero">
        <p className="library-report__eyebrow">{t('settings.nlp.reportHeading')}</p>
        <h3 className="library-report__title">{t('settings.nlp.reportResultTitle')}</h3>
        <div className="library-report__statgrid">
          <div className="library-report__stat">
            <FileText className="library-report__stat-icon" aria-hidden />
            <span className="library-report__stat-value">{stats.documentCount}</span>
            <span className="library-report__stat-label">{t('settings.nlp.reportStatDocuments')}</span>
          </div>
          <div className="library-report__stat">
            <Tag className="library-report__stat-icon" aria-hidden />
            <span className="library-report__stat-value">{stats.taggedCount}</span>
            <span className="library-report__stat-label">{t('settings.nlp.reportStatTagged')}</span>
          </div>
          <div className="library-report__stat">
            <Sparkles className="library-report__stat-icon" aria-hidden />
            <span className="library-report__stat-value">{untagged}</span>
            <span className="library-report__stat-label">{t('settings.nlp.reportStatUntagged')}</span>
          </div>
          <div className="library-report__stat">
            <Folder className="library-report__stat-icon" aria-hidden />
            <span className="library-report__stat-value">{stats.folderCount}</span>
            <span className="library-report__stat-label">{t('settings.nlp.reportStatLibraries')}</span>
          </div>
        </div>
      </div>

      <section className="library-report__section">
        <header className="library-report__section-head">
          <Folder className="h-3.5 w-3.5" aria-hidden />
          <h4>{t('settings.nlp.reportDocumentation')}</h4>
        </header>
        {stats.documentation.length > 0 ? (
          <ul className="library-report-docs">
            {stats.documentation.map((folder) => (
              <li key={folder.id ?? 'root'} className="library-report-docs__row">
                <span className="library-report-docs__mark" aria-hidden>
                  {folder.isVault ? <Lock className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                </span>
                <span className="library-report-docs__name">{folder.name}</span>
                {folder.isVault ? (
                  <span className="library-report-docs__badge">{t('settings.nlp.reportVault')}</span>
                ) : null}
                <span className="library-report-docs__count">{folder.documentCount}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="library-report__empty">{t('settings.nlp.reportEmptySection')}</p>
        )}
      </section>

      <div className="library-report__columns">
        <section className="library-report__section">
          <header className="library-report__section-head">
            <Languages className="h-3.5 w-3.5" aria-hidden />
            <h4>{t('settings.nlp.reportLanguages')}</h4>
          </header>
          {stats.languages.length > 0 ? (
            <MeterList rows={stats.languages} accent />
          ) : (
            <p className="library-report__empty">{t('settings.nlp.reportEmptySection')}</p>
          )}
        </section>

        <section className="library-report__section">
          <header className="library-report__section-head">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <h4>{t('settings.nlp.reportTone')}</h4>
          </header>
          {stats.sentiments.length > 0 ? (
            <MeterList rows={stats.sentiments} />
          ) : (
            <p className="library-report__empty">{t('settings.nlp.reportEmptySection')}</p>
          )}
        </section>
      </div>

      <section className="library-report__section">
        <header className="library-report__section-head">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          <h4>{t('settings.nlp.reportTerms')}</h4>
        </header>
        {stats.topTerms.length > 0 ? (
          <div className="library-report-chips">
            {stats.topTerms.map((term) => (
              <span key={`${term.label}-${term.count}`} className="library-report-chip">
                {term.label}
                <em>{term.count}</em>
              </span>
            ))}
          </div>
        ) : (
          <p className="library-report__empty">{t('settings.nlp.reportEmptySection')}</p>
        )}
      </section>

      {stats.topTags.length > 0 ? (
        <section className="library-report__section">
          <header className="library-report__section-head">
            <Tag className="h-3.5 w-3.5" aria-hidden />
            <h4>{t('settings.nlp.reportTags')}</h4>
          </header>
          <div className="library-report-chips">
            {stats.topTags.map((tag) => (
              <span key={`${tag.label}-${tag.count}`} className="library-report-chip is-tag">
                #{tag.label}
                <em>{tag.count}</em>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {stats.recentTitles.length > 0 ? (
        <section className="library-report__section">
          <header className="library-report__section-head">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            <h4>{t('settings.nlp.reportRecent')}</h4>
          </header>
          <ul className="library-report-list">
            {stats.recentTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="library-report__footer">
        <button
          type="button"
          className="library-report__toggle"
          onClick={() => setShowMarkdown((value) => !value)}
        >
          {showMarkdown ? t('settings.nlp.reportHideMarkdown') : t('settings.nlp.reportShowMarkdown')}
        </button>
      </div>

      {showMarkdown ? (
        <pre className="library-report__markdown">{report.markdown}</pre>
      ) : null}
    </div>
  )
}
