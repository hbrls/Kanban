import { asArray, asRecord, asString, type RecordValue } from "../shared/office-preview-utils";

export function presentationSlideNotesText(slide: RecordValue): string {
  const notesSlide = asRecord(slide.notesSlide);
  if (!notesSlide) return "";

  const blocks: string[] = [];
  for (const element of asArray(notesSlide.elements)) {
    const record = asRecord(element);
    if (!record || !isPresentationNotesBodyPlaceholder(record)) {
      continue;
    }

    const text = asArray(record.paragraphs)
      .map((paragraph) =>
        asArray(asRecord(paragraph)?.runs)
          .map((run) => asString(asRecord(run)?.text))
          .join("")
          .trim(),
      )
      .filter((line) => line && !/^\d+$/u.test(line))
      .join("\n")
      .trim();
    if (text && !blocks.includes(text)) {
      blocks.push(text);
    }
  }

  return blocks.join("\n\n");
}

export function isPresentationNotesBodyPlaceholder(element: RecordValue): boolean {
  const placeholderType = asString(element.placeholderType).toLowerCase();
  const name = asString(element.name).toLowerCase();
  if (placeholderType === "sldimg" || placeholderType === "sldnum") return false;
  if (placeholderType === "body" || placeholderType === "notes") return true;
  if (name.includes("notes") || name.includes("body")) return true;
  return placeholderType === "" && asArray(element.paragraphs).length > 0;
}
