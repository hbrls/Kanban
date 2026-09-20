import type { Meta, StoryObj } from "@storybook/react";

import type { WorkspaceData } from "@/client/hooks/use-workspaces";

import { Button } from "./button";
import { DesktopLayout } from "./desktop-layout";

const workspaces: WorkspaceData[] = [
  {
    id: "default",
    title: "Default Workspace",
    status: "active",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "delivery",
    title: "Delivery Platform",
    status: "active",
    metadata: {},
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
];

const meta = {
  title: "Layouts/Desktop Layout",
  component: DesktopLayout,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    nextjs: {
      navigation: {
        pathname: "/workspace/default",
      },
    },
  },
  args: {
    workspaceId: "default",
    workspaces,
    activeWorkspaceTitle: "Default Workspace",
    workspacesLoading: false,
    onWorkspaceSelect: () => {},
    onWorkspaceCreate: async () => {},
  },
  render: (args) => (
    <DesktopLayout
      {...args}
      titleBarRight={<Button size="sm">Create</Button>}
    >
      <div className="h-full p-4 text-sm text-desktop-text-primary">
        Desktop layout content area
      </div>
    </DesktopLayout>
  ),
} satisfies Meta<typeof DesktopLayout>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultStoryArgs = {
  workspaceId: "default",
  workspaces,
  activeWorkspaceTitle: "Default Workspace",
  workspacesLoading: false,
  onWorkspaceSelect: () => {},
  onWorkspaceCreate: async () => {},
  children: (
    <div className="h-full p-4 text-sm text-desktop-text-primary">
      Desktop layout content area
    </div>
  ),
};

export const Default: Story = {
  args: defaultStoryArgs,
};

export const LoadingSwitcher: Story = {
  args: {
    ...defaultStoryArgs,
    workspacesLoading: true,
  },
};

export const DarkMode: Story = {
  args: defaultStoryArgs,
  globals: {
    colorMode: "dark",
  },
};
