/**
 * Frontend surface for `scribe-apis` (opt-in free public APIs via Tauri).
 * Network runs in Rust — never call these hosts from the webview CSP.
 */
import { invoke, isTauriRuntime } from '@/lib/tauri'
import { isApiEnabled, type ApiId } from '@/lib/apis/prefs'

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

function requireApi(id: ApiId) {
  if (!isTauriRuntime()) {
    throw new Error('apis.requiresDesktop')
  }
  if (!isApiEnabled(id)) {
    throw new Error('apis.disabled')
  }
}

export async function apisPhoton(query: string, limit = 5): Promise<GeocodeHit[]> {
  requireApi('photon')
  return invoke<GeocodeHit[]>('apis_photon', { input: { query, limit } })
}

/** Nominatim first; falls back to Photon when Nominatim fails or is disabled. */
export async function apisGeocode(query: string, limit = 5): Promise<GeocodeHit[]> {
  if (isApiEnabled('nominatim') && isTauriRuntime()) {
    try {
      const hits = await invoke<GeocodeHit[]>('apis_geocode', { input: { query, limit } })
      if (hits.length) return hits
    } catch {
      // fall through to Photon
    }
  }
  if (isApiEnabled('photon')) {
    return apisPhoton(query, limit)
  }
  requireApi('nominatim')
  return invoke<GeocodeHit[]>('apis_geocode', { input: { query, limit } })
}

export async function apisWeather(lat: number, lng: number, days = 3): Promise<WeatherSnapshot> {
  requireApi('open_meteo')
  return invoke<WeatherSnapshot>('apis_weather', { input: { lat, lng, days } })
}

export type AirQualitySnapshot = {
  latitude: number
  longitude: number
  timezone: string
  europeanAqi?: number | null
  usAqi?: number | null
  pm10?: number | null
  pm25?: number | null
  carbonMonoxide?: number | null
  nitrogenDioxide?: number | null
  sulphurDioxide?: number | null
  ozone?: number | null
  aqiLabel: string
}

export async function apisAirQuality(lat: number, lng: number): Promise<AirQualitySnapshot> {
  requireApi('open_meteo')
  return invoke<AirQualitySnapshot>('apis_air_quality', { input: { lat, lng } })
}

export async function apisWikipediaSummary(
  title: string,
  lang = 'en',
): Promise<WikipediaSummary> {
  requireApi('wikipedia')
  return invoke<WikipediaSummary>('apis_wikipedia_summary', { input: { title, lang } })
}

export async function apisWikidataEntity(id: string, lang = 'en'): Promise<WikidataEntity> {
  requireApi('wikidata')
  return invoke<WikidataEntity>('apis_wikidata_entity', { input: { id, lang } })
}

export async function apisWebInstant(query: string): Promise<InstantAnswer> {
  requireApi('duckduckgo')
  return invoke<InstantAnswer>('apis_web_instant', { input: { query } })
}

export async function apisWebSearch(
  query: string,
  instance: string,
  limit = 8,
): Promise<WebSearchResult> {
  requireApi('searx')
  return invoke<WebSearchResult>('apis_web_search', { input: { query, instance, limit } })
}

export async function apisOpenLibrary(query: string, limit = 8): Promise<BookHit[]> {
  requireApi('open_library')
  return invoke<BookHit[]>('apis_open_library', { input: { query, limit } })
}

export async function apisCrossref(query: string, limit = 8): Promise<CrossrefWork[]> {
  requireApi('crossref')
  return invoke<CrossrefWork[]>('apis_crossref', { input: { query, limit } })
}

export async function apisFxRates(base: string, symbols?: string[]): Promise<FxRates> {
  requireApi('frankfurter')
  return invoke<FxRates>('apis_fx_rates', { input: { base, symbols: symbols ?? null } })
}

export async function apisFxConvert(
  amount: number,
  from: string,
  to: string,
): Promise<{ amount: number; from: string; to: string; result: number }> {
  requireApi('frankfurter')
  return invoke('apis_fx_convert', { input: { amount, from, to } })
}

export async function apisCountry(query: string): Promise<CountryInfo[]> {
  requireApi('rest_countries')
  return invoke<CountryInfo[]>('apis_country', { input: { query } })
}

export async function apisTimezone(timezone: string): Promise<TimezoneInfo> {
  requireApi('timezone')
  return invoke<TimezoneInfo>('apis_timezone', { input: { timezone } })
}

export async function apisOpenverse(query: string, limit = 8): Promise<LicensedImage[]> {
  requireApi('openverse')
  return invoke<LicensedImage[]>('apis_openverse', { input: { query, limit } })
}

export async function apisWayback(url: string): Promise<WaybackSnapshot> {
  requireApi('wayback')
  return invoke<WaybackSnapshot>('apis_wayback', { input: { url } })
}

export async function apisPubmed(query: string, limit = 8): Promise<PubmedArticle[]> {
  requireApi('pubmed')
  return invoke<PubmedArticle[]>('apis_pubmed', { input: { query, limit } })
}

export async function apisSemanticScholar(query: string, limit = 8): Promise<ScholarPaper[]> {
  requireApi('semantic_scholar')
  return invoke<ScholarPaper[]>('apis_semantic_scholar', { input: { query, limit } })
}

export async function apisMusicbrainz(query: string, limit = 6): Promise<MusicRelease[]> {
  requireApi('musicbrainz')
  return invoke<MusicRelease[]>('apis_musicbrainz', { input: { query, limit } })
}

export async function apisMusicbrainzCover(mbid: string): Promise<{ coverUrl: string | null }> {
  requireApi('musicbrainz')
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
  requireApi('transit')
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
  requireApi('open_food_facts')
  return invoke<FoodProduct>('apis_food_product', { input: { barcode } })
}

export async function apisFoodSearch(query: string, limit = 8): Promise<FoodProduct[]> {
  requireApi('open_food_facts')
  return invoke<FoodProduct[]>('apis_food_search', { input: { query, limit } })
}

export async function apisInaturalistTaxa(query: string, limit = 8): Promise<NatureTaxon[]> {
  requireApi('inaturalist')
  return invoke<NatureTaxon[]>('apis_inaturalist_taxa', { input: { query, limit } })
}

export async function apisInaturalistNearby(
  lat: number,
  lng: number,
  radiusKm = 5,
  limit = 10,
): Promise<NatureObservation[]> {
  requireApi('inaturalist')
  return invoke<NatureObservation[]>('apis_inaturalist_nearby', {
    input: { lat, lng, radiusKm, limit },
  })
}

export async function apisOverpassPois(
  lat: number,
  lng: number,
  opts?: { radiusM?: number; amenities?: string[]; limit?: number },
): Promise<OverpassPoi[]> {
  requireApi('overpass')
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
  requireApi('sunrise_sunset')
  return invoke<SunTimes>('apis_sun_times', { input: { lat, lng, date: date ?? null } })
}

export async function apisTideStations(query: string, limit = 10): Promise<TideStation[]> {
  requireApi('tides')
  return invoke<TideStation[]>('apis_tide_stations', { input: { query, limit } })
}

export async function apisTidePredictions(
  stationId: string,
  date?: string,
): Promise<TideForecast> {
  requireApi('tides')
  return invoke<TideForecast>('apis_tide_predictions', {
    input: { stationId, date: date ?? null },
  })
}

export type PublicHoliday = {
  date: string
  localName: string
  name: string
  countryCode: string
  fixed: boolean
  global: boolean
  types: string[]
}

export type MealRecipe = {
  id: string
  name: string
  category?: string | null
  area?: string | null
  instructions?: string | null
  thumbnail?: string | null
  youtube?: string | null
  source?: string | null
  ingredients: string[]
  tags: string[]
}

export type DictionarySense = {
  partOfSpeech?: string | null
  definition: string
  example?: string | null
  synonyms: string[]
}

export type DictionaryEntry = {
  word: string
  phonetic?: string | null
  sourceUrls: string[]
  senses: DictionarySense[]
  provider: string
}

export type WordSuggestion = {
  word: string
  score?: number | null
  tags: string[]
}

export type OpenAlexWork = {
  id: string
  title: string
  year?: number | null
  doi?: string | null
  authors: string[]
  citedByCount?: number | null
  oaUrl?: string | null
  abstractText?: string | null
  url?: string | null
}

export type ArxivPaper = {
  id: string
  title: string
  summary?: string | null
  authors: string[]
  published?: string | null
  pdfUrl?: string | null
  absUrl: string
  categories: string[]
}

export type UnpaywallResult = {
  doi: string
  title?: string | null
  isOa: boolean
  oaStatus?: string | null
  pdfUrl?: string | null
  landingPageUrl?: string | null
  hostType?: string | null
}

export type OEmbedInfo = {
  url: string
  title?: string | null
  authorName?: string | null
  providerName?: string | null
  thumbnailUrl?: string | null
  html?: string | null
  typ?: string | null
}

export type MetObject = {
  objectId: number
  title: string
  artist?: string | null
  date?: string | null
  medium?: string | null
  department?: string | null
  culture?: string | null
  primaryImageSmall?: string | null
  primaryImage?: string | null
  objectUrl?: string | null
  isPublicDomain: boolean
}

export type RouteEta = {
  profile: string
  distanceM: number
  durationSec: number
  geometryPolyline?: string | null
}

export type VatCheck = {
  countryCode: string
  vatNumber: string
  valid: boolean
  name?: string | null
  address?: string | null
}

export type Quote = {
  content: string
  author?: string | null
  tags: string[]
  url?: string | null
}

export async function apisNagerHolidays(year: number, country: string): Promise<PublicHoliday[]> {
  requireApi('nager')
  return invoke<PublicHoliday[]>('apis_nager_holidays', { input: { year, country } })
}

export async function apisMealdbSearch(query: string, limit = 8): Promise<MealRecipe[]> {
  requireApi('mealdb')
  return invoke<MealRecipe[]>('apis_mealdb_search', { input: { query, limit } })
}

export async function apisMealdbRandom(): Promise<MealRecipe> {
  requireApi('mealdb')
  return invoke<MealRecipe>('apis_mealdb_random')
}

export async function apisDictionary(word: string, lang?: string): Promise<DictionaryEntry> {
  requireApi('dictionary')
  return invoke<DictionaryEntry>('apis_dictionary', { input: { word, lang: lang ?? null } })
}

export async function apisDatamuseSynonyms(word: string, limit = 12): Promise<WordSuggestion[]> {
  requireApi('datamuse')
  return invoke<WordSuggestion[]>('apis_datamuse_synonyms', { input: { word, limit } })
}

export async function apisDatamuseMeansLike(word: string, limit = 12): Promise<WordSuggestion[]> {
  requireApi('datamuse')
  return invoke<WordSuggestion[]>('apis_datamuse_means_like', { input: { word, limit } })
}

export async function apisOpenAlex(query: string, limit = 8): Promise<OpenAlexWork[]> {
  requireApi('openalex')
  return invoke<OpenAlexWork[]>('apis_openalex', { input: { query, limit } })
}

export async function apisArxiv(query: string, limit = 6): Promise<ArxivPaper[]> {
  requireApi('arxiv')
  return invoke<ArxivPaper[]>('apis_arxiv', { input: { query, limit } })
}

export async function apisUnpaywall(doi: string, email?: string): Promise<UnpaywallResult> {
  requireApi('unpaywall')
  return invoke<UnpaywallResult>('apis_unpaywall', { input: { doi, email: email ?? null } })
}

export async function apisOembed(url: string): Promise<OEmbedInfo> {
  requireApi('oembed')
  return invoke<OEmbedInfo>('apis_oembed', { input: { url } })
}

export async function apisMetSearch(
  query: string,
  limit = 6,
  publicDomainOnly = true,
): Promise<MetObject[]> {
  requireApi('met_museum')
  return invoke<MetObject[]>('apis_met_search', {
    input: { query, limit, publicDomainOnly },
  })
}

export async function apisOsrmRoute(opts: {
  profile?: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}): Promise<RouteEta> {
  requireApi('osrm')
  return invoke<RouteEta>('apis_osrm_route', {
    input: {
      profile: opts.profile ?? 'driving',
      fromLat: opts.fromLat,
      fromLng: opts.fromLng,
      toLat: opts.toLat,
      toLng: opts.toLng,
    },
  })
}

export async function apisViesCheck(vatNumber: string, country?: string): Promise<VatCheck> {
  requireApi('vies')
  return invoke<VatCheck>('apis_vies_check', {
    input: { vatNumber, country: country ?? null },
  })
}

export async function apisQuotable(tags?: string): Promise<Quote> {
  requireApi('quotable')
  return invoke<Quote>('apis_quotable', { input: { tags: tags ?? null } })
}

export type GrammarMatch = {
  message: string
  shortMessage?: string | null
  offset: number
  length: number
  replacements: string[]
  ruleId?: string | null
  category?: string | null
  excerpt?: string | null
}

export type GrammarCheck = {
  language: string
  matches: GrammarMatch[]
}

export async function apisLanguageTool(
  text: string,
  language?: string,
): Promise<GrammarCheck> {
  requireApi('languagetool')
  return invoke<GrammarCheck>('apis_languagetool', {
    input: { text, language: language ?? null },
  })
}

export type Translation = {
  translatedText: string
  detectedLanguage?: string | null
  source: string
  target: string
  instance: string
}

export async function apisLibreTranslate(
  text: string,
  target: string,
  opts?: { source?: string; instance?: string },
): Promise<Translation> {
  requireApi('libretranslate')
  return invoke<Translation>('apis_libretranslate', {
    input: {
      text,
      target,
      source: opts?.source ?? null,
      instance: opts?.instance ?? null,
    },
  })
}

export async function apisEuropeana(query: string, limit = 8): Promise<LicensedImage[]> {
  requireApi('europeana')
  return invoke<LicensedImage[]>('apis_europeana', { input: { query, limit } })
}

export async function apisRijksmuseum(query: string, limit = 8): Promise<LicensedImage[]> {
  requireApi('rijksmuseum')
  return invoke<LicensedImage[]>('apis_rijksmuseum', { input: { query, limit } })
}

export type VatRateInfo = {
  countryCode: string
  standardRate?: number | null
  currency?: string | null
  name?: string | null
}

export type VatNumberInfo = {
  countryCode: string
  vatNumber: string
  valid: boolean
  name?: string | null
  address?: string | null
}

export async function apisVatcomplyCheck(vatNumber: string): Promise<VatNumberInfo> {
  requireApi('vatcomply')
  return invoke<VatNumberInfo>('apis_vatcomply_check', { input: { vatNumber } })
}

export async function apisVatcomplyRate(country: string): Promise<VatRateInfo> {
  requireApi('vatcomply')
  return invoke<VatRateInfo>('apis_vatcomply_rate', { input: { country } })
}

export type CitationLink = {
  citing: string
  cited: string
  creation?: string | null
  timespan?: string | null
  journalSelfCite?: string | null
}

export type CitationBundle = {
  doi: string
  citingCount: number
  citedBy: CitationLink[]
  references: CitationLink[]
}

export async function apisOpenCitations(doi: string, limit = 8): Promise<CitationBundle> {
  requireApi('opencitations')
  return invoke<CitationBundle>('apis_opencitations', { input: { doi, limit } })
}

export type SoundClip = {
  title: string
  url: string
  thumbnail?: string | null
  creator?: string | null
  license?: string | null
  licenseUrl?: string | null
  foreignLandingUrl?: string | null
  duration?: number | null
  source?: string | null
}

export async function apisFreesound(query: string, limit = 8): Promise<SoundClip[]> {
  requireApi('freesound')
  return invoke<SoundClip[]>('apis_freesound', { input: { query, limit } })
}

export type PodcastShow = {
  title: string
  artist?: string | null
  feedUrl?: string | null
  artworkUrl?: string | null
  genre?: string | null
  trackCount?: number | null
  country?: string | null
  itunesUrl?: string | null
}

export async function apisPodcasts(query: string, limit = 8): Promise<PodcastShow[]> {
  requireApi('podcasts')
  return invoke<PodcastShow[]>('apis_podcasts', { input: { query, limit } })
}
