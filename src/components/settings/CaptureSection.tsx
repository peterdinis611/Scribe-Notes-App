import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import QRCode from 'qrcode'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import { TokenExpiryCountdown } from '@/components/security/TokenExpiryCountdown'
import { Button } from '@/components/ui/button'
import {
  captureStart,
  captureStatus,
  captureStop,
  type CaptureCreatedEvent,
  type CaptureStatus,
} from '@/lib/db/capture-api'
import {
  clearCaptureInbox,
  pushCaptureInbox,
  readCaptureInbox,
  removeCaptureInboxItem,
  type CaptureInboxItem,
} from '@/lib/capture/inbox'
import { listDocuments, listFolders } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocumentId, setDocuments } from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'

export function CaptureSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [allowLan, setAllowLan] = useState(false)
  const [inbox, setInbox] = useState<CaptureInboxItem[]>(() => readCaptureInbox())

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
      setInbox(pushCaptureInbox(event.payload))
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
      const next = await captureStart(allowLan)
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
            <label className="mr-2 flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
              <input
                type="checkbox"
                checked={allowLan}
                onChange={(e) => setAllowLan(e.target.checked)}
              />
              {t('capture.allowLan')}
            </label>
          ) : null}
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
              {status?.tokenExpiresAt ? (
                <p className="mt-2 m-0 flex flex-wrap items-center gap-2">
                  <span>{t('capture.tokenTtl')}</span>
                  <TokenExpiryCountdown expiresAt={status.tokenExpiresAt} />
                </p>
              ) : null}
              {isLocalhost ? (
                <p className="mt-2 m-0 text-[#c93400] dark:text-[#ff9f0a]">{t('capture.localhostWarning')}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <SettingsRow
          title={t('capture.queueTitle')}
          description={t('capture.queueDescription')}
          layout="stack"
        >
          {inbox.length === 0 ? (
            <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
              {t('capture.queueEmpty')}
            </p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <ul className="m-0 flex max-h-48 list-none flex-col gap-1.5 overflow-auto p-0">
                {inbox.map((item) => (
                  <li
                    key={`${item.documentId}-${item.receivedAt}`}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-[var(--color-foreground)] hover:underline"
                      onClick={() => {
                        dispatch(setActiveDocumentId(item.documentId))
                        void navigate(ROUTES.document(item.documentId))
                        setInbox(removeCaptureInboxItem(item.documentId))
                      }}
                    >
                      {item.title || t('common.untitled')}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setInbox(removeCaptureInboxItem(item.documentId))}
                    >
                      {t('common.dismiss')}
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  clearCaptureInbox()
                  setInbox([])
                }}
              >
                {t('capture.queueClear')}
              </Button>
            </div>
          )}
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
