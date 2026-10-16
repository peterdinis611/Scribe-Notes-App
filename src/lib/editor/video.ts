/** Keep in sync with `crates/scribe-video`. Sync helpers remain for paste / tests / web fallback. */
import {
  detectVideoProviderNative,
  extractVimeoIdNative,
  extractYoutubeIdNative,
  inspectVideoNative,
  isVideoUrlNative,
  normalizeVideoSrcNative,
  videoExportEmbedNative,
  videoProviderLabelNative,
} from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

const VIDEO_FILE_EXT = /\.(?:mp4|webm|ogv|ogg|mov|m3u8|mkv|m4v)(?:\?[^#]*)?(?:#.*)?$/i

const VIDEO_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'dailymotion.com',
  'dai.ly',
  'twitch.tv',
  'clips.twitch.tv',
  'facebook.com',
  'fb.watch',
  'fb.com',
  'soundcloud.com',
  'mixcloud.com',
  'streamable.com',
  'wistia.com',
  'wistia.net',
  'tiktok.com',
  'loom.com',
  'share.loom.com',
  'bilibili.com',
  'b23.tv',
]

export type VideoProvider =
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'twitch'
  | 'facebook'
  | 'soundcloud'
  | 'mixcloud'
  | 'streamable'
  | 'wistia'
  | 'tiktok'
  | 'loom'
  | 'bilibili'
  | 'file'
  | 'unknown'

const PROVIDER_LABELS: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  twitch: 'Twitch',
  facebook: 'Facebook',
  soundcloud: 'SoundCloud',
  mixcloud: 'Mixcloud',
  streamable: 'Streamable',
  wistia: 'Wistia',
  tiktok: 'TikTok',
  loom: 'Loom',
  bilibili: 'Bilibili',
  file: 'Video',
  unknown: 'Video',
}

function hostOf(src: string): string | null {
  try {
    return new URL(src.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

function pathParts(src: string): string[] {
  try {
    return new URL(src.trim()).pathname.split('/').filter(Boolean)
  } catch {
    return []
  }
}

export function isVideoUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed) && !/^asset:\/\//i.test(trimmed) && !/^file:\/\//i.test(trimmed)) {
    return false
  }

  try {
    const url = new URL(trimmed)
    if (VIDEO_FILE_EXT.test(url.pathname)) return true
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return VIDEO_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return VIDEO_FILE_EXT.test(trimmed)
  }
}

export function extractYoutubeId(src: string): string | null {
  try {
    const url = new URL(src.trim())
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id || null
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
      if (url.searchParams.get('v')) return url.searchParams.get('v')
      const parts = url.pathname.split('/').filter(Boolean)
      const marker = parts.findIndex((part) => part === 'embed' || part === 'shorts' || part === 'live')
      if (marker >= 0 && parts[marker + 1]) return parts[marker + 1] ?? null
    }
  } catch {
    return null
  }
  return null
}

export function extractVimeoId(src: string): string | null {
  try {
    const url = new URL(src.trim())
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
    const id = url.pathname.split('/').filter((part) => /^\d+$/.test(part))[0]
    return id || null
  } catch {
    return null
  }
}

export function extractDailymotionId(src: string): string | null {
  const host = hostOf(src)
  if (!host) return null
  const parts = pathParts(src)
  if (host === 'dai.ly') return parts[0] || null
  if (host === 'dailymotion.com' || host.endsWith('.dailymotion.com')) {
    const marker = parts.findIndex((part) => part === 'video' || part === 'embed')
    if (marker >= 0) return parts[marker + 1] || null
  }
  return null
}

export function extractLoomId(src: string): string | null {
  const host = hostOf(src)
  if (!host || (host !== 'loom.com' && host !== 'share.loom.com' && !host.endsWith('.loom.com'))) {
    return null
  }
  const parts = pathParts(src)
  const marker = parts.findIndex((part) => part === 'share' || part === 'embed')
  if (marker >= 0) return parts[marker + 1] || null
  return null
}

export function extractStreamableId(src: string): string | null {
  const host = hostOf(src)
  if (!host || (host !== 'streamable.com' && !host.endsWith('.streamable.com'))) return null
  return pathParts(src).find((part) => part !== 'e' && part !== 'o') || null
}

export function extractTiktokId(src: string): string | null {
  const host = hostOf(src)
  if (!host || (host !== 'tiktok.com' && !host.endsWith('.tiktok.com'))) return null
  const parts = pathParts(src)
  const marker = parts.findIndex((part) => part === 'video')
  if (marker >= 0) return parts[marker + 1] || null
  return null
}

export function detectVideoProvider(src: string): VideoProvider {
  const trimmed = src.trim()
  if (extractYoutubeId(trimmed)) return 'youtube'
  if (extractVimeoId(trimmed)) return 'vimeo'
  if (extractDailymotionId(trimmed)) return 'dailymotion'
  if (extractLoomId(trimmed)) return 'loom'
  if (extractTiktokId(trimmed)) return 'tiktok'
  if (extractStreamableId(trimmed)) return 'streamable'
  const host = hostOf(trimmed)
  if (host) {
    if (host.includes('twitch') || host === 'clips.twitch.tv') return 'twitch'
    if (host.includes('facebook') || host === 'fb.watch' || host === 'fb.com') return 'facebook'
    if (host.includes('soundcloud')) return 'soundcloud'
    if (host.includes('mixcloud')) return 'mixcloud'
    if (host.includes('wistia')) return 'wistia'
    if (host.includes('bilibili') || host === 'b23.tv') return 'bilibili'
    try {
      if (VIDEO_FILE_EXT.test(new URL(trimmed).pathname)) return 'file'
    } catch {
      /* ignore */
    }
  }
  if (VIDEO_FILE_EXT.test(trimmed)) return 'file'
  return 'unknown'
}

export function videoProviderLabel(src: string): string {
  return PROVIDER_LABELS[detectVideoProvider(src)]
}

export function normalizeVideoSrc(src: string): string {
  const trimmed = src.trim()
  const youtubeId = extractYoutubeId(trimmed)
  if (youtubeId) return `https://www.youtube.com/watch?v=${youtubeId}`
  const vimeoId = extractVimeoId(trimmed)
  if (vimeoId) return `https://vimeo.com/${vimeoId}`
  const dailymotionId = extractDailymotionId(trimmed)
  if (dailymotionId) return `https://www.dailymotion.com/video/${dailymotionId}`
  const loomId = extractLoomId(trimmed)
  if (loomId) return `https://www.loom.com/share/${loomId}`
  const streamableId = extractStreamableId(trimmed)
  if (streamableId) return `https://streamable.com/${streamableId}`
  const tiktokId = extractTiktokId(trimmed)
  if (tiktokId) return `https://www.tiktok.com/video/${tiktokId}`
  return trimmed
}

export function videoExportEmbed(src: string): { kind: 'iframe' | 'video' | 'link'; href: string } {
  const youtubeId = extractYoutubeId(src)
  if (youtubeId) {
    return { kind: 'iframe', href: `https://www.youtube-nocookie.com/embed/${youtubeId}` }
  }
  const vimeoId = extractVimeoId(src)
  if (vimeoId) {
    return { kind: 'iframe', href: `https://player.vimeo.com/video/${vimeoId}` }
  }
  const dailymotionId = extractDailymotionId(src)
  if (dailymotionId) {
    return { kind: 'iframe', href: `https://www.dailymotion.com/embed/video/${dailymotionId}` }
  }
  const loomId = extractLoomId(src)
  if (loomId) {
    return { kind: 'iframe', href: `https://www.loom.com/embed/${loomId}` }
  }
  const streamableId = extractStreamableId(src)
  if (streamableId) {
    return { kind: 'iframe', href: `https://streamable.com/e/${streamableId}` }
  }
  const tiktokId = extractTiktokId(src)
  if (tiktokId) {
    return { kind: 'iframe', href: `https://www.tiktok.com/embed/v2/${tiktokId}` }
  }
  if (VIDEO_FILE_EXT.test(src)) {
    return { kind: 'video', href: src }
  }
  return { kind: 'link', href: src }
}

/** Prefer Rust `scribe-video` under Tauri; otherwise JS fallback. */
export async function isVideoUrlAsync(value: string): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await isVideoUrlNative(value)
    } catch {
      /* fall through */
    }
  }
  return isVideoUrl(value)
}

/** Prefer Rust `scribe-video` under Tauri; otherwise JS fallback. */
export async function videoProviderLabelAsync(src: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await videoProviderLabelNative(src)
    } catch {
      /* fall through */
    }
  }
  return videoProviderLabel(src)
}

/** Prefer Rust `scribe-video` under Tauri; otherwise JS fallback. */
export async function videoExportEmbedAsync(
  src: string,
): Promise<{ kind: 'iframe' | 'video' | 'link'; href: string }> {
  if (isTauriRuntime()) {
    try {
      const embed = await videoExportEmbedNative(src)
      return embed as { kind: 'iframe' | 'video' | 'link'; href: string }
    } catch {
      /* fall through */
    }
  }
  return videoExportEmbed(src)
}

/** Prefer Rust `scribe-video` under Tauri; otherwise JS fallback. */
export async function normalizeVideoSrcAsync(src: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await normalizeVideoSrcNative(src)
    } catch {
      /* fall through */
    }
  }
  return normalizeVideoSrc(src)
}

/** Prefer Rust `scribe-video` under Tauri; otherwise JS fallback. */
export async function detectVideoProviderAsync(src: string): Promise<VideoProvider> {
  if (isTauriRuntime()) {
    try {
      return (await detectVideoProviderNative(src)) as VideoProvider
    } catch {
      /* fall through */
    }
  }
  return detectVideoProvider(src)
}

/** Prefer Rust `scribe-video` under Tauri; otherwise JS fallback. */
export async function inspectVideoAsync(src: string) {
  if (isTauriRuntime()) {
    try {
      return await inspectVideoNative(src)
    } catch {
      /* fall through */
    }
  }
  const provider = detectVideoProvider(src)
  return {
    src: src.trim(),
    normalized: normalizeVideoSrc(src),
    provider,
    label: PROVIDER_LABELS[provider],
    isVideo: isVideoUrl(src),
    export: videoExportEmbed(src),
    youtubeId: extractYoutubeId(src),
    vimeoId: extractVimeoId(src),
  }
}

/** Prefer Rust extractors when available. */
export async function extractYoutubeIdAsync(src: string): Promise<string | null> {
  if (isTauriRuntime()) {
    try {
      return await extractYoutubeIdNative(src)
    } catch {
      /* fall through */
    }
  }
  return extractYoutubeId(src)
}

export async function extractVimeoIdAsync(src: string): Promise<string | null> {
  if (isTauriRuntime()) {
    try {
      return await extractVimeoIdNative(src)
    } catch {
      /* fall through */
    }
  }
  return extractVimeoId(src)
}
