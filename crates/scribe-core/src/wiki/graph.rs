use rusqlite::{params, Connection};

use super::health::list_orphan_documents_limited;
use super::types::{GraphHub, LinkEdge, LinkGraph, OrphanDocument};

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
