import type { Meta, StoryObj } from "@storybook/react";

import type { WorkspaceData } from "@/client/hooks/use-workspaces";

import { WorkspaceSwitcher } from "./workspace-switcher";

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
  title: "Core/Workspace Switcher",
  component: WorkspaceSwitcher,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    workspaces,
    activeWorkspaceId: "default",
    activeWorkspaceTitle: "Default Workspace",
    onSelect: () => {},
    onCreate: async () => {},
    loading: false,
    compact: false,
    desktop: false,
  },
  render: (args) => (
    <div className="min-h-[320px] p-8">
      <WorkspaceSwitcher {...args} />
    </div>
  ),
} satisfies Meta<typeof WorkspaceSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultStoryArgs = {
  workspaces,
  activeWorkspaceId: "default",
  activeWorkspaceTitle: "Default Workspace",
  onSelect: () => {},
  onCreate: async () => {},
  loading: false,
  compact: false,
  desktop: false,
};

export const Default: Story = {
  args: defaultStoryArgs,
};

export const DesktopCompact: Story = {
  args: {
    ...defaultStoryArgs,
    compact: true,
    desktop: true,
  },
  parameters: {
    desktopTheme: true,
  },
};

export const EmptyState: Story = {
  args: {
    ...defaultStoryArgs,
    workspaces: [],
    activeWorkspaceId: null,
    activeWorkspaceTitle: "No Workspace Selected",
  },
};

export const CreatingWorkspace: Story = {
  args: {
    ...defaultStoryArgs,
    desktop: true,
    compact: true,
  },
  parameters: {
    desktopTheme: true,
  },
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll("button");
    const trigger = buttons.item(0);
    if (!(trigger instanceof HTMLElement)) return;
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const newWorkspaceButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("New Workspace"),
    );
    if (newWorkspaceButton instanceof HTMLElement) {
      newWorkspaceButton.click();
    }
  },
};

export const DarkMode: Story = {
  args: defaultStoryArgs,
  globals: {
    colorMode: "dark",
  },
};
