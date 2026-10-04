/**
 * Workspace / Vision - /workspace/:workspaceId/vision
 * React Flow proof-of-concept canvas with a fixed three-node demo graph.
 * Frontend-only: no business data, API, or persistence dependencies.
 */
import { VisionPageClient } from "./vision-page-client";

export async function generateStaticParams() {
  if (process.env.ROUTA_BUILD_STATIC === "1") {
    return [{ workspaceId: "__placeholder__" }];
  }
  return [];
}

export default function WorkspaceVisionPage() {
  return <VisionPageClient />;
}
