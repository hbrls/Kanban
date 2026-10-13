//! Docker-related type definitions for the Docker-based agent execution.
//!
//! These types mirror the TypeScript definitions in `src/core/acp/docker/types.ts`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Status of Docker daemon availability.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerStatus {
    pub available: bool,
    pub daemon_running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub checked_at: String,
}

impl Default for DockerStatus {
    fn default() -> Self {
        Self {
            available: false,
            daemon_running: false,
            version: None,
            api_version: None,
            error: None,
            checked_at: Utc::now().to_rfc3339(),
        }
    }
}

/// Configuration for starting a Docker container.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerConfig {
    pub session_id: String,
    pub image: String,
    pub workspace_path: String,
    /// Optional extra env vars for the container process
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    /// Explicit additional read/write volume mappings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_volumes: Option<Vec<VolumeMapping>>,
    /// Optional container labels
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<HashMap<String, String>>,
    /// Container port exposed by the OpenCode HTTP service
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_port: Option<u16>,
    /// OpenCode auth.json content (JSON string) to mount into container
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_json: Option<String>,
}

/// Volume mapping for Docker containers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeMapping {
    pub host_path: String,
    pub container_path: String,
}

/// Information about a running Docker container.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerInfo {
    pub session_id: String,
    pub container_id: String,
    pub container_name: String,
    pub host_port: u16,
    pub container_port: u16,
    pub image: String,
    pub workspace_path: String,
    pub created_at: DateTime<Utc>,
}

/// Result of a Docker image pull operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerPullResult {
    pub ok: bool,
    pub image: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Notification handler type alias for session updates.
pub type NotificationHandler = Box<dyn Fn(serde_json::Value) + Send + Sync>;
