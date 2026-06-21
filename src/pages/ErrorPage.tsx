import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return 'Nastala neočakávaná chyba. Skúste to znova alebo sa vráťte na úvod.'
}

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const message = getErrorMessage(error)

  return (
    <div className="route-status-screen">
      <div className="route-status-card">
        <div className="route-status-icon route-status-icon--error">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="route-status-title">Niečo sa pokazilo</h1>
        <p className="route-status-description">{message}</p>
        <div className="route-status-actions">
          <Button type="button" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Skúsiť znova
          </Button>
          <Button variant="outline" asChild>
            <Link {...ROUTES.home()}>
              <Home className="h-4 w-4" />
              Na úvod
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
