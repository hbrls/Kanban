import type { Meta, StoryObj } from "@storybook/react";

import { WorkspacePageHeader } from "./workspace-page-header";

const meta = {
  title: "Workspace/Workspace Page Header",
  component: WorkspacePageHeader,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
  },
  args: {
    title: "Default Workspace",
    workspaceId: "default",
    boardName: "Main Board",
    latestSessionName: "recovery-session-12",
    activeAgentsCount: 3,
    pendingTasksCount: 8,
    onRefresh: () => {},
    onTeam: () => {},
    onKanban: () => {},
    onTraces: () => {},
  },
} satisfies Meta<typeof WorkspacePageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const StandbyState: Story = {
  args: {
    activeAgentsCount: 0,
    pendingTasksCount: 0,
    latestSessionName: "No recent session",
  },
};

export const FocusState: Story = {
  play: async ({ canvasElement }) => {
    const refreshButton = canvasElement.querySelector("button");
    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.focus();
    }
  },
};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
};
