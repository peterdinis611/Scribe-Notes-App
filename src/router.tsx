import { lazy, Suspense, type ComponentType } from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { HomePage } from '@/pages/HomePage'
import { DocumentPage } from '@/pages/DocumentPage'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

function lazyPage<T extends ComponentType<object>>(
  loader: () => Promise<{ [key: string]: T }>,
  exportName: string,
) {
  return lazy(async () => {
    const mod = await loader()
    return { default: mod[exportName]! }
  })
}

const SettingsLayout = lazyPage(() => import('@/layouts/SettingsLayout'), 'SettingsLayout')
const DocsPage = lazyPage(() => import('@/pages/DocsPage'), 'DocsPage')
const GraphPage = lazyPage(() => import('@/pages/GraphPage'), 'GraphPage')
const StorageModePage = lazyPage(() => import('@/pages/StorageModePage'), 'StorageModePage')
const PluginsPage = lazyPage(() => import('@/pages/PluginsPage'), 'PluginsPage')
const AppearancePage = lazyPage(() => import('@/pages/settings/AppearancePage'), 'AppearancePage')
const InterfacePage = lazyPage(() => import('@/pages/settings/InterfacePage'), 'InterfacePage')
const StoragePage = lazyPage(() => import('@/pages/settings/StoragePage'), 'StoragePage')
const ShortcutsPage = lazyPage(() => import('@/pages/settings/ShortcutsPage'), 'ShortcutsPage')
const AboutPage = lazyPage(() => import('@/pages/settings/AboutPage'), 'AboutPage')
const PrivacyPage = lazyPage(() => import('@/pages/settings/PrivacyPage'), 'PrivacyPage')
const DiagnosticsPage = lazyPage(() => import('@/pages/settings/DiagnosticsPage'), 'DiagnosticsPage')
const McpPage = lazyPage(() => import('@/pages/settings/McpPage'), 'McpPage')
const CapturePage = lazyPage(() => import('@/pages/settings/CapturePage'), 'CapturePage')
const NlpPage = lazyPage(() => import('@/pages/settings/NlpPage'), 'NlpPage')
const AgentPage = lazyPage(() => import('@/pages/settings/AgentPage'), 'AgentPage')

function withSuspense(Page: ComponentType) {
  return function SuspendedPage() {
    return (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    )
  }
}

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
  component: withSuspense(DocsPage),
})

const graphRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/graph',
  validateSearch: (search: Record<string, unknown>): { around?: boolean } => ({
    around: search.around === true || search.around === 'true' ? true : undefined,
  }),
  component: withSuspense(GraphPage),
})

const pluginsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/plugins',
  component: withSuspense(PluginsPage),
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
  component: withSuspense(StorageModePage),
})

const settingsLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: withSuspense(SettingsLayout),
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
  component: withSuspense(AppearancePage),
})

const settingsInterfaceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'interface',
  component: withSuspense(InterfacePage),
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
  component: withSuspense(StoragePage),
})

const settingsShortcutsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'shortcuts',
  component: withSuspense(ShortcutsPage),
})

const settingsDiagnosticsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'diagnostics',
  component: withSuspense(DiagnosticsPage),
})

const settingsMcpRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'mcp',
  component: withSuspense(McpPage),
})

const settingsNlpRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'nlp',
  component: withSuspense(NlpPage),
})

const settingsAgentRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'agent',
  component: withSuspense(AgentPage),
})

const settingsCaptureRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'capture',
  component: withSuspense(CapturePage),
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
  component: withSuspense(PrivacyPage),
})

const settingsAboutRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: 'about',
  component: withSuspense(AboutPage),
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
