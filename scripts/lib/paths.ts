import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(LIB_DIR, "../..");

export function fromRoot(...segments: string[]): string {
  return path.join(ROOT_DIR, ...segments);
}

