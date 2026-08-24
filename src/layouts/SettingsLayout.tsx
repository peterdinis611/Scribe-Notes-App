import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ROUTES, useSettingsSections } from '@/lib/routes'
import { cn } from '@/lib/utils'

export function SettingsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const settingsSections = useSettingsSections()
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav
        className="titlebar-no-drag flex w-[220px] shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-sidebar-solid)] p-3"
        aria-label={t('nav.settingsSections')}
      >
        {settingsSections.map(({ id, label, description, icon: Icon }) => (
          <Link
            key={id}
            {...ROUTES.settingsSection(id)}
            className={cn(
              'settings-nav-item flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-transparent px-3 py-2.5 no-underline transition-colors hover:bg-[var(--color-hover)]',
              pathname === `/settings/${id}` && 'is-active',
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0">
              <span className="block font-[family-name:var(--font-display)] text-[13px] font-bold tracking-[-0.02em] text-[var(--color-foreground)]">
                {label}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="titlebar-no-drag min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-6">
        <Outlet />
      </div>
    </div>
  )
}
