import { kvGetJson, kvSetJson } from '@/lib/storage/kv'

export const APIS_PREFS_KEY = 'scribe-apis-enabled-v1'

/** Stable ids — match `crates/scribe-apis` modules / FE wrappers. */
export const API_IDS = [
  'nominatim',
  'open_meteo',
  'sunrise_sunset',
  'nager',
  'timezone',
  'overpass',
  'osrm',
  'transit',
  'tides',
  'rest_countries',
  'wikipedia',
  'wikidata',
  'duckduckgo',
  'searx',
  'dictionary',
  'datamuse',
  'open_library',
  'crossref',
  'pubmed',
  'semantic_scholar',
  'openalex',
  'arxiv',
  'unpaywall',
  'wayback',
  'openverse',
  'oembed',
  'met_museum',
  'musicbrainz',
  'mealdb',
  'open_food_facts',
  'inaturalist',
  'quotable',
  'frankfurter',
  'vies',
] as const

export type ApiId = (typeof API_IDS)[number]

export type ApiGroupId =
  | 'places'
  | 'weather'
  | 'knowledge'
  | 'research'
  | 'media'
  | 'foodNature'
  | 'finance'
  | 'writing'

export type ApiGroup = {
  id: ApiGroupId
  apis: ApiId[]
}

export const API_GROUPS: ApiGroup[] = [
  {
    id: 'places',
    apis: ['nominatim', 'overpass', 'osrm', 'transit', 'rest_countries', 'tides'],
  },
  {
    id: 'weather',
    apis: ['open_meteo', 'sunrise_sunset', 'nager', 'timezone', 'quotable'],
  },
  {
    id: 'knowledge',
    apis: ['wikipedia', 'wikidata', 'duckduckgo', 'searx', 'open_library'],
  },
  {
    id: 'research',
    apis: [
      'crossref',
      'pubmed',
      'semantic_scholar',
      'openalex',
      'arxiv',
      'unpaywall',
      'wayback',
    ],
  },
  {
    id: 'media',
    apis: ['openverse', 'oembed', 'met_museum', 'musicbrainz'],
  },
  {
    id: 'foodNature',
    apis: ['mealdb', 'open_food_facts', 'inaturalist'],
  },
  {
    id: 'finance',
    apis: ['frankfurter', 'vies'],
  },
  {
    id: 'writing',
    apis: ['dictionary', 'datamuse'],
  },
]

export type ApisEnabledMap = Partial<Record<ApiId, boolean>>

function readMap(): ApisEnabledMap {
  const stored = kvGetJson<ApisEnabledMap>(APIS_PREFS_KEY)
  if (!stored || typeof stored !== 'object') return {}
  const next: ApisEnabledMap = {}
  for (const id of API_IDS) {
    if (typeof stored[id] === 'boolean') next[id] = stored[id]
  }
  return next
}

function writeMap(map: ApisEnabledMap) {
  kvSetJson(APIS_PREFS_KEY, map)
}

/** Default: enabled (opt-in happens at the click site). Explicit `false` disables. */
export function isApiEnabled(id: ApiId): boolean {
  const map = readMap()
  return map[id] !== false
}

export function setApiEnabled(id: ApiId, enabled: boolean) {
  const map = readMap()
  if (enabled) {
    delete map[id]
  } else {
    map[id] = false
  }
  writeMap(map)
}

export function setAllApisEnabled(enabled: boolean) {
  if (enabled) {
    writeMap({})
    return
  }
  const map: ApisEnabledMap = {}
  for (const id of API_IDS) map[id] = false
  writeMap(map)
}

export function getApisEnabledSnapshot(): Record<ApiId, boolean> {
  const out = {} as Record<ApiId, boolean>
  for (const id of API_IDS) out[id] = isApiEnabled(id)
  return out
}

export function countEnabledApis(): { enabled: number; total: number } {
  let enabled = 0
  for (const id of API_IDS) {
    if (isApiEnabled(id)) enabled += 1
  }
  return { enabled, total: API_IDS.length }
}
