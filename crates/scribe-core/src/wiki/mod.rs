//! Wiki / link-graph domain: orphans, unresolved `[[links]]`, stubs, hubs.

mod graph;
mod health;
mod resolve;
mod types;

pub use graph::{list_graph_hubs, list_link_graph, list_orphan_documents};
pub use health::{list_stub_documents, list_unresolved_wiki_links, wiki_health};
pub use resolve::{find_documents_by_title, resolve_wiki_link_in_document};
pub use types::{
    GraphHub, LinkEdge, LinkGraph, OrphanDocument, ResolveWikiLinkResult, StubDocument, TitleMatch,
    UnresolvedWikiLink, WikiHealth,
};
