        import type { CSSProperties } from "react";

        import type { OfficeTextStyleMaps, ParagraphView, RecordValue, TextRunView } from "./office-types";
        import { asArray, asNumber, asRecord, asString } from "./office-data-coerce";
        import { colorToCss } from "./office-color-utils";

        export function paragraphText(paragraph: unknown): string {
          const runs = asArray(asRecord(paragraph)?.runs);
          return runs.map((run) => asString(asRecord(run)?.text)).join("");
        }

        export function paragraphView(paragraph: unknown, styleMaps: OfficeTextStyleMaps): ParagraphView {
          const record = asRecord(paragraph);
          const styleId = asString(record?.styleId);
          const style = {
            ...resolvedTextStyle(styleId, styleMaps),
            ...(asRecord(record?.paragraphStyle) ?? {}),
            ...(asRecord(record?.style) ?? {}),
            ...paragraphMarkTextStyle(asRecord(record?.textStyle)),
            ...definedRecordProperties(record, TEXT_STYLE_FIELDS),
          };
          const runs = asArray(record?.runs)
            .map(asRecord)
            .filter((run): run is RecordValue => run != null)
            .map((run, index) => ({
              hyperlink: asRecord(run.hyperlink),
              id: asString(run.id) || `${asString(record?.id)}-${index}`,
              referenceMarkers: [],
              reviewMarkIds: asArray(run.reviewMarkIds).map(asString).filter(Boolean),
              text: asString(run.text),
              style: {
                ...style,
                ...(asRecord(run.textStyle) ?? {}),
              },
            }));

          return {
            id: asString(record?.id),
            runs,
            styleId,
            style,
          };
        }

        function paragraphMarkTextStyle(style: RecordValue | null): RecordValue {
          if (style == null) return {};
          return definedRecordProperties(style, ["alignment"]);
        }

        function resolvedTextStyle(styleId: string, styleMaps: OfficeTextStyleMaps, visited = new Set<string>()): RecordValue {
          if (!styleId || visited.has(styleId)) return {};

          const styleRecord = styleMaps.textStyles.get(styleId);
          if (!styleRecord) return {};

          const basedOn = asString(styleRecord.basedOn);
          const nextVisited = new Set(visited);
          nextVisited.add(styleId);

          return {
            ...resolvedTextStyle(basedOn, styleMaps, nextVisited),
            ...(asRecord(styleRecord.textStyle) ?? {}),
            ...(asRecord(styleRecord.paragraphStyle) ?? {}),
            ...definedRecordProperties(styleRecord, TEXT_STYLE_FIELDS),
          };
        }

        const TEXT_STYLE_FIELDS = [
          "alignment",
          "bulletCharacter",
          "indent",
          "lineSpacing",
          "lineSpacingPercent",
          "marginLeft",
          "spaceAfter",
          "spaceBefore",
        ];

        function definedRecordProperties(record: RecordValue | null, keys: string[]): RecordValue {
          const values: RecordValue = {};
          if (!record) return values;

          for (const key of keys) {
            if (record[key] !== undefined && record[key] !== null) {
              values[key] = record[key];
            }
          }

          return values;
        }

        export function paragraphStyle(paragraph: ParagraphView): CSSProperties {
          const isTitle = paragraph.styleId === "Title";
          const isHeading = /^Heading/i.test(paragraph.styleId);
          const spaceBefore = asNumber(paragraph.style?.spaceBefore);
          const spaceAfter = asNumber(paragraph.style?.spaceAfter);
          const marginLeft = emuToCssPx(paragraph.style?.marginLeft);
          const textIndent = emuToCssPx(paragraph.style?.indent);

          return {
            color: colorToCss(asRecord(paragraph.style?.fill)?.color) ?? "#0f172a",
            fontFamily: officeFontFamily(asString(paragraph.style?.typeface)),
            fontSize: cssFontSize(paragraph.style?.fontSize, isTitle ? 26 : isHeading ? 18 : 14),
            fontWeight: paragraph.style?.bold === true || isTitle || isHeading ? 700 : 400,
            lineHeight: paragraphLineHeight(paragraph),
            margin: 0,
            marginBottom: spaceAfter ? Math.min(28, spaceAfter / 20) : isTitle || isHeading ? 10 : 8,
            marginLeft: marginLeft || undefined,
            marginTop: spaceBefore ? Math.min(32, spaceBefore / 20) : isHeading ? 12 : 0,
            textAlign: paragraphTextAlign(paragraph.style?.alignment),
            textIndent: textIndent || undefined,
            whiteSpace: "pre-wrap",
          };
        }

        function paragraphLineHeight(paragraph: ParagraphView): CSSProperties["lineHeight"] {
          const exactPoints = asNumber(paragraph.style?.lineSpacing);
          if (exactPoints > 0) return `${Math.max(8, Math.min(96, exactPoints / 100))}pt`;

          const percent = asNumber(paragraph.style?.lineSpacingPercent);
          if (percent > 0) return Math.max(0.8, Math.min(3, percent / 100_000));

          return 1.55;
        }

        function paragraphTextAlign(alignment: unknown): CSSProperties["textAlign"] {
          switch (asNumber(alignment)) {
            case 2:
              return "center";
            case 3:
              return "right";
            case 4:
              return "justify";
            default:
              return undefined;
          }
        }

        function emuToCssPx(value: unknown): number {
          const emu = asNumber(value);
          if (emu === 0) return 0;
          return emu / 9_525;
        }

        export function textRunStyle(run: TextRunView, fontScale = 1): CSSProperties {
          const runFontSize = run.style?.fontSize == null ? undefined : cssFontSize(run.style.fontSize, 14) * fontScale;
          const scheme = docxSchemeStyle(run.style?.scheme);
          const typeface = asString(run.style?.typeface) || scheme.typeface;
          return {
            backgroundColor: scheme.backgroundColor,
            color: colorToCss(asRecord(run.style?.fill)?.color) ?? undefined,
            fontFamily: officeFontFamily(typeface),
            fontSize: runFontSize == null ? undefined : Math.max(fontScale < 1 ? 2 : 8, Math.min(fontScale < 1 ? 12 : 72, runFontSize)),
            fontStyle: run.style?.italic === true ? "italic" : run.style?.italic === false ? "normal" : undefined,
            fontWeight: run.style?.bold === true ? 700 : run.style?.bold === false ? 400 : undefined,
            ...docxTextDecoration(run.style?.underline),
            textTransform: scheme.textTransform,
          };
        }

        function docxTextDecoration(value: unknown): Pick<CSSProperties, "textDecoration" | "textDecorationStyle"> {
          if (value === true) return { textDecoration: "underline" };
          if (value === false) return { textDecoration: "none" };

          const underline = asString(value).toLowerCase();
          if (!underline) return {};
          if (underline === "none") return { textDecoration: "none" };
          return {
            textDecoration: "underline",
            textDecorationStyle: docxUnderlineStyle(underline),
          };
        }

        function docxUnderlineStyle(underline: string): CSSProperties["textDecorationStyle"] {
          if (underline.includes("double")) return "double";
          if (underline.includes("dotted") || underline.includes("dot")) return "dotted";
          if (underline.includes("dash")) return "dashed";
          if (underline.includes("wave") || underline.includes("wavy")) return "wavy";
          return undefined;
        }

        function docxSchemeStyle(scheme: unknown): Pick<CSSProperties, "backgroundColor" | "textTransform"> & {
          typeface: string;
        } {
          const parts = asString(scheme).split(";").filter(Boolean);
          const style: Pick<CSSProperties, "backgroundColor" | "textTransform"> & { typeface: string } = { typeface: "" };
          for (const part of parts) {
            if (part === "__docxCaps:true") {
              style.textTransform = "uppercase";
              continue;
            }

            if (part.startsWith("__docxHighlight:")) {
              style.backgroundColor = docxHighlightToCss(part.slice("__docxHighlight:".length));
              continue;
            }

            if (part.startsWith("__docxEastAsiaTypeface:")) {
              style.typeface ||= part.slice("__docxEastAsiaTypeface:".length);
              continue;
            }

            if (part.startsWith("__docxComplexScriptTypeface:")) {
              style.typeface ||= part.slice("__docxComplexScriptTypeface:".length);
            }
          }
          return style;
        }

        function docxHighlightToCss(value: string): string | undefined {
          switch (value.toLowerCase()) {
            case "black":
              return "#000000";
            case "blue":
              return "#0000ff";
            case "cyan":
              return "#00ffff";
            case "darkblue":
              return "#000080";
            case "darkcyan":
              return "#008080";
            case "darkgray":
              return "#808080";
            case "darkgreen":
              return "#008000";
            case "darkmagenta":
              return "#800080";
            case "darkred":
              return "#800000";
            case "darkyellow":
              return "#808000";
            case "green":
              return "#00ff00";
            case "lightgray":
              return "#c0c0c0";
            case "magenta":
              return "#ff00ff";
            case "red":
              return "#ff0000";
            case "white":
              return "#ffffff";
            case "yellow":
              return "#ffff00";
            default:
              return undefined;
          }
        }

        export const OFFICE_FONT_FALLBACK =
          'Aptos, Carlito, Calibri, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
        const OFFICE_SERIF_FONT_FALLBACK =
          '"Songti SC", STSong, SimSun, "Noto Serif CJK SC", "Noto Serif CJK", serif';

        export function officeFontFamily(typeface: string): string {
          const families = officeTypefaceFamilies(typeface);
          if (families.length === 0) return OFFICE_FONT_FALLBACK;
          const renderedFamilies = families.map(formatCssFontFamily);
          const fallback = families.some(isSerifTypeface)
            ? `${OFFICE_SERIF_FONT_FALLBACK}, ${OFFICE_FONT_FALLBACK}`
            : OFFICE_FONT_FALLBACK;
          return `${renderedFamilies.join(", ")}, ${fallback}`;
        }

        function officeTypefaceFamilies(typeface: string): string[] {
          return typeface
            .split(/[;,]/u)
            .map((family) => stripWrappingQuotes(family.trim()))
            .filter(Boolean);
        }

        function stripWrappingQuotes(value: string): string {
          if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
            return value.slice(1, -1);
          }
          return value;
        }

        function formatCssFontFamily(family: string): string {
          if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/iu.test(family)) {
            return family;
          }

          const escaped = family.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
          return `"${escaped}"`;
        }

        function isSerifTypeface(family: string): boolean {
          const normalized = family.trim();
          if (/^sans-serif$/iu.test(normalized)) return false;
          return /(^|[\s-])serif($|[\s-])|song|宋|明|仿宋|楷/iu.test(normalized);
        }

        export async function prewarmOfficeFonts(typefaces: Iterable<string>): Promise<void> {
          if (typeof document === "undefined" || !("fonts" in document)) return;
          const fontSet = document.fonts;
          const families = new Set(["Aptos", "Carlito", "Calibri", "Arial", ...Array.from(typefaces).filter(Boolean)]);
          await Promise.all(
            Array.from(families).map(async (family) => {
              try {
                await fontSet.load(`400 16px ${officeFontFamily(family)}`);
              } catch {
                // Optional font probing should never block preview rendering.
              }
            }),
          );
        }

        export function collectTextBlocks(value: unknown, limit = 80): string[] {
          const blocks: string[] = [];
          const seen = new WeakSet<object>();

          function visit(node: unknown) {
            if (blocks.length >= limit) return;
            if (Array.isArray(node)) {
              for (const item of node) visit(item);
              return;
            }

            const record = asRecord(node);
            if (record == null || seen.has(record)) return;
            seen.add(record);

            const paragraphs = asArray(record.paragraphs);
            if (paragraphs.length > 0) {
              const text = paragraphs.map(paragraphText).filter(Boolean).join("\n");
              if (text.trim()) blocks.push(text);
            }

            for (const child of Object.values(record)) {
              if (typeof child === "object" && child !== null) {
                visit(child);
              }
            }
          }

          visit(value);
          return blocks;
        }

        export function resolveStyleRecord(record: RecordValue | null, keys: string[]): RecordValue | null {
          for (const key of keys) {
            const candidate = asRecord(record?.[key]);
            if (candidate) return candidate;
          }

          return null;
        }

        export function cssFontSize(value: unknown, fallbackPx: number): number {
          const raw = asNumber(value);
          if (raw <= 0) return fallbackPx;
          if (raw > 200) return Math.max(8, Math.min(72, raw / 100));
          return Math.max(8, Math.min(72, raw));
        }

