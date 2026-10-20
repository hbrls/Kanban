/** Standard A2A discovery endpoint. */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    name: "Routa Multi-Agent Coordinator",
    description: "Multi-agent coordination platform with ACP and MCP support",
    protocolVersion: "0.3.0",
    version: "0.1.0",
    url: "/api/a2a/rpc",
    skills: [
      {
        id: "coordination",
        name: "Agent Coordination",
        description: "Create, delegate tasks to, and coordinate multiple AI agents",
        tags: ["coordination", "multi-agent", "orchestration"],
      },
      {
        id: "acp-proxy",
        name: "ACP Session Proxy",
        description: "Proxy access to backend ACP agent sessions",
        tags: ["acp", "session", "proxy"],
      },
    ],
    capabilities: { pushNotifications: true },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    additionalInterfaces: [{ url: "/api/a2a/rpc", transport: "JSONRPC" }],
  }, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
