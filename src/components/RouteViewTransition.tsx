import { ViewTransition, type ReactNode } from 'react'

/**
 * Activates React 19.3 View Transitions for route/content swaps.
 * TanStack Router already wraps navigations in `startTransition`, which is
 * required for `<ViewTransition>` to animate (plain setState will not).
 *
 * Do not also pass TanStack `viewTransition: true` — that calls the browser
 * API separately and fights React's coordination.
 */
export function RouteViewTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      default="none"
      enter="scribe-route-fade"
      exit="scribe-route-fade"
      update="scribe-route-fade"
    >
      {children}
    </ViewTransition>
  )
}
