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
        className="titlebar-no-drag flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        aria-label={t('nav.settingsSections')}
      >
        {settingsSections.map(({ id, label, description, icon: Icon }) => (
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

      <div className="titlebar-no-drag min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-6">
        <Outlet />
      </div>
    </div>
  )
}
