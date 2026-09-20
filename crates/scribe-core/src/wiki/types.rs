use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkEdge {
    pub source_id: String,
    pub target_id: String,
    pub source_title: String,
    pub target_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanDocument {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkGraph {
    pub edges: Vec<LinkEdge>,
    pub orphans: Vec<OrphanDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedWikiLink {
    pub document_id: String,
    pub document_title: String,
    pub label: String,
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StubDocument {
    pub id: String,
    pub title: String,
    pub word_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiHealth {
    pub orphans: Vec<OrphanDocument>,
    pub unresolved: Vec<UnresolvedWikiLink>,
    pub stubs: Vec<StubDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphHub {
    pub id: String,
    pub title: String,
    pub backlinks: i64,
    pub outgoing: i64,
}
