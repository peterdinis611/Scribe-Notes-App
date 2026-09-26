import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import type { BuiltInLocale } from '@/i18n'
import { BUILT_IN_LOCALES, DEFAULT_LOCALE } from '@/i18n'
import { cn } from '@/lib/utils'
import { readCustomLocales } from '@/store/persistence'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLocale } from '@/store/settingsSlice'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const BUILT_IN: { id: BuiltInLocale; labelKey: string; short: string }[] = [
  { id: 'sk', labelKey: 'settings.language.sk', short: 'SK' },
  { id: 'en', labelKey: 'settings.language.en', short: 'EN' },
]

export type LocaleOption = {
  code: string
  label: string
  short: string
  kind: 'builtin' | 'custom'
  isDefault?: boolean
}

type LocaleSelectProps = {
  size?: 'sm' | 'default'
  /** Compact trigger for the header (short codes). */
  compact?: boolean
  className?: string
  triggerClassName?: string
  /** Bump after import/remove so custom packs refresh. */
  refreshToken?: number
}

export function useLocaleOptions(refreshToken = 0): LocaleOption[] {
  const { t } = useTranslation()
  return useMemo(() => {
    const builtIn: LocaleOption[] = BUILT_IN.map((entry) => ({
      code: entry.id,
      label: t(entry.labelKey),
      short: entry.short,
      kind: 'builtin' as const,
      isDefault: entry.id === DEFAULT_LOCALE,
    }))
    builtIn.sort((a, b) => {
      if (a.code === DEFAULT_LOCALE) return -1
      if (b.code === DEFAULT_LOCALE) return 1
      return (
        BUILT_IN_LOCALES.indexOf(a.code as BuiltInLocale) -
        BUILT_IN_LOCALES.indexOf(b.code as BuiltInLocale)
      )
    })
    const customs: LocaleOption[] = readCustomLocales().map((pack) => ({
      code: pack.code,
      label: pack.name,
      short: pack.code.slice(0, 3).toUpperCase(),
      kind: 'custom' as const,
    }))
    return [...builtIn, ...customs]
  }, [refreshToken, t])
}

export function LocaleSelect({
  size = 'default',
  compact = false,
  className,
  triggerClassName,
  refreshToken = 0,
}: LocaleSelectProps) {
  const locale = useAppSelector((state) => state.settings.locale)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const options = useLocaleOptions(refreshToken)

  const active = options.find((item) => item.code === locale) ?? options[0]
  const builtIns = options.filter((item) => item.kind === 'builtin')
  const customs = options.filter((item) => item.kind === 'custom')

  return (
    <div className={cn('locale-select', compact && 'locale-select--compact', className)}>
      <Select value={locale} onValueChange={(value) => dispatch(setLocale(value))}>
        <SelectTrigger
          size={size === 'sm' || compact ? 'sm' : 'default'}
          className={cn(
            'locale-select__trigger',
            compact && 'locale-select__trigger--compact',
            triggerClassName,
          )}
          aria-label={t('settings.language.title')}
        >
          <span className="locale-select__value">
            <Languages className="locale-select__icon" aria-hidden />
            {compact ? (
              <span className="locale-select__code">{active?.short ?? locale.toUpperCase()}</span>
            ) : (
              <>
                <SelectValue placeholder={t('settings.language.sk')} />
                {active?.isDefault ? (
                  <span className="locale-select__default">{t('settings.language.defaultBadge')}</span>
                ) : null}
              </>
            )}
          </span>
        </SelectTrigger>
        <SelectContent align="end" className="locale-select__menu">
          <SelectGroup>
            <SelectLabel>{t('settings.language.builtInGroup')}</SelectLabel>
            {builtIns.map((option) => (
              <SelectItem key={option.code} value={option.code} textValue={option.label}>
                <span className="locale-select__option">
                  <span className="locale-select__option-code">{option.short}</span>
                  <span className="locale-select__option-label">{option.label}</span>
                  {option.isDefault ? (
                    <span className="locale-select__option-badge">
                      {t('settings.language.defaultBadge')}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
          {customs.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t('settings.language.customGroup')}</SelectLabel>
                {customs.map((option) => (
                  <SelectItem key={option.code} value={option.code} textValue={option.label}>
                    <span className="locale-select__option">
                      <span className="locale-select__option-code">{option.short}</span>
                      <span className="locale-select__option-label">{option.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}
