"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, RefObject } from "react";

import {
  asNumber,
  asString,
  prewarmOfficeFonts,
  type RecordValue,
} from "../shared/office-preview-utils";
import {
  collectPresentationTypefaces,
  computePresentationFit,
  getSlideFrameSize,
  renderPresentationSlide,
  type PresentationSize,
} from "./presentation-renderer";

export type PresentationCursorCanvasMedia = {
  height?: number;
  src: string;
  width?: number;
};

export type PresentationCursorCanvasPayload = {
  artifact: {
    generatedBy?: string;
    mode?: string;
    reader?: string;
    source?: string;
    title?: string;
  };
  layouts?: RecordValue[];
  media?: Record<string, PresentationCursorCanvasMedia>;
  charts?: RecordValue[];
  slides?: RecordValue[];
  theme?: RecordValue;
};

export function PresentationCursorCanvas({
  payload,
}: {
  payload: PresentationCursorCanvasPayload;
}) {
  const artifact = payload.artifact ?? {};
  const slides = useMemo(() => payload.slides ?? [], [payload.slides]);
  const layouts = useMemo(() => payload.layouts ?? [], [payload.layouts]);
  const charts = useMemo(() => payload.charts ?? [], [payload.charts]);
  const theme = useMemo(() => payload.theme ?? null, [payload.theme]);
  const media = useMemo(() => payload.media ?? {}, [payload.media]);
  const images = useLoadedCanvasImages(media);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    asNumber(slides[0]?.index, 1),
  );
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const selectedPosition = Math.max(
    0,
    slides.findIndex((slide) => asNumber(slide.index, 1) === selectedIndex),
  );
  const selectedSlide = useMemo(
    () => slides[selectedPosition] ?? slides[0] ?? {},
    [slides, selectedPosition],
  );
  const selectedSlideIndex = asNumber(selectedSlide.index, selectedPosition + 1);
  const title = asString(artifact.title) || "Presentation";

  useEffect(() => {
    void prewarmOfficeFonts(collectPresentationTypefaces(slides, layouts));
  }, [layouts, slides]);

  useEffect(() => {
    if (slides.length === 0) return;
    if (slides.some((slide) => asNumber(slide.index, 1) === selectedIndex)) {
      return;
    }
    const firstIndex = asNumber(slides[0]?.index, 1);
    if (firstIndex !== selectedIndex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync when slide set changes and current index is stale
      setSelectedIndex(firstIndex);
    }
  }, [selectedIndex, slides]);

  const goPrevious = useCallback(() => {
    const previous = slides[Math.max(0, selectedPosition - 1)] ?? selectedSlide;
    setSelectedIndex(asNumber(previous.index, selectedSlideIndex));
  }, [selectedPosition, selectedSlide, selectedSlideIndex, slides]);

  const goNext = useCallback(() => {
    const next =
      slides[Math.min(slides.length - 1, selectedPosition + 1)] ??
      selectedSlide;
    setSelectedIndex(asNumber(next.index, selectedSlideIndex));
  }, [selectedPosition, selectedSlide, selectedSlideIndex, slides]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrevious();
      } else if (
        event.key === "ArrowRight" ||
        event.key === "PageDown" ||
        event.key === " "
      ) {
        event.preventDefault();
        goNext();
      } else if (event.key === "Escape" && slideshowOpen) {
        event.preventDefault();
        setSlideshowOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, slideshowOpen]);

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.metaGroup}>
          <span style={styles.badge}>office wasm</span>
          <span style={styles.mutedText}>{asString(artifact.reader)}</span>
        </div>
        <div style={styles.title}>{title}</div>
        <div style={styles.actionGroup}>
          <span style={styles.mutedText}>{slides.length} slides</span>
          <button
            onClick={() => setSlideshowOpen(true)}
            style={styles.primaryButton}
            type="button"
          >
            Play
          </button>
        </div>
      </header>
      <div style={styles.body}>
        <aside style={styles.rail}>
          {slides.map((slide, index) => {
            const slideIndex = asNumber(slide.index, index + 1);
            const active = slideIndex === selectedSlideIndex;
            const thumbnail = asString(slide.thumbnail);
            return (
              <button
                aria-current={active ? "true" : undefined}
                aria-label={`Slide ${slideIndex}: ${slideTitle(slide, index)}`}
                key={slideKey(slide, index)}
                onClick={() => setSelectedIndex(slideIndex)}
                style={styles.thumbnailButton}
                title={slideTitle(slide, index)}
                type="button"
              >
                <span style={styles.thumbnailNumber}>{slideIndex}</span>
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- office thumbnail, not a Next.js route image
                  <img
                    alt=""
                    src={thumbnail}
                    style={thumbnailImageStyle(active)}
                  />
                ) : (
                  <SlideCanvasFrame
                    active={active}
                    charts={charts}
                    images={images}
                    layouts={layouts}
                    mode="thumbnail"
                    slide={slide}
                    theme={theme}
                    width={154}
                  />
                )}
              </button>
            );
          })}
        </aside>
        <main style={styles.stagePanel}>
          <ResponsiveSlideFrame
            charts={charts}
            images={images}
            layouts={layouts}
            slide={selectedSlide}
            theme={theme}
          />
        </main>
      </div>
      {slideshowOpen ? (
        <SlideshowOverlay
          goNext={goNext}
          goPrevious={goPrevious}
          charts={charts}
          images={images}
          layouts={layouts}
          onClose={() => setSlideshowOpen(false)}
          selectedPosition={selectedPosition}
          slide={selectedSlide}
          slides={slides}
          theme={theme}
        />
      ) : null}
    </div>
  );
}

function ResponsiveSlideFrame({
  charts,
  images,
  layouts,
  slide,
  theme,
}: {
  charts: RecordValue[];
  images: ReadonlyMap<string, CanvasImageSource>;
  layouts: RecordValue[];
  slide: RecordValue;
  theme: RecordValue | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef);
  const frame = getSlideFrameSize(slide, layouts);
  const fit = computePresentationFit(size, frame, { padding: 24 });
  const width = Math.max(1, fit.width || frame.width);

  return (
    <div ref={frameRef} style={styles.stageFrame}>
      <SlideCanvasFrame
        charts={charts}
        images={images}
        layouts={layouts}
        mode="stage"
        slide={slide}
        theme={theme}
        width={width}
      />
    </div>
  );
}

function SlideshowOverlay({
  charts,
  goNext,
  goPrevious,
  images,
  layouts,
  onClose,
  selectedPosition,
  slide,
  slides,
  theme,
}: {
  charts: RecordValue[];
  goNext: () => void;
  goPrevious: () => void;
  images: ReadonlyMap<string, CanvasImageSource>;
  layouts: RecordValue[];
  onClose: () => void;
  selectedPosition: number;
  slide: RecordValue;
  slides: RecordValue[];
  theme: RecordValue | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef);
  const frame = getSlideFrameSize(slide, layouts);
  const fit = computePresentationFit(size, frame, { padding: 0 });

  return (
    <div
      aria-label="Play slideshow"
      aria-modal="true"
      role="dialog"
      style={styles.slideshowOverlay}
    >
      <div style={styles.slideshowChrome}>
        <button
          aria-label="Previous slide"
          disabled={selectedPosition === 0}
          onClick={goPrevious}
          style={styles.iconButton}
          type="button"
        >
          <Icon name="left" />
        </button>
        <span style={styles.slideshowCounter}>
          Slide {asNumber(slide.index, selectedPosition + 1)} / {slides.length}
        </span>
        <button
          aria-label="Next slide"
          disabled={selectedPosition >= slides.length - 1}
          onClick={goNext}
          style={styles.iconButton}
          type="button"
        >
          <Icon name="right" />
        </button>
        <button
          aria-label="Close slideshow"
          onClick={onClose}
          style={styles.iconButton}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>
      <div ref={frameRef} style={styles.slideshowFrame}>
        <button
          aria-label="Next slide"
          onClick={goNext}
          style={styles.slideshowCanvasButton}
          type="button"
        >
          <SlideCanvasFrame
            charts={charts}
            images={images}
            layouts={layouts}
            mode="slideshow"
            slide={slide}
            theme={theme}
            width={Math.max(1, fit.width || frame.width)}
          />
        </button>
      </div>
    </div>
  );
}

function SlideCanvasFrame({
  active = false,
  charts,
  images,
  layouts,
  mode,
  slide,
  theme,
  width,
}: {
  active?: boolean;
  charts: RecordValue[];
  images: ReadonlyMap<string, CanvasImageSource>;
  layouts: RecordValue[];
  mode: "slideshow" | "stage" | "thumbnail";
  slide: RecordValue;
  theme: RecordValue | null;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = getSlideFrameSize(slide, layouts);
  const height = Math.max(1, (width / Math.max(1, frame.width)) * frame.height);
  const canvasStyle =
    mode === "thumbnail"
      ? {
          ...styles.thumbnailCanvas,
          boxShadow: active
            ? "0 8px 22px rgba(15, 23, 42, 0.12), 0 0 0 2px #60a5fa"
            : styles.thumbnailCanvas.boxShadow,
        }
      : mode === "stage"
        ? styles.stageCanvas
        : styles.slideshowCanvas;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = canvas;
    let cancelled = false;

    async function draw(): Promise<void> {
      if (typeof document !== "undefined" && "fonts" in document) {
        await document.fonts.ready.catch(() => undefined);
      }
      if (cancelled) return;

      const pixelRatio = window.devicePixelRatio || 1;
      target.width = Math.max(1, Math.round(width * pixelRatio));
      target.height = Math.max(1, Math.round(height * pixelRatio));
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;

      const context = target.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
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
    }

    void draw();
    return () => {
      cancelled = true;
    };
  }, [charts, height, images, layouts, slide, theme, width]);

  return (
    <canvas
      aria-label={`Slide ${asNumber(slide.index, 1)}`}
      height={Math.round(height)}
      ref={canvasRef}
      style={canvasStyle}
      width={Math.round(width)}
    />
  );
}

function thumbnailImageStyle(active: boolean): CSSProperties {
  return {
    ...styles.thumbnailCanvas,
    boxShadow: active
      ? "0 8px 22px rgba(15, 23, 42, 0.12), 0 0 0 2px #60a5fa"
      : styles.thumbnailCanvas.boxShadow,
    height: "auto",
    objectFit: "contain",
  };
}

function useLoadedCanvasImages(
  media: Record<string, PresentationCursorCanvasMedia>,
): ReadonlyMap<string, CanvasImageSource> {
  const [images, setImages] = useState<ReadonlyMap<string, CanvasImageSource>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    const next = new Map<string, CanvasImageSource>();
    const entries = Object.entries(media);
    if (entries.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync when media set is empty
      if (!cancelled) setImages(next);
      return;
    }

    for (const [id, item] of entries) {
      if (!item?.src) continue;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        next.set(id, image);
        if (!cancelled) setImages(new Map(next));
      };
      image.onerror = () => {
        if (!cancelled) setImages(new Map(next));
      };
      image.src = item.src;
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
  }, [media]);

  return images;
}

function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): PresentationSize {
  const [size, setSize] = useState<PresentationSize>({
    height: 0,
    width: 0,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ height: rect.height, width: rect.width });
    };
    update();

    const observer = new ResizeObserver(() => window.requestAnimationFrame(update));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function Icon({ name }: { name: "close" | "left" | "right" }) {
  if (name === "close") {
    return (
      <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
      <path
        d={name === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function slideTitle(slide: RecordValue, index: number): string {
  return asString(slide.title) || `Slide ${index + 1}`;
}

function slideKey(slide: RecordValue, index: number): string {
  return `${asString(slide.id) || "slide"}-${asNumber(slide.index, index + 1)}-${index}`;
}

const styles = {
  actionGroup: {
    alignItems: "center",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  badge: {
    background: "#e0f2fe",
    border: "1px solid #bae6fd",
    borderRadius: 999,
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    padding: "5px 8px",
    whiteSpace: "nowrap",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "clamp(176px, 14vw, 252px) minmax(0, 1fr)",
    minHeight: 0,
  },
  header: {
    alignItems: "center",
    borderBottom: "1px solid #cbd5e1",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 520px) minmax(0, 1fr)",
    padding: "0 16px",
  },
  iconButton: {
    alignItems: "center",
    background: "rgba(15, 23, 42, 0.86)",
    border: "1px solid rgba(148, 163, 184, 0.34)",
    borderRadius: 6,
    color: "#f8fafc",
    cursor: "pointer",
    display: "inline-flex",
    height: 34,
    justifyContent: "center",
    padding: 0,
    width: 34,
  },
  metaGroup: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    minWidth: 0,
  },
  mutedText: {
    color: "#64748b",
    fontSize: 13,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  primaryButton: {
    background: "#2563eb",
    border: "1px solid #1d4ed8",
    borderRadius: 6,
    color: "#ffffff",
    cursor: "pointer",
    font: "600 13px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    height: 32,
    padding: "0 12px",
  },
  rail: {
    background: "rgba(255, 255, 255, 0.88)",
    borderRight: "1px solid #cbd5e1",
    minHeight: 0,
    overflow: "auto",
    padding: "12px 14px 48px 8px",
  },
  shell: {
    background: "#ffffff",
    color: "#0f172a",
    display: "grid",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    gridTemplateRows: "52px minmax(0, 1fr)",
    height: "calc(100vh - 16px)",
    minHeight: 520,
    overflow: "hidden",
  },
  slideshowCanvas: {
    background: "#ffffff",
    boxShadow: "none",
    display: "block",
    height: "auto",
    userSelect: "none",
  },
  slideshowCanvasButton: {
    background: "transparent",
    border: 0,
    cursor: "pointer",
    display: "block",
    padding: 0,
  },
  slideshowChrome: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    position: "absolute",
    right: 20,
    top: 18,
    zIndex: 2,
  },
  slideshowCounter: {
    background: "rgba(15, 23, 42, 0.86)",
    border: "1px solid rgba(148, 163, 184, 0.34)",
    borderRadius: 999,
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 12px",
  },
  slideshowFrame: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  slideshowOverlay: {
    alignItems: "center",
    background: "#000000",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: 20,
    position: "fixed",
    zIndex: 1000,
  },
  stageCanvas: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
    display: "block",
    height: "auto",
    userSelect: "none",
  },
  stageFrame: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  },
  stagePanel: {
    background: "#f8fafc",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    padding: 16,
  },
  thumbnailButton: {
    alignItems: "flex-start",
    background: "transparent",
    border: 0,
    borderRadius: 7,
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    gap: 8,
    padding: "6px 8px 6px 0",
    textAlign: "left",
    width: "100%",
  },
  thumbnailCanvas: {
    background: "#ffffff",
    border: 0,
    borderRadius: 4,
    boxShadow: "0 8px 22px rgba(15, 23, 42, 0.12)",
    display: "block",
    height: "auto",
    userSelect: "none",
  },
  thumbnailNumber: {
    color: "#334155",
    flex: "0 0 22px",
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    lineHeight: 1,
    paddingTop: 4,
    textAlign: "right",
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
} satisfies Record<string, CSSProperties>;
