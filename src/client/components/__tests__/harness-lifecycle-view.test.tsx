import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <div data-testid="mock-image">{props.alt ?? ""}</div>,
}));

import { HarnessLifecycleView } from "../harness-lifecycle-view";

describe("HarnessLifecycleView", () => {
  it("does not expose an interactive hotspot for the Requirements phase", () => {
    const onSelectedNodeChange = vi.fn();

    render(
      <HarnessLifecycleView
        selectedNodeId={null}
        onSelectedNodeChange={onSelectedNodeChange}
      />,
    );

    expect(screen.queryByRole("button", { name: "需求定义" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "编码实现" }));
    expect(onSelectedNodeChange).toHaveBeenCalledWith("build");
  });
});
