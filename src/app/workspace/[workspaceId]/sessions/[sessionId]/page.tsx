/**
 * Workspace Session Page (Server Component Wrapper)
 *
 * This server component provides generateStaticParams for static export
 * and renders the client component.
 *
 * Route: /workspace/[workspaceId]/sessions/[sessionId]
 */

import { Suspense } from "react";
import { SessionPageClient } from "./session-page-client";

// Required for static export - tells Next.js which paths to pre-render.
// For static export (ROUTA_BUILD_STATIC=1): return placeholder values
// For Vercel/SSR: return empty array (pages rendered on-demand)
export async function generateStaticParams() {
  if (process.env.ROUTA_BUILD_STATIC === "1") {
    return [{ workspaceId: "__placeholder__", sessionId: "__placeholder__" }];
  }
  return [];
}

export default function WorkspaceSessionPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <SessionPageClient />
    </Suspense>
  );
}
