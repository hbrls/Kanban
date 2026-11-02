import type { Meta, StoryObj } from "@storybook/react";

import { WorkspaceTabBar } from "./workspace-tab-bar";

const meta = {
  title: "Workspace/Workspace Tab Bar",
  component: WorkspaceTabBar,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    layout: "padded",
  },
  argTypes: {
    onTabChange: { action: "tab-changed" },
  },
  args: {
    activeTab: "overview",
    notesCount: 4,
    activityCount: 2,
    onTabChange: () => {},
  },
} satisfies Meta<typeof WorkspaceTabBar>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultStoryArgs = {
  activeTab: "overview" as const,
  notesCount: 4,
  activityCount: 2,
  onTabChange: () => {},
};

export const OverviewActive: Story = {
  args: defaultStoryArgs,
};

export const NotesActive: Story = {
  args: {
    ...defaultStoryArgs,
    activeTab: "notes",
  },
};

export const ActivityActive: Story = {
  args: {
    ...defaultStoryArgs,
    activeTab: "activity",
  },
};

export const ZeroCounts: Story = {
  args: {
    ...defaultStoryArgs,
    activeTab: "notes",
    notesCount: 0,
    activityCount: 0,
  },
};

export const FocusState: Story = {
  args: defaultStoryArgs,
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button");
    if (button instanceof HTMLElement) {
      button.focus();
    }
  },
};

export const DarkMode: Story = {
  args: defaultStoryArgs,
  globals: {
    colorMode: "dark",
  },
};
