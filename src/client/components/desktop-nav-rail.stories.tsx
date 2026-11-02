import type { Meta, StoryObj } from "@storybook/react";

import { DesktopNavRail } from "./desktop-nav-rail";

const meta = {
  title: "Navigation/Desktop Nav Rail",
  component: DesktopNavRail,
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
} satisfies Meta<typeof DesktopNavRail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OverviewActive: Story = {};

export const TracesActive: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/traces",
      },
    },
  },
};

export const HoverState: Story = {
  play: async ({ canvasElement }) => {
    const firstNavLink = canvasElement.querySelector("a");
    if (firstNavLink instanceof HTMLElement) {
      firstNavLink.style.backgroundColor = "var(--dt-bg-active)";
      firstNavLink.style.color = "var(--dt-text-primary)";
    }
  },
};

export const FocusState: Story = {
  play: async ({ canvasElement }) => {
    const firstNavLink = canvasElement.querySelector("a");
    if (firstNavLink instanceof HTMLElement) {
      firstNavLink.focus();
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
        pathname: "/workspace/default/kanban",
      },
    },
  },
};
