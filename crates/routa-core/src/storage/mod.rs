//! Storage Module — Unified storage layer for sessions and traces.
//!
//! Provides the folder slug algorithm, JSONL writer, and local storage providers
//! that mirror the TypeScript implementation for cross-platform consistency.

mod folder_slug;
mod jsonl_writer;
mod local_session_provider;

pub use folder_slug::*;
pub use jsonl_writer::*;
pub use local_session_provider::*;
