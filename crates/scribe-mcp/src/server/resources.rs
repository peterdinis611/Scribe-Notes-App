//! MCP resources (`scribe://doc|artifact|revision/...`).

use crate::server::ScribeMcp;

use rmcp::model::{ErrorData, Resource, ResourceContents};

impl ScribeMcp {
    pub(crate) fn list_document_resources(&self) -> Result<Vec<Resource>, ErrorData> {
        self.with_store(|store| {
            let docs = store.list_documents(None, Some(40))?;
            Ok(docs
                .into_iter()
                .map(|doc| {
                    Resource::new(format!("scribe://doc/{}", doc.id), doc.title.clone())
                        .with_title(doc.title)
                        .with_mime_type("text/plain")
                        .with_description("Scribe note")
                })
                .collect())
        })
        .map_err(|error| ErrorData::internal_error(error, None))
    }

    pub(crate) fn read_scribe_resource(&self, uri: &str) -> Result<ResourceContents, ErrorData> {
        let uri = uri.trim();
        if let Some(id) = uri.strip_prefix("scribe://doc/") {
            let doc = self
                .with_store(|store| {
                    store
                        .get_document_scoped(id, false, self.vault_scope)?
                        .ok_or_else(|| format!("Document not found: {id}"))
                })
                .map_err(|error| ErrorData::resource_not_found(error, None))?;
            return Ok(ResourceContents::text(doc.plain_text, uri).with_mime_type("text/plain"));
        }
        if let Some(id) = uri.strip_prefix("scribe://artifact/") {
            let artifact = self
                .with_store(|store| {
                    store
                        .get_nlp_artifact(id)?
                        .ok_or_else(|| format!("Artifact not found: {id}"))
                })
                .map_err(|error| ErrorData::resource_not_found(error, None))?;
            let text = serde_json::to_string_pretty(&artifact.payload).unwrap_or_default();
            return Ok(ResourceContents::text(text, uri).with_mime_type("application/json"));
        }
        if let Some(rest) = uri.strip_prefix("scribe://revision/") {
            let mut parts = rest.splitn(2, '/');
            let document_id = parts.next().unwrap_or("").trim();
            let revision_id = parts.next().unwrap_or("").trim();
            if document_id.is_empty() || revision_id.is_empty() {
                return Err(ErrorData::resource_not_found(
                    "Use scribe://revision/{documentId}/{revisionId}",
                    None,
                ));
            }
            let revision = self
                .with_store(|store| {
                    let revision = store
                        .get_document_revision(revision_id)?
                        .ok_or_else(|| format!("Revision not found: {revision_id}"))?;
                    if revision.document_id != document_id {
                        return Err("revision does not belong to document".to_string());
                    }
                    Ok(revision)
                })
                .map_err(|error| ErrorData::resource_not_found(error, None))?;
            let body = format!(
                "# {}\n\n{}",
                revision.title.trim(),
                revision.plain_text.trim()
            );
            return Ok(ResourceContents::text(body, uri).with_mime_type("text/plain"));
        }
        Err(ErrorData::resource_not_found(
            format!(
                "Unknown resource URI: {uri}. Use scribe://doc/{{id}}, scribe://artifact/{{id}}, or scribe://revision/{{docId}}/{{revId}}."
            ),
            None,
        ))
    }
}
