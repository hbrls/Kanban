import type { RecordValue } from "./office-types";
import { asNumber, asRecord, asString } from "./office-data-coerce";

function hexToRgb(value: string): { red: number; green: number; blue: number } | null {
  const normalized = /^[0-9a-f]{8}$/i.test(value) ? value.slice(2) : value;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ red, green, blue }: { red: number; green: number; blue: number }): string {
  return [red, green, blue]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function colorAlpha(value: unknown): number {
  const transform = asRecord(asRecord(value)?.transform);
  const alpha = transform?.alpha;
  if (typeof alpha !== "number" || !Number.isFinite(alpha)) return 1;
  return Math.max(0, Math.min(1, alpha / 100_000));
}

function transformedRgb(
  rgb: { red: number; green: number; blue: number },
  color: RecordValue,
): { red: number; green: number; blue: number } {
  const transform = asRecord(color.transform);
  if (transform == null) return rgb;

  let next = { ...rgb };
  const tint = percentage(transform.tint);
  if (tint != null) {
    next = mapRgb(next, (channel) => channel + (255 - channel) * tint);
  }

  const shade = percentage(transform.shade);
  if (shade != null) {
    next = mapRgb(next, (channel) => channel * (1 - shade));
  }

  const luminanceModulation = percentage(transform.luminanceModulation);
  if (luminanceModulation != null) {
    next = mapRgb(next, (channel) => channel * luminanceModulation);
  }

  const luminanceOffset = percentage(transform.luminanceOffset);
  if (luminanceOffset != null) {
    next = mapRgb(next, (channel) => channel + 255 * luminanceOffset);
  }

  const saturationModulation = percentage(transform.saturationModulation);
  if (saturationModulation != null) {
    next = modulateSaturation(next, saturationModulation);
  }

  return mapRgb(next, clampColorChannel);
}

function percentage(value: unknown): number | null {
  if (value == null) return null;
  const numeric = asNumber(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.max(0, Math.min(1, numeric / 100_000));
}

function mapRgb(
  rgb: { red: number; green: number; blue: number },
  map: (channel: number) => number,
): { red: number; green: number; blue: number } {
  return {
    blue: map(rgb.blue),
    green: map(rgb.green),
    red: map(rgb.red),
  };
}

function modulateSaturation(
  rgb: { red: number; green: number; blue: number },
  factor: number,
): { red: number; green: number; blue: number } {
  const channels = [rgb.red / 255, rgb.green / 255, rgb.blue / 255];
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const lightness = (max + min) / 2;
  if (max === min) return rgb;

  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  const hue = (max === channels[0]
    ? (channels[1]! - channels[2]!) / delta + (channels[1]! < channels[2]! ? 6 : 0)
    : max === channels[1]
      ? (channels[2]! - channels[0]!) / delta + 2
      : (channels[0]! - channels[1]!) / delta + 4) / 6;

  return hslToRgb(hue, Math.max(0, Math.min(1, saturation * factor)), lightness);
}

function hslToRgb(hue: number, saturation: number, lightness: number): { red: number; green: number; blue: number } {
  if (saturation === 0) {
    const channel = lightness * 255;
    return { blue: channel, green: channel, red: channel };
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    blue: hueToRgb(p, q, hue - 1 / 3) * 255,
    green: hueToRgb(p, q, hue) * 255,
    red: hueToRgb(p, q, hue + 1 / 3) * 255,
  };
}

function hueToRgb(p: number, q: number, hue: number): number {
  let nextHue = hue;
  if (nextHue < 0) nextHue += 1;
  if (nextHue > 1) nextHue -= 1;
  if (nextHue < 1 / 6) return p + (q - p) * 6 * nextHue;
  if (nextHue < 1 / 2) return q;
  if (nextHue < 2 / 3) return p + (q - p) * (2 / 3 - nextHue) * 6;
  return p;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function colorToCss(value: unknown): string | undefined {
  const color = asRecord(value);
  if (color == null) return undefined;
  const raw = asString(color?.value);
  const rgb = hexToRgb(raw);
  if (rgb) {
    const transformed = transformedRgb(rgb, color);
    const argbAlpha = /^[0-9a-f]{8}$/i.test(raw) ? Number.parseInt(raw.slice(0, 2), 16) / 255 : 1;
    const alpha = Math.min(argbAlpha, colorAlpha(color));
    if (alpha < 1) return `rgba(${transformed.red}, ${transformed.green}, ${transformed.blue}, ${alpha})`;
    return `#${rgbToHex(transformed)}`;
  }

  const lastColor = asString(color?.lastColor);
  const lastRgb = hexToRgb(lastColor);
  if (lastRgb) {
    const transformed = transformedRgb(lastRgb, color);
    const alpha = colorAlpha(color);
    if (alpha < 1) return `rgba(${transformed.red}, ${transformed.green}, ${transformed.blue}, ${alpha})`;
    return `#${rgbToHex(transformed)}`;
  }
  return undefined;
}

export function fillToCss(fill: unknown): string | undefined {
  const fillRecord = asRecord(fill);
  if (fillRecord == null || asNumber(fillRecord.type) === 0) return undefined;
  return colorToCss(fillRecord.color);
}

export function spreadsheetFillToCss(fill: unknown): string | undefined {
  const fillRecord = asRecord(fill);
  if (fillRecord == null) return undefined;
  return (
    fillToCss(fillRecord) ??
    colorToCss(fillRecord.color) ??
    colorToCss(asRecord(fillRecord.pattern)?.foregroundColor) ??
    colorToCss(asRecord(fillRecord.pattern)?.backgroundColor) ??
    colorToCss(asRecord(fillRecord.pattern)?.fill)
  );
}

export function lineToCss(line: unknown): { color?: string; width: number } {
  const lineRecord = asRecord(line);
  const fillRecord = asRecord(lineRecord?.fill);
  const color = colorToCss(fillRecord?.color);
  const width = Math.max(1, Math.min(4, asNumber(lineRecord?.widthEmu) / 9_000));
  return { color, width };
}

export function slideBackgroundToCss(slide: RecordValue): string {
  const background = asRecord(slide.background);
  const fill = asRecord(background?.fill);
  return fillToCss(fill) ?? "#ffffff";
}
