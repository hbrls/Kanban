import type { Meta, StoryObj } from "@storybook/react";

import { DesktopSidebar } from "./desktop-sidebar";

const meta = {
  title: "Navigation/Desktop Sidebar",
  component: DesktopSidebar,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    layout: "centered",
    nextjs: {
      navigation: {
        pathname: "/workspace/default",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="desktop-theme h-[640px] w-12 border border-desktop-border">
        <Story />
      </div>
    ),
  ],
  args: {
    workspaceId: "default",
  },
} satisfies Meta<typeof DesktopSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OverviewActive: Story = {};

export const KanbanActive: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/workspace/default/kanban",
      },
    },
  },
};

export const HoverState: Story = {
  play: async ({ canvasElement }) => {
    const settingsLink = canvasElement.querySelector('a[title="Settings"]');
    if (settingsLink instanceof HTMLElement) {
      settingsLink.style.backgroundColor = "var(--dt-bg-active)";
      settingsLink.style.color = "var(--dt-text-primary)";
    }
  },
};

export const FocusState: Story = {
  play: async ({ canvasElement }) => {
    const settingsLink = canvasElement.querySelector('a[title="Settings"]');
    if (settingsLink instanceof HTMLElement) {
      settingsLink.focus();
    }
  },
};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/traces",
      },
    },
  },
};
