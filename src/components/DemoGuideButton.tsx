import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useOpenDemoGuide } from '@/hooks/useOpenDemoGuide'
import { cn } from '@/lib/utils'

type DemoGuideButtonProps = {
  size?: 'default' | 'sm'
  showLabel?: boolean
  className?: string
  /** Quiet text control for tertiary welcome actions. */
  variant?: 'outline' | 'link'
}

export function DemoGuideButton({
  size = 'default',
  showLabel = true,
  className,
  variant = 'outline',
}: DemoGuideButtonProps) {
  const openDemoGuide = useOpenDemoGuide()
  const { t } = useTranslation()

  if (variant === 'link') {
    return (
      <button
        type="button"
        className={cn(
          'welcome-link inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--color-muted-foreground)] underline-offset-4 hover:text-[var(--color-foreground)] hover:underline',
          className,
        )}
        onClick={() => void openDemoGuide()}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {showLabel && t('demoGuide.shortLabel')}
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn(
        'border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))] text-[var(--color-foreground)] hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))]',
        className,
      )}
      onClick={() => void openDemoGuide()}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
      {showLabel && (
        <span className="editor-header-label [[data-layout-tier=tight]_&]:hidden">
          {t('demoGuide.shortLabel')}
        </span>
      )}
    </Button>
  )
}
