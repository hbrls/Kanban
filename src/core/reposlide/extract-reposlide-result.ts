export interface RepoSlideTranscriptMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface RepoSlideSessionResult {
  status: "running" | "completed";
  deckPath?: string;
  downloadUrl?: string;
  latestAssistantMessage?: string;
  summary?: string;
  updatedAt?: string;
}

const PPTX_PATH_PATTERN = /((?:\/|[A-Za-z]:\\)[^\s"'`]+?\.pptx)\b/i;

export function extractRepoSlideSessionResult(
  messages: RepoSlideTranscriptMessage[],
): RepoSlideSessionResult {
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant" && typeof message.content === "string" && message.content.trim().length > 0,
  );
  const latestAssistant = assistantMessages.at(-1);

  if (!latestAssistant) {
    return { status: "running" };
  }

  const deckPath = extractPptxPath(latestAssistant.content);

  return {
    status: deckPath ? "completed" : "running",
    deckPath,
    latestAssistantMessage: latestAssistant.content,
    summary: summarizeAssistantContent(latestAssistant.content),
    updatedAt: latestAssistant.timestamp,
  };
}

function extractPptxPath(content: string): string | undefined {
  return content.match(PPTX_PATH_PATTERN)?.[1];
}

function summarizeAssistantContent(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  return lines.slice(0, 12).join("\n");
}
