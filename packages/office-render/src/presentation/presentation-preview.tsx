"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  prewarmOfficeFonts,
  type PreviewLabels,
  type RecordValue,
  useOfficeImageSources,
} from "../shared/office-preview-utils";
import * as styles from "./presentation-preview.module.css";
import { presentationSlideNotesText } from "./presentation-notes";
import {
  collectPresentationTypefaces,
  computePresentationFit,
  getPresentationElementTargets,
  getSlideFrameSize,
  renderPresentationSlide,
  type PresentationSize,
  type PresentationTextOverflow,
} from "./presentation-renderer";

const MAX_THUMBNAIL_WIDTH = 192;
const MIN_THUMBNAIL_WIDTH = 96;
const SLIDE_BITMAP_WIDTH = 1920;
const STACK_BAR_COUNT = 12;
export const PRESENTATION_HEADER_ACTIONS_ID = "office-wasm-presentation-header-actions";

type SlideBitmapSurface = {
  height: number;
  url: string;
  width: number;
};

export function PresentationPreview({
  labels,
  proto,
}: {
  labels: PreviewLabels;
  proto: unknown;
}) {
  const root = asRecord(proto);
  const slides = useMemo(
    () => asArray(root?.slides).map(asRecord).filter((slide): slide is RecordValue => slide != null),
    [root],
  );
  const layouts = useMemo(
    () => asArray(root?.layouts).map(asRecord).filter((layout): layout is RecordValue => layout != null),
    [root],
  );
  const charts = useMemo(
    () => asArray(root?.charts).map(asRecord).filter((chart): chart is RecordValue => chart != null),
    [root],
  );
  const theme = useMemo(() => asRecord(root?.theme), [root]);
  const imageSources = useOfficeImageSources(root);
  const imageElements = useLoadedOfficeImages(imageSources);
  const slideBitmaps = useRenderedSlideBitmaps(slides, imageElements, layouts, charts, theme);
  const railRef = useRef<HTMLElement>(null);
  const railSize = useElementSize(railRef);
  const thumbnailWidth = Math.max(
    MIN_THUMBNAIL_WIDTH,
    Math.min(MAX_THUMBNAIL_WIDTH, (railSize.width || 252) - 56),
  );
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null);
  const [thumbnailRailOpen, setThumbnailRailOpen] = useState(false);
  const selectedSlideIndex = Math.min(activeSlideIndex, Math.max(0, slides.length - 1));
  const selectedSlide = slides[selectedSlideIndex] ?? {};
  const openSlideshow = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
    }
    setIsSlideshowOpen(true);
  }, []);
  const closeSlideshow = useCallback(() => setIsSlideshowOpen(false), []);

  useEffect(() => {
    void prewarmOfficeFonts(collectPresentationTypefaces(slides, layouts));
  }, [layouts, slides]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHeaderActions(document.getElementById(PRESENTATION_HEADER_ACTIONS_ID));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isSlideshowOpen || isEditableKeyboardTarget(event.target)) return;
      if (!isSlideNavigationKey(event.key)) return;

      event.preventDefault();
      setActiveSlideIndex((currentIndex) => nextSlideIndexFromKey(event.key, currentIndex, slides.length));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSlideshowOpen, slides.length]);

  useEffect(() => {
    scrollThumbnailIntoView(railRef, selectedSlideIndex);
  }, [selectedSlideIndex]);

  if (slides.length === 0) {
    return <p style={{ color: "#64748b" }}>{labels.noSlides}</p>;
  }

  return (
    <div className={styles.shell} data-testid="presentation-preview">
      <aside className={styles.rail} data-open={thumbnailRailOpen} ref={railRef}>
        <button
          aria-label={labels.slide}
          className={styles.stackButton}
          onClick={() => setThumbnailRailOpen((isOpen) => !isOpen)}
          type="button"
        >
          {Array.from({ length: Math.min(STACK_BAR_COUNT, slides.length) }).map((_, index) => (
            <span className={styles.stackBar} key={index} />
          ))}
        </button>
        <div className={styles.thumbnailPanel}>
          {slides.map((slide, index) => (
            <button
              aria-label={`${labels.slide} ${asNumber(slide.index, index + 1)}`}
              aria-current={index === selectedSlideIndex ? "true" : undefined}
              className={styles.thumbnailButton}
              data-active={index === selectedSlideIndex}
              data-slide-index={index + 1}
              data-testid="presentation-thumbnail"
              key={`${asString(slide.id)}-${index}`}
              onClick={() => {
                setActiveSlideIndex(index);
                setThumbnailRailOpen(false);
              }}
              onKeyDown={(event) => {
                if (!isSlideNavigationKey(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                const nextIndex = nextSlideIndexFromKey(event.key, index, slides.length);
                setActiveSlideIndex(nextIndex);
                focusThumbnail(railRef, nextIndex);
              }}
              type="button"
            >
              <span className={styles.thumbnailLabel}>
                {asNumber(slide.index, index + 1)}
              </span>
              <SlideRasterFrame
                alt=""
                bitmap={slideBitmaps.get(slideRenderKey(slide, index))}
                className={styles.thumbnailCanvas}
                fallbackImages={imageElements}
                fallbackTextOverflow="clip"
                charts={charts}
                layouts={layouts}
                slide={slide}
                theme={theme}
                width={thumbnailWidth}
              />
            </button>
          ))}
        </div>
      </aside>
      <SlideStage
        charts={charts}
        images={imageElements}
        key={slideRenderKey(selectedSlide, selectedSlideIndex)}
        labels={labels}
        layouts={layouts}
        slide={selectedSlide}
        slideIndex={selectedSlideIndex}
        theme={theme}
      />
      {headerActions
        ? createPortal(
            <button aria-label={labels.playSlideshow} className={styles.playButton} onClick={openSlideshow} type="button">
              <PresentationIcon name="play" size={15} />
              <span>{labels.playSlideshow}</span>
            </button>,
            headerActions,
          )
        : null}
      {isSlideshowOpen ? (
        <SlideshowOverlay
          activeSlideIndex={selectedSlideIndex}
          charts={charts}
          images={imageElements}
          labels={labels}
          layouts={layouts}
          onClose={closeSlideshow}
          setActiveSlideIndex={setActiveSlideIndex}
          slides={slides}
          theme={theme}
        />
      ) : null}
    </div>
  );
}

function SlideStage({
  charts,
  images,
  labels,
  layouts,
  slide,
  slideIndex,
  theme,
}: {
  charts: RecordValue[];
  images: ReadonlyMap<string, CanvasImageSource>;
  labels: PreviewLabels;
  layouts: RecordValue[];
  slide: RecordValue;
  slideIndex: number;
  theme: RecordValue | null;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ elementId: string; slideKey: string } | null>(null);
  const viewportSize = useElementSize(viewportRef);
  const footnote = useMemo(() => slideFootnoteText(slide), [slide]);
  const frame = getSlideFrameSize(slide, layouts);
  const fit = computePresentationFit(
    {
      height: viewportSize.height,
      width: viewportSize.width,
    },
    frame,
    { padding: 24 },
  );
  const canvasWidth = Math.max(1, fit.width);
  const canvasHeight = Math.max(1, fit.height);
  const slideKey = `${asString(slide.id)}-${slideIndex}`;
  const elementTargets = useMemo(
    () => getPresentationElementTargets(slide, { height: canvasHeight, width: canvasWidth }, layouts),
    [canvasHeight, canvasWidth, layouts, slide],
  );
  const selectedTarget =
    selection?.slideKey === slideKey ? (elementTargets.find((target) => target.id === selection.elementId) ?? null) : null;
  const footnoteTop = Math.max(0, (viewportSize.height - canvasHeight) / 2 + canvasHeight + 14);

  return (
    <main className={styles.mainPanel}>
      <div className={styles.stage}>
        <div className={styles.viewport} ref={viewportRef}>
          <div
            className={styles.slideSurface}
            style={{ height: canvasHeight, width: canvasWidth }}
          >
            <SlideCanvasFrame
              className={styles.slideCanvas}
              charts={charts}
              images={images}
              layouts={layouts}
              slide={slide}
              testId="presentation-slide-canvas"
              textOverflow="visible"
              theme={theme}
              width={canvasWidth}
            />
            <button
              aria-label={selectedTarget?.name ?? labels.slide}
              className={styles.interactionLayer}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const point = {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                };
                const target = hitTestElementTarget(elementTargets, point);
                setSelection(target ? { elementId: target.id, slideKey } : null);
              }}
              type="button"
            >
              {selectedTarget ? (
                <span
                  aria-hidden="true"
                  className={styles.selectionBox}
                  style={{
                    height: selectedTarget.rect.height,
                    transform: `translate(${selectedTarget.rect.left}px, ${selectedTarget.rect.top}px)`,
                    width: selectedTarget.rect.width,
                  }}
                >
                  <span className={styles.selectionHandle} data-position="top-left" />
                  <span className={styles.selectionHandle} data-position="top-right" />
                  <span className={styles.selectionHandle} data-position="bottom-left" />
                  <span className={styles.selectionHandle} data-position="bottom-right" />
                </span>
              ) : null}
            </button>
          </div>
          {footnote ? (
            <pre
              className={styles.footnote}
              data-testid="presentation-footnote"
              style={{ top: footnoteTop, width: canvasWidth }}
            >
              {footnote}
            </pre>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function isSlideNavigationKey(key: string): boolean {
  return (
    key === "ArrowDown" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowLeft" ||
    key === "PageDown" ||
    key === "PageUp" ||
    key === "Home" ||
    key === "End"
  );
}

function nextSlideIndexFromKey(key: string, currentIndex: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return slideCount - 1;
  if (key === "ArrowDown" || key === "ArrowRight" || key === "PageDown") return Math.min(slideCount - 1, currentIndex + 1);
  if (key === "ArrowUp" || key === "ArrowLeft" || key === "PageUp") return Math.max(0, currentIndex - 1);
  return currentIndex;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return element.closest("input, textarea, select, [contenteditable='true']") != null;
}

function focusThumbnail(railRef: RefObject<HTMLElement | null>, index: number): void {
  window.requestAnimationFrame(() => {
    const button = thumbnailButtonAt(railRef, index);
    button?.focus();
    button?.scrollIntoView({ block: "nearest" });
  });
}

function scrollThumbnailIntoView(railRef: RefObject<HTMLElement | null>, index: number): void {
  window.requestAnimationFrame(() => {
    thumbnailButtonAt(railRef, index)?.scrollIntoView({ block: "nearest" });
  });
}

function thumbnailButtonAt(railRef: RefObject<HTMLElement | null>, index: number): HTMLButtonElement | null {
  return railRef.current?.querySelector<HTMLButtonElement>(
    `[data-testid="presentation-thumbnail"][data-slide-index="${index + 1}"]`,
  ) ?? null;
}

function SlideshowOverlay({
  activeSlideIndex,
  charts,
  images,
  labels,
  layouts,
  onClose,
  setActiveSlideIndex,
  slides,
  theme,
}: {
  activeSlideIndex: number;
  charts: RecordValue[];
  images: ReadonlyMap<string, CanvasImageSource>;
  labels: PreviewLabels;
  layouts: RecordValue[];
  onClose: () => void;
  setActiveSlideIndex: (index: number) => void;
  slides: RecordValue[];
  theme: RecordValue | null;
}) {
  const frameRef = useRef<HTMLButtonElement>(null);
  const frameSize = useElementSize(frameRef);
  const didEnterFullscreenRef = useRef(typeof document !== "undefined" && document.fullscreenElement != null);
  const selectedIndex = Math.min(activeSlideIndex, Math.max(0, slides.length - 1));
  const slide = useMemo(() => slides[selectedIndex] ?? {}, [slides, selectedIndex]);
  const frame = getSlideFrameSize(slide, layouts);
  const fit = computePresentationFit(frameSize, frame, { padding: 0 });
  const canvasWidth = Math.max(1, fit.width);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const speakerNotes = useMemo(() => presentationSlideNotesText(slide), [slide]);
  const hasSpeakerNotes = speakerNotes.length > 0;
  const speakerNotesLabel = labels.speakerNotes ?? labels.slide;
  const showSpeakerNotesLabel = labels.showSpeakerNotes ?? speakerNotesLabel;
  const hideSpeakerNotesLabel = labels.hideSpeakerNotes ?? speakerNotesLabel;

  // When there are no speaker notes, the panel cannot be shown.
  const canShowSpeakerNotes = hasSpeakerNotes && showSpeakerNotes;

  const goPrevious = useCallback(() => {
    setActiveSlideIndex(Math.max(0, selectedIndex - 1));
  }, [selectedIndex, setActiveSlideIndex]);

  const goNext = useCallback(() => {
    setActiveSlideIndex(Math.min(slides.length - 1, selectedIndex + 1));
  }, [selectedIndex, setActiveSlideIndex, slides.length]);

  const closeSlideshow = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        didEnterFullscreenRef.current = true;
        return;
      }

      if (didEnterFullscreenRef.current) {
        onClose();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlideshow();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrevious();
        return;
      }

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        goNext();
        return;
      }

      if (event.key.toLowerCase() === "n" && hasSpeakerNotes) {
        event.preventDefault();
        setShowSpeakerNotes((isOpen) => !isOpen);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSlideshow, goNext, goPrevious, hasSpeakerNotes]);

  return (
    <div
      aria-label={labels.playSlideshow}
      aria-modal="true"
      className={styles.slideshowOverlay}
      data-testid="presentation-slideshow"
      role="dialog"
    >
      <div className={styles.slideshowChrome}>
        <button
          aria-label={labels.previousSlide}
          className={styles.slideshowIconButton}
          data-testid="presentation-slideshow-previous"
          disabled={selectedIndex === 0}
          onClick={goPrevious}
          type="button"
        >
          <PresentationIcon name="left" />
        </button>
        <div className={styles.slideshowCounter}>
          {labels.slide} {asNumber(slide.index, selectedIndex + 1)} / {slides.length}
        </div>
        <button
          aria-label={labels.nextSlide}
          className={styles.slideshowIconButton}
          data-testid="presentation-slideshow-next"
          disabled={selectedIndex >= slides.length - 1}
          onClick={goNext}
          type="button"
        >
          <PresentationIcon name="right" />
        </button>
        {hasSpeakerNotes ? (
          <button
            aria-label={showSpeakerNotes ? hideSpeakerNotesLabel : showSpeakerNotesLabel}
            aria-pressed={canShowSpeakerNotes}
            className={styles.slideshowIconButton}
            data-testid="presentation-speaker-notes-toggle"
            onClick={() => setShowSpeakerNotes((isOpen) => !isOpen)}
            type="button"
          >
            <PresentationIcon name="note" size={17} />
          </button>
        ) : null}
        <button aria-label={labels.closeSlideshow} className={styles.slideshowIconButton} onClick={closeSlideshow} type="button">
          <PresentationIcon name="close" />
        </button>
      </div>
      <div className={styles.slideshowPresenterLayout} data-notes-open={canShowSpeakerNotes}>
        <button
          aria-label={labels.nextSlide}
          className={styles.slideshowFrame}
          onClick={goNext}
          ref={frameRef}
          type="button"
        >
          <SlideCanvasFrame
            className={styles.slideshowCanvas}
            charts={charts}
            images={images}
            layouts={layouts}
            slide={slide}
            textOverflow="visible"
            theme={theme}
            width={canvasWidth}
          />
        </button>
        {canShowSpeakerNotes ? (
          <aside className={styles.slideshowNotesPanel} data-testid="presentation-speaker-notes">
            <div className={styles.slideshowNotesTitle}>{speakerNotesLabel}</div>
            <pre className={styles.slideshowNotesText}>{speakerNotes}</pre>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function PresentationIcon({
  name,
  size = 18,
}: {
  name: "close" | "left" | "note" | "play" | "right";
  size?: number;
}) {
  const paths = {
    close: "M6 6l12 12M18 6L6 18",
    left: "M15 6l-6 6 6 6",
    note: "M7 4h8l2 2v14H7V4zM15 4v4h4M9 12h6M9 16h5",
    play: "M8 5v14l11-7z",
    right: "M9 6l6 6-6 6",
  };
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d={paths[name]}
        fill={name === "play" ? "currentColor" : "none"}
        stroke={name === "play" ? "none" : "currentColor"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SlideRasterFrame({
  alt,
  bitmap,
  charts,
  className,
  fallbackImages,
  fallbackTextOverflow,
  layouts,
  slide,
  theme,
  width,
}: {
  alt: string;
  bitmap?: SlideBitmapSurface;
  charts: RecordValue[];
  className: string;
  fallbackImages: ReadonlyMap<string, CanvasImageSource>;
  fallbackTextOverflow: PresentationTextOverflow;
  layouts: RecordValue[];
  slide: RecordValue;
  theme: RecordValue | null;
  width: number;
}) {
  const frame = getSlideFrameSize(slide, layouts);
  const height = Math.max(1, (width / frame.width) * frame.height);
  if (bitmap) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Runtime object URLs are generated from the canvas preview surface.
      <img
        alt={alt}
        className={className}
        draggable={false}
        height={Math.round(height)}
        src={bitmap.url}
        style={{ height, width }}
        width={Math.round(width)}
      />
    );
  }

  return (
    <SlideCanvasFrame
      className={className}
      charts={charts}
      images={fallbackImages}
      layouts={layouts}
      slide={slide}
      textOverflow={fallbackTextOverflow}
      theme={theme}
      width={width}
    />
  );
}

function SlideCanvasFrame({
  charts,
  className,
  images,
  layouts,
  slide,
  testId,
  textOverflow,
  theme,
  width,
}: {
  charts: RecordValue[];
  className: string;
  images: ReadonlyMap<string, CanvasImageSource>;
  layouts: RecordValue[];
  slide: RecordValue;
  testId?: string;
  textOverflow: PresentationTextOverflow;
  theme: RecordValue | null;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = getSlideFrameSize(slide, layouts);
  const height = Math.max(1, (width / frame.width) * frame.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    renderPresentationSlide({ charts, context, height, images, layouts, slide, textOverflow, theme, width });
  }, [charts, height, images, layouts, slide, textOverflow, theme, width]);

  return (
    <canvas
      aria-hidden="true"
      className={className}
      data-testid={testId}
      height={Math.round(height)}
      ref={canvasRef}
      width={Math.round(width)}
    />
  );
}

function useRenderedSlideBitmaps(
  slides: RecordValue[],
  images: ReadonlyMap<string, CanvasImageSource>,
  layouts: RecordValue[],
  charts: RecordValue[],
  theme: RecordValue | null,
): ReadonlyMap<string, SlideBitmapSurface> {
  const [bitmaps, setBitmaps] = useState<ReadonlyMap<string, SlideBitmapSurface>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    window.requestAnimationFrame(() => {
      if (!cancelled) {
        setBitmaps(new Map());
      }
    });

    async function renderBitmaps(): Promise<void> {
      if (slides.length === 0) return;

      await waitForDocumentFonts();
      const next = new Map<string, SlideBitmapSurface>();
      for (const [index, slide] of slides.entries()) {
        if (cancelled) return;

        const frame = getSlideFrameSize(slide, layouts);
        const width = SLIDE_BITMAP_WIDTH;
        const height = Math.max(1, (width / frame.width) * frame.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const context = canvas.getContext("2d");
        if (!context) continue;

        renderPresentationSlide({
          charts,
          context,
          height,
          images,
          layouts,
          slide,
          textOverflow: "visible",
          theme,
          width,
        });
        const blob = await canvasToBlob(canvas);
        if (!blob || cancelled) continue;

        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        next.set(slideRenderKey(slide, index), { height, url, width });
        if (!cancelled) {
          setBitmaps(new Map(next));
        }
      }
    }

    void renderBitmaps();
    return () => {
      cancelled = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [charts, images, layouts, slides, theme]);

  return bitmaps;
}

async function waitForDocumentFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await document.fonts.ready.catch(() => undefined);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

function useLoadedOfficeImages(imageSources: Map<string, string>): ReadonlyMap<string, CanvasImageSource> {
  const [images, setImages] = useState<ReadonlyMap<string, CanvasImageSource>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const next = new Map<string, CanvasImageSource>();
    if (imageSources.size === 0) {
      window.requestAnimationFrame(() => {
        if (!cancelled) setImages(next);
      });
      return;
    }

    for (const [id, src] of imageSources) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        next.set(id, image);
        if (!cancelled) setImages(new Map(next));
      };
      image.onerror = () => {
        if (!cancelled) setImages(new Map(next));
      };
      image.src = src;
      if (image.complete && image.naturalWidth > 0) {
        next.set(id, image);
      }
    }

    window.requestAnimationFrame(() => {
      if (!cancelled) setImages(new Map(next));
    });
    return () => {
      cancelled = true;
    };
  }, [imageSources]);

  return images;
}

function slideRenderKey(slide: RecordValue, index: number): string {
  return `${asString(slide.id) || "slide"}-${index}`;
}

function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): PresentationSize {
  const [size, setSize] = useState<PresentationSize>({ height: 0, width: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ height: rect.height, width: rect.width });
    };
    update();

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(update);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return size;
}

function hitTestElementTarget(
  targets: ReturnType<typeof getPresentationElementTargets>,
  point: { x: number; y: number },
) {
  for (let index = targets.length - 1; index >= 0; index--) {
    const target = targets[index];
    if (!target) {
      continue;
    }
    if (
      point.x >= target.rect.left &&
      point.x <= target.rect.left + target.rect.width &&
      point.y >= target.rect.top &&
      point.y <= target.rect.top + target.rect.height
    ) {
      return target;
    }
  }
  return null;
}

function slideFootnoteText(slide: RecordValue): string {
  return presentationSlideNotesText(slide);
}
