import { Link, type NotFoundRouteProps } from '@tanstack/react-router'
import { FileQuestion, Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusPageLayout } from '@/components/StatusPageLayout'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'

export function NotFoundPage(_props: NotFoundRouteProps) {
  const { t } = useTranslation()

  return (
    <StatusPageLayout
      icon={<FileQuestion className="h-7 w-7" aria-hidden="true" />}
      title={t('errors.notFoundTitle')}
      description={t('errors.notFoundDescription')}
    >
      <Button asChild>
        <Link {...ROUTES.home()}>
          <Home className="h-4 w-4" />
          {t('errors.notFoundHome')}
        </Link>
      </Button>
    </StatusPageLayout>
  )
}
