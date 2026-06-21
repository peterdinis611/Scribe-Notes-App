import { Link, type NotFoundRouteProps } from '@tanstack/react-router'
import { FileQuestion, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'

export function NotFoundPage(_props: NotFoundRouteProps) {
  return (
    <div className="route-status-screen">
      <div className="route-status-card">
        <div className="route-status-icon">
          <FileQuestion className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="route-status-title">Stránka neexistuje</h1>
        <p className="route-status-description">
          Táto adresa v Scribe neexistuje alebo bola presunutá. Skontrolujte URL alebo sa vráťte do editora.
        </p>
        <div className="route-status-actions">
          <Button asChild>
            <Link {...ROUTES.home()}>
              <Home className="h-4 w-4" />
              Späť do editora
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
