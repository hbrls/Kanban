import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { NextResponse } from "next/server";

const FLOWS_DIR = path.join(process.cwd(), "resources", "flows");

export interface WorkflowYamlDocument {
  name?: string;
  description?: string;
  version?: string;
  trigger?: unknown;
  steps?: unknown[];
}

export interface WorkflowYamlInput {
  parsed: WorkflowYamlDocument;
  yamlContent: string;
}

export function ensureFlowsDir(): void {
  if (!fs.existsSync(FLOWS_DIR)) {
    fs.mkdirSync(FLOWS_DIR, { recursive: true });
  }
}

export function getWorkflowFilePath(id: string): string {
  return path.join(FLOWS_DIR, `${id}.yaml`);
}

export function listWorkflowFileNames(): Promise<string[]> {
  ensureFlowsDir();
  return fs.promises.readdir(FLOWS_DIR);
}

export async function readWorkflowYaml(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, "utf-8");
}

export async function writeWorkflowYaml(filePath: string, yamlContent: string): Promise<void> {
  await fs.promises.writeFile(filePath, yamlContent, "utf-8");
}

export async function deleteWorkflowYaml(filePath: string): Promise<void> {
  await fs.promises.unlink(filePath);
}

export function parseWorkflowYaml(yamlContent: string): WorkflowYamlDocument {
  return yaml.load(yamlContent) as WorkflowYamlDocument;
}

export function tryParseWorkflowYaml(yamlContent: string): WorkflowYamlDocument {
  try {
    return parseWorkflowYaml(yamlContent);
  } catch {
    return {};
  }
}

export function validateWorkflowDocument(parsed: WorkflowYamlDocument): string | null {
  if (!parsed?.name || !Array.isArray(parsed?.steps) || parsed.steps.length === 0) {
    return "Workflow YAML must have name and at least one step";
  }
  return null;
}

export function toWorkflowResponse(id: string, yamlContent: string, parsed: WorkflowYamlDocument) {
  return {
    id,
    name: parsed.name ?? id,
    description: parsed.description ?? "",
    version: parsed.version ?? "1.0",
    trigger: parsed.trigger,
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    yamlContent,
  };
}

export function workflowNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
}

export function workflowErrorResponse(action: string, err: unknown): NextResponse {
  return NextResponse.json(
    { error: `Failed to ${action} workflow`, details: String(err) },
    { status: 500 },
  );
}

export function parseWorkflowYamlInput(yamlContent: unknown): NextResponse | WorkflowYamlInput {
  if (typeof yamlContent !== "string" || !yamlContent) {
    return NextResponse.json({ error: "Required: yamlContent" }, { status: 400 });
  }

  let parsed: WorkflowYamlDocument;
  try {
    parsed = parseWorkflowYaml(yamlContent);
  } catch (err) {
    return NextResponse.json({ error: `Invalid YAML: ${err}` }, { status: 400 });
  }

  const validationError = validateWorkflowDocument(parsed);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  return { parsed, yamlContent };
}

export async function readExistingWorkflow(
  id: string,
  tolerateInvalidYaml = false,
): Promise<NextResponse | WorkflowYamlInput> {
  const filePath = getWorkflowFilePath(id);
  if (!fs.existsSync(filePath)) {
    return workflowNotFoundResponse();
  }

  const yamlContent = await readWorkflowYaml(filePath);
  const parsed = tolerateInvalidYaml ? tryParseWorkflowYaml(yamlContent) : parseWorkflowYaml(yamlContent);
  return { parsed, yamlContent };
}
