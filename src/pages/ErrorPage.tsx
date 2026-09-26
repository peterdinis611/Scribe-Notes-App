import { useMemo, useState } from 'react'
import { Link, useRouterState, type ErrorComponentProps } from '@tanstack/react-router'
import { Check, ClipboardCopy, Home, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { APP_VERSION } from '@/lib/app-version'
import { buildDiagnosticReport, extractErrorDetails } from '@/lib/errors/report'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function ErrorPage({ error, info, reset }: ErrorComponentProps) {
  const { t, i18n } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [copied, setCopied] = useState(false)
  const [showTech, setShowTech] = useState(true)

  const when = useMemo(() => new Date().toISOString(), [])
  const details = useMemo(
    () => extractErrorDetails(error, info?.componentStack),
    [error, info?.componentStack],
  )
  const route = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')
  const locale = i18n.language || 'sk'

  const report = useMemo(
    () =>
      buildDiagnosticReport({
        appVersion: APP_VERSION,
        details,
        route,
        locale,
        when,
      }),
    [details, locale, route, when],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      toast.success(t('errors.copied'))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('errors.copyFailed'))
    }
  }

  return (
    <div className="error-folio" role="alert">
      <div className="error-folio__atmosphere" aria-hidden="true" />
      <div className="error-folio__sheet">
        <header className="error-folio__masthead">
          <p className="error-folio__kicker">{t('errors.kicker')}</p>
          <p className="error-folio__mark" aria-hidden="true">
            {t('errors.mark')}
          </p>
        </header>

        <div className="error-folio__body">
          <div className="error-folio__lead">
            <h1 className="error-folio__title">{t('errors.title')}</h1>
            <p className="error-folio__subtitle">{t('errors.subtitle')}</p>
            <p className="error-folio__message">{details.message}</p>
          </div>

          <dl className="error-folio__meta">
            <div>
              <dt>{t('errors.meta.type')}</dt>
              <dd>
                <code>{details.name}</code>
              </dd>
            </div>
            <div>
              <dt>{t('errors.meta.route')}</dt>
              <dd>
                <code>{route}</code>
              </dd>
            </div>
            <div>
              <dt>{t('errors.meta.version')}</dt>
              <dd>
                <code>Scribe {APP_VERSION}</code>
              </dd>
            </div>
            <div>
              <dt>{t('errors.meta.time')}</dt>
              <dd>
                <code>{when}</code>
              </dd>
            </div>
            <div>
              <dt>{t('errors.meta.locale')}</dt>
              <dd>
                <code>{locale}</code>
              </dd>
            </div>
          </dl>

          {(details.stack || details.componentStack) && (
            <section className="error-folio__tech">
              <button
                type="button"
                className="error-folio__tech-toggle"
                aria-expanded={showTech}
                onClick={() => setShowTech((value) => !value)}
              >
                <span>{t('errors.technical')}</span>
                <span className="error-folio__tech-hint">
                  {showTech ? t('errors.hideDetails') : t('errors.showDetails')}
                </span>
              </button>
              {showTech ? (
                <div className="error-folio__tech-panels">
                  {details.stack ? (
                    <div className="error-folio__panel">
                      <h2>{t('errors.stack')}</h2>
                      <pre className="error-folio__pre">{details.stack}</pre>
                    </div>
                  ) : null}
                  {details.componentStack ? (
                    <div className="error-folio__panel">
                      <h2>{t('errors.componentStack')}</h2>
                      <pre className="error-folio__pre">{details.componentStack}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}
        </div>

        <footer className="error-folio__actions">
          <Button type="button" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            {t('common.tryAgain')}
          </Button>
          <Button variant="outline" asChild>
            <Link {...ROUTES.home()}>
              <Home className="h-4 w-4" />
              {t('common.home')}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn('error-folio__copy', copied && 'is-copied')}
            onClick={() => void handleCopy()}
          >
            {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied ? t('errors.copiedShort') : t('errors.copyReport')}
          </Button>
        </footer>
      </div>
    </div>
  )
}
