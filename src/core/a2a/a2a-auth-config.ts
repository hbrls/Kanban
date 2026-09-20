const A2A_AUTH_CONFIGS_ENV = "ROUTA_A2A_AUTH_CONFIGS";

export interface A2AResolvedAuthConfig {
  headers: Record<string, string>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string");
}

function parseA2AAuthConfigs(): Record<string, A2AResolvedAuthConfig> {
  const raw = process.env[A2A_AUTH_CONFIGS_ENV]?.trim();
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${A2A_AUTH_CONFIGS_ENV} JSON: ${detail}`, {
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${A2A_AUTH_CONFIGS_ENV} must be a JSON object keyed by auth config id.`);
  }

  return Object.entries(parsed).reduce<Record<string, A2AResolvedAuthConfig>>((acc, [configId, value]) => {
    if (isStringRecord(value)) {
      acc[configId] = { headers: value };
      return acc;
    }

    const headers = value && typeof value === "object" && !Array.isArray(value)
      ? (value as { headers?: unknown }).headers
      : undefined;
    if (!isStringRecord(headers)) {
      throw new Error(
        `${A2A_AUTH_CONFIGS_ENV}.${configId} must be either a header map or an object with a string header map in "headers".`,
      );
    }

    acc[configId] = { headers };
    return acc;
  }, {});
}

export function resolveA2AAuthConfig(authConfigId?: string): A2AResolvedAuthConfig | undefined {
  const normalizedId = authConfigId?.trim();
  if (!normalizedId) {
    return undefined;
  }

  const configs = parseA2AAuthConfigs();
  const config = configs[normalizedId];
  if (!config) {
    throw new Error(
      `A2A auth config "${normalizedId}" was not found in ${A2A_AUTH_CONFIGS_ENV}.`,
    );
  }

  return config;
}
