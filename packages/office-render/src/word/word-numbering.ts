import {
  asArray,
  asNumber,
  asRecord,
  asString,
  type OfficeTextStyleMaps,
  paragraphView,
  type RecordValue,
} from "../shared/office-preview-utils";

export function wordNumberingMarkers(
  elements: unknown[],
  root: RecordValue | null,
  styleMaps: OfficeTextStyleMaps,
): Map<string, string> {
  const numberingByParagraphId = new Map<string, { level: number; numId: string }>();
  for (const numbering of asArray(root?.paragraphNumberings)) {
    const record = asRecord(numbering);
    const paragraphId = asString(record?.paragraphId);
    const numId = asString(record?.numId);
    if (!paragraphId || !numId) continue;
    numberingByParagraphId.set(paragraphId, {
      level: Math.max(0, Math.floor(asNumber(record?.level))),
      numId,
    });
  }

  const numberingDefinitions = wordNumberingDefinitionLevels(root);
  const counters = new Map<string, number>();
  const markers = new Map<string, string>();
  for (const paragraph of wordParagraphRecords(elements)) {
    const view = paragraphView(paragraph, styleMaps);
    const numbering = numberingByParagraphId.get(view.id);
    if (!numbering) continue;

    resetDeeperNumberingLevels(counters, numbering.numId, numbering.level);
    const counterKey = `${numbering.numId}:${numbering.level}`;
    const definition = numberingDefinitions.get(counterKey);
    const current = counters.has(counterKey)
      ? (counters.get(counterKey) ?? 0) + 1
      : Math.max(1, Math.floor(asNumber(view.style?.autoNumberStartAt, asNumber(definition?.startAt, 1))));
    counters.set(counterKey, current);

    const marker = wordNumberingMarkerForDefinition(asString(view.style?.autoNumberType), definition, current);
    if (marker) markers.set(view.id, marker);
  }

  return markers;
}

export type WordNumberingLevel = {
  levelText: string;
  numberFormat: string;
  startAt: number;
};

function wordNumberingDefinitionLevels(root: RecordValue | null): Map<string, WordNumberingLevel> {
  const levelsByKey = new Map<string, WordNumberingLevel>();
  for (const definition of asArray(root?.numberingDefinitions).map(asRecord)) {
    const numId = asString(definition?.numId);
    if (!numId) continue;

    for (const level of asArray(definition?.levels).map(asRecord)) {
      const levelIndex = Math.max(0, Math.floor(asNumber(level?.level)));
      levelsByKey.set(`${numId}:${levelIndex}`, {
        levelText: asString(level?.levelText),
        numberFormat: asString(level?.numberFormat),
        startAt: Math.max(1, Math.floor(asNumber(level?.startAt, 1))),
      });
    }
  }
  return levelsByKey;
}

function wordParagraphRecords(elements: unknown[]): unknown[] {
  const paragraphs: unknown[] = [];
  for (const element of elements) {
    const record = asRecord(element);
    if (!record) continue;
    paragraphs.push(...asArray(record.paragraphs));

    const table = asRecord(record.table);
    for (const row of asArray(table?.rows)) {
      const rowRecord = asRecord(row);
      for (const cell of asArray(rowRecord?.cells)) {
        paragraphs.push(...asArray(asRecord(cell)?.paragraphs));
      }
    }
  }
  return paragraphs;
}

function resetDeeperNumberingLevels(counters: Map<string, number>, numId: string, level: number): void {
  const prefix = `${numId}:`;
  for (const key of Array.from(counters.keys())) {
    if (!key.startsWith(prefix)) continue;
    const keyLevel = Number.parseInt(key.slice(prefix.length), 10);
    if (keyLevel > level) counters.delete(key);
  }
}

function wordNumberingMarker(type: string, value: number): string {
  const alphaLc = alphabeticMarker(value, false);
  const alphaUc = alphabeticMarker(value, true);
  const romanUc = romanMarker(value);
  const romanLc = romanUc.toLowerCase();
  return (
    {
      alphaLcParenR: `${alphaLc})`,
      alphaLcPeriod: `${alphaLc}.`,
      alphaUcParenR: `${alphaUc})`,
      alphaUcPeriod: `${alphaUc}.`,
      arabicParenR: `${value})`,
      arabicPeriod: `${value}.`,
      romanLcParenR: `${romanLc})`,
      romanLcPeriod: `${romanLc}.`,
      romanUcParenR: `${romanUc})`,
      romanUcPeriod: `${romanUc}.`,
    } satisfies Record<string, string>
  )[type] ?? "";
}

function wordNumberingMarkerForDefinition(
  autoNumberType: string,
  definition: WordNumberingLevel | undefined,
  value: number,
): string {
  if (autoNumberType) return wordNumberingMarker(autoNumberType, value);
  if (!definition) return "";

  const format = definition.numberFormat;
  const levelText = definition.levelText;
  if (format === "bullet") return wordBulletMarker(levelText);

  const markerValue = wordNumberingMarker(wordNumberingFormatAutoType(format), value);
  if (!markerValue) return "";
  if (!levelText.includes("%")) return markerValue;
  return levelText.replace(/%\d+/g, markerValue.replace(/[.)]$/u, ""));
}

function wordNumberingFormatAutoType(format: string): string {
  return (
    {
      decimal: "arabicPeriod",
      lowerLetter: "alphaLcPeriod",
      lowerRoman: "romanLcPeriod",
      upperLetter: "alphaUcPeriod",
      upperRoman: "romanUcPeriod",
    } satisfies Record<string, string>
  )[format] ?? "";
}

function alphabeticMarker(value: number, uppercase: boolean): string {
  let remaining = Math.max(1, value);
  let marker = "";
  while (remaining > 0) {
    remaining -= 1;
    marker = String.fromCharCode(97 + (remaining % 26)) + marker;
    remaining = Math.floor(remaining / 26);
  }
  return uppercase ? marker.toUpperCase() : marker;
}

function romanMarker(value: number): string {
  let remaining = Math.max(1, Math.min(3999, value));
  let marker = "";
  for (const [symbol, amount] of [
    ["M", 1000],
    ["CM", 900],
    ["D", 500],
    ["CD", 400],
    ["C", 100],
    ["XC", 90],
    ["L", 50],
    ["XL", 40],
    ["X", 10],
    ["IX", 9],
    ["V", 5],
    ["IV", 4],
    ["I", 1],
  ] as const) {
    while (remaining >= amount) {
      marker += symbol;
      remaining -= amount;
    }
  }
  return marker;
}

export function wordBulletMarker(levelText: string): string {
  return (
    {
      "\uf0a7": "▪",
      "\uf0b7": "•",
      "\uf0d8": "➢",
      "\uf0fc": "✓",
    } satisfies Record<string, string>
  )[levelText] ?? (levelText || "•");
}
