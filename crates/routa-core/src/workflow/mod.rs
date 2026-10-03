//! Workflow engine — YAML-driven multi-step agent orchestration.
//!
//! Allows defining specialist prompts and multi-step flows in YAML files,
//! then executing them by calling ACP agents (via HTTP API or spawned processes).
//!
//! # Architecture
//!
//! ```text
//! workflow.yaml ──► WorkflowDefinition ──► WorkflowExecutor
//!                                              │
//!                   specialists/*.yaml ─────► SpecialistDef
//!                                              │
//!                                         AcpAgentCaller (HTTP)
//!                                              │
//!                                     Claude / OpenCode / GLM
//! ```

pub mod agent_caller;
pub mod executor;
pub mod schema;
pub mod specialist;

pub use agent_caller::AcpAgentCaller;
pub use executor::WorkflowExecutor;
pub use schema::{OnFailure, StepAction, TriggerConfig, WorkflowDefinition, WorkflowStep};
pub use specialist::{SpecialistDef, SpecialistLoader};
