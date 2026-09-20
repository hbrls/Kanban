#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { fromRoot } from "../lib/paths";
import { loadYamlFile } from "../lib/yaml";

type SpecialistExecution = {
  role?: string;
  provider?: string;
  adapter?: string;
  modelTier?: string;
  model?: string;
};

type LocaleOverlay = {
  locale: string | null;
  path: string;
  name?: string;
  description?: string;
};

type SpecialistSpec = {
  id: string;
  name: string;
  description: string;
  role: string;
  modelTier: string;
  roleReminder: string;
  defaultProvider?: string;
  defaultAdapter?: string;
  model?: string;
  execution: SpecialistExecution;
  systemPrompt: string;
  group: string;
  path: string;
  locales: LocaleOverlay[];
};

type SpecialistCatalog = {
  groups: Record<string, SpecialistSpec[]>;
  totalSpecialists: number;
  totalLocales: number;
};

type SpecialistYaml = Record<string, unknown>;

const SPECIALISTS_DIR = fromRoot("resources", "specialists");
const OUTPUT_DIR = fromRoot("docs", "specialists");

const GROUP_DESCRIPTIONS: Record<string, string> = {
  core: "系统基础角色，定义 Routa 多 agent 协作的底座角色模型。",
  team: "面向团队协作的通用职能角色，回答“这类工作通常该派谁做”。",
  review: "分析、审查、判断类 specialist，重点是把关而不是主导实现。",
  issue: "问题整理与工单加工 specialist，把模糊反馈加工成可执行输入。",
  tools: "绑定具体 provider、adapter、SDK 或执行环境的 specialist。",
  "workflows/kanban": "绑定 Kanban 流程阶段的 specialist，强调列职责与卡片流转。",
};

function relativePosix(targetPath: string): string {
  return path.relative(fromRoot(), targetPath).replace(/\\/g, "/");
}

function normalizeField(
  data: SpecialistYaml,
  snake: string,
  camel?: string,
): string | undefined {
  const camelValue = camel ? data[camel] : undefined;
  if (typeof camelValue === "string" && camelValue.length > 0) {
    return camelValue;
  }
  const snakeValue = data[snake];
  return typeof snakeValue === "string" && snakeValue.length > 0 ? snakeValue : undefined;
}

function extractExecution(data: SpecialistYaml): SpecialistExecution {
  const execution = data.execution;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) {
    return {};
  }
  const record = execution as SpecialistYaml;
  return {
    role: typeof record.role === "string" ? record.role : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    adapter: typeof record.adapter === "string" ? record.adapter : undefined,
    modelTier: normalizeField(record, "model_tier", "modelTier"),
    model: typeof record.model === "string" ? record.model : undefined,
  };
}

function pathToGroup(filePath: string): string {
  const rel = path.relative(SPECIALISTS_DIR, filePath).split(path.sep);
  return rel[0] === "locales" ? rel.slice(2, -1).join("/") : rel.slice(0, -1).join("/");
}

function pathToLocale(filePath: string): string | null {
  const rel = path.relative(SPECIALISTS_DIR, filePath).split(path.sep);
  return rel[0] === "locales" && rel[1] ? rel[1] : null;
}

function readYamlDict(filePath: string): SpecialistYaml {
  return loadYamlFile<SpecialistYaml>(filePath) ?? {};
}

function scanSpecialists(): SpecialistCatalog {
  const baseDefs = new Map<string, Omit<SpecialistSpec, "locales">>();
  const localeOverlays = new Map<string, LocaleOverlay[]>();

  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".yaml")) {
        continue;
      }

      const data = readYamlDict(fullPath);
      const rel = path.relative(SPECIALISTS_DIR, fullPath).split(path.sep);
      if (rel[0] === "locales") {
        const specialistId = typeof data.id === "string" && data.id ? data.id : path.basename(fullPath, ".yaml");
        const overlays = localeOverlays.get(specialistId) ?? [];
        overlays.push({
          locale: pathToLocale(fullPath),
          path: relativePosix(fullPath),
          name: typeof data.name === "string" ? data.name : undefined,
          description: typeof data.description === "string" ? data.description : undefined,
        });
        localeOverlays.set(specialistId, overlays);
        continue;
      }

      const specialistId = typeof data.id === "string" && data.id ? data.id : path.basename(fullPath, ".yaml");
      baseDefs.set(specialistId, {
        id: specialistId,
        name: typeof data.name === "string" ? data.name : "",
        description: typeof data.description === "string" ? data.description : "",
        role: typeof data.role === "string" ? data.role : "",
        modelTier: normalizeField(data, "model_tier", "modelTier") ?? "",
        roleReminder: normalizeField(data, "role_reminder", "roleReminder") ?? "",
        defaultProvider: normalizeField(data, "default_provider", "defaultProvider"),
        defaultAdapter: normalizeField(data, "default_adapter", "defaultAdapter"),
        model: typeof data.model === "string" ? data.model : undefined,
        execution: extractExecution(data),
        systemPrompt: typeof data.system_prompt === "string" ? data.system_prompt : "",
        group: pathToGroup(fullPath),
        path: relativePosix(fullPath),
      });
    }
  };

  visit(SPECIALISTS_DIR);

  const groups = new Map<string, SpecialistSpec[]>();
  for (const spec of baseDefs.values()) {
    const locales = [...(localeOverlays.get(spec.id) ?? [])].sort((left, right) => {
      const localeCompare = (left.locale ?? "").localeCompare(right.locale ?? "");
      return localeCompare !== 0 ? localeCompare : left.path.localeCompare(right.path);
    });
    const list = groups.get(spec.group) ?? [];
    list.push({ ...spec, locales });
    groups.set(spec.group, list);
  }

  const sortedGroups = Object.fromEntries(
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, specs]) => [group, specs.sort((left, right) => left.id.localeCompare(right.id))]),
  );

  const localeSet = new Set<string>();
  for (const overlays of localeOverlays.values()) {
    for (const overlay of overlays) {
      if (overlay.locale) {
        localeSet.add(overlay.locale);
      }
    }
  }

  return {
    groups: sortedGroups,
    totalSpecialists: baseDefs.size,
    totalLocales: localeSet.size,
  };
}

export function firstPromptParagraph(prompt: string): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of prompt.split(/\r?\n/)) {
    const stripped = line.trimEnd().trim();
    if (!stripped) {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }
    if (stripped.startsWith("## ")) {
      continue;
    }
    current.push(stripped);
  }
  if (current.length > 0) {
    paragraphs.push(current.join(" "));
  }
  return paragraphs[0] ?? "";
}

export function renderExecutionSummary(spec: SpecialistSpec): string {
  const parts: string[] = [];
  if (spec.execution.role) parts.push(`role=${spec.execution.role}`);
  if (spec.execution.provider) parts.push(`provider=${spec.execution.provider}`);
  if (spec.execution.adapter) parts.push(`adapter=${spec.execution.adapter}`);
  if (spec.execution.modelTier) parts.push(`model_tier=${spec.execution.modelTier}`);
  if (spec.execution.model) parts.push(`model=${spec.execution.model}`);
  return parts.length > 0 ? parts.join(", ") : "-";
}

function docPathForSpecialist(spec: SpecialistSpec): string {
  return path.join(OUTPUT_DIR, spec.group, `${spec.id}.md`);
}

function promptExcerpt(prompt: string, limit = 600): string {
  const excerpt = prompt.trim();
  return excerpt.length <= limit ? excerpt : `${excerpt.slice(0, limit).trimEnd()}\n...`;
}

export function renderOverviewMarkdown(catalog: SpecialistCatalog): string {
  const lines = [
    "# Specialists",
    "",
    "本文由脚本自动生成，来源如下：",
    "- `resources/specialists/**/*.yaml`",
    "- `resources/specialists/locales/<locale>/**/*.yaml`",
    "",
    "用途：帮助用户按 group 理解内置 specialist，并跳转到每个 specialist 的独立说明页。",
    "",
    `- 基础 specialist 数量：\`${catalog.totalSpecialists}\``,
    `- locale 覆盖语言数量：\`${catalog.totalLocales}\``,
    "",
    "## Group Index",
    "",
  ];

  for (const [group, specialists] of Object.entries(catalog.groups)) {
    lines.push(`- \`${group}\`: ${specialists.length} 个 specialist`);
  }
  lines.push("");

  for (const [group, specialists] of Object.entries(catalog.groups)) {
    lines.push(`## \`${group}\``, "");
    lines.push(GROUP_DESCRIPTIONS[group] ?? "该分组来自 specialist 目录结构。", "");
    lines.push("| ID | Name | Role | Model Tier | Locales | Doc | Source |");
    lines.push("|---|---|---|---|---:|---|---|");
    for (const spec of specialists) {
      const docLink = path.relative(OUTPUT_DIR, docPathForSpecialist(spec)).replace(/\\/g, "/");
      lines.push(
        `| \`${spec.id}\` | ${spec.name} | \`${spec.role || "-"}\` | \`${spec.modelTier || "-"}\` | ${spec.locales.length} | [${spec.name}](${docLink}) | \`${spec.path}\` |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderSpecialistMarkdown(spec: SpecialistSpec): string {
  const lines = [`# ${spec.name}`, ""];
  if (spec.description) {
    lines.push(spec.description, "");
  }

  lines.push("## Summary", "");
  lines.push(`- ID: \`${spec.id}\``);
  lines.push(`- Group: \`${spec.group}\``);
  lines.push(`- Role: \`${spec.role || "-"}\``);
  lines.push(`- Model Tier: \`${spec.modelTier || "-"}\``);
  lines.push(`- Source YAML: \`${spec.path}\``);
  lines.push(`- Default Provider: \`${spec.defaultProvider || "-"}\``);
  lines.push(`- Default Adapter: \`${spec.defaultAdapter || "-"}\``);
  lines.push(`- Model Override: \`${spec.model || "-"}\``);
  lines.push(`- Execution Defaults: \`${renderExecutionSummary(spec)}\``);
  lines.push("");

  const promptSummary = firstPromptParagraph(spec.systemPrompt);
  if (promptSummary) {
    lines.push("## Prompt Summary", "", `> ${promptSummary}`, "");
  }

  if (spec.roleReminder) {
    lines.push("## Role Reminder", "", `> ${spec.roleReminder}`, "");
  }

  lines.push("## Prompt Excerpt", "", "```text", promptExcerpt(spec.systemPrompt), "```", "");

  if (spec.locales.length > 0) {
    lines.push("## Locale Overlays", "");
    lines.push("| Locale | Name | Description | File |");
    lines.push("|---|---|---|---|");
    for (const overlay of spec.locales) {
      lines.push(
        `| \`${overlay.locale ?? ""}\` | ${overlay.name ?? "-"} | ${overlay.description ?? "-"} | \`${overlay.path}\` |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function ensureCleanMarkdownTree(rootDir: string): void {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.endsWith(".md") || entry.name === "_category_.json") {
        fs.unlinkSync(fullPath);
      }
    }
  };

  walk(rootDir);
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true }).map((entry) => path.join(rootDir, entry.name)).sort().reverse()) {
    if (fs.existsSync(entry) && fs.statSync(entry).isDirectory()) {
      fs.rmSync(entry, { recursive: true, force: true });
    }
  }
}

function writeCategoryFile(directory: string, label: string, position?: number): void {
  const payload: Record<string, string | number> = { label };
  if (position !== undefined) {
    payload.position = position;
  }
  fs.writeFileSync(path.join(directory, "_category_.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeCategoryHierarchy(group: string): void {
  let current = OUTPUT_DIR;
  for (const [index, part] of group.split("/").entries()) {
    current = path.join(current, part);
    fs.mkdirSync(current, { recursive: true });
    const categoryFile = path.join(current, "_category_.json");
    if (!fs.existsSync(categoryFile)) {
      writeCategoryFile(current, part.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()), index + 1);
    }
  }
}

function saveDocs(catalog: SpecialistCatalog): void {
  ensureCleanMarkdownTree(OUTPUT_DIR);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  writeCategoryFile(OUTPUT_DIR, "Specialists", 4);
  fs.writeFileSync(path.join(OUTPUT_DIR, "README.md"), renderOverviewMarkdown(catalog), "utf8");

  for (const [group, specialists] of Object.entries(catalog.groups)) {
    writeCategoryHierarchy(group);
    for (const spec of specialists) {
      const docPath = docPathForSpecialist(spec);
      fs.mkdirSync(path.dirname(docPath), { recursive: true });
      fs.writeFileSync(docPath, renderSpecialistMarkdown(spec), "utf8");
    }
  }
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const catalog = scanSpecialists();

  if (args.has("--json")) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }
  if (args.has("--save")) {
    saveDocs(catalog);
    console.log(`✅ Saved to ${OUTPUT_DIR}`);
    return;
  }
  console.log(renderOverviewMarkdown(catalog));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
