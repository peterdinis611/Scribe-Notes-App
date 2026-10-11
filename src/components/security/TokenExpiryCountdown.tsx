import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type TokenExpiryCountdownProps = {
  /** Unix seconds */
  expiresAt: number | null | undefined
  className?: string
}

function formatRemaining(ms: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (ms <= 0) return t('security.tokenExpired')
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min >= 60) {
    const hours = Math.floor(min / 60)
    const remMin = min % 60
    return t('security.tokenExpiresInHours', { hours, minutes: remMin })
  }
  if (min > 0) return t('security.tokenExpiresInMin', { minutes: min, seconds: sec })
  return t('security.tokenExpiresInSec', { seconds: sec })
}

/** Live countdown for Files API / Capture bearer TTL. */
export function TokenExpiryCountdown({ expiresAt, className }: TokenExpiryCountdownProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  if (!expiresAt) return null
  const remaining = expiresAt * 1000 - now
  const urgent = remaining > 0 && remaining < 5 * 60 * 1000

  return (
    <span
      className={cn(
        'font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted-foreground)]',
        urgent && 'text-[color-mix(in_srgb,var(--color-destructive)_80%,var(--color-foreground))]',
        remaining <= 0 && 'text-[var(--color-destructive)]',
        className,
      )}
      title={new Date(expiresAt * 1000).toLocaleString()}
    >
      {formatRemaining(remaining, t)}
    </span>
  )
}
