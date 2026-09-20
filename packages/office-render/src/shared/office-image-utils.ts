import { useMemo } from "react";

import type { RecordValue } from "./office-types";
import { asArray, asRecord, asString, bytesFromUnknown, inferImageContentType } from "./office-data-coerce";

type ImageSource = {
  id: string;
  src: string;
};

type ImagePayload = {
  bytes: Uint8Array | null;
  contentType: string;
  id: string;
  uri: string;
};

export function imageReferenceId(value: unknown): string {
  const record = asRecord(value);
  return asString(record?.id);
}

export function elementImageReferenceId(element: RecordValue): string {
  const direct = imageReferenceId(element.imageReference);
  if (direct) return direct;

  const fill = asRecord(element.fill);
  const fillImage = imageReferenceId(fill?.imageReference);
  if (fillImage) return fillImage;

  const shapeFill = asRecord(asRecord(element.shape)?.fill);
  return imageReferenceId(shapeFill?.imageReference);
}

export function useOfficeImageSources(root: RecordValue | null): Map<string, string> {
  const imageRecords = useMemo(() => {
    const rootImages = asArray(root?.images).map(asRecord).filter((image): image is RecordValue => image != null);
    return [...rootImages.map(imagePayloadFromImageRecord), ...collectElementImagePayloads(root)].filter(
      (image): image is ImagePayload => image != null,
    );
  }, [root]);

  const imageSources = useMemo(() => {
    const sources: ImageSource[] = [];
    for (const image of imageRecords) {
      const bytes = image.bytes;
      if (bytes != null && bytes.byteLength > 0) {
        const contentType = image.contentType || inferImageContentType(image.id);
        const payload = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(payload).set(bytes);
        const blob = new Blob([payload], { type: contentType });
        sources.push({ id: image.id, src: URL.createObjectURL(blob) });
        continue;
      }

      if (image.uri) {
        sources.push({ id: image.id, src: image.uri });
      }
    }

    return sources;
  }, [imageRecords]);

  return useMemo(() => {
    return new Map(imageSources.map((image) => [image.id, image.src]));
  }, [imageSources]);
}

function imagePayloadFromImageRecord(image: RecordValue): ImagePayload | null {
  const id = asString(image.id);
  if (!id) return null;

  return {
    bytes: bytesFromUnknown(image.data ?? image.bytes),
    contentType: asString(image.contentType),
    id,
    uri: asString(image.uri),
  };
}

function collectElementImagePayloads(root: RecordValue | null): ImagePayload[] {
  if (root == null) return [];

  const payloads: ImagePayload[] = [];
  const seen = new WeakSet<object>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = asRecord(value);
    if (record == null || seen.has(record)) return;
    seen.add(record);

    const image = asRecord(record.image);
    const id = imageReferenceId(record.imageReference);
    if (image != null && id) {
      payloads.push({
        bytes: bytesFromUnknown(image.data ?? image.bytes),
        contentType: asString(image.contentType),
        id,
        uri: asString(image.uri),
      });
    }

    for (const child of Object.values(record)) {
      if (typeof child === "object" && child !== null) {
        visit(child);
      }
    }
  }

  visit(root);
  return payloads;
}

