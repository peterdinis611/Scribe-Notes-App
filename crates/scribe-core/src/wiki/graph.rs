use std::collections::{HashSet, VecDeque};

use rusqlite::{params, Connection, OptionalExtension};

use super::health::list_orphan_documents_limited;
use super::types::{GraphHub, LinkEdge, LinkGraph, OrphanDocument, WikiNeighborhood};

/// All orphans (no limit cap beyond SQL). Used by link graph UI.
pub fn list_orphan_documents(conn: &Connection) -> Result<Vec<OrphanDocument>, String> {
    list_orphan_documents_limited(conn, 10_000)
}

pub fn list_link_graph(conn: &Connection) -> Result<LinkGraph, String> {
    let mut edge_stmt = conn
        .prepare(
            "SELECT l.source_id, l.target_id, s.title AS source_title, t.title AS target_title
             FROM document_links l
             JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL
             JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
             ORDER BY s.title, t.title",
        )
        .map_err(|e| e.to_string())?;

    let edges = edge_stmt
        .query_map([], |row| {
            Ok(LinkEdge {
                source_id: row.get(0)?,
                target_id: row.get(1)?,
                source_title: row.get(2)?,
                target_title: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(LinkGraph {
        edges,
        orphans: list_orphan_documents(conn)?,
    })
}

pub fn list_graph_hubs(conn: &Connection, limit: i64) -> Result<Vec<GraphHub>, String> {
    let max = limit.clamp(1, 50);
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.title,
                    COALESCE(inc.n, 0) AS backlinks,
                    COALESCE(outg.n, 0) AS outgoing
             FROM documents d
             LEFT JOIN (
                SELECT l.target_id AS id, COUNT(*) AS n
                FROM document_links l
                JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL
                GROUP BY l.target_id
             ) inc ON inc.id = d.id
             LEFT JOIN (
                SELECT l.source_id AS id, COUNT(*) AS n
                FROM document_links l
                JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
                GROUP BY l.source_id
             ) outg ON outg.id = d.id
             WHERE d.deleted_at IS NULL
               AND (COALESCE(inc.n, 0) + COALESCE(outg.n, 0)) > 0
             ORDER BY (COALESCE(inc.n, 0) + COALESCE(outg.n, 0)) DESC,
                      COALESCE(inc.n, 0) DESC,
                      d.title COLLATE NOCASE
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![max], |row| {
            Ok(GraphHub {
                id: row.get(0)?,
                title: row.get(1)?,
                backlinks: row.get(2)?,
                outgoing: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Collect note + up to `hops` outbound wiki-link neighbors (BFS). Mirrors FE `collectWikiNeighborhood`.
pub fn collect_wiki_neighborhood(
    conn: &Connection,
    root_id: &str,
    hops: u32,
    max_notes: usize,
) -> Result<WikiNeighborhood, String> {
    let root_id = root_id.trim();
    if root_id.is_empty() {
        return Err("root_id is required".into());
    }
    let max_notes = max_notes.clamp(1, 500);
    let hops = hops.min(8);

    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM documents WHERE id = ?1 AND deleted_at IS NULL",
            params![root_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!("Document not found: {root_id}"));
    }

    let mut seen = HashSet::new();
    seen.insert(root_id.to_string());
    let mut ordered = vec![root_id.to_string()];
    let mut frontier: VecDeque<(String, u32)> = VecDeque::new();
    frontier.push_back((root_id.to_string(), 0));

    while let Some((id, depth)) = frontier.pop_front() {
        if depth >= hops || ordered.len() >= max_notes {
            continue;
        }
        let mut stmt = conn
            .prepare(
                "SELECT t.id
                 FROM document_links l
                 JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
                 WHERE l.source_id = ?1
                 ORDER BY t.title COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let targets = stmt
            .query_map(params![id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for target in targets {
            if seen.contains(&target) || ordered.len() >= max_notes {
                continue;
            }
            seen.insert(target.clone());
            ordered.push(target.clone());
            frontier.push_back((target, depth + 1));
        }
    }

    Ok(WikiNeighborhood {
        root_id: root_id.to_string(),
        hops,
        document_ids: ordered,
    })
}
