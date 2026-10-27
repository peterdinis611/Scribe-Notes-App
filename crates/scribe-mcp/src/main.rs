mod http;
mod rest;
mod server;
mod tools;

use rmcp::transport::stdio;
use rmcp::ServiceExt;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("scribe_mcp=info".parse()?))
        .with_writer(std::io::stderr)
        .init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let server = server::ScribeMcp::new()?;
    eprintln!(
        "[scribe-mcp] ready (db: {}, writable: {})",
        server.db_path.display(),
        server.writable
    );

    if http::http_mode_requested(&args) {
        let bind = http::parse_bind_addr(&args)?;
        http::serve_http(server, bind).await?;
        return Ok(());
    }

    let service = server.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
