const VIDEO_FILE_EXT = /\.(?:mp4|webm|ogv|ogg|mov|m3u8)(?:\?[^#]*)?(?:#.*)?$/i

const VIDEO_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'dailymotion.com',
  'dai.ly',
  'twitch.tv',
  'facebook.com',
  'fb.watch',
  'fb.com',
  'soundcloud.com',
  'mixcloud.com',
  'streamable.com',
  'wistia.com',
  'wistia.net',
  'tiktok.com',
]

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

export function videoProviderLabel(src: string): string {
  const trimmed = src.trim()
  if (extractYoutubeId(trimmed)) return 'YouTube'
  if (extractVimeoId(trimmed)) return 'Vimeo'
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '')
    if (host.includes('dailymotion') || host === 'dai.ly') return 'Dailymotion'
    if (host.includes('twitch')) return 'Twitch'
    if (host.includes('facebook') || host === 'fb.watch' || host === 'fb.com') return 'Facebook'
    if (host.includes('soundcloud')) return 'SoundCloud'
    if (host.includes('mixcloud')) return 'Mixcloud'
    if (host.includes('streamable')) return 'Streamable'
    if (host.includes('wistia')) return 'Wistia'
    if (host.includes('tiktok')) return 'TikTok'
  } catch {
    /* file / relative */
  }
  if (VIDEO_FILE_EXT.test(trimmed)) return 'Video'
  return 'Video'
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
  if (VIDEO_FILE_EXT.test(src)) {
    return { kind: 'video', href: src }
  }
  return { kind: 'link', href: src }
}
