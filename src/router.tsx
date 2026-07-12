import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { HomePage } from '@/pages/HomePage'
import { DocumentPage } from '@/pages/DocumentPage'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AppearancePage } from '@/pages/settings/AppearancePage'
import { StoragePage } from '@/pages/settings/StoragePage'
import { ShortcutsPage } from '@/pages/settings/ShortcutsPage'
import { AboutPage } from '@/pages/settings/AboutPage'
import { DiagnosticsPage } from '@/pages/settings/DiagnosticsPage'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: ErrorPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
  notFoundComponent: NotFoundPage,
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
})

const documentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/doc/$documentId',
  component: DocumentPage,
})

const settingsLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsLayout,
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/settings/appearance' })
  },
})

const settingsAppearanceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'appearance',
  component: AppearancePage,
})

const settingsStorageRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'storage',
  component: StoragePage,
})

const settingsShortcutsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'shortcuts',
  component: ShortcutsPage,
})

const settingsDiagnosticsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'diagnostics',
  component: DiagnosticsPage,
})

const settingsAboutRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'about',
  component: AboutPage,
})

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    homeRoute,
    documentRoute,
    settingsLayoutRoute.addChildren([
      settingsIndexRoute,
      settingsAppearanceRoute,
      settingsStorageRoute,
      settingsShortcutsRoute,
      settingsDiagnosticsRoute,
      settingsAboutRoute,
    ]),
  ]),
])

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
