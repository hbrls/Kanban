import { asArray, asRecord, asString, colorToCss, type RecordValue } from "../shared/office-preview-utils";

export type SpreadsheetTablePalette = {
  border: string;
  columnStripe: string;
  header: string;
  headerText: string;
  rowStripe: string;
  total: string;
  totalText: string;
};

type BuiltInTableStyle = {
  accent: string;
  borderRatio: number;
  columnStripeRatio: number;
  darkText: boolean;
  exactFallback?: SpreadsheetTablePalette;
  fallback: string;
  rowStripeRatio: number;
  totalRatio: number;
};

const BUILT_IN_MEDIUM_STYLES = new Map<number, BuiltInTableStyle>(
  Array.from({ length: 28 }, (_, offset) => {
    const styleIndex = offset + 1;
    return [styleIndex, builtInMediumStyle(styleIndex)];
  }),
);

const BUILT_IN_LIGHT_STYLES = new Map<number, BuiltInTableStyle>(
  Array.from({ length: 21 }, (_, offset) => {
    const styleIndex = offset + 1;
    return [styleIndex, builtInLightStyle(styleIndex)];
  }),
);

const BUILT_IN_DARK_STYLES = new Map<number, BuiltInTableStyle>(
  Array.from({ length: 11 }, (_, offset) => {
    const styleIndex = offset + 1;
    return [styleIndex, builtInDarkStyle(styleIndex)];
  }),
);

export function tableStylePalette(
  styleName: string,
  theme?: RecordValue | null,
): SpreadsheetTablePalette {
  const builtIn = builtInTableStyle(styleName);
  const themeColor = builtIn ? tableStyleThemeColor(builtIn.accent, theme) : undefined;
  if (!themeColor && builtIn?.exactFallback) return builtIn.exactFallback;
  const baseColor = themeColor ?? builtIn?.fallback;
  if (baseColor) {
    return {
      border: mixCssColorWithWhite(baseColor, builtIn?.borderRatio ?? 0.18),
      columnStripe: mixCssColorWithWhite(baseColor, builtIn?.columnStripeRatio ?? 0.82),
      header: mixCssColorWithWhite(baseColor, builtIn?.totalRatio ?? 0.58),
      headerText: builtIn?.darkText === false ? "#ffffff" : "#1f2937",
      rowStripe: mixCssColorWithWhite(baseColor, builtIn?.rowStripeRatio ?? 0.74),
      total: mixCssColorWithWhite(baseColor, builtIn?.totalRatio ?? 0.58),
      totalText: builtIn?.darkText === false ? "#ffffff" : "#1f2937",
    };
  }

  return tablePalette("#93c5fd", "#e0f2fe", "#bae6fd", "#f0f9ff", "#bae6fd");
}

function builtInTableStyle(styleName: string): BuiltInTableStyle | undefined {
  const lightIndex = Number(styleName.match(/TableStyleLight(\d+)/i)?.[1] ?? styleName.match(/Light(\d+)/i)?.[1] ?? "");
  if (Number.isFinite(lightIndex) && lightIndex > 0) return BUILT_IN_LIGHT_STYLES.get(lightIndex);

  const mediumIndex = Number(styleName.match(/TableStyleMedium(\d+)/i)?.[1] ?? styleName.match(/Medium(\d+)/i)?.[1] ?? "");
  if (Number.isFinite(mediumIndex) && mediumIndex > 0) return BUILT_IN_MEDIUM_STYLES.get(mediumIndex);

  const darkIndex = Number(styleName.match(/TableStyleDark(\d+)/i)?.[1] ?? styleName.match(/Dark(\d+)/i)?.[1] ?? "");
  if (Number.isFinite(darkIndex) && darkIndex > 0) return BUILT_IN_DARK_STYLES.get(darkIndex);

  return undefined;
}

function builtInLightStyle(styleIndex: number): BuiltInTableStyle {
  const accentIndex = lightAccentIndex(styleIndex);
  return {
    accent: `accent${accentIndex}`,
    borderRatio: 0.52,
    columnStripeRatio: 0.92,
    darkText: true,
    fallback: fallbackAccentColor(accentIndex),
    rowStripeRatio: styleIndex <= 7 ? 0.9 : 0.86,
    totalRatio: styleIndex <= 7 ? 0.78 : 0.7,
  };
}

function builtInMediumStyle(styleIndex: number): BuiltInTableStyle {
  const accentIndex = mediumAccentIndex(styleIndex);
  const familyIndex = Math.floor((styleIndex - 1) / 6);
  const intensity = mediumIntensity(familyIndex, styleIndex);
  return {
    accent: `accent${accentIndex}`,
    borderRatio: familyIndex <= 1 ? 0.34 : 0.2,
    columnStripeRatio: intensity.columnStripeRatio,
    darkText: familyIndex <= 2,
    ...(mediumExactFallback(styleIndex) ? { exactFallback: mediumExactFallback(styleIndex) } : {}),
    fallback: fallbackAccentColor(accentIndex),
    rowStripeRatio: intensity.rowStripeRatio,
    totalRatio: intensity.totalRatio,
  };
}

function builtInDarkStyle(styleIndex: number): BuiltInTableStyle {
  const accentIndex = darkAccentIndex(styleIndex);
  return {
    accent: `accent${accentIndex}`,
    borderRatio: 0,
    columnStripeRatio: styleIndex <= 5 ? 0.58 : 0.48,
    darkText: false,
    fallback: fallbackAccentColor(accentIndex),
    rowStripeRatio: styleIndex <= 5 ? 0.46 : 0.36,
    totalRatio: styleIndex <= 5 ? 0.22 : 0.12,
  };
}

function lightAccentIndex(styleIndex: number): number {
  if (styleIndex <= 7) return 1;
  return ((styleIndex - 8) % 6) + 1;
}

function mediumAccentIndex(styleIndex: number): number {
  if (styleIndex === 2) return 1;
  if (styleIndex === 4) return 1;
  if (styleIndex === 9) return 6;
  return ((styleIndex - 1) % 6) + 1;
}

function darkAccentIndex(styleIndex: number): number {
  if (styleIndex <= 5) return styleIndex;
  return ((styleIndex - 6) % 6) + 1;
}

function mediumIntensity(familyIndex: number, styleIndex: number): {
  columnStripeRatio: number;
  rowStripeRatio: number;
  totalRatio: number;
} {
  if (styleIndex === 2) {
    return { columnStripeRatio: 0.82, rowStripeRatio: 0.74, totalRatio: 0.82 };
  }
  if (styleIndex === 4 || styleIndex === 9) {
    return { columnStripeRatio: 0.82, rowStripeRatio: 0.74, totalRatio: 0.58 };
  }
  if (familyIndex <= 0) return { columnStripeRatio: 0.86, rowStripeRatio: 0.78, totalRatio: 0.62 };
  if (familyIndex === 1) return { columnStripeRatio: 0.82, rowStripeRatio: 0.72, totalRatio: 0.54 };
  if (familyIndex === 2) return { columnStripeRatio: 0.78, rowStripeRatio: 0.66, totalRatio: 0.46 };
  if (familyIndex === 3) return { columnStripeRatio: 0.72, rowStripeRatio: 0.58, totalRatio: 0.38 };
  return { columnStripeRatio: 0.68, rowStripeRatio: 0.52, totalRatio: 0.3 };
}

function mediumExactFallback(styleIndex: number): SpreadsheetTablePalette | undefined {
  if (styleIndex === 2) return tablePalette("#56b6d6", "#d7f0f8", "#9ed8ea", "#c7eaf7", "#9ed8ea");
  if (styleIndex === 4) return tablePalette("#8ab4f8", "#dbeafe", "#bfdbfe", "#eff6ff", "#bfdbfe");
  if (styleIndex === 9) return tablePalette("#7ab56c", "#d9ead3", "#b7dfae", "#eef7e8", "#b7dfae");
  return undefined;
}

function tablePalette(
  border: string,
  columnStripe: string,
  header: string,
  rowStripe: string,
  total: string,
  headerText = "#1f2937",
  totalText = headerText,
): SpreadsheetTablePalette {
  return { border, columnStripe, header, headerText, rowStripe, total, totalText };
}

function fallbackAccentColor(accentIndex: number): string {
  if (accentIndex === 1) return "#5b9bd5";
  if (accentIndex === 2) return "#ed7d31";
  if (accentIndex === 3) return "#a5a5a5";
  if (accentIndex === 4) return "#ffc000";
  if (accentIndex === 5) return "#4472c4";
  return "#70ad47";
}

function tableStyleThemeColor(colorName: string, theme?: RecordValue | null): string | undefined {
  const colorScheme = asRecord(theme?.colorScheme);
  const colors = asArray(colorScheme?.colors).map(asRecord).filter((color): color is RecordValue => color != null);
  const themeColor = colors.find((color) => asString(color.name).toLowerCase() === colorName);
  return colorToCss(themeColor?.color);
}

function mixCssColorWithWhite(value: string, whiteRatio: number): string {
  const rgb = hexColorToRgb(value);
  if (!rgb) return value;
  const ratio = Math.max(0, Math.min(1, whiteRatio));
  const red = Math.round(rgb.red * (1 - ratio) + 255 * ratio);
  const green = Math.round(rgb.green * (1 - ratio) + 255 * ratio);
  const blue = Math.round(rgb.blue * (1 - ratio) + 255 * ratio);
  return `rgb(${red}, ${green}, ${blue})`;
}

function hexColorToRgb(value: string): { blue: number; green: number; red: number } | null {
  const trimmed = value.trim().replace(/^#/, "");
  const normalized = /^[0-9a-f]{8}$/i.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    blue: Number.parseInt(normalized.slice(4, 6), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    red: Number.parseInt(normalized.slice(0, 2), 16),
  };
}
