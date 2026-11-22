//! Open Food Facts product lookup (barcode or search).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoodProduct {
    pub code: String,
    pub name: String,
    pub brands: Option<String>,
    pub quantity: Option<String>,
    pub nutriscore: Option<String>,
    pub nova_group: Option<i64>,
    pub image_url: Option<String>,
    pub url: String,
    pub energy_kcal_100g: Option<f64>,
    pub proteins_100g: Option<f64>,
    pub carbohydrates_100g: Option<f64>,
    pub fat_100g: Option<f64>,
}

fn map_product(code: &str, product: &Value) -> Option<FoodProduct> {
    let name = product
        .get("product_name")
        .or_else(|| product.get("product_name_en"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())?
        .to_string();
    let nutriments = product.get("nutriments");
    Some(FoodProduct {
        code: code.to_string(),
        name,
        brands: product
            .get("brands")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        quantity: product
            .get("quantity")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        nutriscore: product
            .get("nutriscore_grade")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        nova_group: product.get("nova_group").and_then(|v| v.as_i64()),
        image_url: product
            .get("image_front_small_url")
            .or_else(|| product.get("image_url"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        url: format!("https://world.openfoodfacts.org/product/{code}"),
        energy_kcal_100g: nutriments
            .and_then(|n| n.get("energy-kcal_100g"))
            .and_then(|v| v.as_f64()),
        proteins_100g: nutriments
            .and_then(|n| n.get("proteins_100g"))
            .and_then(|v| v.as_f64()),
        carbohydrates_100g: nutriments
            .and_then(|n| n.get("carbohydrates_100g"))
            .and_then(|v| v.as_f64()),
        fat_100g: nutriments
            .and_then(|n| n.get("fat_100g"))
            .and_then(|v| v.as_f64()),
    })
}

pub fn product_by_barcode(barcode: &str) -> ApiResult<FoodProduct> {
    let code = barcode.trim();
    if code.len() < 8 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::invalid("barcode must be numeric (8–14 digits)"));
    }
    let url = format!("https://world.openfoodfacts.org/api/v2/product/{code}.json");
    let raw: Value = get_json(&url)?;
    let status = raw.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
    if status != 1 {
        return Err(ApiError::not_found("product not found"));
    }
    let product = raw
        .get("product")
        .ok_or_else(|| ApiError::not_found("product not found"))?;
    map_product(code, product).ok_or_else(|| ApiError::not_found("product missing name"))
}

pub fn search_products(query: &str, limit: usize) -> ApiResult<Vec<FoodProduct>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "https://world.openfoodfacts.org/cgi/search.pl?search_terms={}&search_simple=1&action=process&json=1&page_size={limit}",
        urlencoding::encode(q)
    );
    let raw: Value = get_json(&url)?;
    let products = raw
        .get("products")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(products
        .iter()
        .filter_map(|p| {
            let code = p.get("code").and_then(|v| v.as_str()).unwrap_or("");
            if code.is_empty() {
                return None;
            }
            map_product(code, p)
        })
        .take(limit)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_barcode() {
        assert!(product_by_barcode("abc").is_err());
    }

    #[test]
    fn rejects_short_query() {
        assert!(search_products("a", 3).is_err());
    }
}
