import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BuiltInLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { readCustomLocales } from '@/store/persistence'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLocale } from '@/store/settingsSlice'

const BUILT_IN: { id: BuiltInLocale; labelKey: string; short: string }[] = [
  { id: 'sk', labelKey: 'settings.language.sk', short: 'SK' },
  { id: 'en', labelKey: 'settings.language.en', short: 'EN' },
]

type LocaleToggleProps = {
  size?: 'sm' | 'default'
  showLabels?: boolean
  className?: string
  /** Bump to refresh custom locale chips after import/remove. */
  refreshToken?: number
}

export function LocaleToggle({
  size = 'default',
  showLabels = false,
  className,
  refreshToken = 0,
}: LocaleToggleProps) {
  const locale = useAppSelector((state) => state.settings.locale)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  const customs = useMemo(() => readCustomLocales(), [refreshToken])

  return (
    <div
      className={cn(
        'locale-toggle inline-flex flex-wrap items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5',
        className,
      )}
      role="group"
      aria-label={t('settings.language.title')}
    >
      {BUILT_IN.map((entry) => {
        const active = locale === entry.id
        return (
          <IconTooltip key={entry.id} label={t(entry.labelKey)}>
            <button
              type="button"
              className={cn(
                'rounded-[5px] border-none font-medium transition-colors',
                size === 'sm' ? 'h-6 min-w-7 px-1.5 text-[11px]' : 'h-7 min-w-9 px-2.5 text-[12px]',
                active
                  ? 'bg-[var(--color-selection)] text-[var(--color-foreground)]'
                  : 'bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
              )}
              aria-pressed={active}
              aria-label={t(entry.labelKey)}
              onClick={() => dispatch(setLocale(entry.id))}
            >
              {showLabels ? t(entry.labelKey) : entry.short}
            </button>
          </IconTooltip>
        )
      })}
      {customs.map((pack) => {
        const active = locale === pack.code
        const short = pack.code.slice(0, 3).toUpperCase()
        return (
          <IconTooltip key={pack.code} label={pack.name}>
            <button
              type="button"
              className={cn(
                'rounded-[5px] border-none font-medium transition-colors',
                size === 'sm' ? 'h-6 min-w-7 px-1.5 text-[11px]' : 'h-7 min-w-9 px-2.5 text-[12px]',
                active
                  ? 'bg-[var(--color-selection)] text-[var(--color-foreground)]'
                  : 'bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
              )}
              aria-pressed={active}
              aria-label={pack.name}
              onClick={() => dispatch(setLocale(pack.code))}
            >
              {showLabels ? pack.name : short}
            </button>
          </IconTooltip>
        )
      })}
    </div>
  )
}

/** Hook helper for Appearance section to force LocaleToggle refresh. */
export function useCustomLocaleRefresh() {
  const [token, setToken] = useState(0)
  return {
    refreshToken: token,
    bump: () => setToken((value) => value + 1),
  }
}
