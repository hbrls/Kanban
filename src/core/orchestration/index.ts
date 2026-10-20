/**
 * Routa Orchestration Module
 *
 * Provides the multi-agent orchestration engine:
 * - Task block parsing (@@@task blocks)
 * - Specialist prompts (ROUTA/CRAFTER/GATE)
 */

export { extractTaskBlocks, hasTaskBlocks, parseTaskBlockContent } from "./task-block-parser";
export type { ParsedTask, ParseResult } from "./task-block-parser";

export {
  SPECIALISTS,
  getSpecialistByRole,
  getSpecialistById,
  buildDelegationPrompt,
  buildCoordinatorPrompt,
} from "./specialist-prompts";
export type { SpecialistConfig } from "./specialist-prompts";
