/**
 * Specialists API
 *
 * REST API for managing user-defined specialist configurations.
 * Supports CRUD operations for specialists stored in the database.
 *
 * Endpoints:
 * - GET /api/specialists - List all specialists
 * - GET /api/specialists/:id - Get a specific specialist
 * - POST /api/specialists - Create a new specialist
 * - PUT /api/specialists/:id - Update a specialist
 * - DELETE /api/specialists/:id - Delete a specialist
 * - POST /api/specialists/sync - Sync bundled specialists to database
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase, isPostgres } from "@/core/db";
import { PostgresSpecialistStore } from "@/core/store/specialist-store";
import { syncBundledSpecialistsToDatabase } from "@/core/specialists/specialist-db-loader";
import { setSpecialistDatabaseEnabled, reloadSpecialists, loadSpecialistsSync } from "@/core/orchestration/specialist-prompts";
import { AgentRole, ModelTier } from "@/core/models/agent";
import { isCanonicalTeamSpecialistId } from "@/core/specialists/specialist-file-loader";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isAgentRole(value: string | undefined): value is AgentRole {
  return value !== undefined && Object.values(AgentRole).includes(value as AgentRole);
}

function isModelTier(value: string | undefined): value is ModelTier {
  return value !== undefined && Object.values(ModelTier).includes(value as ModelTier);
}

function validateTeamSpecialistId(id: string | undefined): string | null {
  if (!id?.startsWith("team-")) {
    return null;
  }
  if (isCanonicalTeamSpecialistId(id)) {
    return null;
  }
  return `Invalid team specialist id: ${id}. Team specialists must use one of the bundled canonical ids.`;
}

function normalizeSpecialistPayload(body: Record<string, unknown>) {
  const execution = body.execution && typeof body.execution === "object"
    ? body.execution as Record<string, unknown>
    : undefined;

  return {
    id: normalizeOptionalString(body.id),
    name: normalizeOptionalString(body.name),
    description: normalizeOptionalString(body.description),
    role: normalizeOptionalString(execution?.role) ?? normalizeOptionalString(body.role),
    defaultModelTier: normalizeOptionalString(execution?.modelTier) ?? normalizeOptionalString(body.defaultModelTier),
    systemPrompt: normalizeOptionalString(body.systemPrompt),
    roleReminder: normalizeOptionalString(body.roleReminder),
    defaultProvider: normalizeOptionalString(execution?.provider) ?? normalizeOptionalString(body.defaultProvider),
    defaultAdapter: normalizeOptionalString(execution?.adapter) ?? normalizeOptionalString(body.defaultAdapter),
    model: normalizeOptionalString(execution?.model) ?? normalizeOptionalString(body.model),
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  };
}

// ─── GET /api/specialists ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const locale = searchParams.get("locale") ?? request.cookies.get("NEXT_LOCALE")?.value ?? "en";

    if (!isPostgres()) {
      // SQLite-backed local dev uses the file-based specialist source.
      const specialists = process.env.NODE_ENV === "development"
        ? await reloadSpecialists(locale)
        : loadSpecialistsSync(locale);
      if (id) {
        const specialist = specialists.find((s) => s.id === id);
        if (!specialist) {
          return NextResponse.json({ error: "Specialist not found" }, { status: 404 });
        }
        return NextResponse.json(specialist);
      }
      return NextResponse.json({ specialists });
    }

    const db = getDatabase();
    const store = new PostgresSpecialistStore(db);
    setSpecialistDatabaseEnabled(true);

    if (id) {
      // Get specific specialist
      const specialist = await store.get(id);
      if (!specialist) {
        return NextResponse.json(
          { error: "Specialist not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(specialist);
    }

    // List all specialists
    const specialists = await store.list();
    return NextResponse.json({ specialists });
  } catch (error) {
    console.error("[SpecialistsAPI] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load specialists", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── POST /api/specialists ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!isPostgres()) {
      return NextResponse.json(
        { error: "Specialist writes require Postgres; local SQLite uses bundled/file-based specialists" },
        { status: 501 }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const action = normalizeOptionalString(body.action);
    const {
      id,
      name,
      description,
      role,
      defaultModelTier,
      systemPrompt,
      roleReminder,
      defaultProvider,
      defaultAdapter,
      model,
    } = normalizeSpecialistPayload(body);

    // Handle sync action
    if (action === "sync") {
      const db = getDatabase();
      const store = new PostgresSpecialistStore(db);
      setSpecialistDatabaseEnabled(true);

      await syncBundledSpecialistsToDatabase(store);
      await reloadSpecialists();

      return NextResponse.json({
        success: true,
        message: "Bundled specialists synced to database",
      });
    }

    // Validate required fields
    if (!id || !name || !role || !defaultModelTier || !systemPrompt) {
      return NextResponse.json(
        { error: "Missing required fields: id, name, role, defaultModelTier, systemPrompt" },
        { status: 400 }
      );
    }

    const teamIdError = validateTeamSpecialistId(id);
    if (teamIdError) {
      return NextResponse.json({ error: teamIdError }, { status: 400 });
    }

    // Validate role
    if (!isAgentRole(role)) {
      return NextResponse.json(
        { error: `Invalid role: ${role}. Must be one of: ${Object.values(AgentRole).join(", ")}` },
        { status: 400 }
      );
    }

    // Validate modelTier
    if (!isModelTier(defaultModelTier)) {
      return NextResponse.json(
        { error: `Invalid defaultModelTier: ${defaultModelTier}. Must be one of: ${Object.values(ModelTier).join(", ")}` },
        { status: 400 }
      );
    }

    const normalizedRole: AgentRole = role;
    const normalizedDefaultModelTier: ModelTier = defaultModelTier;

    const db = getDatabase();
    const store = new PostgresSpecialistStore(db);
    setSpecialistDatabaseEnabled(true);

    // Check if specialist already exists
    const existing = await store.get(id);
    if (existing) {
      return NextResponse.json(
        { error: "Specialist already exists", id },
        { status: 409 }
      );
    }

    const specialist = await store.create({
      id,
      name,
      description,
      role: normalizedRole,
      defaultModelTier: normalizedDefaultModelTier,
      systemPrompt,
      roleReminder,
      defaultProvider,
      defaultAdapter,
      model,
      source: "user",
    });

    await reloadSpecialists();

    return NextResponse.json(
      { specialist, message: "Specialist created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SpecialistsAPI] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create specialist", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── PUT /api/specialists ───────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    if (!isPostgres()) {
      return NextResponse.json(
        { error: "Specialist writes require Postgres; local SQLite uses bundled/file-based specialists" },
        { status: 501 }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const {
      id,
      name,
      description,
      role,
      defaultModelTier,
      systemPrompt,
      roleReminder,
      defaultProvider,
      defaultAdapter,
      model,
      enabled,
    } = normalizeSpecialistPayload(body);

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    const teamIdError = validateTeamSpecialistId(id);
    if (teamIdError) {
      return NextResponse.json({ error: teamIdError }, { status: 400 });
    }

    // Validate role if provided
    if (role && !isAgentRole(role)) {
      return NextResponse.json(
        { error: `Invalid role: ${role}. Must be one of: ${Object.values(AgentRole).join(", ")}` },
        { status: 400 }
      );
    }

    // Validate modelTier if provided
    if (defaultModelTier && !isModelTier(defaultModelTier)) {
      return NextResponse.json(
        { error: `Invalid defaultModelTier: ${defaultModelTier}. Must be one of: ${Object.values(ModelTier).join(", ")}` },
        { status: 400 }
      );
    }

    const normalizedRole = role && isAgentRole(role) ? role : undefined;
    const normalizedDefaultModelTier = defaultModelTier && isModelTier(defaultModelTier)
      ? defaultModelTier
      : undefined;

    const db = getDatabase();
    const store = new PostgresSpecialistStore(db);
    setSpecialistDatabaseEnabled(true);

    const specialist = await store.update(id, {
      name,
      description,
      role: normalizedRole,
      defaultModelTier: normalizedDefaultModelTier,
      systemPrompt,
      roleReminder,
      defaultProvider,
      defaultAdapter,
      model,
      enabled,
    });

    if (!specialist) {
      return NextResponse.json(
        { error: "Specialist not found" },
        { status: 404 }
      );
    }

    await reloadSpecialists();

    return NextResponse.json({
      specialist,
      message: "Specialist updated successfully",
    });
  } catch (error) {
    console.error("[SpecialistsAPI] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update specialist", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/specialists ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    if (!isPostgres()) {
      return NextResponse.json(
        { error: "Specialist writes require Postgres; local SQLite uses bundled/file-based specialists" },
        { status: 501 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const store = new PostgresSpecialistStore(db);
    setSpecialistDatabaseEnabled(true);

    const deleted = await store.delete(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Specialist not found" },
        { status: 404 }
      );
    }

    await reloadSpecialists();

    return NextResponse.json({
      success: true,
      message: "Specialist deleted successfully",
    });
  } catch (error) {
    console.error("[SpecialistsAPI] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete specialist", details: String(error) },
      { status: 500 }
    );
  }
}
