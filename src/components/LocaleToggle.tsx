import { useTranslation } from 'react-i18next'
import type { AppLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLocale } from '@/store/settingsSlice'

const LOCALES: { id: AppLocale; labelKey: string; short: string }[] = [
  { id: 'sk', labelKey: 'settings.language.sk', short: 'SK' },
  { id: 'en', labelKey: 'settings.language.en', short: 'EN' },
]

type LocaleToggleProps = {
  size?: 'sm' | 'default'
  showLabels?: boolean
  className?: string
}

export function LocaleToggle({ size = 'default', showLabels = false, className }: LocaleToggleProps) {
  const locale = useAppSelector((state) => state.settings.locale)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'locale-toggle inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5',
        className,
      )}
      role="group"
      aria-label={t('settings.language.title')}
    >
      {LOCALES.map((entry) => {
        const active = locale === entry.id
        return (
          <button
            key={entry.id}
            type="button"
            className={cn(
              'rounded-[5px] border-none font-medium transition-colors',
              size === 'sm' ? 'h-6 min-w-7 px-1.5 text-[11px]' : 'h-7 min-w-9 px-2.5 text-[12px]',
              active
                ? 'bg-[var(--color-selection)] text-[var(--color-foreground)]'
                : 'bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
            )}
            aria-pressed={active}
            title={t(entry.labelKey)}
            onClick={() => dispatch(setLocale(entry.id))}
          >
            {showLabels ? t(entry.labelKey) : entry.short}
          </button>
        )
      })}
    </div>
  )
}
