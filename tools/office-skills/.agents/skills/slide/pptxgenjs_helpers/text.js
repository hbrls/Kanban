// Copyright (c) OpenAI. All rights reserved.
"use strict";

function calcTextBoxHeightSimple(
  fontSize,
  lines = 1,
  leading = 1.15,
  padding = 0.3
) {
  const lineHeightIn = (fontSize / 72) * leading;
  return lines * lineHeightIn + padding;
}

function calcTextBox(fontSize, opts = {}) {
  const size = clampNumber(fontSize, 1, 400, 12);
  const text = extractText(opts.text);
  const layout = estimateTextLayout(text, size, opts);
  return {
    x: numberOr(opts.x, 0),
    y: numberOr(opts.y, 0),
    w: numberOr(opts.w, 1),
    h: layout.height,
    margin: opts.margin,
    paraSpaceAfter: opts.paraSpaceAfter,
    fit: opts.fit || "shrink",
  };
}

function autoFontSize(textOrRuns, fontFace, opts = {}) {
  const text = extractText(textOrRuns);
  const minFontSize = clampNumber(opts.minFontSize, 1, 400, 6);
  const requestedFontSize = clampNumber(opts.fontSize, minFontSize, 400, 12);
  const maxFontSize = clampNumber(
    opts.maxFontSize,
    requestedFontSize,
    400,
    requestedFontSize
  );
  const mode = String(opts.mode || "shrink").toLowerCase();
  const searchMax =
    mode === "grow" || mode === "auto"
      ? maxFontSize
      : Math.min(maxFontSize, requestedFontSize);

  let chosen = minFontSize;
  for (let size = searchMax; size >= minFontSize; size -= 0.25) {
    const layout = estimateTextLayout(text, size, opts);
    if (layout.fits) {
      chosen = round2(size);
      break;
    }
  }

  return {
    x: numberOr(opts.x, 0),
    y: numberOr(opts.y, 0),
    w: numberOr(opts.w, 1),
    h: numberOr(opts.h, estimateTextLayout(text, chosen, opts).height),
    fontFace,
    fontSize: chosen,
    margin: opts.margin,
    paraSpaceAfter: opts.paraSpaceAfter,
    fit: "shrink",
  };
}

function estimateTextLayout(text, fontSize, opts = {}) {
  const width = Math.max(numberOr(opts.w, 1), 0.01);
  const height = Math.max(numberOr(opts.h, Number.POSITIVE_INFINITY), 0.01);
  const margin = normalizeBoxSpacing(opts.margin);
  const padding = normalizeBoxSpacing(opts.padding);
  const horizontalPad = margin.left + margin.right + padding.left + padding.right;
  const verticalPad = margin.top + margin.bottom + padding.top + padding.bottom;
  const usableWidth = Math.max(width - horizontalPad, 0.05);
  const lines = estimateWrappedLines(text, usableWidth, fontSize);
  const paragraphCount = Math.max(1, String(text || "").split(/\n+/).length);
  const paragraphSpacing =
    (paragraphCount - 1) * numberOr(opts.paraSpaceAfter, 0) / 72;
  const lineHeight = numberOr(opts.leading, 1.15);
  const contentHeight = calcTextBoxHeightSimple(fontSize, lines, lineHeight, 0);
  const totalHeight = round2(contentHeight + verticalPad + paragraphSpacing);
  return {
    lines,
    height: totalHeight,
    fits: totalHeight <= height + 1e-6,
  };
}

function estimateWrappedLines(text, width, fontSize) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const paragraphs = normalized.split("\n");
  const capacity = Math.max(estimateLineCapacity(width, fontSize), 1);
  let lines = 0;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines += 1;
      continue;
    }

    let currentUnits = 0;
    const tokens = paragraph.split(/(\s+)/).filter(Boolean);
    for (const token of tokens) {
      const units = measureTokenUnits(token);
      if (/^\s+$/.test(token)) {
        currentUnits = Math.min(currentUnits + units, capacity);
        continue;
      }

      if (units > capacity) {
        if (currentUnits > 0) {
          lines += 1;
        }
        lines += Math.ceil(units / capacity);
        currentUnits = units % capacity;
        continue;
      }

      if (currentUnits > 0 && currentUnits + units > capacity) {
        lines += 1;
        currentUnits = units;
        continue;
      }

      currentUnits += units;
    }

    lines += 1;
  }

  return Math.max(lines, 1);
}

function estimateLineCapacity(width, fontSize) {
  const widthPoints = width * 72;
  const averageGlyphWidth = Math.max(fontSize * 0.56, 1);
  return Math.floor(widthPoints / averageGlyphWidth);
}

function measureTokenUnits(token) {
  let units = 0;
  for (const char of String(token)) {
    if (/\s/.test(char)) {
      units += 0.35;
    } else if (/[\u3000-\u9fff\uf900-\ufaff]/.test(char)) {
      units += 1;
    } else if (/[A-Z0-9]/.test(char)) {
      units += 0.7;
    } else if (/[ilI1.,'`:;|!]/.test(char)) {
      units += 0.28;
    } else if (/[-_/\\()[\]{}]/.test(char)) {
      units += 0.4;
    } else {
      units += 0.56;
    }
  }
  return units;
}

function extractText(textOrRuns) {
  if (Array.isArray(textOrRuns)) {
    return textOrRuns
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  if (textOrRuns == null) return "";
  return String(textOrRuns);
}

function normalizeBoxSpacing(value) {
  if (Array.isArray(value)) {
    const [top = 0, right = top, bottom = top, left = right] = value;
    return {
      top: numberOr(top, 0),
      right: numberOr(right, 0),
      bottom: numberOr(bottom, 0),
      left: numberOr(left, 0),
    };
  }

  const uniform = numberOr(value, 0);
  return {
    top: uniform,
    right: uniform,
    bottom: uniform,
    left: uniform,
  };
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const n = numberOr(value, fallback);
  return Math.max(min, Math.min(max, n));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  calcTextBox,
  calcTextBoxHeightSimple,
  autoFontSize,
};
