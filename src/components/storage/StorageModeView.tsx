import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Box,
  FileImage,
  FileQuestion,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listLibraryAssets, revealInFinder, type LibraryAsset } from '@/lib/db/api'
import { convertFileSrc } from '@/lib/tauri'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { goToHome } from '@/lib/navigation'
import { useAppDispatch } from '@/store/hooks'

type AssetFilter = 'all' | 'image' | 'svg' | 'lottie' | 'model3d' | 'other'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function KindIcon({ kind }: { kind: string }) {
  if (kind === 'image') return <ImageIcon className="h-5 w-5" />
  if (kind === 'svg') return <FileImage className="h-5 w-5" />
  if (kind === 'lottie') return <Sparkles className="h-5 w-5" />
  if (kind === 'model3d') return <Box className="h-5 w-5" />
  return <FileQuestion className="h-5 w-5" />
}

function isPreviewable(kind: string) {
  return kind === 'image' || kind === 'svg'
}

export function StorageModeView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssetFilter>('all')

  async function loadAssets() {
    setLoading(true)
    try {
      const next = await listLibraryAssets()
      setAssets(next)
    } catch (error) {
      toast.error(t('storageMode.loadError'), String(error))
      setAssets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAssets()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (filter !== 'all' && asset.kind !== filter) return false
      if (!q) return true
      return (
        asset.fileName.toLowerCase().includes(q) ||
        asset.extension.toLowerCase().includes(q) ||
        (asset.documentTitle ?? '').toLowerCase().includes(q) ||
        asset.documentId.toLowerCase().includes(q)
      )
    })
  }, [assets, filter, query])

  const filters: { id: AssetFilter; label: string }[] = [
    { id: 'all', label: t('storageMode.filterAll') },
    { id: 'image', label: t('storageMode.filterImages') },
    { id: 'svg', label: t('storageMode.filterSvg') },
    { id: 'lottie', label: t('storageMode.filterLottie') },
    { id: 'model3d', label: t('storageMode.filterModel3d') },
    { id: 'other', label: t('storageMode.filterOther') },
  ]

  return (
    <div className="storage-mode flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="storage-mode-header titlebar-no-drag">
        <div className="storage-mode-brand min-w-0">
          <div className="storage-mode-mark" aria-hidden="true">
            <HardDrive className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="storage-mode-eyebrow">{t('storageMode.eyebrow')}</p>
            <h1 className="storage-mode-title">{t('storageMode.title')}</h1>
            <p className="storage-mode-lede">{t('storageMode.lede')}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void loadAssets()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            {t('storageMode.refresh')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToHome({ dispatch, navigate })}
          >
            {t('nav.home')}
          </Button>
        </div>
      </header>

      <div className="storage-mode-toolbar titlebar-no-drag">
        <label className="storage-mode-search">
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('storageMode.searchPlaceholder')}
            aria-label={t('storageMode.searchPlaceholder')}
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <div className="storage-mode-filters" role="tablist" aria-label={t('storageMode.filterAria')}>
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={cn('storage-mode-filter', filter === item.id && 'is-active')}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="storage-mode-count">
          {t('storageMode.count', { count: filtered.length, total: assets.length })}
        </p>
      </div>

      <div className="storage-mode-body titlebar-no-drag">
        {loading ? (
          <p className="storage-mode-empty">{t('storageMode.loading')}</p>
        ) : filtered.length === 0 ? (
          <div className="storage-mode-empty-card">
            <HardDrive className="h-6 w-6 text-[var(--color-muted-foreground)]" />
            <p className="m-0 mt-2 text-[14px] font-semibold text-[var(--color-foreground)]">
              {assets.length === 0 ? t('storageMode.emptyTitle') : t('storageMode.emptyFilteredTitle')}
            </p>
            <p className="m-0 mt-1 max-w-[42ch] text-center text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)]">
              {assets.length === 0 ? t('storageMode.emptyBody') : t('storageMode.emptyFilteredBody')}
            </p>
          </div>
        ) : (
          <ul className="storage-mode-grid">
            {filtered.map((asset) => (
              <li key={asset.path} className="storage-mode-card">
                <div className="storage-mode-thumb">
                  {isPreviewable(asset.kind) ? (
                    <img
                      src={convertFileSrc(asset.path)}
                      alt={asset.fileName}
                      loading="lazy"
                      className="storage-mode-thumb-img"
                    />
                  ) : (
                    <span className="storage-mode-thumb-fallback" aria-hidden="true">
                      <KindIcon kind={asset.kind} />
                    </span>
                  )}
                </div>
                <div className="storage-mode-card-body">
                  <p className="storage-mode-file" title={asset.fileName}>
                    {asset.fileName}
                  </p>
                  <p className="storage-mode-meta">
                    {asset.extension ? asset.extension.toUpperCase() : 'FILE'} · {formatBytes(asset.sizeBytes)}
                  </p>
                  <p className="storage-mode-doc" title={asset.documentTitle ?? asset.documentId}>
                    {asset.documentTitle || t('storageMode.orphanDocument')}
                  </p>
                  <div className="storage-mode-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => void revealInFinder(asset.path).catch((error) => toast.error(String(error)))}
                    >
                      <FolderOpen className="h-3 w-3" />
                      {t('storageMode.reveal')}
                    </Button>
                    {asset.documentTitle ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => void navigate(ROUTES.document(asset.documentId))}
                      >
                        {t('storageMode.openDocument')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
