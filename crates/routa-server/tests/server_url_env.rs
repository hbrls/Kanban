#[path = "common/mod.rs"]
mod common;

use routa_server::{start_server, ServerConfig};

// Kept in its own test binary: `ROUTA_SERVER_URL` is process-global, so a single
// test per binary avoids racing other tests that also start servers.
#[tokio::test]
async fn publishes_bound_address_for_ephemeral_port() {
    let db_path = common::random_db_path();
    let config = ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 0,
        db_path: db_path.to_string_lossy().to_string(),
        static_dir: None,
    };

    let addr = start_server(config).await.expect("start server");
    assert_ne!(addr.port(), 0, "the OS should assign a real ephemeral port");

    // Spawned agent CLIs read this env var to reach the coordination MCP
    // endpoint, so it must carry the bound port rather than the requested 0.
    let published = std::env::var("ROUTA_SERVER_URL").expect("ROUTA_SERVER_URL should be set");
    assert_eq!(published, format!("http://{addr}"));

    let _ = std::fs::remove_file(&db_path);
}
