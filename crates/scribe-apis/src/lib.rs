//! Opt-in free public API clients for Scribe.
//!
//! All network calls are user-triggered (geocode, weather, wiki, research, FX, …).
//! No background telemetry. Clients send a descriptive `User-Agent`.

mod arxiv;
mod crossref;
mod datamuse;
mod dictionary;
mod duckduckgo;
mod error;
mod europeana;
mod exchange_rate;
mod frankfurter;
mod freesound;
mod http;
mod inaturalist;
mod languagetool;
mod libretranslate;
mod mealdb;
mod met_museum;
mod musicbrainz;
mod nager;
mod nominatim;
mod oembed;
mod open_food_facts;
mod open_library;
mod open_meteo;
mod openalex;
mod opencitations;
mod openverse;
mod osrm;
mod overpass;
mod photon;
mod podcasts;
mod pubmed;
mod quotable;
mod rest_countries;
mod rijksmuseum;
mod searx;
mod semantic_scholar;
mod sunrise_sunset;
mod tides;
mod timezone;
mod transit;
mod unpaywall;
mod vatcomply;
mod vies;
mod wayback;
mod wikidata;
mod wikipedia;

pub use arxiv::{search_papers as arxiv_search, ArxivPaper};
pub use crossref::{search_works as crossref_search, CrossrefWork};
pub use datamuse::{
    means_like as datamuse_means_like, suggest as datamuse_suggest, synonyms as datamuse_synonyms,
    WordSuggestion,
};
pub use dictionary::{lookup_word as dictionary_lookup, DictionaryEntry, DictionarySense};
pub use duckduckgo::{instant_answer, InstantAnswer, InstantRelated};
pub use error::{ApiError, ApiResult};
pub use europeana::search_images as europeana_search;
pub use exchange_rate::{
    convert_with_fallback as fx_convert_fallback, ecb_eur_latest,
    latest_with_fallback as fx_latest_fallback, open_er_api_latest,
};
pub use frankfurter::{convert as fx_convert, latest_rates as fx_latest, FxRates};
pub use freesound::{search_sounds as freesound_search, SoundClip};
pub use http::USER_AGENT;
pub use inaturalist::{
    nearby_observations as inaturalist_nearby, search_taxa as inaturalist_taxa, NatureObservation,
    NatureTaxon,
};
pub use languagetool::{check as languagetool_check, GrammarCheck, GrammarMatch};
pub use libretranslate::{translate as libretranslate_translate, Translation, DEFAULT_INSTANCE as LIBRETRANSLATE_DEFAULT_INSTANCE};
pub use mealdb::{
    meal_by_id as mealdb_by_id, random_meal as mealdb_random, search_meals as mealdb_search,
    MealRecipe,
};
pub use met_museum::{
    object_by_id as met_object, search_objects as met_search, MetObject,
};
pub use musicbrainz::{
    cover_art as musicbrainz_cover, search_releases as musicbrainz_search, MusicRelease,
};
pub use nager::{
    is_today_holiday as nager_today, public_holidays as nager_holidays, PublicHoliday,
};
pub use nominatim::{geocode, GeocodeHit};
pub use oembed::{resolve as oembed_resolve, OEmbedInfo};
pub use open_food_facts::{
    product_by_barcode as off_product, search_products as off_search, FoodProduct,
};
pub use open_library::{search_books as open_library_search, BookHit};
pub use open_meteo::{
    air_quality as weather_air_quality, aqi_label, forecast as weather_forecast, weather_label,
    AirQualitySnapshot, WeatherDay, WeatherSnapshot,
};
pub use openalex::{search_works as openalex_search, OpenAlexWork};
pub use opencitations::{citations_for_doi as opencitations_doi, CitationBundle, CitationLink};
pub use openverse::{search_images as openverse_search, LicensedImage};
pub use osrm::{route as osrm_route, RouteEta};
pub use overpass::{nearby_pois as overpass_pois, OverpassPoi};
pub use photon::geocode as photon_geocode;
pub use podcasts::{search_podcasts as podcasts_search, PodcastShow};
pub use pubmed::{search_pubmed as pubmed_search, PubmedArticle};
pub use quotable::{random_quote as quotable_random, Quote};
pub use rest_countries::{lookup_country, CountryInfo};
pub use rijksmuseum::search_images as rijksmuseum_search;
pub use searx::{search as searx_search, WebSearchHit, WebSearchResult};
pub use semantic_scholar::{search_papers as semantic_scholar_search, ScholarPaper};
pub use sunrise_sunset::{sun_times, SunTimes};
pub use tides::{
    find_stations as tide_stations, tide_predictions, TideForecast, TidePrediction, TideStation,
};
pub use timezone::{timezone_now, TimezoneInfo};
pub use transit::{plan_trip as transit_plan, TransitItinerary, TransitLeg, TransitPlan};
pub use unpaywall::{lookup_doi as unpaywall_doi, UnpaywallResult};
pub use vatcomply::{
    check_vat_number as vatcomply_check, vat_rate as vatcomply_rate, VatNumberInfo, VatRateInfo,
};
pub use vies::{check_vat as vies_check, VatCheck};
pub use wayback::{wayback_closest, WaybackSnapshot};
pub use wikidata::{entity as wikidata_entity, WikidataEntity};
pub use wikipedia::{summary as wikipedia_summary, WikipediaSummary};
