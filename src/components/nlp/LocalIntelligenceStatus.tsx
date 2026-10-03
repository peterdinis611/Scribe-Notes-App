import { HardDrive, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { nlpLlmStatus, nlpStatus, type NlpLlmStatus, type NlpStatus } from '@/lib/db/nlp-api'
import { ROUTES } from '@/lib/routes'
import {
  storageFsServerStart,
  storageFsServerStatus,
  type StorageFsServerStatus,
} from '@/lib/storage/files-api-server'
import { cn } from '@/lib/utils'

type LocalIntelligenceStatusProps = {
  className?: string
  compact?: boolean
  showStartFilesCta?: boolean
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        on ? 'bg-emerald-500' : 'bg-[var(--color-muted-foreground)]/50',
      )}
      aria-hidden
    />
  )
}

export function LocalIntelligenceStatus({
  className,
  compact = false,
  showStartFilesCta = true,
}: LocalIntelligenceStatusProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [nlp, setNlp] = useState<NlpStatus | null>(null)
  const [llm, setLlm] = useState<NlpLlmStatus | null>(null)
  const [files, setFiles] = useState<StorageFsServerStatus | null>(null)
  const [startingFiles, setStartingFiles] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await nlpStatus()
      setNlp(next)
      if (next.enabled && next.llm?.enabled) {
        try {
          setLlm(await nlpLlmStatus())
        } catch {
          setLlm(null)
        }
      } else {
        setLlm(null)
      }
    } catch {
      setNlp(null)
      setLlm(null)
    }
    try {
      setFiles(await storageFsServerStatus())
    } catch {
      setFiles(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 12_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const nlpOn = Boolean(nlp?.enabled && nlp?.sidecarOk)
  const llmOn = Boolean(llm?.reachable)
  const modelMissing =
    Boolean(llm?.reachable && nlp?.llm?.model && !(llm.models ?? []).includes(nlp.llm.model))
  const filesOn = Boolean(files?.running)

  async function handleStartFiles() {
    setStartingFiles(true)
    try {
      setFiles(await storageFsServerStart())
    } catch {
      /* panel callers surface toasts if needed */
    } finally {
      setStartingFiles(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2',
        className,
      )}
      role="status"
      aria-label={t('localIntelligence.title')}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          <Sparkles className="h-3 w-3" />
          {t('localIntelligence.title')}
        </p>
        {!compact ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => navigate(ROUTES.settingsSection('nlp'))}
          >
            {t('localIntelligence.settings')}
          </Button>
        ) : null}
      </div>
      <div className={cn('flex flex-wrap gap-x-3 gap-y-1.5 text-[12px]', compact && 'gap-x-2')}>
        <span className="inline-flex items-center gap-1.5 text-[var(--color-foreground)]">
          <Dot on={nlpOn} />
          {t(nlpOn ? 'localIntelligence.nlpOn' : 'localIntelligence.nlpOff')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--color-foreground)]">
          {llmOn ? <Wifi className="h-3 w-3 opacity-70" /> : <WifiOff className="h-3 w-3 opacity-70" />}
          {modelMissing
            ? t('localIntelligence.llmModelMissing', { model: nlp?.llm?.model ?? '' })
            : t(
                llmOn
                  ? 'localIntelligence.llmOk'
                  : nlp?.llm?.enabled
                    ? 'localIntelligence.llmDown'
                    : 'localIntelligence.llmOff',
              )}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--color-foreground)]">
          <HardDrive className="h-3 w-3 opacity-70" />
          {t(filesOn ? 'localIntelligence.filesOn' : 'localIntelligence.filesOff')}
        </span>
      </div>
      {!filesOn && showStartFilesCta ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={startingFiles}
            onClick={() => void handleStartFiles()}
          >
            {t('localIntelligence.startFilesApi')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => navigate(ROUTES.settingsSection('storage'))}
          >
            {t('localIntelligence.storageMode')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
