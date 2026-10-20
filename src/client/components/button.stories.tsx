import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button";

const meta = {
  title: "Core/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    onClick: { action: "clicked" },
  },
  args: {
    children: "Button",
    variant: "primary",
    size: "md",
    loading: false,
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
};

export const Danger: Story = {
  args: {
    variant: "danger",
    children: "Delete",
  },
};
export const Loading: Story = {
  args: {
    loading: true,
    children: "Saving",
  },
};

export const HoverState: Story = {
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button");
    if (button instanceof HTMLElement) {
      button.style.backgroundColor = "rgb(29 78 216)";
    }
  },
};

export const FocusState: Story = {
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
    variant: "secondary",
    children: "Dark Secondary",
  },
};
