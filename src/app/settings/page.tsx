/**
 * Settings Page - /settings
 *
 * Provides a full-page UI for all Routa settings:
 * - Providers (default agent providers and model configurations)
 * - Specialists (custom agent configurations)
 * - Models (custom model definitions with aliases)
 * - Memory (memory monitoring and cleanup)
 * - MCP Servers (Model Context Protocol server management)
 * - Webhooks (GitHub webhook triggers)
 * - Schedules (cron-based scheduled triggers)
 *
 * This server route wrapper keeps the page entry static-safe on Next.js 16
 * while delegating all interactive behavior to the client component.
 */

import { Suspense } from "react";
import { SettingsPageClient } from "./settings-page-client";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageClient />
    </Suspense>
  );
}
