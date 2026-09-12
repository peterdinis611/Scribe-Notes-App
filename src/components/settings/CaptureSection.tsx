import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import QRCode from 'qrcode'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import { Button } from '@/components/ui/button'
import {
  captureStart,
  captureStatus,
  captureStop,
  type CaptureCreatedEvent,
  type CaptureStatus,
} from '@/lib/db/capture-api'
import { listDocuments, listFolders } from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { useAppDispatch } from '@/store/hooks'
import { setDocuments } from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'

export function CaptureSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const next = await captureStatus()
    setStatus(next)
    if (next.running && next.url) {
      const dataUrl = await QRCode.toDataURL(next.url, {
        margin: 1,
        width: 220,
        color: { dark: '#0c0a09', light: '#00000000' },
      })
      setQrDataUrl(dataUrl)
    } else {
      setQrDataUrl(null)
    }
  }, [])

  useEffect(() => {
    void refresh().catch(() => setStatus(null))
  }, [refresh])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen<CaptureCreatedEvent>('mobile-capture', async (event) => {
      toast.success(t('capture.noteReceived'), event.payload.title)
      try {
        const [documents, folders] = await Promise.all([listDocuments(), listFolders()])
        dispatch(setDocuments(documents))
        dispatch(setFolders(folders))
      } catch {
        // ignore refresh errors
      }
    }).then((fn) => {
      unlisten = fn
    })
    return () => unlisten?.()
  }, [dispatch, t])

  async function handleStart() {
    setBusy(true)
    try {
      const next = await captureStart()
      setStatus(next)
      if (next.url) {
        const dataUrl = await QRCode.toDataURL(next.url, {
          margin: 1,
          width: 220,
          color: { dark: '#0c0a09', light: '#00000000' },
        })
        setQrDataUrl(dataUrl)
      }
      toast.success(t('capture.started'))
    } catch (error) {
      toast.error(t('capture.startError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    setBusy(true)
    try {
      const next = await captureStop()
      setStatus(next)
      setQrDataUrl(null)
      toast.info(t('capture.stopped'))
    } catch (error) {
      toast.error(t('capture.stopError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyUrl() {
    if (!status?.url) return
    try {
      await navigator.clipboard.writeText(status.url)
      toast.success(t('capture.urlCopied'))
    } catch {
      toast.error(t('capture.urlCopyError'))
    }
  }

  const running = Boolean(status?.running)
  const isLocalhost = status?.lanIp === '127.0.0.1' || status?.url?.includes('127.0.0.1')

  return (
    <SettingsSection>
      <SettingsSectionHeader title={t('capture.title')} description={t('capture.description')} />

      <SettingsGroup>
        <SettingsRow title={t('capture.lanTitle')} description={t('capture.lanDescription')}>
          {!running ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void handleStart()}>
              {busy ? t('capture.starting') : t('capture.start')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleStop()}
              >
                {t('capture.stop')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => void copyUrl()}>
                {t('capture.copyUrl')}
              </Button>
            </>
          )}
        </SettingsRow>

        {running && qrDataUrl ? (
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center">
            <img
              src={qrDataUrl}
              alt={t('capture.qrAlt')}
              className="rounded-[12px] border border-[var(--color-border)] bg-white p-2"
              width={220}
              height={220}
            />
            <div className="min-w-0 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
              <p className="m-0 font-medium text-[var(--color-foreground)]">{t('capture.scanHint')}</p>
              <p className="mt-2 m-0 break-all font-mono text-[11px]">{status?.url}</p>
              {isLocalhost ? (
                <p className="mt-2 m-0 text-[#c93400] dark:text-[#ff9f0a]">{t('capture.localhostWarning')}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <SettingsRow title={t('capture.inboxTitle')} description={t('capture.inboxDescription')} />
      </SettingsGroup>
    </SettingsSection>
  )
}
