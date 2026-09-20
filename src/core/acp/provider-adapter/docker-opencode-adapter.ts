import { OpenCodeAdapter } from "./opencode-adapter";
import type { ProviderBehavior } from "./types";

/**
 * Docker OpenCode emits the same ACP session/update shapes as OpenCode,
 * but uses a separate provider ID for routing and analytics.
 */
export class DockerOpenCodeProviderAdapter extends OpenCodeAdapter {
  override getBehavior(): ProviderBehavior {
    return {
      type: "docker-opencode",
      immediateToolInput: false,
      streaming: true,
    };
  }
}
