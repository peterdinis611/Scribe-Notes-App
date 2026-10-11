import i18n from '@/i18n'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'
import { closeUiSurface, openUiSurface, renderUiSurfaceHtml, type UiSurfaceId, type UiSurfaceRequest } from '@/lib/db/api'
import { DOCS_GROUPS, DOCS_TOPIC_IDS } from '@/components/docs/docs-groups'
import { PRIVACY_ARTICLE_IDS } from '@/lib/privacy'
import { isTauriRuntime } from '@/lib/tauri'
import { listen } from '@tauri-apps/api/event'

export type ScribeUiEvent = {
  event: string
  arg?: string | null
}

const SURFACE_STRING_PREFIXES = [
  'whatsNew.',
  'welcome.',
  'common.',
  'nav.',
  'settings.privacy.',
  'settings.about.',
  'settings.docs.',
] as const

function collectStrings(): Record<string, string> {
  const bundle = i18n.getResourceBundle(i18n.language, 'translation') as Record<string, unknown> | undefined
  const out: Record<string, string> = {}

  function walk(node: unknown, path: string) {
    if (typeof node === 'string') {
      if (SURFACE_STRING_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        out[path] = node
      }
      return
    }
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      walk(value, path ? `${path}.${key}` : key)
    }
  }

  walk(bundle, '')
  return out
}

function privacyArticles() {
  return PRIVACY_ARTICLE_IDS.map((id) => {
    const paragraphs = i18n.t(`settings.privacy.articles.${id}.paragraphs`, {
      returnObjects: true,
    })
    return {
      id,
      title: i18n.t(`settings.privacy.articles.${id}.title`),
      paragraphs: Array.isArray(paragraphs) ? (paragraphs as string[]) : [],
    }
  })
}

function docsTopics() {
  return DOCS_TOPIC_IDS.map((id) => {
    const paragraphs = i18n.t(`settings.docs.topics.${id}.paragraphs`, {
      returnObjects: true,
      version: APP_SHORT_VERSION,
    })
    const points = i18n.t(`settings.docs.topics.${id}.points`, {
      returnObjects: true,
      version: APP_SHORT_VERSION,
    })
    return {
      id,
      title: i18n.t(`settings.docs.topics.${id}.title`, { version: APP_SHORT_VERSION }),
      summary: i18n.t(`settings.docs.topics.${id}.summary`, { version: APP_SHORT_VERSION }),
      paragraphs: Array.isArray(paragraphs) ? (paragraphs as string[]) : [],
      points: Array.isArray(points) ? (points as string[]) : [],
    }
  })
}

function docsGroups(): Array<[string, string[]]> {
  return DOCS_GROUPS.map((group) => [group.id, [...group.topics]])
}

function highlightCopy(): Record<string, [string, string]> {
  const ids = [
    'docsFieldGuide',
    'pythonUiChrome',
    'sharedUiCatalogs',
    'renderUiSurface',
    'welcomeSurfaces',
  ]
  const out: Record<string, [string, string]> = {}
  for (const id of ids) {
    out[id] = [
      i18n.t(`whatsNew.${id}.title`),
      i18n.t(`whatsNew.${id}.description`),
    ]
  }
  return out
}

export function buildUiSurfaceRequest(
  surface: UiSurfaceId,
  extras?: Partial<UiSurfaceRequest>,
): UiSurfaceRequest {
  const { surface: _ignored, ...rest } = extras ?? {}
  return {
    surface,
    locale: i18n.language,
    strings: collectStrings(),
    version: APP_VERSION,
    shortVersion: APP_SHORT_VERSION,
    highlights: Object.keys(highlightCopy()),
    highlightCopy: highlightCopy(),
    recent: [],
    privacyArticles: privacyArticles(),
    docsTopics: docsTopics(),
    docsGroups: docsGroups(),
    ...rest,
  }
}

export async function openScribeUiSurface(
  surface: UiSurfaceId,
  extras?: Partial<UiSurfaceRequest>,
): Promise<boolean> {
  if (!isTauriRuntime()) return false
  try {
    await openUiSurface(buildUiSurfaceRequest(surface, extras))
    return true
  } catch {
    return false
  }
}

export async function renderScribeUiHtml(
  surface: UiSurfaceId,
  extras?: Partial<UiSurfaceRequest>,
): Promise<string | null> {
  if (!isTauriRuntime()) return null
  try {
    return await renderUiSurfaceHtml(buildUiSurfaceRequest(surface, extras))
  } catch {
    return null
  }
}

export async function closeScribeUiSurface() {
  if (!isTauriRuntime()) return
  try {
    await closeUiSurface()
  } catch {
    // ignore
  }
}

export function subscribeScribeUiEvents(handler: (event: ScribeUiEvent) => void): () => void {
  if (!isTauriRuntime()) {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data
      if (!data || data.source !== 'scribe-ui') return
      handler({ event: String(data.event ?? ''), arg: data.arg ?? null })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }

  let unlisten: (() => void) | undefined
  void listen<ScribeUiEvent>('scribe-ui-event', (event) => {
    handler(event.payload)
  }).then((fn) => {
    unlisten = fn
  })

  return () => {
    unlisten?.()
  }
}
