import type { Meta, StoryObj } from "@storybook/react";

import { CompactStat } from "./compact-stat";

const meta = {
  title: "Workspace/Compact Stat",
  component: CompactStat,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
  },
  args: {
    label: "Tasks",
    value: 42,
    sub: "7 pending",
    color: "emerald",
  },
} satisfies Meta<typeof CompactStat>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSub: Story = {
  args: {
    sub: undefined,
  },
};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
};
