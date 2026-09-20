import net from "net";

const SENSITIVE_ENV_NAME = /(key|token|secret|password|auth)/i;

export const DOCKER_EPHEMERAL_PORT_START = 49152;
export const DOCKER_EPHEMERAL_PORT_END = 65535;
export const DEFAULT_DOCKER_AGENT_IMAGE = process.env.ROUTA_DOCKER_OPENCODE_IMAGE ?? "routa/opencode-agent:latest";

export function generateContainerName(sessionId: string): string {
  const shortId = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
  return `routa-agent-${shortId || "session"}`;
}

export function sanitizeEnvForLogging(env?: Record<string, string | undefined>): Record<string, string> {
  const safe: Record<string, string> = {};
  if (!env) return safe;

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    safe[key] = SENSITIVE_ENV_NAME.test(key) ? "***" : value;
  }

  return safe;
}

export async function findAvailablePort(usedPorts: Set<number>): Promise<number> {
  for (let port = DOCKER_EPHEMERAL_PORT_START; port <= DOCKER_EPHEMERAL_PORT_END; port += 1) {
    if (usedPorts.has(port)) continue;
    const available = await isPortFree(port);
    if (available) return port;
  }

  throw new Error("No available ports in Docker ephemeral range (49152-65535)");
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

export function shellEscape(input: string): string {
  if (!input) return "''";
  return `'${input.replace(/'/g, `'\\''`)}'`;
}
