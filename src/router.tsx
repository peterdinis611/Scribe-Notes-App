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
import { DocsPage } from '@/pages/DocsPage'
import { GraphPage } from '@/pages/GraphPage'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AppearancePage } from '@/pages/settings/AppearancePage'
import { StoragePage } from '@/pages/settings/StoragePage'
import { ShortcutsPage } from '@/pages/settings/ShortcutsPage'
import { AboutPage } from '@/pages/settings/AboutPage'
import { DiagnosticsPage } from '@/pages/settings/DiagnosticsPage'
import { McpPage } from '@/pages/settings/McpPage'
import { NlpPage } from '@/pages/settings/NlpPage'

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

const docsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/docs',
  component: DocsPage,
})

const graphRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/graph',
  validateSearch: (search: Record<string, unknown>): { around?: boolean } => ({
    around: search.around === true || search.around === 'true' ? true : undefined,
  }),
  component: GraphPage,
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

const settingsAiRedirectRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'ai',
  beforeLoad: () => {
    throw redirect({ to: '/settings/nlp' })
  },
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

const settingsMcpRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'mcp',
  component: McpPage,
})

const settingsNlpRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'nlp',
  component: NlpPage,
})

const settingsAboutRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'about',
  component: AboutPage,
})

/** Legacy path from when Docs lived under Settings. */
const settingsDocsRedirectRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'docs',
  beforeLoad: () => {
    throw redirect({ to: '/docs' })
  },
})

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    homeRoute,
    documentRoute,
    docsRoute,
    graphRoute,
    settingsLayoutRoute.addChildren([
      settingsIndexRoute,
      settingsAppearanceRoute,
      settingsAiRedirectRoute,
      settingsStorageRoute,
      settingsShortcutsRoute,
      settingsDiagnosticsRoute,
      settingsMcpRoute,
      settingsNlpRoute,
      settingsDocsRedirectRoute,
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
