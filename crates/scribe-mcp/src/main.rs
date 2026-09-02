mod server;
mod tools;

use rmcp::ServiceExt;
use rmcp::transport::stdio;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("scribe_mcp=info".parse()?))
        .with_writer(std::io::stderr)
        .init();

    let server = server::ScribeMcp::new()?;
    eprintln!(
        "[scribe-mcp] ready (db: {}, writable: {})",
        server.db_path.display(),
        server.writable
    );

    let service = server.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
