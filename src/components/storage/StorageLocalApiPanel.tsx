import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Copy, ExternalLink, Play, Square, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  STORAGE_FS_ENDPOINT_CATALOG,
  absoluteEndpointUrl,
  formatEndpointsMarkdown,
  storageFsServerStart,
  storageFsServerStatus,
  storageFsServerStop,
  type StorageFsEndpoint,
  type StorageFsServerStatus,
} from '@/lib/storage/files-api-server'

function groupLabel(group: string, t: (key: string) => string): string {
  if (group === 'graphql') return t('storageMode.localApi.groupGraphql')
  if (group === 'docs') return t('storageMode.localApi.groupDocs')
  if (group === 'meta') return t('storageMode.localApi.groupMeta')
  return t('storageMode.localApi.groupRest')
}

export function StorageLocalApiPanel() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<StorageFsServerStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const next = await storageFsServerStatus()
    setStatus(next)
  }, [])

  useEffect(() => {
    void refresh().catch(() =>
      setStatus({
        running: false,
        port: null,
        url: null,
        documentsDir: null,
        filesRoot: null,
        endpoints: STORAGE_FS_ENDPOINT_CATALOG,
      }),
    )
  }, [refresh])

  const endpoints = status?.endpoints?.length
    ? status.endpoints
    : STORAGE_FS_ENDPOINT_CATALOG

  const grouped = useMemo(() => {
    const map = new Map<string, StorageFsEndpoint[]>()
    for (const ep of endpoints) {
      const list = map.get(ep.group) ?? []
      list.push(ep)
      map.set(ep.group, list)
    }
    return ['meta', 'docs', 'graphql', 'rest']
      .filter((g) => map.has(g))
      .map((g) => ({ group: g, items: map.get(g)! }))
  }, [endpoints])

  async function handleStart() {
    setBusy(true)
    try {
      const next = await storageFsServerStart(8787)
      setStatus(next)
      toast.success(t('storageMode.localApi.started'))
    } catch (error) {
      toast.error(t('storageMode.localApi.startError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    setBusy(true)
    try {
      const next = await storageFsServerStop()
      setStatus(next)
      toast.info(t('storageMode.localApi.stopped'))
    } catch (error) {
      toast.error(t('storageMode.localApi.stopError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyText(text: string, okKey: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t(okKey))
    } catch {
      toast.error(t('storageMode.localApi.copyError'))
    }
  }

  async function openExternalPath(path: string) {
    const url = absoluteEndpointUrl(status?.url, path)
    try {
      await openUrl(url)
    } catch (error) {
      toast.error(t('storageMode.localApi.openError'), String(error))
    }
  }

  const running = Boolean(status?.running)
  const base = status?.url

  return (
    <aside className={cn('storage-api-rail', running && 'is-live')} aria-label={t('storageMode.localApi.title')}>
      <header className="storage-api-rail-head">
        <div className="min-w-0">
          <p className="storage-api-eyebrow">{t('storageMode.localApi.eyebrow')}</p>
          <h2 className="storage-api-title">{t('storageMode.localApi.title')}</h2>
        </div>
        <span className={cn('storage-api-badge', running ? 'is-live' : 'is-off')}>
          <Radio className="h-3 w-3" aria-hidden="true" />
          {running ? t('storageMode.localApi.live') : t('storageMode.localApi.offline')}
        </span>
      </header>

      <p className="storage-api-lede">{t('storageMode.localApi.lede')}</p>

      <div className="storage-api-actions">
        {running ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} className="gap-1.5" onClick={() => void handleStop()}>
            <Square className="h-3 w-3" />
            {t('storageMode.localApi.stop')}
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy} className="gap-1.5" onClick={() => void handleStart()}>
            <Play className="h-3 w-3" />
            {t('storageMode.localApi.start')}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          disabled={!endpoints.length}
          onClick={() =>
            void copyText(
              formatEndpointsMarkdown({
                url: base ?? 'http://127.0.0.1:8787',
                endpoints,
              }),
              'storageMode.localApi.copiedAll',
            )
          }
        >
          <Copy className="h-3 w-3" />
          {t('storageMode.localApi.copyAll')}
        </Button>
        {running ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void openExternalPath('/docs')}
          >
            <ExternalLink className="h-3 w-3" />
            {t('storageMode.localApi.openSwagger')}
          </Button>
        ) : null}
      </div>

      {running && base ? (
        <div className="storage-api-base">
          <code title={base}>{base}</code>
          <button
            type="button"
            className="storage-api-icon-btn"
            aria-label={t('storageMode.localApi.copy')}
            onClick={() => void copyText(base, 'storageMode.localApi.copied')}
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <p className="storage-api-hint">{t('storageMode.localApi.startHint')}</p>
      )}

      {status?.filesRoot ? (
        <p className="storage-api-root" title={status.filesRoot}>
          {t('storageMode.localApi.root')}: <span>{status.filesRoot}</span>
        </p>
      ) : null}

      <div className="storage-api-sections">
        {grouped.map(({ group, items }) => (
          <section key={group} className="storage-api-section">
            <h3 className="storage-api-section-title">{groupLabel(group, t)}</h3>
            <ul className="storage-api-list">
              {items.map((ep) => {
                const abs = absoluteEndpointUrl(base, ep.path)
                const showAbs = Boolean(running && base)
                return (
                  <li key={`${ep.method}:${ep.path}`} className="storage-api-row">
                    <span className={cn('storage-api-method', ep.method === 'POST' && 'is-post')}>
                      {ep.method}
                    </span>
                    <div className="storage-api-row-main min-w-0">
                      <p className="storage-api-label">{ep.label}</p>
                      <code className="storage-api-path" title={showAbs ? abs : ep.path}>
                        {showAbs ? abs : ep.path}
                      </code>
                    </div>
                    <div className="storage-api-row-actions">
                      <button
                        type="button"
                        className="storage-api-icon-btn"
                        aria-label={t('storageMode.localApi.copy')}
                        onClick={() =>
                          void copyText(showAbs ? abs : ep.path, 'storageMode.localApi.copied')
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      {ep.method === 'GET' &&
                      running &&
                      (ep.path === '/graphql' || ep.path === '/docs') ? (
                        <button
                          type="button"
                          className="storage-api-icon-btn"
                          aria-label={
                            ep.path === '/docs'
                              ? t('storageMode.localApi.openSwagger')
                              : t('storageMode.localApi.openGraphiql')
                          }
                          onClick={() => void openExternalPath(ep.path)}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
