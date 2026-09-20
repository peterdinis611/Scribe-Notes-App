//! Wiki / link-graph domain: orphans, unresolved `[[links]]`, stubs, hubs.

mod graph;
mod health;
mod types;

pub use graph::{list_graph_hubs, list_link_graph, list_orphan_documents};
pub use health::{list_stub_documents, list_unresolved_wiki_links, wiki_health};
pub use types::{
    GraphHub, LinkEdge, LinkGraph, OrphanDocument, StubDocument, UnresolvedWikiLink, WikiHealth,
};
