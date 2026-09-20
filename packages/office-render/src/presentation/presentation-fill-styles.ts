import {
  asArray,
  asNumber,
  asRecord,
  colorToCss,
  fillToCss,
  lineToCss,
  type RecordValue,
} from "../shared/office-preview-utils";
import type { PresentationRect } from "./presentation-layout";
import type { PresentationLineStyle } from "./presentation-line-styles";

const PRESENTATION_GRADIENT_KIND_PATH = 2;

function shapeFillToCss(
  shape: RecordValue | null,
  element: RecordValue,
  lineColor: PresentationLineStyle["color"],
  rect: PresentationRect,
): string | undefined {
  const fill = fillToCss(shape?.fill) ?? fillToCss(element.fill);
  if (!fill) return undefined;
  if (shape && isTransparentOutlineEllipse(shape, rect)) return undefined;

  const isLikelyOutlineOnly =
    Math.abs(rect.width - rect.height) <=
    Math.max(2, Math.min(rect.width, rect.height) * 0.03);
  if (
    isLikelyOutlineOnly &&
    lineColor &&
    sameBaseColor(fill, lineColor) &&
    colorAlphaFromCss(lineColor) < 0.5
  ) {
    return undefined;
  }

  return fill;
}

export function shapeFillToPaint(
  context: CanvasRenderingContext2D,
  shape: RecordValue | null,
  element: RecordValue,
  lineColor: PresentationLineStyle["color"],
  rect: PresentationRect,
): string | CanvasGradient | undefined {
  const fill = asRecord(shape?.fill) ?? asRecord(element.fill);
  const gradient = presentationGradientFill(context, fill, rect);
  if (gradient) return gradient;
  return shapeFillToCss(shape, element, lineColor, rect);
}

export function presentationGradientStops(
  fill: unknown,
): Array<{ color: string; position: number }> {
  const stops = asArray(asRecord(fill)?.gradientStops)
    .map((stop, index) => {
      const record = asRecord(stop);
      const color = colorToCss(record?.color ?? stop);
      if (!color) return null;
      return {
        color,
        index,
        position: gradientStopPosition(record),
      };
    })
    .filter(
      (
        stop,
      ): stop is { color: string; index: number; position: number | null } =>
        stop != null,
    );

  return stops.map((stop) => ({
    color: stop.color,
    position:
      stop.position ??
      (stops.length === 1 ? 0 : stop.index / (stops.length - 1)),
  }));
}

function presentationGradientFill(
  context: CanvasRenderingContext2D,
  fill: RecordValue | null,
  rect: PresentationRect,
): CanvasGradient | undefined {
  const stops = presentationGradientStops(fill);
  if (stops.length < 2) return undefined;

  if (asNumber(fill?.gradientKind) === PRESENTATION_GRADIENT_KIND_PATH) {
    const radius = Math.max(rect.width, rect.height) / 2;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const gradient = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius,
    );
    for (const stop of stops) {
      gradient.addColorStop(clamp(stop.position, 0, 1), stop.color);
    }
    return gradient;
  }

  const line = gradientLine(rect, gradientAngle(fill));
  const gradient = context.createLinearGradient(
    line.x1,
    line.y1,
    line.x2,
    line.y2,
  );
  for (const stop of stops) {
    gradient.addColorStop(clamp(stop.position, 0, 1), stop.color);
  }
  return gradient;
}

function gradientStopPosition(stop: RecordValue | null): number | null {
  for (const key of ["position", "offset", "pos"]) {
    const value = asNumber(stop?.[key], Number.NaN);
    if (Number.isFinite(value)) {
      return value > 1 ? clamp(value / 100_000, 0, 1) : clamp(value, 0, 1);
    }
  }

  return null;
}

function gradientAngle(fill: RecordValue | null): number {
  for (const key of ["angle", "gradientAngle", "direction"]) {
    const value = asNumber(fill?.[key], Number.NaN);
    if (Number.isFinite(value)) {
      return Math.abs(value) > 360 ? value / 60_000 : value;
    }
  }

  return 0;
}

function gradientLine(
  rect: PresentationRect,
  angleDegrees: number,
): { x1: number; x2: number; y1: number; y2: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const length = Math.abs(rect.width * dx) + Math.abs(rect.height * dy);
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  return {
    x1: cx - (dx * length) / 2,
    x2: cx + (dx * length) / 2,
    y1: cy - (dy * length) / 2,
    y2: cy + (dy * length) / 2,
  };
}

function isTransparentOutlineEllipse(
  shape: RecordValue | null,
  rect: PresentationRect,
): boolean {
  const fill = fillToCss(shape?.fill);
  const line = lineToCss(shape?.line);
  if (!fill || !line.color) return false;
  const isNearSquare =
    Math.abs(rect.width - rect.height) <=
    Math.max(2, Math.min(rect.width, rect.height) * 0.03);
  return (
    isNearSquare &&
    colorAlphaFromCss(fill) === 0 &&
    sameBaseColor(fill, line.color)
  );
}

function sameBaseColor(left: string, right: string): boolean {
  return cssRgbKey(left) === cssRgbKey(right);
}

function cssRgbKey(value: string): string {
  const hex = value.match(/^#?([0-9a-f]{6})$/i);
  if (hex) return hex[1].toLowerCase();
  const rgba = parseCssColorChannels(value);
  if (!rgba) return value.toLowerCase();
  return rgba
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("");
}

function colorAlphaFromCss(value: string): number {
  const channels = parseCssColorChannels(value);
  if (!channels || channels[3] == null) return 1;
  const alpha = Number(channels[3]);
  return Number.isFinite(alpha) ? alpha : 1;
}

function parseCssColorChannels(value: string): string[] | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const functionName = value.slice(0, open).trim().toLowerCase();
  if (functionName !== "rgb" && functionName !== "rgba") return null;
  const channels = value
    .slice(open + 1, close)
    .split(",")
    .map((channel) => channel.trim());
  return channels.length >= 3 ? channels : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
