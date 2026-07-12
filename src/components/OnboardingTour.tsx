import { useEffect, useState } from 'react'
import { BookOpen, Focus, FolderInput, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { persistOnboardingDismissed, readOnboardingDismissed } from '@/store/persistence'

const STEP_IDS = ['library', 'export', 'focus', 'demo'] as const

const STEP_ICONS = {
  library: BookOpen,
  export: FolderInput,
  focus: Focus,
  demo: Sparkles,
} as const

export function OnboardingTour() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(true)

  useEffect(() => {
    if (!readOnboardingDismissed()) {
      setOpen(true)
    }
  }, [])

  function closeTour() {
    if (dontShowAgain) {
      persistOnboardingDismissed(true)
    }
    setOpen(false)
  }

  function handleSkip() {
    closeTour()
  }

  function handleNext() {
    if (step >= STEP_IDS.length - 1) {
      closeTour()
      return
    }
    setStep((value) => value + 1)
  }

  function handleBack() {
    setStep((value) => Math.max(0, value - 1))
  }

  if (!open) return null

  const stepId = STEP_IDS[step]!
  const Icon = STEP_ICONS[stepId]

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) closeTour()
      }}
    >
      <DialogContent className="max-w-[460px]" showClose>
        <DialogHeader>
          <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))] text-[var(--color-accent)]">
            <Icon className="h-4 w-4" />
          </div>
          <DialogTitle>{t('onboarding.title')}</DialogTitle>
          <DialogDescription>
            {t('onboarding.stepOf', { current: step + 1, total: STEP_IDS.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <h3 className="m-0 text-[15px] font-semibold text-[var(--color-foreground)]">
            {t(`onboarding.${stepId}.title`)}
          </h3>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t(`onboarding.${stepId}.description`)}
          </p>
        </div>

        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEP_IDS.map((id, index) => (
            <span
              key={id}
              className={
                index === step
                  ? 'h-1.5 w-5 rounded-full bg-[var(--color-accent)]'
                  : 'h-1.5 w-1.5 rounded-full bg-[var(--color-border)]'
              }
              aria-hidden="true"
            />
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
          />
          <span className="text-[12px] text-[var(--color-muted-foreground)]">
            {t('onboarding.dontShowAgain')}
          </span>
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={handleSkip}>
            {t('common.skip')}
          </Button>
          {step > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={handleBack}>
              {t('common.back')}
            </Button>
          )}
          <Button type="button" variant="default" size="sm" onClick={handleNext}>
            {step >= STEP_IDS.length - 1 ? t('common.done') : t('common.next')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
