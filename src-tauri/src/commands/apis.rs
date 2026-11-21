//! Opt-in free public APIs via `scribe-apis` (network only when invoked).

use serde::Deserialize;

fn map_err(err: scribe_apis::ApiError) -> String {
    err.to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeocodeInput {
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_geocode(input: GeocodeInput) -> Result<serde_json::Value, String> {
    let hits = scribe_apis::geocode(&input.query, input.limit.unwrap_or(5) as usize).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherInput {
    pub lat: f64,
    pub lng: f64,
    pub days: Option<u32>,
}

#[tauri::command]
pub fn apis_weather(input: WeatherInput) -> Result<serde_json::Value, String> {
    let snap =
        scribe_apis::weather_forecast(input.lat, input.lng, input.days.unwrap_or(3) as usize)
            .map_err(map_err)?;
    serde_json::to_value(snap).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikipediaInput {
    pub title: String,
    pub lang: Option<String>,
}

#[tauri::command]
pub fn apis_wikipedia_summary(input: WikipediaInput) -> Result<serde_json::Value, String> {
    let lang = input.lang.unwrap_or_else(|| "en".into());
    let summary = scribe_apis::wikipedia_summary(&input.title, &lang).map_err(map_err)?;
    serde_json::to_value(summary).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikidataInput {
    pub id: String,
    pub lang: Option<String>,
}

#[tauri::command]
pub fn apis_wikidata_entity(input: WikidataInput) -> Result<serde_json::Value, String> {
    let lang = input.lang.unwrap_or_else(|| "en".into());
    let entity = scribe_apis::wikidata_entity(&input.id, &lang).map_err(map_err)?;
    serde_json::to_value(entity).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstantInput {
    pub query: String,
}

#[tauri::command]
pub fn apis_web_instant(input: InstantInput) -> Result<serde_json::Value, String> {
    let answer = scribe_apis::instant_answer(&input.query).map_err(map_err)?;
    serde_json::to_value(answer).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearxInput {
    pub query: String,
    pub instance: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_web_search(input: SearxInput) -> Result<serde_json::Value, String> {
    let result =
        scribe_apis::searx_search(&input.instance, &input.query, input.limit.unwrap_or(8) as usize)
            .map_err(map_err)?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BooksInput {
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_open_library(input: BooksInput) -> Result<serde_json::Value, String> {
    let hits =
        scribe_apis::open_library_search(&input.query, input.limit.unwrap_or(8) as usize)
            .map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossrefInput {
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_crossref(input: CrossrefInput) -> Result<serde_json::Value, String> {
    let hits =
        scribe_apis::crossref_search(&input.query, input.limit.unwrap_or(8) as usize).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FxInput {
    pub base: String,
    pub symbols: Option<Vec<String>>,
}

#[tauri::command]
pub fn apis_fx_rates(input: FxInput) -> Result<serde_json::Value, String> {
    let rates =
        scribe_apis::fx_latest_fallback(&input.base, input.symbols.as_deref()).map_err(map_err)?;
    serde_json::to_value(rates).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FxConvertInput {
    pub amount: f64,
    pub from: String,
    pub to: String,
}

#[tauri::command]
pub fn apis_fx_convert(input: FxConvertInput) -> Result<serde_json::Value, String> {
    let value =
        scribe_apis::fx_convert_fallback(input.amount, &input.from, &input.to).map_err(map_err)?;
    Ok(serde_json::json!({ "amount": input.amount, "from": input.from, "to": input.to, "result": value }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryInput {
    pub query: String,
}

#[tauri::command]
pub fn apis_country(input: CountryInput) -> Result<serde_json::Value, String> {
    let hits = scribe_apis::lookup_country(&input.query).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimezoneInput {
    pub timezone: String,
}

#[tauri::command]
pub fn apis_timezone(input: TimezoneInput) -> Result<serde_json::Value, String> {
    let info = scribe_apis::timezone_now(&input.timezone).map_err(map_err)?;
    serde_json::to_value(info).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryLimitInput {
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_openverse(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits =
        scribe_apis::openverse_search(&input.query, input.limit.unwrap_or(8) as usize).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlInput {
    pub url: String,
}

#[tauri::command]
pub fn apis_wayback(input: UrlInput) -> Result<serde_json::Value, String> {
    let snap = scribe_apis::wayback_closest(&input.url).map_err(map_err)?;
    serde_json::to_value(snap).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apis_pubmed(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits =
        scribe_apis::pubmed_search(&input.query, input.limit.unwrap_or(8) as usize).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apis_semantic_scholar(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits = scribe_apis::semantic_scholar_search(&input.query, input.limit.unwrap_or(8) as usize)
        .map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apis_musicbrainz(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits = scribe_apis::musicbrainz_search(&input.query, input.limit.unwrap_or(6) as usize)
        .map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MbidInput {
    pub mbid: String,
}

#[tauri::command]
pub fn apis_musicbrainz_cover(input: MbidInput) -> Result<serde_json::Value, String> {
    let url = scribe_apis::musicbrainz_cover(&input.mbid).map_err(map_err)?;
    Ok(serde_json::json!({ "coverUrl": url }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitInput {
    pub instance: String,
    pub from_lat: f64,
    pub from_lng: f64,
    pub to_lat: f64,
    pub to_lng: f64,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_transit_plan(input: TransitInput) -> Result<serde_json::Value, String> {
    let plan = scribe_apis::transit_plan(
        &input.instance,
        input.from_lat,
        input.from_lng,
        input.to_lat,
        input.to_lng,
        input.limit.unwrap_or(3) as usize,
    )
    .map_err(map_err)?;
    serde_json::to_value(plan).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarcodeInput {
    pub barcode: String,
}

#[tauri::command]
pub fn apis_food_product(input: BarcodeInput) -> Result<serde_json::Value, String> {
    let product = scribe_apis::off_product(&input.barcode).map_err(map_err)?;
    serde_json::to_value(product).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apis_food_search(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits =
        scribe_apis::off_search(&input.query, input.limit.unwrap_or(8) as usize).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apis_inaturalist_taxa(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits = scribe_apis::inaturalist_taxa(&input.query, input.limit.unwrap_or(8) as usize)
        .map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NearbyInput {
    pub lat: f64,
    pub lng: f64,
    pub radius_km: Option<f64>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_inaturalist_nearby(input: NearbyInput) -> Result<serde_json::Value, String> {
    let hits = scribe_apis::inaturalist_nearby(
        input.lat,
        input.lng,
        input.radius_km.unwrap_or(5.0),
        input.limit.unwrap_or(10) as usize,
    )
    .map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverpassInput {
    pub lat: f64,
    pub lng: f64,
    pub radius_m: Option<u32>,
    pub amenities: Option<Vec<String>>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn apis_overpass_pois(input: OverpassInput) -> Result<serde_json::Value, String> {
    let amenities = input.amenities.unwrap_or_default();
    let hits = scribe_apis::overpass_pois(
        input.lat,
        input.lng,
        input.radius_m.unwrap_or(800),
        &amenities,
        input.limit.unwrap_or(20) as usize,
    )
    .map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SunInput {
    pub lat: f64,
    pub lng: f64,
    pub date: Option<String>,
}

#[tauri::command]
pub fn apis_sun_times(input: SunInput) -> Result<serde_json::Value, String> {
    let times =
        scribe_apis::sun_times(input.lat, input.lng, input.date.as_deref()).map_err(map_err)?;
    serde_json::to_value(times).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apis_tide_stations(input: QueryLimitInput) -> Result<serde_json::Value, String> {
    let hits =
        scribe_apis::tide_stations(&input.query, input.limit.unwrap_or(10) as usize).map_err(map_err)?;
    serde_json::to_value(hits).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TideInput {
    pub station_id: String,
    pub date: Option<String>,
}

#[tauri::command]
pub fn apis_tide_predictions(input: TideInput) -> Result<serde_json::Value, String> {
    let forecast =
        scribe_apis::tide_predictions(&input.station_id, input.date.as_deref()).map_err(map_err)?;
    serde_json::to_value(forecast).map_err(|e| e.to_string())
}
