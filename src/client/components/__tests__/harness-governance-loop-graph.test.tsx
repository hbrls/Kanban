import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  Handle: () => null,
  ReactFlow: ({
    nodes,
    nodeTypes,
    onNodeClick,
  }: {
    nodes: Array<{ id: string; type: string; data: { title: string } }>;
    nodeTypes?: Record<string, (props: { data: unknown }) => ReactNode>;
    onNodeClick?: (_event: unknown, node: { id: string }) => void;
  }) => (
    <div data-testid="react-flow">
      {nodes.map((node) => {
        const NodeComponent = nodeTypes?.[node.type];
        return (
          <div key={node.id}>
            {NodeComponent ? <NodeComponent data={node.data} /> : null}
            <button
              type="button"
              onClick={() => onNodeClick?.(null, { id: node.id })}
            >
              flow-node-{node.id}
            </button>
          </div>
        );
      })}
    </div>
  ),
  MarkerType: { ArrowClosed: "ArrowClosed" },
  Position: {
    Top: "top",
    Right: "right",
    Bottom: "bottom",
    Left: "left",
  },
}));

import { HarnessGovernanceLoopGraph } from "../harness-governance-loop-graph";

describe("HarnessGovernanceLoopGraph", () => {
  it("renders the governance flow without a coding design-decision node", () => {
    render(
      <HarnessGovernanceLoopGraph
        repoPath="/Users/phodal/ai/routa-js"
        planError={null}
      />,
    );

    expect(screen.queryByRole("button", { name: /Internal loop Design decisions/i })).toBeNull();
    expect(screen.queryByText("No ADR / design decision source connected (docs/ARCHITECTURE.md or docs/adr)")).toBeNull();
    expect(screen.getByText("No release / publish workflow detected in this repository.")).not.toBeNull();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: /Internal loop Implementation/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Internal loop Requirements/i })).not.toBeNull();
  });

  it("keeps available stages selectable through the governance flow", () => {
    const onSelectedNodeChange = vi.fn();

    render(
      <HarnessGovernanceLoopGraph
        repoPath="/Users/phodal/ai/routa-js"
        planError={null}
        selectedNodeId="build"
        onSelectedNodeChange={onSelectedNodeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: /Push loop Change gates/i,
    }));

    expect(onSelectedNodeChange).toHaveBeenCalledWith("precommit");
  });

  it("uses ArrowLeft for the Test -> Build transition", () => {
    const onSelectedNodeChange = vi.fn();

    render(
      <HarnessGovernanceLoopGraph
        repoPath="/Users/phodal/ai/routa-js"
        planError={null}
        selectedNodeId="test"
        onSelectedNodeChange={onSelectedNodeChange}
      />,
    );

    const testNode = screen.getByRole("button", {
      name: /Internal loop Local verification/i,
    });

    fireEvent.keyDown(testNode, { key: "ArrowRight" });
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(0);

    fireEvent.keyDown(testNode, { key: "ArrowLeft" });
    expect(onSelectedNodeChange).toHaveBeenCalledWith("build");
  });

  it("navigates directly from Requirements to Implementation with ArrowRight", () => {
    const onSelectedNodeChange = vi.fn();

    render(
      <HarnessGovernanceLoopGraph
        repoPath="/Users/phodal/ai/routa-js"
        planError={null}
        selectedNodeId="build"
        onSelectedNodeChange={onSelectedNodeChange}
      />,
    );

    const buildNode = screen.getByRole("button", {
      name: /Internal loop Implementation/i,
    });

    fireEvent.keyDown(buildNode, { key: "ArrowRight" });
    expect(onSelectedNodeChange).toHaveBeenCalledWith("test");
  });

  it("keeps the Requirements phase non-interactive without spec sources details", () => {
    const onSelectedNodeChange = vi.fn();

    render(
      <HarnessGovernanceLoopGraph
        repoPath="/Users/phodal/ai/routa-js"
        planError={null}
        selectedNodeId="build"
        onSelectedNodeChange={onSelectedNodeChange}
      />,
    );

    const thinkingNode = screen.getByRole("button", {
      name: /Internal loop Requirements/i,
    });

    fireEvent.click(thinkingNode);
    fireEvent.keyDown(thinkingNode, { key: "ArrowRight" });
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(0);

    expect(screen.queryByText("Spec Sources")).toBeNull();
    expect(screen.queryByText("Evidence model")).toBeNull();
    expect(screen.queryByText("artifacts-present")).toBeNull();
  });
});
