//! OpenTripPlanner / GraphQL plan (user-provided instance).

use crate::error::{ApiError, ApiResult};
use crate::http::USER_AGENT;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitLeg {
    pub mode: String,
    pub from_name: String,
    pub to_name: String,
    pub duration_sec: Option<i64>,
    pub route_short_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitItinerary {
    pub duration_sec: Option<i64>,
    pub walk_distance_m: Option<f64>,
    pub legs: Vec<TransitLeg>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitPlan {
    pub instance: String,
    pub itineraries: Vec<TransitItinerary>,
}

fn normalize_instance(base: &str) -> ApiResult<String> {
    let base = base.trim().trim_end_matches('/');
    if !(base.starts_with("https://") || base.starts_with("http://")) {
        return Err(ApiError::invalid("OTP instance must be http(s) URL"));
    }
    Ok(base.to_string())
}

pub fn plan_trip(
    instance: &str,
    from_lat: f64,
    from_lng: f64,
    to_lat: f64,
    to_lng: f64,
    limit: usize,
) -> ApiResult<TransitPlan> {
    let instance = normalize_instance(instance)?;
    let limit = limit.clamp(1, 5);
    let query = r#"
      query Plan($from: InputCoordinates!, $to: InputCoordinates!, $num: Int!) {
        plan(from: $from, to: $to, numItineraries: $num) {
          itineraries {
            duration
            walkDistance
            legs {
              mode
              duration
              route { shortName }
              from { name }
              to { name }
            }
          }
        }
      }
    "#;
    let body = json!({
        "query": query,
        "variables": {
            "from": { "lat": from_lat, "lon": from_lng },
            "to": { "lat": to_lat, "lon": to_lng },
            "num": limit as i64
        }
    });
    let endpoint = if instance.ends_with("/otp/routers/default/index/graphql")
        || instance.contains("/graphql")
    {
        instance.clone()
    } else {
        format!("{instance}/otp/routers/default/index/graphql")
    };
    let response = ureq::post(&endpoint)
        .set("User-Agent", USER_AGENT)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(20))
        .send_json(body)
        .map_err(|err| ApiError::network(err.to_string()))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|err| ApiError::parse(err.to_string()))?;
    if let Some(errors) = value.get("errors") {
        return Err(ApiError::network(format!("OTP GraphQL errors: {errors}")));
    }
    let itineraries = value
        .pointer("/data/plan/itineraries")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|it| {
            let legs = it
                .get("legs")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|leg| TransitLeg {
                    mode: leg
                        .get("mode")
                        .and_then(|v| v.as_str())
                        .unwrap_or("WALK")
                        .to_string(),
                    from_name: leg
                        .pointer("/from/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    to_name: leg
                        .pointer("/to/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    duration_sec: leg.get("duration").and_then(|v| v.as_i64()),
                    route_short_name: leg
                        .pointer("/route/shortName")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                })
                .collect();
            TransitItinerary {
                duration_sec: it.get("duration").and_then(|v| v.as_i64()),
                walk_distance_m: it.get("walkDistance").and_then(|v| v.as_f64()),
                legs,
            }
        })
        .collect();
    Ok(TransitPlan {
        instance,
        itineraries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_instance() {
        assert!(plan_trip("not-url", 0.0, 0.0, 1.0, 1.0, 1).is_err());
    }
}
