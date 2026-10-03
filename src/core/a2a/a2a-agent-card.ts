/**
 * A2A Agent Card Fetching - Utilities for fetching and validating A2A Agent Cards
 */

import {
  type AgentCard,
  A2AInvalidCardError,
  A2ANetworkError,
  A2AOutboundClientOptions,
} from "./types";

/**
 * Default options for Agent Card fetching
 */
const DEFAULT_FETCH_OPTIONS: Required<
  Pick<A2AOutboundClientOptions, "timeout" | "maxRetries" | "retryDelay">
> = {
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * Fetch an A2A Agent Card from a URL
 *
 * @param url - The URL to fetch the Agent Card from
 * @param options - Optional client options for timeout and retries
 * @returns The validated Agent Card
 * @throws {A2AInvalidCardError} If the card is invalid or missing required fields
 * @throws {A2ANetworkError} If the network request fails after retries
 */
export async function fetchAgentCard(
  url: string,
  options?: A2AOutboundClientOptions
): Promise<AgentCard> {
  const opts = { ...DEFAULT_FETCH_OPTIONS, ...options };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxRetries!; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...(options?.requestHeaders ?? {}),
        },
        signal: AbortSignal.timeout(opts.timeout!),
      });

      if (!response.ok) {
        throw new A2ANetworkError(
          `HTTP ${response.status}: ${response.statusText} while fetching Agent Card from ${url}`
        );
      }

      const card = (await response.json()) as AgentCard;

      // Validate the card has required fields
      validateAgentCard(card, url);

      return card;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if it's a validation error
      if (lastError instanceof A2AInvalidCardError) {
        throw lastError;
      }

      // Wait before retrying (except on the last attempt)
      if (attempt < opts.maxRetries! - 1) {
        await sleep(opts.retryDelay!);
      }
    }
  }

  throw new A2ANetworkError(
    `Failed to fetch Agent Card after ${opts.maxRetries} attempts: ${lastError?.message}`,
    lastError
  );
}

/**
 * Validate an Agent Card has the required fields
 *
 * @param card - The Agent Card to validate
 * @param url - The URL where the card was fetched from (for error messages)
 * @throws {A2AInvalidCardError} If the card is invalid
 */
export function validateAgentCard(card: unknown, url: string): asserts card is AgentCard {
  if (!card || typeof card !== "object") {
    throw new A2AInvalidCardError("Agent Card must be an object", url);
  }

  const c = card as Partial<AgentCard>;

  if (!c.name || typeof c.name !== "string") {
    throw new A2AInvalidCardError("Agent Card must have a 'name' field", url);
  }

  if (!c.version || typeof c.version !== "string") {
    throw new A2AInvalidCardError("Agent Card must have a 'version' field", url);
  }

  if (!c.url || typeof c.url !== "string") {
    throw new A2AInvalidCardError("Agent Card must have a 'url' field pointing to the RPC endpoint", url);
  }

  // Validate protocol version is present
  if (!c.protocolVersion || typeof c.protocolVersion !== "string") {
    throw new A2AInvalidCardError("Agent Card must have a 'protocolVersion' field", url);
  }

  // Validate skills is an array if present
  if (c.skills !== undefined && !Array.isArray(c.skills)) {
    throw new A2AInvalidCardError("Agent Card 'skills' must be an array", url);
  }
}

/**
 * Extract the RPC endpoint URL from an Agent Card
 *
 * @param card - The Agent Card to extract the URL from
 * @returns The RPC endpoint URL
 */
export function getRpcEndpoint(card: AgentCard): string {
  return card.url;
}

/**
 * Check if an Agent Card supports a specific skill
 *
 * @param card - The Agent Card to check
 * @param skillId - The skill ID to look for
 * @returns True if the skill is supported
 */
export function hasSkill(card: AgentCard, skillId: string): boolean {
  return card.skills?.some((skill) => skill.id === skillId) ?? false;
}

/**
 * Get all skill IDs from an Agent Card
 *
 * @param card - The Agent Card to get skills from
 * @returns Array of skill IDs
 */
export function getSkillIds(card: AgentCard): string[] {
  return card.skills?.map((skill) => skill.id) ?? [];
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  // If timeout signal is already provided, use it directly
  if (init.signal) {
    return fetch(input, init);
  }

  // Otherwise use the default timeout
  return fetch(input, { ...init, signal: AbortSignal.timeout(DEFAULT_FETCH_OPTIONS.timeout) });
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
