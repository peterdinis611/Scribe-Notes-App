//! Map block spec: defaults + parsing (`src/lib/editor/map.ts`).
//! Accepts JSON, `geo:` URIs, and OpenStreetMap URLs.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const MAP_DEFAULT_SOURCE: &str = r#"{
  "title": "Bratislava",
  "lat": 48.1486,
  "lng": 17.1077,
  "zoom": 13,
  "markers": [
    { "lat": 48.1486, "lng": 17.1077, "label": "Bratislava" }
  ]
}"#;

const DEFAULT_ZOOM: f64 = 13.0;
const GEO_DEFAULT_ZOOM: f64 = 14.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapMarker {
    pub lat: f64,
    pub lng: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapSpec {
    pub lat: f64,
    pub lng: f64,
    pub zoom: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub markers: Vec<MapMarker>,
}

/// `Err` carries the user-facing message (FE `{ ok: false, error }`).
pub type MapParseResult = Result<MapSpec, String>;

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

/// JS `asNumber`: finite numbers, or non-blank numeric strings.
fn as_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64().filter(|f| f.is_finite()),
        Value::String(s) => parse_str_number(s),
        _ => None,
    }
}

fn parse_str_number(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<f64>().ok().filter(|f| f.is_finite())
}

/// First present, non-null value among `keys` (JS `a ?? b ?? c`).
fn nullish<'a>(obj: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().filter_map(|k| obj.get(*k)).find(|v| !v.is_null())
}

fn parse_lat_lng(lat: Option<f64>, lng: Option<f64>) -> Option<(f64, f64)> {
    let (lat, lng) = (lat?, lng?);
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return None;
    }
    Some((lat, lng))
}

fn lat_lng_from_record(obj: &Map<String, Value>) -> Option<(f64, f64)> {
    parse_lat_lng(
        nullish(obj, &["lat", "latitude"]).and_then(as_number),
        nullish(obj, &["lng", "lon", "longitude"]).and_then(as_number),
    )
}

fn parse_center(value: &Value) -> Option<(f64, f64)> {
    match value {
        Value::Array(items) if items.len() >= 2 => {
            parse_lat_lng(as_number(&items[0]), as_number(&items[1]))
        }
        Value::Object(obj) => lat_lng_from_record(obj),
        _ => None,
    }
}

fn parse_marker(value: &Value) -> Option<MapMarker> {
    let obj = value.as_object()?;
    let (lat, lng) = obj
        .get("position")
        .and_then(parse_center)
        .or_else(|| lat_lng_from_record(obj))?;
    let label = match (obj.get("label"), obj.get("title")) {
        (Some(Value::String(s)), _) => s.trim().to_string(),
        (_, Some(Value::String(s))) => s.trim().to_string(),
        _ => String::new(),
    };
    Some(MapMarker { lat, lng, label: if label.is_empty() { None } else { Some(label) } })
}

pub fn parse_map_spec(source: &str) -> MapParseResult {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Err("Empty map spec".into());
    }
    if let Some(spec) = spec_from_map_url(trimmed) {
        return Ok(spec);
    }

    let raw: Value = serde_json::from_str(trimmed)
        .map_err(|_| "Map spec must be valid JSON or an OpenStreetMap URL".to_string())?;
    let obj = raw.as_object().ok_or_else(|| "Map spec must be a JSON object".to_string())?;

    let (lat, lng) = obj
        .get("center")
        .and_then(parse_center)
        .or_else(|| lat_lng_from_record(obj))
        .ok_or_else(|| "Map needs lat/lng or center: [lat, lng]".to_string())?;

    let markers = obj
        .get("markers")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_marker).collect())
        .unwrap_or_default();

    Ok(MapSpec {
        lat,
        lng,
        zoom: clamp(obj.get("zoom").and_then(as_number).unwrap_or(DEFAULT_ZOOM), 1.0, 19.0),
        title: obj.get("title").and_then(Value::as_str).map(|s| s.trim().to_string()),
        markers,
    })
}

// --- URL parsing (no `url` crate dependency) -------------------------------------------------

/// Scan `-?\d+(\.\d+)?` at the start of `s`; returns (token, rest).
fn scan_number(s: &str) -> Option<(&str, &str)> {
    let b = s.as_bytes();
    let mut i = 0;
    if b.first() == Some(&b'-') {
        i += 1;
    }
    let int_start = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    if i == int_start {
        return None;
    }
    if b.get(i) == Some(&b'.') {
        let mut j = i + 1;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        if j > i + 1 {
            i = j;
        }
    }
    Some((&s[..i], &s[i..]))
}

fn scan_digits(s: &str) -> Option<(&str, &str)> {
    let n = s.bytes().take_while(u8::is_ascii_digit).count();
    if n == 0 { None } else { Some((&s[..n], &s[n..])) }
}

/// `^geo:(lat),(lng)(?:\?z=(\d+))?` (case-insensitive prefix).
fn parse_geo(value: &str) -> Option<MapSpec> {
    if value.len() < 4 || !value.is_char_boundary(4) || !value[..4].eq_ignore_ascii_case("geo:") {
        return None;
    }
    let (lat_s, rest) = scan_number(&value[4..])?;
    let rest = rest.strip_prefix(',')?;
    let (lng_s, rest) = scan_number(rest)?;
    let zoom_s = rest.strip_prefix("?z=").and_then(scan_digits).map(|(d, _)| d);

    let (lat, lng) = parse_lat_lng(parse_str_number(lat_s), parse_str_number(lng_s))?;
    Some(MapSpec {
        lat,
        lng,
        zoom: clamp(zoom_s.and_then(parse_str_number).unwrap_or(GEO_DEFAULT_ZOOM), 1.0, 19.0),
        title: None,
        markers: vec![MapMarker { lat, lng, label: None }],
    })
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => match s.get(i + 1..i + 3).map(|h| u8::from_str_radix(h, 16)) {
                Some(Ok(v)) => {
                    out.push(v);
                    i += 2;
                }
                _ => out.push(b'%'),
            },
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `URLSearchParams.get` — first value for `key`.
fn query_get(query: &str, key: &str) -> Option<String> {
    query.split('&').filter(|p| !p.is_empty()).find_map(|pair| {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        (percent_decode(k) == key).then(|| percent_decode(v))
    })
}

/// Search for `map=<z>/<lat>/<lng>` anywhere in `hash`.
fn find_map_fragment(hash: &str) -> Option<(&str, &str, &str)> {
    hash.match_indices("map=").find_map(|(i, m)| {
        let rest = &hash[i + m.len()..];
        let (z, rest) = scan_digits(rest)?;
        let rest = rest.strip_prefix('/')?;
        let (lat, rest) = scan_number(rest)?;
        let rest = rest.strip_prefix('/')?;
        let (lng, _) = scan_number(rest)?;
        Some((z, lat, lng))
    })
}

fn is_osm_host(host: &str) -> bool {
    host == "openstreetmap.org" || host == "osm.org" || host.ends_with(".openstreetmap.org")
}

/// Split `scheme://authority/path?query#hash` → (host, query, hash). Host is lowercased, `www.` stripped.
fn split_url(value: &str) -> Option<(String, &str, &str)> {
    let (scheme, rest) = value.split_once("://")?;
    if scheme.is_empty() || !scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)) {
        return None;
    }
    let (before_hash, hash) = rest.split_once('#').unwrap_or((rest, ""));
    let (before_query, query) = before_hash.split_once('?').unwrap_or((before_hash, ""));
    let authority = before_query.split('/').next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or("");
    let host = match host_port.rsplit_once(':') {
        Some((h, port)) if port.chars().all(|c| c.is_ascii_digit()) => h,
        _ => host_port,
    };
    let host = host.to_lowercase();
    let host = host.strip_prefix("www.").map(str::to_string).unwrap_or(host);
    if host.is_empty() {
        return None;
    }
    Some((host, query, hash))
}

pub fn spec_from_map_url(value: &str) -> Option<MapSpec> {
    let trimmed = value.trim();
    if let Some(spec) = parse_geo(trimmed) {
        return Some(spec);
    }

    let (host, query, hash) = split_url(trimmed)?;
    if !is_osm_host(&host) {
        return None;
    }

    // Hash params are only used for `key=value` hashes that are not the `map=` fragment.
    let hash_params = if hash.contains('=') && !hash.starts_with("map=") { hash } else { "" };
    let map_match = find_map_fragment(hash);

    let num = |s: Option<String>| s.as_deref().and_then(parse_str_number);
    let mlat = num(query_get(query, "mlat")).or_else(|| num(query_get(hash_params, "mlat")));
    let mlon = num(query_get(query, "mlon")).or_else(|| num(query_get(hash_params, "mlon")));

    let zoom = map_match
        .and_then(|m| parse_str_number(m.0))
        .or_else(|| num(query_get(query, "zoom")))
        .unwrap_or(DEFAULT_ZOOM);
    let lat = map_match.and_then(|m| parse_str_number(m.1)).or(mlat);
    let lng = map_match.and_then(|m| parse_str_number(m.2)).or(mlon);
    let (lat, lng) = parse_lat_lng(lat, lng)?;

    let marker = parse_lat_lng(mlat, mlon).unwrap_or((lat, lng));
    Some(MapSpec {
        lat,
        lng,
        zoom: clamp(zoom, 1.0, 19.0),
        title: None,
        markers: vec![MapMarker { lat: marker.0, lng: marker.1, label: None }],
    })
}

pub fn is_map_url(value: &str) -> bool {
    spec_from_map_url(value).is_some()
}

pub fn map_preview_label(source: &str) -> String {
    let Ok(spec) = parse_map_spec(source) else {
        return "Map".into();
    };
    if let Some(title) = spec.title.as_deref().filter(|t| !t.is_empty()) {
        return title.to_string();
    }
    if let Some(label) = spec.markers.first().and_then(|m| m.label.as_deref()).filter(|l| !l.is_empty()) {
        return label.to_string();
    }
    format!("{:.3}, {:.3}", spec.lat, spec.lng)
}

pub fn map_osm_href(spec: &MapSpec) -> String {
    let hash = format!("#map={}/{}/{}", spec.zoom, spec.lat, spec.lng);
    match spec.markers.first() {
        None => format!("https://www.openstreetmap.org/{hash}"),
        Some(m) => format!("https://www.openstreetmap.org/?mlat={}&mlon={}{hash}", m.lat, m.lng),
    }
}

/// `application/x-www-form-urlencoded` byte set (matches `URLSearchParams.toString`).
fn form_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'*' | b'-' | b'.' | b'_' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn map_embed_href(spec: &MapSpec) -> String {
    let span = 180.0 / 2f64.powf(spec.zoom);
    let south = clamp(spec.lat - span, -90.0, 90.0);
    let north = clamp(spec.lat + span, -90.0, 90.0);
    let west = clamp(spec.lng - span, -180.0, 180.0);
    let east = clamp(spec.lng + span, -180.0, 180.0);
    let mut query = format!(
        "bbox={}&layer=mapnik",
        form_encode(&format!("{west},{south},{east},{north}"))
    );
    if let Some(m) = spec.markers.first() {
        query.push_str(&format!("&marker={}", form_encode(&format!("{},{}", m.lat, m.lng))));
    }
    format!("https://www.openstreetmap.org/export/embed.html?{query}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_source_parses() {
        let spec = parse_map_spec(MAP_DEFAULT_SOURCE).unwrap();
        assert_eq!(spec.title.as_deref(), Some("Bratislava"));
        assert_eq!((spec.lat, spec.lng, spec.zoom), (48.1486, 17.1077, 13.0));
        assert_eq!(spec.markers.len(), 1);
        assert_eq!(spec.markers[0].label.as_deref(), Some("Bratislava"));
        assert_eq!(map_preview_label(MAP_DEFAULT_SOURCE), "Bratislava");
    }

    #[test]
    fn errors() {
        assert_eq!(parse_map_spec("  ").unwrap_err(), "Empty map spec");
        assert_eq!(parse_map_spec("nope").unwrap_err(), "Map spec must be valid JSON or an OpenStreetMap URL");
        assert_eq!(parse_map_spec("[1,2]").unwrap_err(), "Map spec must be a JSON object");
        assert_eq!(parse_map_spec("{}").unwrap_err(), "Map needs lat/lng or center: [lat, lng]");
        assert!(parse_map_spec(r#"{"lat":91,"lng":0}"#).is_err());
        assert_eq!(map_preview_label("nope"), "Map");
    }

    #[test]
    fn center_variants_and_clamp() {
        let a = parse_map_spec(r#"{"center":[10,20],"zoom":99}"#).unwrap();
        assert_eq!((a.lat, a.lng, a.zoom), (10.0, 20.0, 19.0));
        let b = parse_map_spec(r#"{"center":{"latitude":"1.5","lon":"2"},"zoom":"0"}"#).unwrap();
        assert_eq!((b.lat, b.lng, b.zoom), (1.5, 2.0, 1.0));
        let c = parse_map_spec(r#"{"latitude":0,"longitude":0}"#).unwrap();
        assert_eq!((c.lat, c.lng, c.zoom), (0.0, 0.0, 13.0));
        assert_eq!(map_preview_label(r#"{"lat":1,"lng":2}"#), "1.000, 2.000");
    }

    #[test]
    fn markers_parse() {
        let spec = parse_map_spec(
            r#"{"lat":0,"lng":0,"markers":[
                {"position":[1,2],"title":" T "},
                {"latitude":3,"longitude":4,"label":""},
                {"lat":999,"lng":0},
                "bad"
            ]}"#,
        )
        .unwrap();
        assert_eq!(spec.markers.len(), 2);
        assert_eq!(spec.markers[0], MapMarker { lat: 1.0, lng: 2.0, label: Some("T".into()) });
        assert_eq!(spec.markers[1].label, None);
        assert_eq!(map_preview_label(r#"{"lat":0,"lng":0,"markers":[{"lat":1,"lng":1,"label":"Pin"}]}"#), "Pin");
    }

    #[test]
    fn geo_uri() {
        let spec = parse_map_spec("geo:48.1,17.1?z=10").unwrap();
        assert_eq!((spec.lat, spec.lng, spec.zoom), (48.1, 17.1, 10.0));
        assert_eq!(spec.markers.len(), 1);
        assert_eq!(parse_map_spec("GEO:-1,2").unwrap().zoom, 14.0);
        assert!(is_map_url("geo:1,2"));
        assert!(!is_map_url("geo:200,2"));
    }

    #[test]
    fn osm_urls() {
        let spec = spec_from_map_url("https://www.openstreetmap.org/#map=15/48.15/17.11").unwrap();
        assert_eq!((spec.lat, spec.lng, spec.zoom), (48.15, 17.11, 15.0));
        assert_eq!(spec.markers[0].lat, 48.15);

        let marked =
            spec_from_map_url("https://openstreetmap.org/?mlat=48&mlon=17#map=12/48.1/17.1").unwrap();
        assert_eq!((marked.markers[0].lat, marked.markers[0].lng), (48.0, 17.0));
        assert_eq!(marked.zoom, 12.0);

        let only_marker = spec_from_map_url("https://osm.org/?mlat=1&mlon=2&zoom=5").unwrap();
        assert_eq!((only_marker.lat, only_marker.lng, only_marker.zoom), (1.0, 2.0, 5.0));

        assert!(spec_from_map_url("https://sub.openstreetmap.org/#map=3/1/2").is_some());
        assert!(spec_from_map_url("https://example.com/#map=3/1/2").is_none());
        assert!(spec_from_map_url("https://evilopenstreetmap.org/#map=3/1/2").is_none());
        assert!(spec_from_map_url("https://www.openstreetmap.org/").is_none());
        assert!(spec_from_map_url("not a url").is_none());
    }

    #[test]
    fn hrefs() {
        let spec = parse_map_spec("geo:48,17?z=1").unwrap();
        assert_eq!(map_osm_href(&spec), "https://www.openstreetmap.org/?mlat=48&mlon=17#map=1/48/17");
        let bare = MapSpec { lat: 1.0, lng: 2.0, zoom: 3.0, title: None, markers: vec![] };
        assert_eq!(map_osm_href(&bare), "https://www.openstreetmap.org/#map=3/1/2");
        let embed = map_embed_href(&parse_map_spec("geo:0,0?z=1").unwrap());
        assert_eq!(
            embed,
            "https://www.openstreetmap.org/export/embed.html?bbox=-90%2C-90%2C90%2C90&layer=mapnik&marker=0%2C0"
        );
    }

    #[test]
    fn serializes_camel_case() {
        let spec = parse_map_spec(MAP_DEFAULT_SOURCE).unwrap();
        let json = serde_json::to_value(&spec).unwrap();
        assert_eq!(json["title"], "Bratislava");
        assert!(serde_json::to_value(MapMarker { lat: 0.0, lng: 0.0, label: None }).unwrap().get("label").is_none());
    }
}
