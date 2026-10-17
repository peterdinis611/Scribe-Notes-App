/** Keep in sync with `crates/scribe-video`. Sync helpers remain for paste / tests / web fallback. */
import {
  collectVideosFromTiptapNative,
  detectVideoProviderNative,
  extractProviderIdNative,
  extractStartSecondsNative,
  extractVimeoIdNative,
  extractYoutubeIdNative,
  inspectVideoNative,
  isVideoUrlNative,
  normalizeVideoSrcNative,
  parseVideoFenceNative,
  renderVideoFigureHtmlNative,
  videoExportEmbedNative,
  videoProviderLabelNative,
  videoThumbnailUrlNative,
  videoToMarkdownFenceNative,
} from '@/lib/db/api'
import { convertFileSrc, isTauriRuntime } from '@/lib/tauri'

const VIDEO_FILE_EXT = /\.(?:mp4|webm|ogv|ogg|mov|m3u8|mkv|m4v)(?:\?[^#]*)?(?:#.*)?$/i

export type VideoBlockAttrs = {
  src?: string | null
  caption?: string | null
  /** Local library video id (ASR / playback path). */
  libraryVideoId?: string | null
}

/** Resolve a stored path/URL for React Player (local files need convertFileSrc). */
export function resolveVideoSrc(src: string | null | undefined): string {
  if (!src) return ''
  const trimmed = src.trim()
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('asset://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }
  if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return convertFileSrc(trimmed)
  }
  return trimmed
}

export function isLocalVideoPath(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('asset://')) return false
  return (
    trimmed.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('file://') ||
    VIDEO_FILE_EXT.test(trimmed)
  )
}

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

export function parseDurationToken(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return Number(s)
  const lower = s.toLowerCase()
  let total = 0
  let num = 0
  let sawUnit = false
  for (const ch of lower) {
    if (ch >= '0' && ch <= '9') {
      num = num * 10 + (ch.charCodeAt(0) - 48)
      continue
    }
    const mult = ch === 'h' ? 3600 : ch === 'm' ? 60 : ch === 's' ? 1 : null
    if (mult == null) return null
    total += num * mult
    num = 0
    sawUnit = true
  }
  if (!sawUnit || num !== 0) return null
  return total
}

export function extractStartSeconds(src: string): number | null {
  try {
    const url = new URL(src.trim())
    for (const key of ['t', 'start', 'time_continue']) {
      const value = url.searchParams.get(key)
      if (value) {
        const secs = parseDurationToken(value)
        if (secs != null) return secs
      }
    }
    const hash = url.hash.replace(/^#/, '')
    const frag = hash.split('&')[0] ?? ''
    if (frag.startsWith('t=')) {
      return parseDurationToken(frag.slice(2))
    }
  } catch {
    /* ignore */
  }
  return null
}

export function videoThumbnailUrl(src: string): string | null {
  const youtubeId = extractYoutubeId(src)
  if (youtubeId) return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
  const dailymotionId = extractDailymotionId(src)
  if (dailymotionId) return `https://www.dailymotion.com/thumbnail/video/${dailymotionId}`
  return null
}

function withStart(href: string, start: number | null): string {
  if (start == null || start <= 0) return href
  return href.includes('?') ? `${href}&start=${start}` : `${href}?start=${start}`
}

export function videoExportEmbed(src: string): { kind: 'iframe' | 'video' | 'link'; href: string } {
  const start = extractStartSeconds(src)
  const youtubeId = extractYoutubeId(src)
  if (youtubeId) {
    return {
      kind: 'iframe',
      href: withStart(`https://www.youtube-nocookie.com/embed/${youtubeId}`, start),
    }
  }
  const vimeoId = extractVimeoId(src)
  if (vimeoId) {
    const base = `https://player.vimeo.com/video/${vimeoId}`
    return {
      kind: 'iframe',
      href: start && start > 0 ? `${base}#t=${start}s` : base,
    }
  }
  const dailymotionId = extractDailymotionId(src)
  if (dailymotionId) {
    return {
      kind: 'iframe',
      href: withStart(`https://www.dailymotion.com/embed/video/${dailymotionId}`, start),
    }
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

export function parseVideoFence(body: string): VideoBlockAttrs {
  let src: string | null = null
  let caption: string | null = null
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^caption:/i.test(line)) {
      const value = line.replace(/^caption:\s*/i, '').trim()
      if (value) caption = value
      continue
    }
    if (!src) src = normalizeVideoSrc(line)
    else if (!caption) caption = line
  }
  return { src, caption }
}

export function videoToMarkdownFence(attrs: VideoBlockAttrs): string {
  const lines = ['```video']
  if (attrs.src?.trim()) lines.push(attrs.src.trim())
  if (attrs.caption?.trim()) lines.push(`caption: ${attrs.caption.trim()}`)
  lines.push('```', '')
  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderVideoFigureHtml(attrs: VideoBlockAttrs): string {
  const source = attrs.src?.trim() ?? ''
  const embed = videoExportEmbed(source)
  const captionHtml = attrs.caption?.trim()
    ? `<figcaption>${escapeHtml(attrs.caption.trim())}</figcaption>`
    : ''
  if (!source) {
    return `<figure class="video-block" style="margin:16pt 0;"><p>Video</p>${captionHtml}</figure>`
  }
  if (embed.kind === 'iframe') {
    return `<figure class="video-block" style="margin:16pt 0;"><div style="aspect-ratio:16/9;"><iframe src="${escapeHtml(embed.href)}" width="100%" height="360" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>${captionHtml}</figure>`
  }
  if (embed.kind === 'video') {
    return `<figure class="video-block" style="margin:16pt 0;"><video src="${escapeHtml(embed.href)}" controls playsinline style="width:100%;max-height:420px;"></video>${captionHtml}</figure>`
  }
  return `<figure class="video-block" style="margin:16pt 0;"><p><a href="${escapeHtml(embed.href)}">${escapeHtml(source)}</a></p>${captionHtml}</figure>`
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
    providerId: extractYoutubeId(src) || extractVimeoId(src) || extractLoomId(src),
    startSeconds: extractStartSeconds(src),
    thumbnailUrl: videoThumbnailUrl(src),
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

export async function extractStartSecondsAsync(src: string): Promise<number | null> {
  if (isTauriRuntime()) {
    try {
      return await extractStartSecondsNative(src)
    } catch {
      /* fall through */
    }
  }
  return extractStartSeconds(src)
}

export async function videoThumbnailUrlAsync(src: string): Promise<string | null> {
  if (isTauriRuntime()) {
    try {
      return await videoThumbnailUrlNative(src)
    } catch {
      /* fall through */
    }
  }
  return videoThumbnailUrl(src)
}

export async function extractProviderIdAsync(src: string): Promise<string | null> {
  if (isTauriRuntime()) {
    try {
      return await extractProviderIdNative(src)
    } catch {
      /* fall through */
    }
  }
  return (
    extractYoutubeId(src) ||
    extractVimeoId(src) ||
    extractDailymotionId(src) ||
    extractLoomId(src) ||
    extractStreamableId(src) ||
    extractTiktokId(src)
  )
}

export async function parseVideoFenceAsync(body: string): Promise<VideoBlockAttrs> {
  if (isTauriRuntime()) {
    try {
      return await parseVideoFenceNative(body)
    } catch {
      /* fall through */
    }
  }
  return parseVideoFence(body)
}

export async function videoToMarkdownFenceAsync(attrs: VideoBlockAttrs): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await videoToMarkdownFenceNative(attrs.src, attrs.caption)
    } catch {
      /* fall through */
    }
  }
  return videoToMarkdownFence(attrs)
}

export async function renderVideoFigureHtmlAsync(attrs: VideoBlockAttrs): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await renderVideoFigureHtmlNative(attrs.src, attrs.caption)
    } catch {
      /* fall through */
    }
  }
  return renderVideoFigureHtml(attrs)
}

export async function collectVideosFromTiptapAsync(contentJson: string) {
  if (isTauriRuntime()) {
    try {
      return await collectVideosFromTiptapNative(contentJson)
    } catch {
      /* fall through */
    }
  }
  return []
}
