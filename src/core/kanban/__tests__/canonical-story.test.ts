import { describe, expect, it } from "vitest";
import { extractCanonicalStoryYaml, parseCanonicalStory } from "../canonical-story";

describe("canonical story YAML parsing", () => {
  const validMarkdown = `# Refined Story

Some human-readable summary.

\`\`\`yaml
story:
  version: 1
  language: en
  title: User can update profile
  problem_statement: Users cannot manage their own profile information.
  user_value: Users need self-service account management.
  acceptance_criteria:
    - id: AC1
      text: User can edit display name from settings.
      testable: true
    - id: AC2
      text: Updated display name persists after refresh.
      testable: true
  constraints_and_affected_areas:
    - src/app/settings/page.tsx
    - src/core/user/profile.ts
  dependencies_and_sequencing:
    independent_story_check: pass
    depends_on:
      - none
    unblock_condition: Ready to start now.
  out_of_scope:
    - Avatar uploads
  invest:
    independent:
      status: pass
      reason: This can ship on its own.
    negotiable:
      status: warning
      reason: Final field list may still change.
    valuable:
      status: pass
      reason: Users gain direct value.
    estimable:
      status: pass
      reason: Touched files are identified.
    small:
      status: pass
      reason: Limited to one settings flow.
    testable:
      status: pass
      reason: AC is concrete and verifiable.
\`\`\`

## Execution Notes

Todo will add execution detail later.
`;

  it("extracts the first canonical YAML block", () => {
    expect(extractCanonicalStoryYaml(validMarkdown)).toContain("story:");
    expect(extractCanonicalStoryYaml("no yaml here")).toBeNull();
  });

  it("parses a valid canonical story document", () => {
    const result = parseCanonicalStory(validMarkdown);

    expect(result.hasYamlBlock).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.story?.story.title).toBe("User can update profile");
    expect(result.story?.story.acceptance_criteria).toHaveLength(2);
    expect(result.story?.story.invest.independent.status).toBe("pass");
  });

  it("allows depends_on to be an empty array", () => {
    const result = parseCanonicalStory(
      validMarkdown.replace("depends_on:\n      - none", "depends_on: []"),
    );

    expect(result.issues).toEqual([]);
    expect(result.story?.story.dependencies_and_sequencing.depends_on).toEqual([]);
  });

  it("allows depends_on to be omitted", () => {
    const result = parseCanonicalStory(
      validMarkdown.replace("    depends_on:\n      - none\n", ""),
    );

    expect(result.issues).toEqual([]);
    expect(result.story?.story.dependencies_and_sequencing.depends_on).toEqual([]);
  });

  it("reports invalid YAML syntax", () => {
    const result = parseCanonicalStory("```yaml\nstory: [broken\n```");

    expect(result.hasYamlBlock).toBe(true);
    expect(result.story).toBeNull();
    expect(result.issues[0]).toContain("Failed to parse canonical story YAML");
  });

  it("reports missing required fields", () => {
    const result = parseCanonicalStory(`\`\`\`yaml
story:
  version: 1
  language: en
  title: Incomplete story
  problem_statement: Missing most required fields.
\`\`\``);

    expect(result.hasYamlBlock).toBe(true);
    expect(result.story).toBeNull();
    expect(result.issues).toContain("story.user_value must be a non-empty string");
    expect(result.issues).toContain("story.acceptance_criteria must be an array");
    expect(result.issues).toContain("story.invest must be an object");
  });
});
