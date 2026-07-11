import { useEffect } from 'react'
import i18n from '@/i18n'
import { useAppSelector } from '@/store/hooks'

export function useI18nSync() {
  const locale = useAppSelector((state) => state.settings.locale)

  useEffect(() => {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale)
    }
  }, [locale])
}
