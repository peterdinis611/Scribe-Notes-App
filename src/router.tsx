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
import { StorageModePage } from '@/pages/StorageModePage'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AppearancePage } from '@/pages/settings/AppearancePage'
import { InterfacePage } from '@/pages/settings/InterfacePage'
import { StoragePage } from '@/pages/settings/StoragePage'
import { ShortcutsPage } from '@/pages/settings/ShortcutsPage'
import { AboutPage } from '@/pages/settings/AboutPage'
import { PrivacyPage } from '@/pages/settings/PrivacyPage'
import { DiagnosticsPage } from '@/pages/settings/DiagnosticsPage'
import { McpPage } from '@/pages/settings/McpPage'
import { CapturePage } from '@/pages/settings/CapturePage'
import { NlpPage } from '@/pages/settings/NlpPage'
import { AgentPage } from '@/pages/settings/AgentPage'
import { PluginsPage } from '@/pages/PluginsPage'

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

const pluginsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/plugins',
  component: PluginsPage,
})

/** Audit UI is intentionally hidden for now. */
const auditHiddenRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/audit',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})

const storageModeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/storage',
  component: StorageModePage,
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

const settingsInterfaceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'interface',
  component: InterfacePage,
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

const settingsAgentRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'agent',
  component: AgentPage,
})

const settingsCaptureRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'capture',
  component: CapturePage,
})

/** Legacy path from when Plugins lived under Settings. */
const settingsPluginsRedirectRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'plugins',
  beforeLoad: () => {
    throw redirect({ to: '/plugins' })
  },
})

/** Audit UI is intentionally hidden for now. */
const settingsAuditRedirectRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'audit',
  beforeLoad: () => {
    throw redirect({ to: '/settings/appearance' })
  },
})

const settingsPrivacyRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'privacy',
  component: PrivacyPage,
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
    pluginsRoute,
    auditHiddenRoute,
    storageModeRoute,
    settingsLayoutRoute.addChildren([
      settingsIndexRoute,
      settingsAppearanceRoute,
      settingsInterfaceRoute,
      settingsAiRedirectRoute,
      settingsStorageRoute,
      settingsShortcutsRoute,
      settingsDiagnosticsRoute,
      settingsMcpRoute,
      settingsNlpRoute,
      settingsAgentRoute,
      settingsCaptureRoute,
      settingsPluginsRedirectRoute,
      settingsAuditRedirectRoute,
      settingsDocsRedirectRoute,
      settingsPrivacyRoute,
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
