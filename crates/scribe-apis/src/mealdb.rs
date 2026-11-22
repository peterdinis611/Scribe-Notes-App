//! TheMealDB — free recipe / dish search (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MealRecipe {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub area: Option<String>,
    pub instructions: Option<String>,
    pub thumbnail: Option<String>,
    pub youtube: Option<String>,
    pub source: Option<String>,
    pub ingredients: Vec<String>,
    pub tags: Vec<String>,
}

fn map_meal(m: &Value) -> Option<MealRecipe> {
    let id = m.get("idMeal")?.as_str()?.to_string();
    let name = m.get("strMeal")?.as_str()?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let mut ingredients = Vec::new();
    for i in 1..=20 {
        let ing = m
            .get(format!("strIngredient{i}"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let measure = m
            .get(format!("strMeasure{i}"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("");
        if let Some(ing) = ing {
            if measure.is_empty() {
                ingredients.push(ing.to_string());
            } else {
                ingredients.push(format!("{measure} {ing}"));
            }
        }
    }
    let tags = m
        .get("strTags")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    Some(MealRecipe {
        id,
        name,
        category: m
            .get("strCategory")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        area: m.get("strArea").and_then(|v| v.as_str()).map(str::to_string),
        instructions: m
            .get("strInstructions")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        thumbnail: m
            .get("strMealThumb")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        youtube: m
            .get("strYoutube")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        source: m
            .get("strSource")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        ingredients,
        tags,
    })
}

pub fn search_meals(query: &str, limit: usize) -> ApiResult<Vec<MealRecipe>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "https://www.themealdb.com/api/json/v1/1/search.php?s={}",
        urlencoding::encode(q)
    );
    let raw: Value = get_json(&url)?;
    let meals = raw
        .get("meals")
        .and_then(|v| {
            if v.is_null() {
                None
            } else {
                v.as_array().cloned()
            }
        })
        .unwrap_or_default();
    Ok(meals.iter().filter_map(map_meal).take(limit).collect())
}

pub fn meal_by_id(id: &str) -> ApiResult<MealRecipe> {
    let id = id.trim();
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::invalid("invalid meal id"));
    }
    let url = format!("https://www.themealdb.com/api/json/v1/1/lookup.php?i={id}");
    let raw: Value = get_json(&url)?;
    let meal = raw
        .get("meals")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| ApiError::not_found("meal not found"))?;
    map_meal(meal).ok_or_else(|| ApiError::not_found("meal not found"))
}

pub fn random_meal() -> ApiResult<MealRecipe> {
    let raw: Value = get_json("https://www.themealdb.com/api/json/v1/1/random.php")?;
    let meal = raw
        .get("meals")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| ApiError::not_found("no random meal"))?;
    map_meal(meal).ok_or_else(|| ApiError::not_found("no random meal"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_meals("a", 3).is_err());
    }
}
