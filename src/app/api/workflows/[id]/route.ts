/**
 * /api/workflows/[id] — Get, Update, Delete a specific workflow.
 *
 * GET    /api/workflows/[id]  → Get workflow YAML content
 * PUT    /api/workflows/[id]  → Replace workflow YAML content
 * DELETE /api/workflows/[id]  → Delete the workflow file
 */

import { NextRequest, NextResponse } from "next/server";
import {
  deleteWorkflowYaml,
  getWorkflowFilePath,
  parseWorkflowYamlInput,
  readExistingWorkflow,
  toWorkflowResponse,
  workflowErrorResponse,
  writeWorkflowYaml,
} from "../_helpers";

export const dynamic = "force-dynamic";

async function loadExistingWorkflow(id: string) {
  const existing = await readExistingWorkflow(id);
  return existing instanceof NextResponse ? existing : null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await readExistingWorkflow(id, true);
    if (existing instanceof NextResponse) {
      return existing;
    }

    return NextResponse.json({
      workflow: toWorkflowResponse(id, existing.yamlContent, existing.parsed),
    });
  } catch (err) {
    return workflowErrorResponse("get", err);
  }
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const notFound = await loadExistingWorkflow(id);
    if (notFound) {
      return notFound;
    }

    const body = await request.json().catch(() => null);
    const workflowInput = parseWorkflowYamlInput(body?.yamlContent);
    if (workflowInput instanceof NextResponse) {
      return workflowInput;
    }

    await writeWorkflowYaml(getWorkflowFilePath(id), workflowInput.yamlContent);

    return NextResponse.json({
      workflow: toWorkflowResponse(id, workflowInput.yamlContent, workflowInput.parsed),
    });
  } catch (err) {
    return workflowErrorResponse("update", err);
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const notFound = await loadExistingWorkflow(id);
    if (notFound) {
      return notFound;
    }

    await deleteWorkflowYaml(getWorkflowFilePath(id));
    return NextResponse.json({ success: true });
  } catch (err) {
    return workflowErrorResponse("delete", err);
  }
}
