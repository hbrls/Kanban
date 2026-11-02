export function normalizeThoughtContent(content: string): string {
  return content.replace(/^(?:\r?\n)+/, "");
}
