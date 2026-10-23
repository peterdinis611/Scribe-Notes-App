/** Keep in sync with `crates/scribe-ui/src/library_assets.rs`. */
import { type LibraryAsset } from '@/lib/db/api'

export type LibraryAssetKindFilter =
  | 'image'
  | 'svg'
  | 'lottie'
  | 'model3d'
  | 'video'
  | 'other'

export const LIBRARY_ASSET_KIND_FILTERS: LibraryAssetKindFilter[] = [
  'image',
  'svg',
  'lottie',
  'model3d',
  'video',
  'other',
]

export function assetKind(extension: string): string {
  const ext = extension.trim().replace(/^\.+/, '').toLowerCase()
  switch (ext) {
    case 'svg':
      return 'svg'
    case 'json':
    case 'lottie':
      return 'lottie'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
    case 'avif':
    case 'apng':
      return 'image'
    case 'glb':
    case 'gltf':
    case 'usdz':
      return 'model3d'
    case 'mp4':
    case 'webm':
    case 'ogv':
    case 'ogg':
    case 'mov':
    case 'm3u8':
    case 'mkv':
    case 'm4v':
      return 'video'
    default:
      return 'other'
  }
}

export function isOrphanAsset(documentTitle: string | null | undefined): boolean {
  return !documentTitle?.trim()
}

export function isPreviewableKind(kind: string): boolean {
  return kind === 'image' || kind === 'svg'
}

export function isVideoKind(kind: string): boolean {
  return kind === 'video'
}

export function formatBytes(bytes: number): string {
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

export function filterLibraryAssets(
  assets: LibraryAsset[],
  filter: string,
  query: string,
): LibraryAsset[] {
  const q = query.trim().toLowerCase()
  return assets.filter((asset) => {
    if (filter === 'orphans') {
      if (!isOrphanAsset(asset.documentTitle)) return false
    } else if (filter && filter !== 'all' && asset.kind !== filter) {
      return false
    }
    if (!q) return true
    return (
      asset.fileName.toLowerCase().includes(q) ||
      asset.extension.toLowerCase().includes(q) ||
      (asset.documentTitle ?? '').toLowerCase().includes(q) ||
      asset.documentId.toLowerCase().includes(q)
    )
  })
}
