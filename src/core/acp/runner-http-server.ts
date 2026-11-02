import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextRequest } from "next/server";

type RouteMatch =
  | { kind: "acp" }
  | { kind: "session"; sessionId: string }
  | { kind: "sessionHistory"; sessionId: string }
  | { kind: "sessionDisconnect"; sessionId: string }
  | null;

type RouteContext = { params: Promise<{ sessionId: string }> };
type AcpGetHandler = (request: NextRequest) => Promise<Response>;
type AcpPostHandler = (request: NextRequest) => Promise<Response>;
type SessionGetHandler = (request: NextRequest, context: RouteContext) => Promise<Response>;
type SessionPatchHandler = (request: NextRequest, context: RouteContext) => Promise<Response>;
type SessionDeleteHandler = (request: NextRequest, context: RouteContext) => Promise<Response>;
type SessionDisconnectHandler = (request: NextRequest, context: RouteContext) => Promise<Response>;
type SessionHistoryHandler = (request: NextRequest, context: RouteContext) => Promise<Response>;

type RunnerHandlers = {
  getAcp: AcpGetHandler;
  postAcp: AcpPostHandler;
  getSession: SessionGetHandler;
  patchSession: SessionPatchHandler;
  deleteSession: SessionDeleteHandler;
  disconnectSession: SessionDisconnectHandler;
  getSessionHistory: SessionHistoryHandler;
};

let handlerPromise: Promise<RunnerHandlers> | null = null;

function importRouteModule<T>(modulePath: string): Promise<T> {
  return Function("modulePath", "return import(modulePath)")(modulePath) as Promise<T>;
}

async function loadRunnerHandlers(): Promise<RunnerHandlers> {
  const [acpRoute, sessionRoute, disconnectRoute, historyRoute] = await Promise.all([
    importRouteModule<{ GET: AcpGetHandler; POST: AcpPostHandler }>("@/app/api/acp/route"),
    importRouteModule<{
      GET: SessionGetHandler;
      PATCH: SessionPatchHandler;
      DELETE: SessionDeleteHandler;
    }>("@/app/api/sessions/[sessionId]/route"),
    importRouteModule<{ POST: SessionDisconnectHandler }>("@/app/api/sessions/[sessionId]/disconnect/route"),
    importRouteModule<{ GET: SessionHistoryHandler }>("@/app/api/sessions/[sessionId]/history/route"),
  ]);

  return {
    getAcp: acpRoute.GET,
    postAcp: acpRoute.POST,
    getSession: sessionRoute.GET,
    patchSession: sessionRoute.PATCH,
    deleteSession: sessionRoute.DELETE,
    disconnectSession: disconnectRoute.POST,
    getSessionHistory: historyRoute.GET,
  };
}

async function getRunnerHandlers(): Promise<RunnerHandlers> {
  handlerPromise ??= loadRunnerHandlers();
  return handlerPromise;
}

export function matchRunnerRoute(pathname: string): RouteMatch {
  if (pathname === "/api/acp") {
    return { kind: "acp" };
  }

  const disconnectMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/disconnect$/);
  if (disconnectMatch) {
    return {
      kind: "sessionDisconnect",
      sessionId: decodeURIComponent(disconnectMatch[1]),
    };
  }

  const historyMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/history$/);
  if (historyMatch) {
    return {
      kind: "sessionHistory",
      sessionId: decodeURIComponent(historyMatch[1]),
    };
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    return {
      kind: "session",
      sessionId: decodeURIComponent(sessionMatch[1]),
    };
  }

  return null;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

function toNextRequest(baseUrl: string, req: IncomingMessage, body?: Buffer): NextRequest {
  const url = new URL(req.url ?? "/", baseUrl);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new NextRequest(url, {
    method: req.method,
    headers,
    body: body ? new Blob([new Uint8Array(body)]) : undefined,
    duplex: body ? "half" : undefined,
  });
}

async function writeResponse(nodeRes: ServerResponse, response: Response): Promise<void> {
  nodeRes.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value);
  });

  if (!response.body) {
    nodeRes.end();
    return;
  }

  const readable = Readable.fromWeb(response.body as unknown as NodeReadableStream);
  await new Promise<void>((resolve, reject) => {
    readable.on("error", reject);
    nodeRes.on("error", reject);
    nodeRes.on("close", resolve);
    readable.pipe(nodeRes);
  });
}

export async function handleRunnerRequest(baseUrl: string, req: IncomingMessage): Promise<Response> {
  const url = new URL(req.url ?? "/", baseUrl);
  const match = matchRunnerRoute(url.pathname);
  if (!match) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await readRequestBody(req);
  const nextRequest = toNextRequest(baseUrl, req, body);
  const handlers = await getRunnerHandlers();

  if (match.kind === "acp") {
    if (req.method === "GET") return handlers.getAcp(nextRequest);
    if (req.method === "POST") return handlers.postAcp(nextRequest);
  }

  if (match.kind === "session") {
    const params = Promise.resolve({ sessionId: match.sessionId });
    if (req.method === "GET") return handlers.getSession(nextRequest, { params });
    if (req.method === "PATCH") return handlers.patchSession(nextRequest, { params });
    if (req.method === "DELETE") return handlers.deleteSession(nextRequest, { params });
  }

  if (match.kind === "sessionHistory" && req.method === "GET") {
    return handlers.getSessionHistory(nextRequest, {
      params: Promise.resolve({ sessionId: match.sessionId }),
    });
  }

  if (match.kind === "sessionDisconnect" && req.method === "POST") {
    return handlers.disconnectSession(nextRequest, {
      params: Promise.resolve({ sessionId: match.sessionId }),
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export async function startAcpRunnerServer(options?: { host?: string; port?: number }) {
  const host = options?.host ?? process.env.ROUTA_ACP_RUNNER_HOST ?? "127.0.0.1";
  const port = options?.port ?? Number.parseInt(process.env.ROUTA_ACP_RUNNER_PORT ?? "3310", 10);
  const baseUrl = `http://${host}:${port}`;

  const server = createServer(async (req, res) => {
    try {
      const response = await handleRunnerRequest(baseUrl, req);
      await writeResponse(res, response);
    } catch (error) {
      console.error("[ACP Runner] Unhandled request failure:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
      }
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Internal Server Error",
      }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`[ACP Runner] Listening on ${baseUrl}`);
  return server;
}
