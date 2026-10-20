import type { Decorator, Preview } from "@storybook/react";

import "../src/app/globals.css";

const withThemeMode: Decorator = (Story, context) => {
  const colorMode = context.globals.colorMode === "dark" ? "dark" : "light";
  const useDesktopTheme = context.parameters.desktopTheme ?? false;
  const surfaceClassName = useDesktopTheme
    ? "desktop-theme bg-desktop-bg-primary text-desktop-text-primary"
    : "bg-[var(--background)] text-[var(--foreground)]";

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", colorMode === "dark");
  }

  return (
    <div
      className={[
        "min-h-screen",
        surfaceClassName,
      ].join(" ")}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withThemeMode],
  globalTypes: {
    colorMode: {
      description: "Global color mode",
      toolbar: {
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    colorMode: "light",
  },
  parameters: {
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
    options: {
      storySort: {
        order: ["Foundations", "Core", "Layouts", "Navigation", "Workspace", "Traces"],
      },
    },
    a11y: {
      test: "todo",
    },
  },
};

export default preview;
