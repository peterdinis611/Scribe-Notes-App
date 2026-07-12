import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusPageLayout } from '@/components/StatusPageLayout'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  const message = getErrorMessage(error, t('errors.generic'))

  return (
    <StatusPageLayout
      icon={<AlertTriangle className="h-7 w-7" aria-hidden="true" />}
      iconClassName="text-[var(--color-destructive)]"
      title={t('errors.title')}
      description={message}
    >
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
    </StatusPageLayout>
  )
}
