import type { Meta, StoryObj } from "@storybook/react";

import { OverviewCard } from "./overview-card";

const meta = {
  title: "Workspace/Overview Card",
  component: OverviewCard,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
  },
  args: {
    eyebrow: "Primary surface",
    title: "Kanban board",
    description: "Kanban is the canonical work surface for routing, queue supervision, and lane-based execution.",
    meta: ["3 boards", "12 active tasks", "2 background runs"],
    actionLabel: "Go to board",
    onAction: () => {},
  },
} satisfies Meta<typeof OverviewCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LatestRecoveryPoint: Story = {
  args: {
    eyebrow: "Latest recovery point",
    title: "bugfix-qa-session",
    description: "Recover the latest session from this workspace or continue task execution from the board.",
    meta: ["21 recent sessions", "8 notes", "4 agents"],
    actionLabel: "Open latest session",
  },
};

export const FocusState: Story = {
  play: async ({ canvasElement }) => {
    const action = canvasElement.querySelector("button");
    if (action instanceof HTMLButtonElement) {
      action.focus();
    }
  },
};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
};
