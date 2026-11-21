//! Opt-in free public API clients for Scribe.
//!
//! All network calls are user-triggered (geocode, weather, wiki, research, FX, …).
//! No background telemetry. Clients send a descriptive `User-Agent`.

mod crossref;
mod duckduckgo;
mod error;
mod exchange_rate;
mod frankfurter;
mod http;
mod inaturalist;
mod musicbrainz;
mod nominatim;
mod open_food_facts;
mod open_library;
mod open_meteo;
mod openverse;
mod overpass;
mod pubmed;
mod rest_countries;
mod searx;
mod semantic_scholar;
mod sunrise_sunset;
mod tides;
mod timezone;
mod transit;
mod wayback;
mod wikidata;
mod wikipedia;

pub use crossref::{search_works as crossref_search, CrossrefWork};
pub use duckduckgo::{instant_answer, InstantAnswer, InstantRelated};
pub use error::{ApiError, ApiResult};
pub use exchange_rate::{
    convert_with_fallback as fx_convert_fallback, ecb_eur_latest, latest_with_fallback as fx_latest_fallback,
    open_er_api_latest,
};
pub use frankfurter::{convert as fx_convert, latest_rates as fx_latest, FxRates};
pub use http::USER_AGENT;
pub use inaturalist::{
    nearby_observations as inaturalist_nearby, search_taxa as inaturalist_taxa, NatureObservation,
    NatureTaxon,
};
pub use musicbrainz::{
    cover_art as musicbrainz_cover, search_releases as musicbrainz_search, MusicRelease,
};
pub use nominatim::{geocode, GeocodeHit};
pub use open_food_facts::{
    product_by_barcode as off_product, search_products as off_search, FoodProduct,
};
pub use open_library::{search_books as open_library_search, BookHit};
pub use open_meteo::{forecast as weather_forecast, weather_label, WeatherDay, WeatherSnapshot};
pub use openverse::{search_images as openverse_search, LicensedImage};
pub use overpass::{nearby_pois as overpass_pois, OverpassPoi};
pub use pubmed::{search_pubmed as pubmed_search, PubmedArticle};
pub use rest_countries::{lookup_country, CountryInfo};
pub use searx::{search as searx_search, WebSearchHit, WebSearchResult};
pub use semantic_scholar::{search_papers as semantic_scholar_search, ScholarPaper};
pub use sunrise_sunset::{sun_times, SunTimes};
pub use tides::{find_stations as tide_stations, tide_predictions, TideForecast, TidePrediction, TideStation};
pub use timezone::{timezone_now, TimezoneInfo};
pub use transit::{plan_trip as transit_plan, TransitItinerary, TransitLeg, TransitPlan};
pub use wayback::{wayback_closest, WaybackSnapshot};
pub use wikidata::{entity as wikidata_entity, WikidataEntity};
pub use wikipedia::{summary as wikipedia_summary, WikipediaSummary};
