//! JSONL Writer — Append-only JSON Lines file writer.
//!
//! Provides thread-safe, async JSONL file operations for session and trace storage.

use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

/// Append-only JSONL file writer with serialized writes.
pub struct JsonlWriter {
    path: PathBuf,
    lock: Mutex<()>,
}

impl JsonlWriter {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            lock: Mutex::new(()),
        }
    }

    /// Append a serializable value as a single JSONL line.
    pub async fn append<T: serde::Serialize>(&self, value: &T) -> Result<(), std::io::Error> {
        let _guard = self.lock.lock().await;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let mut line = serde_json::to_string(value)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        line.push('\n');
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .await?;
        file.write_all(line.as_bytes()).await?;
        file.flush().await?;
        Ok(())
    }
}

/// Read all entries from a JSONL file, skipping malformed lines.
pub async fn read_jsonl_file<T: serde::de::DeserializeOwned>(path: impl AsRef<Path>) -> Vec<T> {
    let content = match fs::read_to_string(path.as_ref()).await {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect()
}

/// List all .jsonl files in a directory.
pub async fn list_jsonl_files(dir: impl AsRef<Path>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut entries = match fs::read_dir(dir.as_ref()).await {
        Ok(e) => e,
        Err(_) => return files,
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
    files.sort();
    files
}
