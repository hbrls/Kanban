import {
  asArray,
  asNumber,
  asRecord,
  type RecordValue,
} from "../shared/office-preview-utils";
import type {
  PresentationRect,
  PresentationShapeKind,
} from "./presentation-layout";

export function elementPath(
  kind: PresentationShapeKind,
  rect: PresentationRect,
  shape: RecordValue | null = null,
): Path2D {
  const path = new Path2D();
  if (kind === "ellipse") {
    path.ellipse(
      rect.width / 2,
      rect.height / 2,
      rect.width / 2,
      rect.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    return path;
  }

  if (kind === "arc") {
    const points = presetGeometryLinePoints({ geometry: 89, ...shape }, rect);
    for (const [index, point] of (points ?? []).entries()) {
      if (index === 0) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
    }
    return path;
  }

  if (kind === "roundRect") {
    const radius = roundedRectRadius(rect, shape);
    roundedRect(path, 0, 0, rect.width, rect.height, radius);
    return path;
  }

  if (kind === "triangle") {
    polygon(path, [
      [rect.width / 2, 0],
      [rect.width, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "rtTriangle") {
    polygon(path, [
      [0, 0],
      [rect.width, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "diamond") {
    polygon(path, [
      [rect.width / 2, 0],
      [rect.width, rect.height / 2],
      [rect.width / 2, rect.height],
      [0, rect.height / 2],
    ]);
    return path;
  }

  if (kind === "pentagon") {
    polygon(path, [
      [0, 0],
      [rect.width, 0],
      [rect.width, rect.height * 0.72],
      [rect.width / 2, rect.height],
      [0, rect.height * 0.72],
    ]);
    return path;
  }

  if (kind === "homePlate") {
    const pointInset = rect.width * 0.22;
    polygon(path, [
      [0, 0],
      [rect.width - pointInset, 0],
      [rect.width, rect.height / 2],
      [rect.width - pointInset, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "chevron") {
    const inset = Math.min(rect.width * 0.38, rect.height * 0.5);
    polygon(path, [
      [0, 0],
      [rect.width - inset, 0],
      [rect.width, rect.height / 2],
      [rect.width - inset, rect.height],
      [0, rect.height],
      [inset, rect.height / 2],
    ]);
    return path;
  }

  if (kind === "octagon") {
    const inset = Math.min(rect.width, rect.height) * 0.28;
    polygon(path, [
      [inset, 0],
      [rect.width - inset, 0],
      [rect.width, inset],
      [rect.width, rect.height - inset],
      [rect.width - inset, rect.height],
      [inset, rect.height],
      [0, rect.height - inset],
      [0, inset],
    ]);
    return path;
  }

  if (
    kind === "star4" ||
    kind === "star5" ||
    kind === "star6" ||
    kind === "star8" ||
    kind === "star32"
  ) {
    const points =
      kind === "star32"
        ? 32
        : kind === "star8"
          ? 8
          : kind === "star6"
            ? 6
            : kind === "star4"
              ? 4
              : 5;
    starPath(
      path,
      rect.width / 2,
      rect.height / 2,
      Math.min(rect.width, rect.height) / 2,
      Math.min(rect.width, rect.height) * 0.2,
      points,
    );
    return path;
  }

  if (kind === "donut") {
    const radius = Math.min(rect.width, rect.height) / 2;
    const innerRadius = radius * 0.45;
    path.ellipse(
      rect.width / 2,
      rect.height / 2,
      radius,
      radius,
      0,
      0,
      Math.PI * 2,
    );
    path.ellipse(
      rect.width / 2,
      rect.height / 2,
      innerRadius,
      innerRadius,
      0,
      0,
      Math.PI * 2,
      true,
    );
    return path;
  }

  if (kind === "chord") {
    const chordY = rect.height * 0.7;
    path.moveTo(rect.width * 0.08, chordY);
    path.ellipse(
      rect.width / 2,
      rect.height / 2,
      rect.width / 2,
      rect.height / 2,
      0,
      Math.PI * 0.82,
      Math.PI * 2.18,
    );
    path.closePath();
    return path;
  }

  if (kind === "pie") {
    const radiusX = rect.width / 2;
    const radiusY = rect.height / 2;
    const start = pptAngleToRadians(adjustmentValue(shape, "adj1") ?? 0);
    const end = pptAngleToRadians(adjustmentValue(shape, "adj2") ?? 90 * 60_000);
    path.moveTo(rect.width / 2, rect.height / 2);
    path.lineTo(
      rect.width / 2 + Math.cos(start) * radiusX,
      rect.height / 2 + Math.sin(start) * radiusY,
    );
    path.ellipse(
      rect.width / 2,
      rect.height / 2,
      radiusX,
      radiusY,
      0,
      start,
      end,
    );
    path.closePath();
    return path;
  }

  if (kind === "moon") {
    path.ellipse(
      rect.width * 0.48,
      rect.height / 2,
      rect.width * 0.42,
      rect.height * 0.5,
      0,
      Math.PI * 0.5,
      Math.PI * 1.5,
      false,
    );
    path.ellipse(
      rect.width * 0.66,
      rect.height / 2,
      rect.width * 0.34,
      rect.height * 0.42,
      0,
      Math.PI * 1.5,
      Math.PI * 0.5,
      true,
    );
    path.closePath();
    return path;
  }

  if (kind === "blockArc") {
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const outerX = rect.width / 2;
    const outerY = rect.height / 2;
    const innerX = outerX * 0.56;
    const innerY = outerY * 0.56;
    const start = -Math.PI * 0.72;
    const end = Math.PI * 0.72;
    path.ellipse(centerX, centerY, outerX, outerY, 0, start, end);
    path.ellipse(centerX, centerY, innerX, innerY, 0, end, start, true);
    path.closePath();
    return path;
  }

  if (kind === "mathPlus" || kind === "mathEqual") {
    const bar = Math.min(rect.width, rect.height) * 0.24;
    if (kind === "mathPlus") {
      const x1 = (rect.width - bar) / 2;
      const x2 = x1 + bar;
      const y1 = (rect.height - bar) / 2;
      const y2 = y1 + bar;
      polygon(path, [
        [x1, 0],
        [x2, 0],
        [x2, y1],
        [rect.width, y1],
        [rect.width, y2],
        [x2, y2],
        [x2, rect.height],
        [x1, rect.height],
        [x1, y2],
        [0, y2],
        [0, y1],
        [x1, y1],
      ]);
      return path;
    }

    const gap = rect.height * 0.16;
    const top = rect.height * 0.28;
    path.rect(0, top, rect.width, bar);
    path.rect(0, top + bar + gap, rect.width, bar);
    return path;
  }

  if (kind === "delay") {
    path.moveTo(0, 0);
    path.lineTo(rect.width * 0.5, 0);
    path.bezierCurveTo(
      rect.width,
      0,
      rect.width,
      rect.height,
      rect.width * 0.5,
      rect.height,
    );
    path.lineTo(0, rect.height);
    path.closePath();
    return path;
  }

  if (kind === "can") {
    const cap = Math.min(rect.height * 0.22, rect.width * 0.22);
    path.moveTo(0, cap);
    path.bezierCurveTo(0, 0, rect.width, 0, rect.width, cap);
    path.lineTo(rect.width, rect.height - cap);
    path.bezierCurveTo(
      rect.width,
      rect.height,
      0,
      rect.height,
      0,
      rect.height - cap,
    );
    path.closePath();
    return path;
  }

  if (kind === "cube") {
    const depthX = rect.width * 0.24;
    const depthY = rect.height * 0.18;
    polygon(path, [
      [0, depthY],
      [depthX, 0],
      [rect.width, 0],
      [rect.width, rect.height - depthY],
      [rect.width - depthX, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "frame") {
    const inset = Math.min(rect.width, rect.height) * 0.16;
    path.rect(0, 0, rect.width, rect.height);
    const innerWidth = Math.max(0, rect.width - inset * 2);
    const innerHeight = Math.max(0, rect.height - inset * 2);
    path.moveTo(inset, inset);
    path.lineTo(inset, inset + innerHeight);
    path.lineTo(inset + innerWidth, inset + innerHeight);
    path.lineTo(inset + innerWidth, inset);
    path.closePath();
    return path;
  }

  if (kind === "halfFrame") {
    const inset = Math.min(rect.width, rect.height) * 0.24;
    polygon(path, [
      [0, 0],
      [rect.width, 0],
      [rect.width, inset],
      [inset, inset],
      [inset, rect.height - inset],
      [rect.width, rect.height - inset],
      [rect.width, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "corner") {
    const inset = Math.min(rect.width, rect.height) * 0.38;
    polygon(path, [
      [0, 0],
      [rect.width, 0],
      [rect.width, inset],
      [inset, inset],
      [inset, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "document") {
    const wave = Math.min(rect.height * 0.18, rect.width * 0.08);
    path.moveTo(0, 0);
    path.lineTo(rect.width, 0);
    path.lineTo(rect.width, rect.height - wave);
    path.bezierCurveTo(
      rect.width * 0.66,
      rect.height + wave,
      rect.width * 0.34,
      rect.height - wave * 2,
      0,
      rect.height,
    );
    path.closePath();
    return path;
  }

  if (kind === "heart") {
    path.moveTo(rect.width / 2, rect.height);
    path.bezierCurveTo(
      rect.width * 0.04,
      rect.height * 0.62,
      0,
      rect.height * 0.24,
      rect.width * 0.26,
      rect.height * 0.08,
    );
    path.bezierCurveTo(
      rect.width * 0.4,
      -rect.height * 0.02,
      rect.width / 2,
      rect.height * 0.12,
      rect.width / 2,
      rect.height * 0.24,
    );
    path.bezierCurveTo(
      rect.width / 2,
      rect.height * 0.12,
      rect.width * 0.6,
      -rect.height * 0.02,
      rect.width * 0.74,
      rect.height * 0.08,
    );
    path.bezierCurveTo(
      rect.width,
      rect.height * 0.24,
      rect.width * 0.96,
      rect.height * 0.62,
      rect.width / 2,
      rect.height,
    );
    path.closePath();
    return path;
  }

  if (kind === "teardrop") {
    path.moveTo(rect.width * 0.5, rect.height);
    path.bezierCurveTo(
      rect.width * 0.08,
      rect.height * 0.72,
      rect.width * 0.04,
      rect.height * 0.28,
      rect.width * 0.42,
      rect.height * 0.06,
    );
    path.bezierCurveTo(
      rect.width * 0.72,
      -rect.height * 0.1,
      rect.width * 1.08,
      rect.height * 0.2,
      rect.width * 0.88,
      rect.height * 0.52,
    );
    path.bezierCurveTo(
      rect.width * 0.78,
      rect.height * 0.68,
      rect.width * 0.64,
      rect.height * 0.84,
      rect.width * 0.5,
      rect.height,
    );
    path.closePath();
    return path;
  }

  if (kind === "extract") {
    polygon(path, [
      [0, 0],
      [rect.width, 0],
      [rect.width / 2, rect.height],
    ]);
    return path;
  }

  if (kind === "parallelogram") {
    const skew = Math.min(rect.width / 3, rect.width * 0.18);
    polygon(path, [
      [skew, 0],
      [rect.width, 0],
      [rect.width - skew, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "diagStripe") {
    const skew = Math.min(rect.width * 0.45, rect.height * 0.55);
    polygon(path, [
      [skew, 0],
      [rect.width, 0],
      [rect.width - skew, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "snip1Rect") {
    const snip = Math.min(rect.width, rect.height) * 0.18;
    polygon(path, [
      [0, 0],
      [rect.width - snip, 0],
      [rect.width, snip],
      [rect.width, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "snipRect") {
    const snip = Math.min(rect.width, rect.height) * 0.18;
    polygon(path, [
      [snip, 0],
      [rect.width, 0],
      [rect.width, rect.height - snip],
      [rect.width - snip, rect.height],
      [0, rect.height],
      [0, snip],
    ]);
    return path;
  }

  if (
    kind === "wedgeRectCallout" ||
    kind === "wedgeRoundRectCallout" ||
    kind === "wedgeEllipseCallout"
  ) {
    calloutPath(path, rect, kind);
    return path;
  }

  if (kind === "cloud" || kind === "cloudCallout") {
    cloudPath(path, rect);
    if (kind === "cloudCallout") {
      path.ellipse(
        rect.width * 0.22,
        rect.height * 0.92,
        rect.width * 0.08,
        rect.height * 0.06,
        0,
        0,
        Math.PI * 2,
      );
      path.ellipse(
        rect.width * 0.12,
        rect.height * 0.97,
        rect.width * 0.045,
        rect.height * 0.035,
        0,
        0,
        Math.PI * 2,
      );
    }
    return path;
  }

  if (kind === "leftArrow") {
    const head = Math.min(rect.width * 0.42, rect.height * 0.5);
    const shaftTop = rect.height * 0.28;
    const shaftBottom = rect.height * 0.72;
    polygon(path, [
      [0, rect.height / 2],
      [head, 0],
      [head, shaftTop],
      [rect.width, shaftTop],
      [rect.width, shaftBottom],
      [head, shaftBottom],
      [head, rect.height],
    ]);
    return path;
  }

  if (kind === "rightArrow") {
    const head = Math.min(rect.width * 0.42, rect.height * 0.5);
    const shaftTop = rect.height * 0.28;
    const shaftBottom = rect.height * 0.72;
    polygon(path, [
      [0, shaftTop],
      [rect.width - head, shaftTop],
      [rect.width - head, 0],
      [rect.width, rect.height / 2],
      [rect.width - head, rect.height],
      [rect.width - head, shaftBottom],
      [0, shaftBottom],
    ]);
    return path;
  }

  if (kind === "upArrow") {
    const head = Math.min(rect.height * 0.42, rect.width * 0.5);
    const shaftLeft = rect.width * 0.32;
    const shaftRight = rect.width * 0.68;
    polygon(path, [
      [rect.width / 2, 0],
      [rect.width, head],
      [shaftRight, head],
      [shaftRight, rect.height],
      [shaftLeft, rect.height],
      [shaftLeft, head],
      [0, head],
    ]);
    return path;
  }

  if (kind === "downArrow") {
    const head = Math.min(rect.height * 0.42, rect.width * 0.5);
    const shaftLeft = rect.width * 0.32;
    const shaftRight = rect.width * 0.68;
    polygon(path, [
      [shaftLeft, 0],
      [shaftRight, 0],
      [shaftRight, rect.height - head],
      [rect.width, rect.height - head],
      [rect.width / 2, rect.height],
      [0, rect.height - head],
      [shaftLeft, rect.height - head],
    ]);
    return path;
  }

  if (kind === "leftRightArrow") {
    const head = Math.min(rect.width * 0.28, rect.height * 0.5);
    const shaftTop = rect.height * 0.32;
    const shaftBottom = rect.height * 0.68;
    polygon(path, [
      [0, rect.height / 2],
      [head, 0],
      [head, shaftTop],
      [rect.width - head, shaftTop],
      [rect.width - head, 0],
      [rect.width, rect.height / 2],
      [rect.width - head, rect.height],
      [rect.width - head, shaftBottom],
      [head, shaftBottom],
      [head, rect.height],
    ]);
    return path;
  }

  if (kind === "leftRightArrowCallout") {
    const head = Math.min(rect.width * 0.24, rect.height * 0.42);
    const bodyTop = rect.height * 0.24;
    const bodyBottom = rect.height * 0.76;
    polygon(path, [
      [0, rect.height / 2],
      [head, 0],
      [head, bodyTop],
      [rect.width - head, bodyTop],
      [rect.width - head, 0],
      [rect.width, rect.height / 2],
      [rect.width - head, rect.height],
      [rect.width - head, bodyBottom],
      [head, bodyBottom],
      [head, rect.height],
    ]);
    return path;
  }

  if (kind === "upDownArrow") {
    const head = Math.min(rect.width * 0.42, rect.height * 0.28);
    const shaftLeft = rect.width * 0.32;
    const shaftRight = rect.width * 0.68;
    polygon(path, [
      [rect.width / 2, 0],
      [rect.width, head],
      [shaftRight, head],
      [shaftRight, rect.height - head],
      [rect.width, rect.height - head],
      [rect.width / 2, rect.height],
      [0, rect.height - head],
      [shaftLeft, rect.height - head],
      [shaftLeft, head],
      [0, head],
    ]);
    return path;
  }

  if (kind === "quadArrowCallout") {
    polygon(path, [
      [rect.width / 2, 0],
      [rect.width * 0.66, rect.height * 0.2],
      [rect.width * 0.58, rect.height * 0.2],
      [rect.width * 0.58, rect.height * 0.42],
      [rect.width * 0.8, rect.height * 0.42],
      [rect.width * 0.8, rect.height * 0.34],
      [rect.width, rect.height / 2],
      [rect.width * 0.8, rect.height * 0.66],
      [rect.width * 0.8, rect.height * 0.58],
      [rect.width * 0.58, rect.height * 0.58],
      [rect.width * 0.58, rect.height * 0.8],
      [rect.width * 0.66, rect.height * 0.8],
      [rect.width / 2, rect.height],
      [rect.width * 0.34, rect.height * 0.8],
      [rect.width * 0.42, rect.height * 0.8],
      [rect.width * 0.42, rect.height * 0.58],
      [rect.width * 0.2, rect.height * 0.58],
      [rect.width * 0.2, rect.height * 0.66],
      [0, rect.height / 2],
      [rect.width * 0.2, rect.height * 0.34],
      [rect.width * 0.2, rect.height * 0.42],
      [rect.width * 0.42, rect.height * 0.42],
      [rect.width * 0.42, rect.height * 0.2],
      [rect.width * 0.34, rect.height * 0.2],
    ]);
    return path;
  }

  if (
    kind === "curvedLeftArrow" ||
    kind === "curvedRightArrow" ||
    kind === "curvedUpArrow" ||
    kind === "curvedDownArrow"
  ) {
    curvedArrowPath(path, rect, kind);
    return path;
  }

  if (kind === "uturnArrow") {
    polygon(path, [
      [0, rect.height * 0.3],
      [rect.width * 0.28, 0],
      [rect.width * 0.28, rect.height * 0.18],
      [rect.width * 0.8, rect.height * 0.18],
      [rect.width * 0.8, rect.height * 0.75],
      [rect.width * 0.6, rect.height * 0.75],
      [rect.width * 0.6, rect.height * 0.38],
      [rect.width * 0.28, rect.height * 0.38],
      [rect.width * 0.28, rect.height * 0.6],
    ]);
    return path;
  }

  if (kind === "lightningBolt") {
    polygon(path, [
      [rect.width * 0.58, 0],
      [rect.width * 0.18, rect.height * 0.55],
      [rect.width * 0.46, rect.height * 0.55],
      [rect.width * 0.32, rect.height],
      [rect.width * 0.82, rect.height * 0.38],
      [rect.width * 0.54, rect.height * 0.38],
    ]);
    return path;
  }

  if (kind === "bentUpArrow" || kind === "bentArrow") {
    const head = Math.min(rect.width * 0.36, rect.height * 0.32);
    const shaft = Math.min(rect.width, rect.height) * 0.28;
    const verticalX =
      kind === "bentArrow" ? rect.width - shaft : rect.width - head;
    polygon(path, [
      [verticalX, 0],
      [rect.width, head],
      [verticalX + shaft / 2, head],
      [verticalX + shaft / 2, rect.height],
      [0, rect.height],
      [0, rect.height - shaft],
      [verticalX - shaft / 2, rect.height - shaft],
      [verticalX - shaft / 2, head],
      [verticalX - head, head],
    ]);
    return path;
  }

  if (kind === "trapezoid") {
    const inset = Math.min(rect.width / 3, rect.width * 0.18);
    polygon(path, [
      [inset, 0],
      [rect.width - inset, 0],
      [rect.width, rect.height],
      [0, rect.height],
    ]);
    return path;
  }

  if (kind === "hexagon") {
    const inset = Math.min(rect.width / 3, rect.width * 0.24);
    polygon(path, [
      [inset, 0],
      [rect.width - inset, 0],
      [rect.width, rect.height / 2],
      [rect.width - inset, rect.height],
      [inset, rect.height],
      [0, rect.height / 2],
    ]);
    return path;
  }

  if (kind === "bracePair" || kind === "bracketPair") {
    drawBracketLikePath(path, rect, kind);
    return path;
  }

  if (
    kind === "leftBrace" ||
    kind === "rightBrace" ||
    kind === "leftBracket" ||
    kind === "rightBracket"
  ) {
    drawSingleBracketLikePath(path, rect, kind);
    return path;
  }

  path.rect(0, 0, rect.width, rect.height);
  return path;
}

export function customGeometryPath(
  shape: RecordValue | null,
  rect: PresentationRect,
): Path2D | null {
  const paths = Array.isArray(shape?.customPaths) ? shape.customPaths : [];
  if (paths.length === 0) return null;

  const result = new Path2D();
  let hasCommands = false;
  for (const rawPath of paths) {
    const customPath = asRecord(rawPath);
    const width = asNumber(customPath?.widthEmu, rect.width);
    const height = asNumber(customPath?.heightEmu, rect.height);
    const scaleX = width === 0 ? 1 : rect.width / width;
    const scaleY = height === 0 ? 1 : rect.height / height;
    const commands = Array.isArray(customPath?.commands)
      ? customPath.commands
      : [];
    for (const rawCommand of commands) {
      const command = asRecord(rawCommand);
      if (!command) continue;
      const moveTo = asRecord(command.moveTo);
      const lineTo = asRecord(command.lineTo);
      const close = asRecord(command.close);
      const quadBezTo = asRecord(command.quadBezTo);
      const cubicBezTo = asRecord(command.cubicBezTo);
      if (moveTo) {
        result.moveTo(asNumber(moveTo.x) * scaleX, asNumber(moveTo.y) * scaleY);
        hasCommands = true;
      } else if (lineTo) {
        result.lineTo(asNumber(lineTo.x) * scaleX, asNumber(lineTo.y) * scaleY);
        hasCommands = true;
      } else if (quadBezTo) {
        result.quadraticCurveTo(
          asNumber(quadBezTo.x1) * scaleX,
          asNumber(quadBezTo.y1) * scaleY,
          asNumber(quadBezTo.x) * scaleX,
          asNumber(quadBezTo.y) * scaleY,
        );
        hasCommands = true;
      } else if (cubicBezTo) {
        result.bezierCurveTo(
          asNumber(cubicBezTo.x1) * scaleX,
          asNumber(cubicBezTo.y1) * scaleY,
          asNumber(cubicBezTo.x2) * scaleX,
          asNumber(cubicBezTo.y2) * scaleY,
          asNumber(cubicBezTo.x) * scaleX,
          asNumber(cubicBezTo.y) * scaleY,
        );
        hasCommands = true;
      } else if (close) {
        result.closePath();
      }
    }
  }

  return hasCommands ? result : null;
}

export function customGeometryLinePoints(
  shape: RecordValue | null,
  rect: PresentationRect,
): Array<{ x: number; y: number }> | null {
  const paths = Array.isArray(shape?.customPaths) ? shape.customPaths : [];
  const points: Array<{ x: number; y: number }> = [];
  for (const rawPath of paths) {
    const customPath = asRecord(rawPath);
    const width = asNumber(customPath?.widthEmu, rect.width);
    const height = asNumber(customPath?.heightEmu, rect.height);
    const scaleX = width === 0 ? 1 : rect.width / width;
    const scaleY = height === 0 ? 1 : rect.height / height;
    const commands = Array.isArray(customPath?.commands)
      ? customPath.commands
      : [];
    for (const rawCommand of commands) {
      const command = asRecord(rawCommand);
      if (!command) continue;
      const point =
        asRecord(command.moveTo) ??
        asRecord(command.lineTo) ??
        asRecord(command.quadBezTo) ??
        asRecord(command.cubicBezTo);
      if (point) {
        points.push({
          x: asNumber(point.x) * scaleX,
          y: asNumber(point.y) * scaleY,
        });
      }
    }
  }

  return points.length >= 2 ? points : null;
}

export function presetGeometryLinePoints(
  shape: RecordValue | null,
  rect: PresentationRect,
): Array<{ x: number; y: number }> | null {
  if (asNumber(shape?.geometry) !== 89) return null;

  const start = pptAngleToRadians(adjustmentValue(shape, "adj1") ?? 0);
  let end = pptAngleToRadians(adjustmentValue(shape, "adj2") ?? 90 * 60_000);
  while (end < start) end += Math.PI * 2;

  const steps = Math.max(8, Math.ceil(((end - start) / (Math.PI * 2)) * 32));
  const points: Array<{ x: number; y: number }> = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = start + ((end - start) * step) / steps;
    points.push({
      x: rect.width / 2 + Math.cos(angle) * (rect.width / 2),
      y: rect.height / 2 + Math.sin(angle) * (rect.height / 2),
    });
  }
  return points.length >= 2 ? points : null;
}

function polygon(path: Path2D, points: Array<[number, number]>): void {
  const [first, ...rest] = points;
  if (!first) return;
  path.moveTo(first[0], first[1]);
  for (const [x, y] of rest) {
    path.lineTo(x, y);
  }
  path.closePath();
}

function calloutPath(
  path: Path2D,
  rect: PresentationRect,
  kind: "wedgeEllipseCallout" | "wedgeRectCallout" | "wedgeRoundRectCallout",
): void {
  const tail = [
    [rect.width * 0.5, rect.height],
    [rect.width * 0.32, rect.height * 0.74],
    [rect.width * 0.62, rect.height * 0.74],
  ] satisfies Array<[number, number]>;

  if (kind === "wedgeEllipseCallout") {
    path.ellipse(
      rect.width / 2,
      rect.height * 0.42,
      rect.width / 2,
      rect.height * 0.42,
      0,
      0,
      Math.PI * 2,
    );
    polygon(path, tail);
    return;
  }

  if (kind === "wedgeRoundRectCallout") {
    roundedRect(
      path,
      0,
      0,
      rect.width,
      rect.height * 0.78,
      Math.min(rect.width, rect.height) * 0.08,
    );
    polygon(path, tail);
    return;
  }

  polygon(path, [
    [0, 0],
    [rect.width, 0],
    [rect.width, rect.height * 0.74],
    [tail[2][0], tail[2][1]],
    [tail[0][0], tail[0][1]],
    [tail[1][0], tail[1][1]],
    [0, rect.height * 0.74],
  ]);
}

function cloudPath(path: Path2D, rect: PresentationRect): void {
  path.moveTo(rect.width * 0.26, rect.height * 0.82);
  path.bezierCurveTo(
    rect.width * 0.08,
    rect.height * 0.82,
    0,
    rect.height * 0.66,
    rect.width * 0.12,
    rect.height * 0.52,
  );
  path.bezierCurveTo(
    rect.width * 0.02,
    rect.height * 0.32,
    rect.width * 0.24,
    rect.height * 0.16,
    rect.width * 0.42,
    rect.height * 0.24,
  );
  path.bezierCurveTo(
    rect.width * 0.5,
    0,
    rect.width * 0.78,
    rect.height * 0.06,
    rect.width * 0.78,
    rect.height * 0.3,
  );
  path.bezierCurveTo(
    rect.width,
    rect.height * 0.34,
    rect.width,
    rect.height * 0.66,
    rect.width * 0.82,
    rect.height * 0.72,
  );
  path.bezierCurveTo(
    rect.width * 0.72,
    rect.height * 0.92,
    rect.width * 0.42,
    rect.height * 0.96,
    rect.width * 0.26,
    rect.height * 0.82,
  );
  path.closePath();
}

function curvedArrowPath(
  path: Path2D,
  rect: PresentationRect,
  kind: "curvedDownArrow" | "curvedLeftArrow" | "curvedRightArrow" | "curvedUpArrow",
): void {
  const points: Array<[number, number]> = [
    [0.08, 1],
    [0.08, 0.56],
    [0.48, 0.56],
    [0.48, 0.32],
    [0.72, 0.32],
    [0.72, 0.06],
    [1, 0.5],
    [0.72, 0.94],
    [0.72, 0.68],
    [0.24, 0.68],
    [0.24, 1],
  ];
  polygon(
    path,
    points.map(([x, y]) => orientedPoint(rect, x, y, kind)),
  );
}

function orientedPoint(
  rect: PresentationRect,
  x: number,
  y: number,
  kind: "curvedDownArrow" | "curvedLeftArrow" | "curvedRightArrow" | "curvedUpArrow",
): [number, number] {
  if (kind === "curvedLeftArrow") return [rect.width * (1 - x), rect.height * y];
  if (kind === "curvedUpArrow") return [rect.width * y, rect.height * (1 - x)];
  if (kind === "curvedDownArrow") return [rect.width * (1 - y), rect.height * x];
  return [rect.width * x, rect.height * y];
}

function adjustmentValue(shape: RecordValue | null, name: string): number | null {
  const adjustments = [
    ...asArray(shape?.adjustmentList),
    ...asArray(shape?.adjustments),
  ];
  for (const rawAdjustment of adjustments) {
    const adjustment = asRecord(rawAdjustment);
    if (adjustment?.name !== name) continue;
    const formula = String(adjustment.formula ?? "");
    const match = /^val\s+(-?\d+(?:\.\d+)?)$/u.exec(formula.trim());
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function roundedRectRadius(rect: PresentationRect, shape: RecordValue | null): number {
  const adjustment = adjustmentValue(shape, "adj") ?? 16_667;
  return Math.min(rect.width, rect.height) * clamp(adjustment, 0, 50_000) / 100_000;
}

function pptAngleToRadians(value: number): number {
  return (value / 60_000) * (Math.PI / 180);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function starPath(
  path: Path2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
): void {
  const steps = points * 2;
  for (let index = 0; index < steps; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index / steps) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  path.closePath();
}

function drawBracketLikePath(
  path: Path2D,
  rect: PresentationRect,
  kind: "bracePair" | "bracketPair",
): void {
  const strokeWidth = Math.max(1, Math.min(rect.width, rect.height) * 0.08);
  const inset = Math.min(rect.width * 0.2, strokeWidth * 2);
  if (kind === "bracketPair") {
    roundedRect(path, 0, 0, inset, rect.height, strokeWidth);
    roundedRect(path, rect.width - inset, 0, inset, rect.height, strokeWidth);
    return;
  }

  path.moveTo(inset, 0);
  path.quadraticCurveTo(0, rect.height * 0.25, inset, rect.height * 0.5);
  path.quadraticCurveTo(0, rect.height * 0.75, inset, rect.height);
  path.lineTo(inset + strokeWidth, rect.height);
  path.quadraticCurveTo(
    strokeWidth,
    rect.height * 0.75,
    inset + strokeWidth,
    rect.height * 0.5,
  );
  path.quadraticCurveTo(
    strokeWidth,
    rect.height * 0.25,
    inset + strokeWidth,
    0,
  );
  path.closePath();
  path.moveTo(rect.width - inset, 0);
  path.quadraticCurveTo(
    rect.width,
    rect.height * 0.25,
    rect.width - inset,
    rect.height * 0.5,
  );
  path.quadraticCurveTo(
    rect.width,
    rect.height * 0.75,
    rect.width - inset,
    rect.height,
  );
  path.lineTo(rect.width - inset - strokeWidth, rect.height);
  path.quadraticCurveTo(
    rect.width - strokeWidth,
    rect.height * 0.75,
    rect.width - inset - strokeWidth,
    rect.height * 0.5,
  );
  path.quadraticCurveTo(
    rect.width - strokeWidth,
    rect.height * 0.25,
    rect.width - inset - strokeWidth,
    0,
  );
  path.closePath();
}

function drawSingleBracketLikePath(
  path: Path2D,
  rect: PresentationRect,
  kind: "leftBrace" | "rightBrace" | "leftBracket" | "rightBracket",
): void {
  if (kind === "leftBracket" || kind === "rightBracket") {
    const x = kind === "leftBracket" ? rect.width : 0;
    const outerX = kind === "leftBracket" ? 0 : rect.width;
    path.moveTo(x, 0);
    path.lineTo(outerX, 0);
    path.lineTo(outerX, rect.height);
    path.lineTo(x, rect.height);
    return;
  }

  const mirror = kind === "rightBrace";
  const x = (value: number) => (mirror ? rect.width - value : value);
  const outer = rect.width;
  const waist = rect.width * 0.18;
  const inner = rect.width * 0.74;
  path.moveTo(x(outer), 0);
  path.bezierCurveTo(x(waist), 0, x(waist), rect.height * 0.25, x(inner), rect.height * 0.36);
  path.bezierCurveTo(x(outer), rect.height * 0.43, x(outer), rect.height * 0.47, x(waist), rect.height * 0.5);
  path.bezierCurveTo(x(outer), rect.height * 0.53, x(outer), rect.height * 0.57, x(inner), rect.height * 0.64);
  path.bezierCurveTo(x(waist), rect.height * 0.75, x(waist), rect.height, x(outer), rect.height);
}

function roundedRect(
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  path.moveTo(x + r, y);
  path.lineTo(x + width - r, y);
  path.quadraticCurveTo(x + width, y, x + width, y + r);
  path.lineTo(x + width, y + height - r);
  path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  path.lineTo(x + r, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
}
