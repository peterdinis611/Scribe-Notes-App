import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { HomePage } from '@/pages/HomePage'
import { DocumentPage } from '@/pages/DocumentPage'
import { AppearancePage } from '@/pages/settings/AppearancePage'
import { StoragePage } from '@/pages/settings/StoragePage'
import { ShortcutsPage } from '@/pages/settings/ShortcutsPage'
import { AboutPage } from '@/pages/settings/AboutPage'

const rootRoute = createRootRoute({
  component: AppLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doc/$documentId',
  component: DocumentPage,
})

const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
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

const settingsAboutRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'about',
  component: AboutPage,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  documentRoute,
  settingsLayoutRoute.addChildren([
    settingsIndexRoute,
    settingsAppearanceRoute,
    settingsStorageRoute,
    settingsShortcutsRoute,
    settingsAboutRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
