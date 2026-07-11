import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useOpenDemoGuide } from '@/hooks/useOpenDemoGuide'
import { cn } from '@/lib/utils'

type DemoGuideButtonProps = {
  size?: 'default' | 'sm'
  showLabel?: boolean
  className?: string
}

export function DemoGuideButton({
  size = 'default',
  showLabel = true,
  className,
}: DemoGuideButtonProps) {
  const openDemoGuide = useOpenDemoGuide()
  const { t } = useTranslation()

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
