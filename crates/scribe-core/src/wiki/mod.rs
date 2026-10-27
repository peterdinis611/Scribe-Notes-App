//! Wiki / link-graph domain: orphans, unresolved `[[links]]`, stubs, hubs.

mod aliases;
mod ghost;
mod graph;
mod health;
mod link_parse;
mod resolve;
mod types;

pub use aliases::{add_alias_tag, document_matches_title_or_alias, parse_aliases};
pub use ghost::{find_wiki_ghost_match, WikiGhostCandidate, WikiGhostMatch};
pub use graph::{list_graph_hubs, list_link_graph, list_orphan_documents};
pub use health::{list_stub_documents, list_unresolved_wiki_links, wiki_health};
pub use link_parse::{format_wiki_link_render_text, parse_wiki_link_raw, ParsedWikiLink};
pub use resolve::{
    attach_link_suggestions, find_documents_by_title, resolve_wiki_link_in_document,
};
pub use types::{
    GraphHub, LinkEdge, LinkGraph, OrphanDocument, ResolveWikiLinkResult, StubDocument, TitleMatch,
    UnresolvedWikiLink, WikiHealth,
};
