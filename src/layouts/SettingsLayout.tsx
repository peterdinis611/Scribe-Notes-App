import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ROUTES, SETTINGS_SECTIONS } from '@/lib/routes'

export function SettingsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const active =
    SETTINGS_SECTIONS.find((section) => pathname === `/settings/${section.id}`) ??
    SETTINGS_SECTIONS[0]

  return (
    <div className="settings-page">
      <header className="settings-page-header titlebar-drag">
        <div className="titlebar-no-drag">
          <h1 className="settings-page-title">Nastavenia</h1>
          <p className="settings-page-subtitle">Prispôsobte si Scribe</p>
        </div>
      </header>

      <div className="settings-page-layout">
        <nav className="settings-page-nav titlebar-no-drag" aria-label="Sekcie nastavení">
          {SETTINGS_SECTIONS.map(({ id, label, description, icon: Icon }) => (
            <Link
              key={id}
              {...ROUTES.settingsSection(id)}
              className="settings-page-nav-item"
              activeProps={{ className: 'settings-page-nav-item is-active' }}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0">
                <span className="settings-page-nav-label">{label}</span>
                <span className="settings-page-nav-desc">{description}</span>
              </span>
            </Link>
          ))}
        </nav>

        <div className="settings-page-content titlebar-no-drag">
          <div className="settings-page-content-header">
            <h2 className="settings-content-title">{active.label}</h2>
            <p className="settings-content-subtitle">{active.description}</p>
          </div>
          <div className="settings-page-content-body">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
