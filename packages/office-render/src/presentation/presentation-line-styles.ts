import {
  asArray,
  asNumber,
  asRecord,
  colorToCss,
  type RecordValue,
} from "../shared/office-preview-utils";

const EMU_PER_CSS_PIXEL = 9_525;

export type PresentationLineStyle = {
  color?: string;
  dash: number[];
  headEnd: PresentationLineEndStyle | null;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  tailEnd: PresentationLineEndStyle | null;
  width: number;
};

export type PresentationLineEndStyle = {
  length: number;
  type: number;
  width: number;
};

export type PresentationShadowStyle = {
  blur: number;
  color: string;
  offsetX: number;
  offsetY: number;
};

export function presentationLineStyle(
  line: unknown,
  slideScale: number,
): PresentationLineStyle {
  const lineRecord = asRecord(line);
  const fillRecord = asRecord(lineRecord?.fill);
  const rawWidthEmu = asNumber(lineRecord?.widthEmu);
  const width = rawWidthEmu > 0 ? rawWidthEmu / EMU_PER_CSS_PIXEL : 1;
  const scaledWidth = Math.max(0.5, width * Math.max(0.01, slideScale));
  return {
    color: colorToCss(fillRecord?.color),
    dash: presentationLineDash(asNumber(lineRecord?.style), scaledWidth),
    headEnd: presentationLineEndStyle(
      lineRecord?.headEnd ?? lineRecord?.head,
      scaledWidth,
    ),
    lineCap: presentationLineCap(asNumber(lineRecord?.cap)),
    lineJoin: presentationLineJoin(asNumber(lineRecord?.join)),
    tailEnd: presentationLineEndStyle(
      lineRecord?.tailEnd ?? lineRecord?.tail,
      scaledWidth,
    ),
    width: scaledWidth,
  };
}

export function presentationElementLineStyle(
  element: RecordValue,
  slideScale: number,
): PresentationLineStyle {
  const shapeLine =
    asRecord(asRecord(element.shape)?.line) ?? asRecord(element.line);
  const connectorLine = asRecord(asRecord(element.connector)?.lineStyle);
  if (!connectorLine) return presentationLineStyle(shapeLine, slideScale);

  return presentationLineStyle(
    {
      ...shapeLine,
      cap: connectorLine.cap ?? shapeLine?.cap,
      head: connectorLine.head ?? connectorLine.headEnd ?? shapeLine?.head,
      headEnd:
        connectorLine.headEnd ?? connectorLine.head ?? shapeLine?.headEnd,
      join: connectorLine.join ?? shapeLine?.join,
      tail: connectorLine.tail ?? connectorLine.tailEnd ?? shapeLine?.tail,
      tailEnd:
        connectorLine.tailEnd ?? connectorLine.tail ?? shapeLine?.tailEnd,
    },
    slideScale,
  );
}

export function applyLineStyle(
  context: CanvasRenderingContext2D,
  line: PresentationLineStyle,
): void {
  context.strokeStyle = line.color ?? "#0f172a";
  context.lineWidth = line.width;
  context.lineCap = line.lineCap;
  context.lineJoin = line.lineJoin;
  context.setLineDash(line.dash);
}

function presentationLineCap(cap: number): CanvasLineCap {
  if (cap === 2) return "square";
  if (cap === 3) return "round";
  return "butt";
}

function presentationLineJoin(join: number): CanvasLineJoin {
  if (join === 1) return "round";
  if (join === 2) return "bevel";
  return "miter";
}

function presentationLineDash(style: number, width: number): number[] {
  const unit = Math.max(1, width);
  if (style === 2) return [unit * 4, unit * 2];
  if (style === 3) return [unit, unit * 2];
  if (style === 4) return [unit * 8, unit * 3];
  if (style === 5) return [unit * 8, unit * 3, unit, unit * 3];
  if (style === 6) return [unit * 8, unit * 3, unit, unit * 3, unit, unit * 3];
  return [];
}

export function presentationLineEndStyle(
  end: unknown,
  lineWidth: number,
): PresentationLineEndStyle | null {
  const record = asRecord(end);
  const type = asNumber(record?.type);
  if (!record || type <= 1) return null;

  return {
    length: lineEndScale(asNumber(record.length, 2), lineWidth),
    type,
    width: lineEndScale(asNumber(record.width, 2), lineWidth),
  };
}

function lineEndScale(value: number, lineWidth: number): number {
  const multiplier =
    value <= 1 ? 2.5 : value === 2 ? 3.5 : value === 3 ? 5 : Math.min(value, 6);
  return Math.max(5, lineWidth * multiplier);
}

export function drawLineEnd(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  end: PresentationLineEndStyle | null,
  color: string,
  atTail: boolean,
): void {
  if (!end) return;

  const from = atTail ? { x: width, y: height } : { x: 0, y: 0 };
  const to = atTail ? { x: 0, y: 0 } : { x: width, y: height };
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const x = atTail ? 0 : width;
  const y = atTail ? 0 : height;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.strokeStyle = color;
  drawLineEndPath(context, end);
  context.restore();
}

export function drawLineEndPath(
  context: CanvasRenderingContext2D,
  end: PresentationLineEndStyle,
): void {
  context.beginPath();
  if (end.type === 5) {
    context.ellipse(
      -end.length / 2,
      0,
      end.width / 2,
      end.width / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else if (end.type === 4) {
    context.moveTo(0, 0);
    context.lineTo(-end.length / 2, -end.width / 2);
    context.lineTo(-end.length, 0);
    context.lineTo(-end.length / 2, end.width / 2);
    context.closePath();
    context.fill();
  } else if (end.type === 3) {
    context.moveTo(0, 0);
    context.lineTo(-end.length, -end.width / 2);
    context.lineTo(-end.length * 0.62, 0);
    context.lineTo(-end.length, end.width / 2);
    context.closePath();
    context.fill();
  } else if (end.type === 6) {
    context.moveTo(-end.length, -end.width / 2);
    context.lineTo(0, 0);
    context.lineTo(-end.length, end.width / 2);
    context.stroke();
  } else {
    context.moveTo(0, 0);
    context.lineTo(-end.length, -end.width / 2);
    context.lineTo(-end.length, end.width / 2);
    context.closePath();
    context.fill();
  }
}

export function presentationShadowStyle(
  element: RecordValue,
  slideScale: number,
): PresentationShadowStyle | null {
  for (const effect of asArray(element.effects)) {
    const shadow = asRecord(asRecord(effect)?.shadow);
    const color = colorToCss(shadow?.color);
    if (!shadow || !color || colorAlphaFromCss(color) <= 0) {
      continue;
    }

    const distance =
      (asNumber(shadow.distance) / EMU_PER_CSS_PIXEL) *
      Math.max(0.01, slideScale);
    const direction = (asNumber(shadow.direction) / 60_000 / 180) * Math.PI;
    return {
      blur: Math.max(
        0,
        (asNumber(shadow.blurRadius) / EMU_PER_CSS_PIXEL) *
          Math.max(0.01, slideScale),
      ),
      color,
      offsetX: Math.cos(direction) * distance,
      offsetY: Math.sin(direction) * distance,
    };
  }

  return null;
}

export function applyElementShadow(
  context: CanvasRenderingContext2D,
  element: RecordValue,
  slideScale: number,
): void {
  const shadow = presentationShadowStyle(element, slideScale);
  if (!shadow) return;
  context.shadowBlur = shadow.blur;
  context.shadowColor = shadow.color;
  context.shadowOffsetX = shadow.offsetX;
  context.shadowOffsetY = shadow.offsetY;
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
