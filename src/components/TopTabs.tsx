import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { OpenDocument } from "../hooks/useDocumentState";
import { disambiguateTabLabels } from "../utils/tabLabels";

type OverflowEdge = "none" | "start" | "end" | "both";

function TopTabsComponent({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
}: TopTabsProps) {
  const labels = disambiguateTabLabels(documents);
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<OverflowEdge>("none");

  // The strip hides its scrollbar by design, so which edge is faded is the
  // only cue that there are more tabs than fit.
  const measureOverflow = useCallback(() => {
    const strip = stripRef.current;

    if (!strip) {
      return;
    }

    const atStart = strip.scrollLeft > 1;
    const atEnd = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;

    setOverflow(
      atStart && atEnd
        ? "both"
        : atStart
          ? "start"
          : atEnd
            ? "end"
            : "none",
    );
  }, []);

  useLayoutEffect(() => {
    measureOverflow();
  }, [measureOverflow, documents]);

  useEffect(() => {
    const strip = stripRef.current;

    if (!strip || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measureOverflow);
    observer.observe(strip);

    return () => observer.disconnect();
  }, [measureOverflow]);

  // A vertical wheel does nothing to a horizontal-only scroller, which left
  // mouse users with no way to reach the overflowing tabs at all. Registered
  // natively so the scroll can be claimed rather than also moving the page.
  useEffect(() => {
    const strip = stripRef.current;

    if (!strip) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (strip.scrollWidth <= strip.clientWidth) {
        return;
      }

      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };

    strip.addEventListener("wheel", onWheel, { passive: false });

    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  // Selecting or closing a tab can leave the newly active one out of sight.
  // Scroll the strip itself rather than calling scrollIntoView, which would
  // also move the page behind this fixed chrome.
  useEffect(() => {
    const strip = stripRef.current;
    const activeTab = strip?.querySelector<HTMLElement>(".tab.active");

    if (!strip || !activeTab) {
      return;
    }

    // Measured against the strip itself. offsetLeft would be relative to the
    // nearest positioned ancestor - the fixed chrome, not this scroller - and
    // silently produces offsets larger than the strip's own scroll width.
    const stripBox = strip.getBoundingClientRect();
    const tabBox = activeTab.getBoundingClientRect();
    const left = tabBox.left - stripBox.left + strip.scrollLeft;
    const right = left + tabBox.width;

    if (left < strip.scrollLeft) {
      strip.scrollLeft = left;
    } else if (right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = right - strip.clientWidth;
    }

    measureOverflow();
  }, [activeDocumentId, documents, measureOverflow]);

  return (
    <div
      ref={stripRef}
      className="top-tabs"
      role="tablist"
      aria-label="Open documents"
      data-overflow={overflow}
      onScroll={measureOverflow}
    >
      {documents.map((document, index) => {
        const isActive = document.id === activeDocumentId;

        return (
          <div
            key={document.id}
            className={isActive ? "tab active" : "tab"}
            role="tab"
            aria-selected={isActive}
          >
            <button
              type="button"
              className="tab-label"
              onClick={() => onSelectDocument(document.id)}
              title={document.filePath ?? document.fileName}
            >
              <span
                className={document.isDirty ? "dirty-dot" : "saved-dot"}
                aria-hidden="true"
              />
              <span>{labels[index]}</span>
            </button>
            <button
              type="button"
              className="tab-close"
              onClick={() => onCloseDocument(document.id)}
              title={`Close ${document.fileName}`}
              aria-label={`Close ${document.fileName}`}
            >
              <X aria-hidden="true" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

type TopTabsProps = {
  documents: OpenDocument[];
  activeDocumentId: string;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
};

export const TopTabs = memo(TopTabsComponent);
