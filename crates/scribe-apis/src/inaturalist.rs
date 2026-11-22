//! iNaturalist taxa / nearby observations.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NatureTaxon {
    pub id: i64,
    pub name: String,
    pub preferred_common_name: Option<String>,
    pub rank: Option<String>,
    pub wikipedia_url: Option<String>,
    pub default_photo_url: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NatureObservation {
    pub id: i64,
    pub species_guess: Option<String>,
    pub taxon: Option<NatureTaxon>,
    pub observed_on: Option<String>,
    pub place_guess: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub url: String,
    pub photo_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TaxaResponse {
    results: Option<Vec<TaxonRaw>>,
}

#[derive(Debug, Deserialize)]
struct TaxonRaw {
    id: Option<i64>,
    name: Option<String>,
    preferred_common_name: Option<String>,
    rank: Option<String>,
    wikipedia_url: Option<String>,
    default_photo: Option<PhotoRaw>,
}

#[derive(Debug, Deserialize)]
struct PhotoRaw {
    medium_url: Option<String>,
    url: Option<String>,
    square_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ObsResponse {
    results: Option<Vec<ObsRaw>>,
}

#[derive(Debug, Deserialize)]
struct ObsRaw {
    id: Option<i64>,
    species_guess: Option<String>,
    observed_on: Option<String>,
    place_guess: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    uri: Option<String>,
    taxon: Option<TaxonRaw>,
    photos: Option<Vec<PhotoRaw>>,
}

fn map_taxon(t: TaxonRaw) -> Option<NatureTaxon> {
    let id = t.id?;
    let name = t.name?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    Some(NatureTaxon {
        id,
        name,
        preferred_common_name: t.preferred_common_name,
        rank: t.rank,
        wikipedia_url: t.wikipedia_url,
        default_photo_url: t.default_photo.and_then(|p| {
            p.medium_url.or(p.url).or(p.square_url)
        }),
        url: format!("https://www.inaturalist.org/taxa/{id}"),
    })
}

pub fn search_taxa(query: &str, limit: usize) -> ApiResult<Vec<NatureTaxon>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "https://api.inaturalist.org/v1/taxa?per_page={limit}&q={}",
        urlencoding::encode(q)
    );
    let raw: TaxaResponse = get_json(&url)?;
    Ok(raw
        .results
        .unwrap_or_default()
        .into_iter()
        .filter_map(map_taxon)
        .collect())
}

pub fn nearby_observations(
    lat: f64,
    lng: f64,
    radius_km: f64,
    limit: usize,
) -> ApiResult<Vec<NatureObservation>> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err(ApiError::invalid("invalid coordinates"));
    }
    let radius = radius_km.clamp(0.5, 50.0);
    let limit = limit.clamp(1, 20);
    let url = format!(
        "https://api.inaturalist.org/v1/observations?lat={lat}&lng={lng}&radius={radius}&per_page={limit}&order=desc&order_by=observed_on"
    );
    let raw: ObsResponse = get_json(&url)?;
    Ok(raw
        .results
        .unwrap_or_default()
        .into_iter()
        .filter_map(|o| {
            let id = o.id?;
            Some(NatureObservation {
                id,
                species_guess: o.species_guess,
                taxon: o.taxon.and_then(map_taxon),
                observed_on: o.observed_on,
                place_guess: o.place_guess,
                latitude: o.latitude,
                longitude: o.longitude,
                url: o
                    .uri
                    .unwrap_or_else(|| format!("https://www.inaturalist.org/observations/{id}")),
                photo_url: o.photos.and_then(|photos| {
                    photos.into_iter().next().and_then(|p| {
                        p.medium_url.or(p.url).or(p.square_url)
                    })
                }),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_taxa("x", 3).is_err());
    }

    #[test]
    fn rejects_bad_coords() {
        assert!(nearby_observations(999.0, 0.0, 5.0, 3).is_err());
    }
}
