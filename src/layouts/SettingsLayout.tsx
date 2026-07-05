import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { SidebarToggle } from '@/components/SidebarToggle'
import { ROUTES, SETTINGS_SECTIONS } from '@/lib/routes'
import { cn } from '@/lib/utils'

export function SettingsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const active =
    SETTINGS_SECTIONS.find((section) => pathname === `/settings/${section.id}`) ??
    SETTINGS_SECTIONS[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-canvas)]">
      <header className="relative border-b border-[var(--color-border)] bg-[var(--color-toolbar)] px-7 pb-4 pt-5">
        <div
          className="settings-page-header-drag titlebar-drag absolute bottom-0 left-[var(--titlebar-traffic-lights-width,78px)] right-0 top-0 z-0"
          aria-hidden="true"
        />
        <div className="titlebar-no-drag flex items-center gap-3">
          <SidebarToggle />
          <div>
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em]">Nastavenia</h1>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">Prispôsobte si Scribe</p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          className="titlebar-no-drag flex w-[220px] shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          aria-label="Sekcie nastavení"
        >
          {SETTINGS_SECTIONS.map(({ id, label, description, icon: Icon }) => (
            <Link
              key={id}
              {...ROUTES.settingsSection(id)}
              className={cn(
                'flex items-start gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 no-underline transition-colors hover:bg-[var(--color-hover)]',
                pathname === `/settings/${id}` &&
                  'bg-[var(--color-selection)] text-[var(--color-accent)]',
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[var(--color-foreground)]">
                  {label}
                </span>
                <span className="block text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                  {description}
                </span>
              </span>
            </Link>
          ))}
        </nav>

        <div className="titlebar-no-drag flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-8 py-5">
            <h2 className="m-0 text-[17px] font-bold tracking-[-0.02em]">{active.label}</h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">{active.description}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
