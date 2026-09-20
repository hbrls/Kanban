type SharpPipeline = {
  flatten(options: { background: string }): SharpPipeline;
  jpeg(options: { mozjpeg?: boolean; quality?: number }): SharpPipeline;
  metadata(): Promise<{ hasAlpha?: boolean }>;
  png(options?: { compressionLevel?: number }): SharpPipeline;
  resize(options: {
    fit?: "inside";
    width?: number;
    withoutEnlargement?: boolean;
  }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
};

export type SharpFactory = (input: Buffer | Uint8Array) => SharpPipeline;

/**
 * Load sharp only when the caller's project provides it. Keeping this as a
 * runtime import avoids making the npm package install native dependencies by
 * default.
 */
export async function loadSharp(): Promise<SharpFactory | null> {
  try {
    const importModule = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<{ default?: unknown }>;
    const imported = await importModule("sharp");
    return typeof imported.default === "function"
      ? (imported.default as SharpFactory)
      : null;
  } catch {
    return null;
  }
}
