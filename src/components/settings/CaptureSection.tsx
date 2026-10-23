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
import {
  addDocumentTag,
  getDocument,
  listDocuments,
  listFolders,
  moveDocumentToFolder,
  setDocumentTags,
} from '@/lib/db/api'
import { setNoteProperty, NOTE_STATUS_OPTIONS } from '@/lib/library/document-properties'
import { promptInput } from '@/lib/input-dialog'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, setActiveDocument, setDocuments, setSaveStatus } from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'
import { cacheDocument } from '@/lib/cache/document-cache'

export function CaptureSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [allowLan, setAllowLan] = useState(false)
  const [inbox, setInbox] = useState<CaptureInboxItem[]>(() => readCaptureInbox())
  const [selectedInbox, setSelectedInbox] = useState<Set<string>>(() => new Set())
  const folders = useAppSelector((state) => state.folders.folders)

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
    if (folders.length > 0) return
    void listFolders()
      .then((rows) => dispatch(setFolders(rows)))
      .catch(() => null)
  }, [dispatch, folders.length])

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
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedInbox.has(item.documentId)}
                        onChange={() => {
                          setSelectedInbox((prev) => {
                            const next = new Set(prev)
                            if (next.has(item.documentId)) next.delete(item.documentId)
                            else next.add(item.documentId)
                            return next
                          })
                        }}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-[var(--color-foreground)] hover:underline"
                        onClick={() => {
                          dispatch(setActiveDocumentId(item.documentId))
                          void navigate(ROUTES.document(item.documentId))
                          setInbox(removeCaptureInboxItem(item.documentId))
                          setSelectedInbox((prev) => {
                            const next = new Set(prev)
                            next.delete(item.documentId)
                            return next
                          })
                        }}
                      >
                        {item.title || t('common.untitled')}
                      </button>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setInbox(removeCaptureInboxItem(item.documentId))
                        setSelectedInbox((prev) => {
                          const next = new Set(prev)
                          next.delete(item.documentId)
                          return next
                        })
                      }}
                    >
                      {t('common.dismiss')}
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={inbox.length === 0}
                  onClick={() => {
                    const next = inbox[0]
                    if (!next) return
                    void (async () => {
                      try {
                        const doc = cacheDocument(await getDocument(next.documentId))
                        dispatch(setActiveDocumentId(doc.id))
                        dispatch(setActiveDocument(doc))
                        dispatch(setSaveStatus('saved'))
                        await navigate(ROUTES.document(doc.id))
                        setInbox(removeCaptureInboxItem(doc.id))
                      } catch (error) {
                        toast.error(t('capture.triageNextError'), String(error))
                      }
                    })()
                  }}
                >
                  {t('capture.triageNext')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selectedInbox.size === 0}
                  onClick={() => {
                    void (async () => {
                      const tag = await promptInput({
                        title: t('capture.triageTag'),
                        description: t('capture.triageTagHint'),
                        placeholder: 'inbox',
                        confirmLabel: t('common.confirm'),
                      })
                      if (!tag?.trim()) return
                      for (const id of selectedInbox) {
                        await addDocumentTag(id, tag.trim()).catch(() => null)
                        setInbox(removeCaptureInboxItem(id))
                      }
                      setSelectedInbox(new Set())
                      toast.success(t('capture.triageTagged', { tag: tag.trim() }))
                    })()
                  }}
                >
                  {t('capture.triageTag')}
                </Button>
                <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
                  <span className="sr-only">{t('capture.triageStatus')}</span>
                  <select
                    className="h-8 max-w-[140px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-foreground)]"
                    disabled={selectedInbox.size === 0}
                    defaultValue=""
                    onChange={(event) => {
                      const status = event.target.value
                      event.target.value = ''
                      if (!status || selectedInbox.size === 0) return
                      void (async () => {
                        for (const id of selectedInbox) {
                          try {
                            const doc = await getDocument(id)
                            const next = setNoteProperty(doc.tags ?? [], 'status', status)
                            await setDocumentTags(id, next)
                          } catch {
                            // ignore per-item
                          }
                          setInbox(removeCaptureInboxItem(id))
                        }
                        setSelectedInbox(new Set())
                        toast.success(t('capture.triageStatusDone', { status }))
                      })()
                    }}
                  >
                    <option value="" disabled>
                      {t('capture.triageStatus')}
                    </option>
                    {NOTE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selectedInbox.size === 0}
                  onClick={() => {
                    void (async () => {
                      const project = await promptInput({
                        title: t('capture.triageProject'),
                        description: t('capture.triageProjectHint'),
                        placeholder: 'Acme',
                        confirmLabel: t('common.confirm'),
                      })
                      if (!project?.trim()) return
                      for (const id of selectedInbox) {
                        try {
                          const doc = await getDocument(id)
                          const next = setNoteProperty(doc.tags ?? [], 'project', project.trim())
                          await setDocumentTags(id, next)
                        } catch {
                          // ignore
                        }
                        setInbox(removeCaptureInboxItem(id))
                      }
                      setSelectedInbox(new Set())
                      toast.success(t('capture.triageProjectDone', { project: project.trim() }))
                    })()
                  }}
                >
                  {t('capture.triageProject')}
                </Button>
                <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
                  <span className="sr-only">{t('capture.triageFolder')}</span>
                  <select
                    className="h-8 max-w-[160px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-foreground)]"
                    disabled={selectedInbox.size === 0 || folders.length === 0}
                    defaultValue=""
                    onChange={(event) => {
                      const folderId = event.target.value
                      event.target.value = ''
                      if (!folderId || selectedInbox.size === 0) return
                      const folder = folders.find((row) => row.id === folderId)
                      if (!folder) return
                      void (async () => {
                        for (const id of selectedInbox) {
                          await moveDocumentToFolder(id, folder.id).catch(() => null)
                          setInbox(removeCaptureInboxItem(id))
                        }
                        setSelectedInbox(new Set())
                        toast.success(t('capture.triageMoved', { folder: folder.name }))
                      })()
                    }}
                  >
                    <option value="" disabled>
                      {t('capture.triageFolder')}
                    </option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearCaptureInbox()
                    setInbox([])
                    setSelectedInbox(new Set())
                  }}
                >
                  {t('capture.queueClear')}
                </Button>
              </div>
            </div>
          )}
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
