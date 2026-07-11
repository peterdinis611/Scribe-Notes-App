import { ArrowRight, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOpenDemoGuide } from '@/hooks/useOpenDemoGuide'

export function DemoGuidePromoCard() {
  const openDemoGuide = useOpenDemoGuide()
  const { t } = useTranslation()

  return (
    <Card className="overflow-hidden border-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_7%,var(--color-surface))] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[color-mix(in_srgb,var(--color-accent)_25%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-canvas))] text-[var(--color-accent)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-accent)]">
              {t('demoGuide.badge')}
            </p>
            <h2 className="m-0 mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)]">
              {t('demoGuide.title')}
            </h2>
            <p className="m-0 mt-1 max-w-[42ch] text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
              {t('demoGuide.description')}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="default"
          size="default"
          className="shrink-0 self-start sm:self-center"
          onClick={() => void openDemoGuide()}
        >
          {t('demoGuide.open')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
