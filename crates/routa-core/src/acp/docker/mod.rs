//! Docker-based agent execution module.
//!
//! This module provides support for running OpenCode agents in Docker containers,
//! communicating with them via an HTTP/SSE bridge.

mod adapter;
mod detector;
mod process_manager;
mod types;
mod utils;

pub use adapter::DockerOpenCodeAdapter;
pub use detector::DockerDetector;
pub use process_manager::DockerProcessManager;
pub use types::*;
pub use utils::*;
