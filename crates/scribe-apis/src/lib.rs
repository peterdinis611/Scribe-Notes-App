//! Opt-in free public API clients for Scribe.
//!
//! All network calls are user-triggered (geocode, weather, wiki, research, FX, …).
//! No background telemetry. Clients send a descriptive `User-Agent`.

mod crossref;
mod duckduckgo;
mod error;
mod frankfurter;
mod http;
mod nominatim;
mod open_library;
mod open_meteo;
mod rest_countries;
mod searx;
mod timezone;
mod wikidata;
mod wikipedia;

pub use crossref::{search_works as crossref_search, CrossrefWork};
pub use duckduckgo::{instant_answer, InstantAnswer, InstantRelated};
pub use error::{ApiError, ApiResult};
pub use frankfurter::{convert as fx_convert, latest_rates as fx_latest, FxRates};
pub use http::USER_AGENT;
pub use nominatim::{geocode, GeocodeHit};
pub use open_library::{search_books as open_library_search, BookHit};
pub use open_meteo::{forecast as weather_forecast, weather_label, WeatherDay, WeatherSnapshot};
pub use rest_countries::{lookup_country, CountryInfo};
pub use searx::{search as searx_search, WebSearchHit, WebSearchResult};
pub use timezone::{timezone_now, TimezoneInfo};
pub use wikidata::{entity as wikidata_entity, WikidataEntity};
pub use wikipedia::{summary as wikipedia_summary, WikipediaSummary};
