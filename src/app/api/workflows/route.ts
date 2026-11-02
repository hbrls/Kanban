/**
 * /api/workflows — CRUD API for workflow YAML definitions.
 *
 * GET  /api/workflows  → List all workflows in resources/flows/
 * POST /api/workflows  → Create a new workflow YAML file
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import {
  ensureFlowsDir,
  getWorkflowFilePath,
  listWorkflowFileNames,
  parseWorkflowYaml,
  parseWorkflowYamlInput,
  readWorkflowYaml,
  toWorkflowResponse,
  workflowErrorResponse,
  writeWorkflowYaml,
} from "./_helpers";

export const dynamic = "force-dynamic";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const files = await listWorkflowFileNames();
    const workflows = [];

    for (const file of files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      const id = file.replace(/\.(yaml|yml)$/u, "");
      const content = await readWorkflowYaml(getWorkflowFilePath(id));
      try {
        workflows.push(toWorkflowResponse(id, content, parseWorkflowYaml(content)));
      } catch {
        // Skip invalid YAML files
      }
    }

    return NextResponse.json({ workflows });
  } catch (err) {
    return workflowErrorResponse("list", err);
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { id, yamlContent } = body;
    if (!id || !yamlContent) {
      return NextResponse.json(
        { error: "Required: id, yamlContent" },
        { status: 400 }
      );
    }

    // Validate id (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json(
        { error: "ID must contain only letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    const workflowInput = parseWorkflowYamlInput(yamlContent);
    if (workflowInput instanceof NextResponse) {
      return workflowInput;
    }

    ensureFlowsDir();
    const filePath = getWorkflowFilePath(id);

    if (fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Workflow with id "${id}" already exists` },
        { status: 409 },
      );
    }

    await writeWorkflowYaml(filePath, workflowInput.yamlContent);

    return NextResponse.json(
      {
        workflow: toWorkflowResponse(id, workflowInput.yamlContent, workflowInput.parsed),
      },
      { status: 201 },
    );
  } catch (err) {
    return workflowErrorResponse("create", err);
  }
}
