/**
 * Specialist Store - Specialist configuration storage contracts.
 *
 * Defines the CRUD interface for specialist configurations with role and
 * model tier mappings. No database-backed implementation is currently
 * available; specialist CRUD operations remain unimplemented.
 */

import type { SpecialistConfig } from "../specialists/specialist-types";
import { AgentRole, ModelTier } from "../models/agent";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SpecialistCreateInput {
  id: string;
  name: string;
  description?: string;
  role: AgentRole;
  defaultModelTier: ModelTier;
  systemPrompt: string;
  roleReminder?: string;
  defaultProvider?: string;
  defaultAdapter?: string;
  model?: string;
  source?: "user" | "bundled" | "hardcoded";
  createdBy?: string;
}

export interface SpecialistUpdateInput {
  name?: string;
  description?: string;
  role?: AgentRole;
  defaultModelTier?: ModelTier;
  systemPrompt?: string;
  roleReminder?: string;
  defaultProvider?: string;
  defaultAdapter?: string;
  model?: string;
  enabled?: boolean;
}

export interface SpecialistFilter {
  source?: "user" | "bundled" | "hardcoded";
  role?: AgentRole;
  enabled?: boolean;
  createdBy?: string;
}

// ─── Store Interface ───────────────────────────────────────────────────────

export interface SpecialistStore {
  create(input: SpecialistCreateInput): Promise<SpecialistConfig>;
  get(id: string): Promise<SpecialistConfig | null>;
  list(filter?: SpecialistFilter): Promise<SpecialistConfig[]>;
  update(id: string, input: SpecialistUpdateInput): Promise<SpecialistConfig | null>;
  delete(id: string): Promise<boolean>;
  upsert(input: SpecialistCreateInput): Promise<SpecialistConfig>;
  ensureBundledSpecialists(): Promise<void>;
}
