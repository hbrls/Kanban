function looksLikeFilePath(title: string): boolean {
  const value = title.trim();
  if (!value) return false;

  return value.startsWith("/")
    || value.startsWith("./")
    || value.startsWith("../")
    || value.startsWith("~/")
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes("\\")
    || /\/[^/\s]+\.[A-Za-z0-9]{1,8}$/.test(value)
    || /\.[A-Za-z0-9]{1,8}$/.test(value);
}

function isGenericToolName(name: string | undefined): boolean {
  if (!name) return true;
  const genericNames = ["other", "tool", "unknown", "function", "action"];
  return genericNames.includes(name.toLowerCase());
}

function inferFromInput(rawInput?: Record<string, unknown>): string | null {
  if (!rawInput) return null;

  const hasFilePath = "file_path" in rawInput || "path" in rawInput || "filePath" in rawInput;
  const hasContent = "content" in rawInput || "file_content" in rawInput;
  const hasCommand = "command" in rawInput;
  const hasInfoRequest = "information_request" in rawInput;
  const hasQuery = "query" in rawInput;
  const hasPattern = "pattern" in rawInput || "glob_pattern" in rawInput;
  const hasUrl = "url" in rawInput;
  const hasOldStr = "old_str" in rawInput || "old_str_1" in rawInput;
  const hasTerminalId = "terminal_id" in rawInput;
  const hasInsertLine = "insert_line" in rawInput || "insert_line_1" in rawInput;
  const hasViewRange = "view_range" in rawInput;

  if (hasInfoRequest) return "codebase-retrieval";
  if (hasOldStr && hasFilePath) return "str-replace-editor";
  if (hasInsertLine && hasFilePath) return "str-replace-editor";
  if (hasViewRange && hasFilePath) return "view";
  if (hasFilePath && hasContent) return "write-file";
  if (hasFilePath && !hasContent) return "read-file";
  if (hasTerminalId && hasCommand) return "launch-process";
  if (hasTerminalId) return "terminal";
  if (hasCommand) return "shell";
  if (hasUrl && hasQuery) return "web-search";
  if (hasUrl) return "web-fetch";
  if (hasPattern) return "glob";
  if (hasQuery) return "search";

  return null;
}

function extractProviderToolName(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const providerMatch = title.match(/^Tool:\s+[^/]+\/([^/\s]+)$/);
  return providerMatch?.[1];
}

export function inferToolDisplayName(
  title: string | undefined,
  kind: string | undefined,
  rawInput?: Record<string, unknown>
): string {
  const providerToolName = extractProviderToolName(title);
  if (providerToolName) return providerToolName;

  const inferredFromInput = inferFromInput(rawInput);

  if (title && looksLikeFilePath(title)) {
    return inferredFromInput ?? kind ?? "read-file";
  }

  if (isGenericToolName(title)) {
    if (inferredFromInput) return inferredFromInput;
    if (!isGenericToolName(kind)) return kind!;
    return inferredFromInput ?? "tool";
  }

  return title ?? inferredFromInput ?? kind ?? "tool";
}
