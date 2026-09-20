import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { BranchSelector } from "./branch-selector";
import {
  createFetchMockDecorator,
  jsonResponse,
  type StoryFetchRoute,
} from "./storybook-fetch-mock";

const defaultBranchData = {
  current: "main",
  local: ["main", "feature/storybook", "release/2026-q1"],
  remote: ["main", "feature/storybook", "release/2026-q1", "origin/remote-only-fix"],
  status: {
    ahead: 0,
    behind: 0,
    hasUncommittedChanges: false,
  },
};

const routesFor = (branchData = defaultBranchData): StoryFetchRoute[] => [
  {
    match: (url, init) =>
      url.includes("/api/clone/branches?repoPath=") && (!init?.method || init.method === "GET"),
    respond: () => jsonResponse(branchData),
  },
  {
    match: (url, init) => url.includes("/api/clone/branches") && init?.method === "POST",
    respond: () => jsonResponse(branchData),
  },
  {
    match: (url, init) => url.includes("/api/clone/branches") && init?.method === "PATCH",
    respond: async (_url, init) => {
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ success: true, branch: payload.branch ?? branchData.current });
    },
  },
];

const meta = {
  title: "Core/Branch Selector",
  component: BranchSelector,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  decorators: [createFetchMockDecorator(routesFor()) as Decorator],
  args: {
    repoPath: "/Users/phodal/ai/routa-js",
    currentBranch: "main",
    onBranchChange: () => {},
    disabled: false,
  },
} satisfies Meta<typeof BranchSelector>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultStoryArgs = {
  repoPath: "/Users/phodal/ai/routa-js",
  currentBranch: "main",
  onBranchChange: () => {},
  disabled: false,
};

export const Default: Story = {
  args: defaultStoryArgs,
};

export const RemoteBranches: Story = {
  args: {
    ...defaultStoryArgs,
  },
  decorators: [
    createFetchMockDecorator(
      routesFor({
        ...defaultBranchData,
        status: {
          ahead: 0,
          behind: 2,
          hasUncommittedChanges: true,
        },
      }),
    ) as Decorator,
  ],
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector("button");
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const Disabled: Story = {
  args: {
    ...defaultStoryArgs,
    disabled: true,
  },
};

export const FocusState: Story = {
  args: defaultStoryArgs,
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector("button");
    if (trigger instanceof HTMLElement) {
      trigger.focus();
    }
  },
};

export const DarkMode: Story = {
  args: {
    ...defaultStoryArgs,
  },
  globals: {
    colorMode: "dark",
  },
};
