const AGENT_ENV_KEYS = [
  "ANTHROPIC_AGENT",
  "AUGMENT_AGENT",
  "CURSOR_AGENT",
  "ROUTA_AGENT",
  "AIDER_AGENT",
  "COPILOT_AGENT",
  "WINDSURF_AGENT",
  "CLINE_AGENT",
];

export function isAiAgent(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLAUDE_CODE === "1") {
    return true;
  }

  if (AGENT_ENV_KEYS.some((key) => Boolean(env[key]))) {
    return true;
  }

  if (env.GITHUB_ACTIONS || env.CI) {
    return true;
  }

  return Boolean(env.CLAUDE_CONFIG_DIR || env.MCP_SERVER_NAME);
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
