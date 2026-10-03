import { pathToFileURL } from "node:url";

export function getCliArgs(argv: string[] = process.argv.slice(2)): Set<string> {
  return new Set(argv);
}

export function isDirectExecution(importMetaUrl: string, entryArg = process.argv[1]): boolean {
  return Boolean(entryArg) && importMetaUrl === pathToFileURL(entryArg).href;
}

