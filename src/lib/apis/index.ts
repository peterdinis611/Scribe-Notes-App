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

export type LicensedImage = {
  title: string
  url: string
  thumbnail?: string | null
  creator?: string | null
  license?: string | null
  licenseUrl?: string | null
  foreignLandingUrl?: string | null
  source?: string | null
}

export type WaybackSnapshot = {
  url: string
  archivedUrl: string
  timestamp: string
  available: boolean
  status?: string | null
}

export type PubmedArticle = {
  pmid: string
  title: string
  authors: string[]
  source?: string | null
  pubDate?: string | null
  url: string
}

export type ScholarPaper = {
  paperId: string
  title: string
  abstractText?: string | null
  year?: number | null
  authors: string[]
  url?: string | null
  venue?: string | null
  citationCount?: number | null
}

export type MusicRelease = {
  id: string
  title: string
  artist?: string | null
  date?: string | null
  url: string
  coverUrl?: string | null
}

export type TransitLeg = {
  mode: string
  fromName: string
  toName: string
  durationSec?: number | null
  routeShortName?: string | null
}

export type TransitItinerary = {
  durationSec?: number | null
  walkDistanceM?: number | null
  legs: TransitLeg[]
}

export type TransitPlan = {
  instance: string
  itineraries: TransitItinerary[]
}

export type FoodProduct = {
  code: string
  name: string
  brands?: string | null
  quantity?: string | null
  nutriscore?: string | null
  novaGroup?: number | null
  imageUrl?: string | null
  url: string
  energyKcal100g?: number | null
  proteins100g?: number | null
  carbohydrates100g?: number | null
  fat100g?: number | null
}

export type NatureTaxon = {
  id: number
  name: string
  preferredCommonName?: string | null
  rank?: string | null
  wikipediaUrl?: string | null
  defaultPhotoUrl?: string | null
  url: string
}

export type NatureObservation = {
  id: number
  speciesGuess?: string | null
  taxon?: NatureTaxon | null
  observedOn?: string | null
  placeGuess?: string | null
  latitude?: number | null
  longitude?: number | null
  url: string
  photoUrl?: string | null
}

export type OverpassPoi = {
  id: number
  name: string
  kind: string
  latitude: number
  longitude: number
  tags: [string, string][]
}

export type SunTimes = {
  latitude: number
  longitude: number
  date?: string | null
  sunrise: string
  sunset: string
  solarNoon?: string | null
  dayLengthSec?: number | null
  civilTwilightBegin?: string | null
  civilTwilightEnd?: string | null
}

export type TideStation = {
  id: string
  name: string
  latitude?: number | null
  longitude?: number | null
  state?: string | null
}

export type TidePrediction = {
  time: string
  heightFt?: number | null
  typ?: string | null
}

export type TideForecast = {
  stationId: string
  predictions: TidePrediction[]
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

export async function apisOpenverse(query: string, limit = 8): Promise<LicensedImage[]> {
  requireTauri()
  return invoke<LicensedImage[]>('apis_openverse', { input: { query, limit } })
}

export async function apisWayback(url: string): Promise<WaybackSnapshot> {
  requireTauri()
  return invoke<WaybackSnapshot>('apis_wayback', { input: { url } })
}

export async function apisPubmed(query: string, limit = 8): Promise<PubmedArticle[]> {
  requireTauri()
  return invoke<PubmedArticle[]>('apis_pubmed', { input: { query, limit } })
}

export async function apisSemanticScholar(query: string, limit = 8): Promise<ScholarPaper[]> {
  requireTauri()
  return invoke<ScholarPaper[]>('apis_semantic_scholar', { input: { query, limit } })
}

export async function apisMusicbrainz(query: string, limit = 6): Promise<MusicRelease[]> {
  requireTauri()
  return invoke<MusicRelease[]>('apis_musicbrainz', { input: { query, limit } })
}

export async function apisMusicbrainzCover(mbid: string): Promise<{ coverUrl: string | null }> {
  requireTauri()
  return invoke('apis_musicbrainz_cover', { input: { mbid } })
}

export async function apisTransitPlan(opts: {
  instance: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  limit?: number
}): Promise<TransitPlan> {
  requireTauri()
  return invoke<TransitPlan>('apis_transit_plan', {
    input: {
      instance: opts.instance,
      fromLat: opts.fromLat,
      fromLng: opts.fromLng,
      toLat: opts.toLat,
      toLng: opts.toLng,
      limit: opts.limit ?? 3,
    },
  })
}

export async function apisFoodProduct(barcode: string): Promise<FoodProduct> {
  requireTauri()
  return invoke<FoodProduct>('apis_food_product', { input: { barcode } })
}

export async function apisFoodSearch(query: string, limit = 8): Promise<FoodProduct[]> {
  requireTauri()
  return invoke<FoodProduct[]>('apis_food_search', { input: { query, limit } })
}

export async function apisInaturalistTaxa(query: string, limit = 8): Promise<NatureTaxon[]> {
  requireTauri()
  return invoke<NatureTaxon[]>('apis_inaturalist_taxa', { input: { query, limit } })
}

export async function apisInaturalistNearby(
  lat: number,
  lng: number,
  radiusKm = 5,
  limit = 10,
): Promise<NatureObservation[]> {
  requireTauri()
  return invoke<NatureObservation[]>('apis_inaturalist_nearby', {
    input: { lat, lng, radiusKm, limit },
  })
}

export async function apisOverpassPois(
  lat: number,
  lng: number,
  opts?: { radiusM?: number; amenities?: string[]; limit?: number },
): Promise<OverpassPoi[]> {
  requireTauri()
  return invoke<OverpassPoi[]>('apis_overpass_pois', {
    input: {
      lat,
      lng,
      radiusM: opts?.radiusM ?? 800,
      amenities: opts?.amenities ?? null,
      limit: opts?.limit ?? 20,
    },
  })
}

export async function apisSunTimes(
  lat: number,
  lng: number,
  date?: string,
): Promise<SunTimes> {
  requireTauri()
  return invoke<SunTimes>('apis_sun_times', { input: { lat, lng, date: date ?? null } })
}

export async function apisTideStations(query: string, limit = 10): Promise<TideStation[]> {
  requireTauri()
  return invoke<TideStation[]>('apis_tide_stations', { input: { query, limit } })
}

export async function apisTidePredictions(
  stationId: string,
  date?: string,
): Promise<TideForecast> {
  requireTauri()
  return invoke<TideForecast>('apis_tide_predictions', {
    input: { stationId, date: date ?? null },
  })
}
