/**
 * Shared database-related types.
 *
 * The PostgreSQL table definitions were removed together with PG support;
 * SQLite table definitions live in sqlite-schema.ts. This file keeps only
 * types shared with other modules (e.g. sqlite-stores.ts).
 */

export interface SkillFileEntry {
  /** Relative path within the skill (e.g., "SKILL.md", "examples/usage.md") */
  path: string;
  /** File content */
  content: string;
}
