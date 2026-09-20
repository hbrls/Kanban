import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

const routaStorybookTheme = create({
  base: "light",
  brandTitle: "Routa Storybook",
  brandUrl: "https://github.com/phodal/routa",
  colorPrimary: "#2563eb",
  colorSecondary: "#1d4ed8",
  appBg: "#f8fafc",
  appContentBg: "#ffffff",
  appBorderColor: "#cbd5e1",
  appBorderRadius: 12,
  barBg: "#eff6ff",
  barSelectedColor: "#1d4ed8",
  barTextColor: "#0f172a",
  textColor: "#0f172a",
  textInverseColor: "#ffffff",
});

addons.setConfig({
  theme: routaStorybookTheme,
  sidebar: {
    showRoots: true,
  },
});
