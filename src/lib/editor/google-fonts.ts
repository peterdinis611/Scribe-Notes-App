import { formatCustomFontFamily, normalizeFontFamily } from '@/lib/editor/font-family'
import { kvGet, kvSet } from '@/lib/storage/kv'

const GOOGLE_FONTS_CACHE_KEY = 'scribe-google-fonts-cache-v1'
const LOADED_ATTR = 'data-scribe-google-font'

/** Popular Google Fonts (offline / CORS fallback). Sorted alphabetically. */
export const CURATED_GOOGLE_FONTS = [
  'Abril Fatface',
  'Alegreya',
  'Anton',
  'Archivo',
  'Arimo',
  'Bitter',
  'Cabin',
  'Cairo',
  'Cardo',
  'Caveat',
  'Comfortaa',
  'Comic Neue',
  'Cormorant Garamond',
  'Crimson Pro',
  'Crimson Text',
  'DM Sans',
  'DM Serif Display',
  'Dancing Script',
  'EB Garamond',
  'Exo 2',
  'Fira Code',
  'Fira Sans',
  'Frank Ruhl Libre',
  'Great Vibes',
  'Heebo',
  'IBM Plex Mono',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Inconsolata',
  'Inter',
  'JetBrains Mono',
  'Josefin Sans',
  'Karla',
  'Lato',
  'Libre Baskerville',
  'Libre Franklin',
  'Lora',
  'Manrope',
  'Merriweather',
  'Montserrat',
  'Mukta',
  'Mulish',
  'Noto Sans',
  'Noto Serif',
  'Nunito',
  'Nunito Sans',
  'Open Sans',
  'Oswald',
  'Outfit',
  'Overpass',
  'Pacifico',
  'Playfair Display',
  'Poppins',
  'PT Sans',
  'PT Serif',
  'Public Sans',
  'Quicksand',
  'Raleway',
  'Roboto',
  'Roboto Condensed',
  'Roboto Mono',
  'Roboto Slab',
  'Rubik',
  'Source Code Pro',
  'Source Sans 3',
  'Source Serif 4',
  'Space Grotesk',
  'Space Mono',
  'Spectral',
  'Syne',
  'Titillium Web',
  'Ubuntu',
  'Work Sans',
] as const

const curatedSet = new Set(CURATED_GOOGLE_FONTS.map((name) => name.toLowerCase()))
const loadedFamilies = new Set<string>()
let cachedFamilies: string[] | null = null
let fetchPromise: Promise<string[]> | null = null

function readCachedFamilies(): string[] | null {
  try {
    const raw = kvGet(GOOGLE_FONTS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; families?: unknown }
    if (!parsed || !Array.isArray(parsed.families)) return null
    // Refresh weekly.
    if (typeof parsed.at === 'number' && Date.now() - parsed.at > 7 * 24 * 60 * 60 * 1000) {
      return null
    }
    const families = parsed.families.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
    return families.length > 0 ? families : null
  } catch {
    return null
  }
}

function writeCachedFamilies(families: string[]) {
  kvSet(
    GOOGLE_FONTS_CACHE_KEY,
    JSON.stringify({ at: Date.now(), families }),
  )
}

/** Family name without quotes / stack fallbacks. */
export function primaryFontFamilyName(value: string | null | undefined): string {
  if (!value) return ''
  return value.split(',')[0]?.replaceAll(/["']/g, '').trim() ?? ''
}

export function isKnownGoogleFont(familyName: string): boolean {
  const key = familyName.trim().toLowerCase()
  if (!key) return false
  if (curatedSet.has(key)) return true
  if (cachedFamilies?.some((name) => name.toLowerCase() === key)) return true
  return false
}

export function googleFontsCssUrl(familyName: string): string {
  const family = encodeURIComponent(familyName.trim()).replaceAll('%20', '+')
  return `https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,400;0,700;1,400;1,700&display=swap`
}

/** Inject a stylesheet so the font can render in the editor. */
export function ensureGoogleFontLoaded(familyName: string, options?: { force?: boolean }): void {
  const name = primaryFontFamilyName(familyName)
  if (!name || loadedFamilies.has(name.toLowerCase())) return
  if (!options?.force && !isKnownGoogleFont(name)) return

  loadedFamilies.add(name.toLowerCase())

  if (typeof document === 'undefined') return
  const href = googleFontsCssUrl(name)
  const existing = document.head.querySelectorAll(`link[${LOADED_ATTR}]`)
  for (const node of existing) {
    if (node.getAttribute(LOADED_ATTR) === name) return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.setAttribute(LOADED_ATTR, name)
  document.head.appendChild(link)
}

export function googleFontsLinkTags(familyNames: string[]): string {
  const unique = [...new Set(familyNames.map(primaryFontFamilyName).filter(Boolean))]
  return unique
    .map((name) => `<link rel="stylesheet" href="${googleFontsCssUrl(name)}">`)
    .join('\n')
}

export function extractFontFamiliesFromContentJson(contentJson: string): string[] {
  const found = new Set<string>()
  try {
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const record = node as { marks?: Array<{ attrs?: Record<string, unknown> }>; content?: unknown[] }
      for (const mark of record.marks ?? []) {
        const fontFamily = mark.attrs?.fontFamily
        if (typeof fontFamily === 'string') {
          const name = primaryFontFamilyName(fontFamily)
          if (name) found.add(name)
        }
      }
      for (const child of record.content ?? []) walk(child)
    }
    walk(JSON.parse(contentJson))
  } catch {
    // ignore
  }
  return [...found]
}

export function loadGoogleFontsForDocument(contentJson: string, pageFontFamily?: string) {
  for (const family of extractFontFamiliesFromContentJson(contentJson)) {
    ensureGoogleFontLoaded(family)
  }
  if (pageFontFamily) ensureGoogleFontLoaded(pageFontFamily)
}

async function fetchGoogleFontMetadata(): Promise<string[] | null> {
  try {
    const response = await fetch('https://fonts.google.com/metadata/fonts', {
      // Avoid opaque cache surprises in Tauri / Vite.
      cache: 'force-cache',
    })
    if (!response.ok) return null
    let text = await response.text()
    // Google prefixes JSON with )]}'
    if (text.startsWith(")]}'")) text = text.slice(4)
    const data = JSON.parse(text) as {
      familyMetadataList?: Array<{ family?: string }>
    }
    const families = (data.familyMetadataList ?? [])
      .map((item) => item.family?.trim())
      .filter((name): name is string => Boolean(name))
    return families.length > 0 ? families : null
  } catch {
    return null
  }
}

/** Full list for the picker (cached metadata when network allows). */
export async function listGoogleFontFamilies(): Promise<string[]> {
  if (cachedFamilies) return cachedFamilies

  const fromStorage = readCachedFamilies()
  if (fromStorage) {
    cachedFamilies = fromStorage
    return fromStorage
  }

  if (!fetchPromise) {
    fetchPromise = (async () => {
      const remote = await fetchGoogleFontMetadata()
      if (remote) {
        writeCachedFamilies(remote)
        cachedFamilies = remote
        return remote
      }
      cachedFamilies = [...CURATED_GOOGLE_FONTS]
      return cachedFamilies
    })()
  }

  return fetchPromise
}

export function applyGoogleFontFamily(familyName: string): string {
  const name = familyName.trim()
  ensureGoogleFontLoaded(name, { force: true })
  return formatCustomFontFamily(name)
}

export function filterGoogleFonts(fonts: string[], query: string, limit = 60): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return fonts.slice(0, Math.min(limit, 40))
  return fonts.filter((font) => font.toLowerCase().includes(q)).slice(0, limit)
}

export function matchesGoogleFontValue(cssValue: string | null | undefined, familyName: string) {
  return normalizeFontFamily(primaryFontFamilyName(cssValue)) === normalizeFontFamily(familyName)
}
