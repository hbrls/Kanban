import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button";
import { DesktopAppShell } from "./desktop-app-shell";

const meta = {
  title: "Layouts/Desktop App Shell",
  component: DesktopAppShell,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    nextjs: {
      navigation: {
        pathname: "/workspace/default",
      },
    },
  },
  argTypes: {
    workspaceId: { control: "text" },
    workspaceTitle: { control: "text" },
  },
  args: {
    workspaceId: "default",
    workspaceTitle: "Default Workspace",
  },
  render: (args) => (
    <DesktopAppShell
      {...args}
      titleBarRight={<Button size="sm">New Task</Button>}
    >
      <div className="h-full p-4 text-sm text-desktop-text-primary">
        Desktop shell content area
      </div>
    </DesktopAppShell>
  ),
} satisfies Meta<typeof DesktopAppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultStoryArgs = {
  workspaceId: "default",
  workspaceTitle: "Default Workspace",
  children: null,
};

export const Default: Story = {
  args: defaultStoryArgs,
};

export const KanbanActive: Story = {
  args: defaultStoryArgs,
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/workspace/default/kanban",
      },
    },
  },
};

export const HoverState: Story = {
  args: defaultStoryArgs,
  play: async ({ canvasElement }) => {
    const firstNavLink = canvasElement.querySelector('[data-testid="desktop-shell-sidebar"] a');
    if (firstNavLink instanceof HTMLElement) {
      firstNavLink.style.backgroundColor = "var(--dt-bg-active)";
      firstNavLink.style.color = "var(--dt-text-primary)";
    }
  },
};

export const FocusState: Story = {
  args: defaultStoryArgs,
  play: async ({ canvasElement }) => {
    const firstNavLink = canvasElement.querySelector('[data-testid="desktop-shell-sidebar"] a');
    if (firstNavLink instanceof HTMLElement) {
      firstNavLink.focus();
    }
  },
};

export const DarkMode: Story = {
  args: defaultStoryArgs,
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
