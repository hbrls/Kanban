import type { Meta, StoryObj } from "@storybook/react";

import { TracesViewTabs } from "./traces-view-tabs";

const meta = {
  title: "Traces/Traces View Tabs",
  component: TracesViewTabs,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    layout: "padded",
  },
  argTypes: {
    onTabChange: { action: "tab-changed" },
  },
  args: {
    activeTab: "chat",
    onTabChange: () => {},
  },
} satisfies Meta<typeof TracesViewTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultStoryArgs = {
  activeTab: "chat" as const,
  onTabChange: () => {},
};

export const ChatActive: Story = {
  args: defaultStoryArgs,
};

export const TraceActive: Story = {
  args: {
    ...defaultStoryArgs,
    activeTab: "event-bridge",
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
  globals: {
    colorMode: "dark",
  },
  args: {
    ...defaultStoryArgs,
    activeTab: "event-bridge",
  },
};
