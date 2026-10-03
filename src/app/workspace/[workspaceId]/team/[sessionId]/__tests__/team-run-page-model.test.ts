import { describe, expect, it } from "vitest";

import {
  extractDelegationSessionId,
  resolveDelegationRosterSpecialistId,
  resolveDelegationTarget,
  resolveRosterSpecialistId,
} from "../team-run-page-model";

describe("team-run-page-model", () => {
  it("extracts delegated child session id from tool output", () => {
    expect(extractDelegationSessionId({
      rawOutput: {
        output: "{\"success\":true,\"sessionId\":\"child-123\",\"agentId\":\"agent-1\"}",
      },
    })).toBe("child-123");
  });

  it("falls back to delegated roster mapping for child sessions without specialist ids", () => {
    const delegatedRosterIdsBySessionId = new Map([
      ["child-123", "team-backend-dev"],
    ]);

    expect(resolveRosterSpecialistId({
      sessionId: "child-123",
      cwd: "/tmp",
      workspaceId: "default",
      createdAt: "2026-03-23T00:00:00.000Z",
      role: "CRAFTER",
    }, undefined, delegatedRosterIdsBySessionId)).toBe("team-backend-dev");
  });

  it("maps specialist aliases from delegation tool calls to team roster roles", () => {
    expect(resolveDelegationRosterSpecialistId({
      rawInput: {
        specialist: "researcher",
      },
    })).toBe("team-researcher");

    expect(resolveDelegationRosterSpecialistId({
      rawInput: {
        specialist: "backend-dev",
      },
    })).toBe("team-backend-dev");

    expect(resolveDelegationRosterSpecialistId({
      rawInput: {
        specialist: "qa",
      },
    })).toBe("team-qa");
  });

  it("renders human labels for delegation aliases", () => {
    expect(resolveDelegationTarget({
      rawInput: {
        specialist: "researcher",
      },
    })).toBe("Research Analyst");

    expect(resolveDelegationTarget({
      rawInput: {
        specialist: "backend-dev",
      },
    })).toBe("Backend Developer");
  });
});
