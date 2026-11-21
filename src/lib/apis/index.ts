/**
 * Frontend surface for `scribe-apis` (opt-in free public APIs via Tauri).
 * Network runs in Rust — never call these hosts from the webview CSP.
 */
import { invoke, isTauriRuntime } from '@/lib/tauri'

export type GeocodeHit = {
  displayName: string
  lat: number
  lng: number
  placeId?: string | null
  osmType?: string | null
  osmId?: string | null
  importance?: number | null
}

export type WeatherDay = {
  date: string
  tempMaxC?: number | null
  tempMinC?: number | null
  weatherCode?: number | null
  weatherLabel: string
  precipitationMm?: number | null
}

export type WeatherSnapshot = {
  latitude: number
  longitude: number
  timezone: string
  temperatureC?: number | null
  weatherCode?: number | null
  weatherLabel: string
  windSpeedKmh?: number | null
  daily: WeatherDay[]
}

export type WikipediaSummary = {
  title: string
  description?: string | null
  extract: string
  url: string
  lang: string
  thumbnailUrl?: string | null
}

export type WikidataEntity = {
  id: string
  label: string
  description?: string | null
  url: string
}

export type InstantRelated = { text: string; url?: string | null }

export type InstantAnswer = {
  heading: string
  abstractText: string
  abstractUrl?: string | null
  answer?: string | null
  related: InstantRelated[]
}

export type WebSearchHit = {
  title: string
  url: string
  content: string
  engine?: string | null
}

export type WebSearchResult = {
  query: string
  instance: string
  hits: WebSearchHit[]
}

export type BookHit = {
  title: string
  authors: string[]
  firstPublishYear?: number | null
  isbn?: string | null
  openLibraryKey?: string | null
  url?: string | null
}

export type CrossrefWork = {
  title: string
  doi?: string | null
  authors: string[]
  published?: string | null
  containerTitle?: string | null
  url?: string | null
  typeName?: string | null
}

export type FxRates = {
  base: string
  date: string
  rates: Record<string, number>
}

export type CountryInfo = {
  name: string
  officialName?: string | null
  cca2?: string | null
  cca3?: string | null
  capital: string[]
  region?: string | null
  subregion?: string | null
  currencies: string[]
  languages: string[]
  timezones: string[]
  lat?: number | null
  lng?: number | null
  flagEmoji?: string | null
}

export type TimezoneInfo = {
  timezone: string
  datetime: string
  utcOffset?: string | null
  dayOfWeek?: number | null
  dayOfYear?: number | null
  abbreviation?: string | null
}

function requireTauri() {
  if (!isTauriRuntime()) {
    throw new Error('apis.requiresDesktop')
  }
}

export async function apisGeocode(query: string, limit = 5): Promise<GeocodeHit[]> {
  requireTauri()
  return invoke<GeocodeHit[]>('apis_geocode', { input: { query, limit } })
}

export async function apisWeather(lat: number, lng: number, days = 3): Promise<WeatherSnapshot> {
  requireTauri()
  return invoke<WeatherSnapshot>('apis_weather', { input: { lat, lng, days } })
}

export async function apisWikipediaSummary(
  title: string,
  lang = 'en',
): Promise<WikipediaSummary> {
  requireTauri()
  return invoke<WikipediaSummary>('apis_wikipedia_summary', { input: { title, lang } })
}

export async function apisWikidataEntity(id: string, lang = 'en'): Promise<WikidataEntity> {
  requireTauri()
  return invoke<WikidataEntity>('apis_wikidata_entity', { input: { id, lang } })
}

export async function apisWebInstant(query: string): Promise<InstantAnswer> {
  requireTauri()
  return invoke<InstantAnswer>('apis_web_instant', { input: { query } })
}

export async function apisWebSearch(
  query: string,
  instance: string,
  limit = 8,
): Promise<WebSearchResult> {
  requireTauri()
  return invoke<WebSearchResult>('apis_web_search', { input: { query, instance, limit } })
}

export async function apisOpenLibrary(query: string, limit = 8): Promise<BookHit[]> {
  requireTauri()
  return invoke<BookHit[]>('apis_open_library', { input: { query, limit } })
}

export async function apisCrossref(query: string, limit = 8): Promise<CrossrefWork[]> {
  requireTauri()
  return invoke<CrossrefWork[]>('apis_crossref', { input: { query, limit } })
}

export async function apisFxRates(base: string, symbols?: string[]): Promise<FxRates> {
  requireTauri()
  return invoke<FxRates>('apis_fx_rates', { input: { base, symbols: symbols ?? null } })
}

export async function apisFxConvert(
  amount: number,
  from: string,
  to: string,
): Promise<{ amount: number; from: string; to: string; result: number }> {
  requireTauri()
  return invoke('apis_fx_convert', { input: { amount, from, to } })
}

export async function apisCountry(query: string): Promise<CountryInfo[]> {
  requireTauri()
  return invoke<CountryInfo[]>('apis_country', { input: { query } })
}

export async function apisTimezone(timezone: string): Promise<TimezoneInfo> {
  requireTauri()
  return invoke<TimezoneInfo>('apis_timezone', { input: { timezone } })
}
