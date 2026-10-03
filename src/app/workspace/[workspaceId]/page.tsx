/**
 * Workspace Page (Server Component Wrapper)
 *
 * This server component provides generateStaticParams for static export
 * and redirects the workspace root to the canonical Kanban work surface.
 *
 * Route: /workspace/[workspaceId]
 */

import { redirect } from "next/navigation";

// Required for static export - tells Next.js which paths to pre-render.
// For static export (ROUTA_BUILD_STATIC=1): return placeholder values
// For Vercel/SSR: return empty array (pages rendered on-demand)
export async function generateStaticParams() {
  if (process.env.ROUTA_BUILD_STATIC === "1") {
    return [{ workspaceId: "__placeholder__" }];
  }
  return [];
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/workspace/${workspaceId}/kanban`);
}
