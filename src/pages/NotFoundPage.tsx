import { Link, type NotFoundRouteProps } from '@tanstack/react-router'
import { FileQuestion, Home } from 'lucide-react'
import { StatusPageLayout } from '@/components/StatusPageLayout'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'

export function NotFoundPage(_props: NotFoundRouteProps) {
  return (
    <StatusPageLayout
      icon={<FileQuestion className="h-7 w-7" aria-hidden="true" />}
      title="Stránka neexistuje"
      description="Táto adresa v Scribe neexistuje alebo bola presunutá. Skontrolujte URL alebo sa vráťte do editora."
    >
      <Button asChild>
        <Link {...ROUTES.home()}>
          <Home className="h-4 w-4" />
          Späť do editora
        </Link>
      </Button>
    </StatusPageLayout>
  )
}
