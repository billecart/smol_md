import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X } from "lucide-react";
import type { OpenDocument } from "../hooks/useDocumentState";
import { disambiguateTabLabels } from "../utils/tabLabels";

type OverflowEdge = "none" | "start" | "end" | "both";

// How far the pointer has to travel before a press on a tab becomes a drag.
// Below this it is still an ordinary click.
const DRAG_THRESHOLD_PX = 4;
// Dragging past either edge of an overflowing strip scrolls it, so a tab can
// be carried to a spot that is currently out of sight.
const EDGE_SCROLL_PX = 12;

type PendingDrag = {
  documentId: string;
  pointerId: number;
  startX: number;
  isDragging: boolean;
};

function TopTabsComponent({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
  onReorderDocument,
}: TopTabsProps) {
  const labels = disambiguateTabLabels(documents);
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<OverflowEdge>("none");
  const dragRef = useRef<PendingDrag | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

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

  // Pointer events rather than HTML5 drag and drop: Tauri's file-drop
  // handling claims native drags in the webview, and a pointer drag also
  // lets the tabs reflow live under the cursor.
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>(".tab");

    // The close button stays a plain button: pressing it should never pick
    // the tab up.
    if (!tab?.dataset.documentId || target.closest(".tab-close")) {
      return;
    }

    dragRef.current = {
      documentId: tab.dataset.documentId,
      pointerId: event.pointerId,
      startX: event.clientX,
      isDragging: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const strip = stripRef.current;

    if (!drag || !strip || drag.pointerId !== event.pointerId) {
      return;
    }

    if (!drag.isDragging) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) {
        return;
      }

      // Captured on the strip, which never moves, rather than on the tab:
      // React re-inserts the tab's node as it reorders, and a node that
      // leaves the document loses its capture.
      drag.isDragging = true;
      strip.setPointerCapture(event.pointerId);
      setDraggingId(drag.documentId);
      onSelectDocument(drag.documentId);
    }

    const stripBox = strip.getBoundingClientRect();

    if (event.clientX < stripBox.left + EDGE_SCROLL_PX) {
      strip.scrollLeft -= EDGE_SCROLL_PX;
    } else if (event.clientX > stripBox.right - EDGE_SCROLL_PX) {
      strip.scrollLeft += EDGE_SCROLL_PX;
    }

    // The dragged tab's new index is how many of the other tabs have their
    // centre left of the pointer. Leaving the dragged tab out keeps this
    // stable when neighbouring tabs differ in width.
    let toIndex = 0;

    strip.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
      if (tab.dataset.documentId === drag.documentId) {
        return;
      }

      const box = tab.getBoundingClientRect();

      if (box.left + box.width / 2 < event.clientX) {
        toIndex += 1;
      }
    });

    onReorderDocument(drag.documentId, toIndex);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (drag.isDragging) {
      stripRef.current?.releasePointerCapture?.(event.pointerId);
      setDraggingId(null);
    }
  };

  return (
    <div
      ref={stripRef}
      className={draggingId ? "top-tabs dragging" : "top-tabs"}
      role="tablist"
      aria-label="Open documents"
      data-overflow={overflow}
      onScroll={measureOverflow}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {documents.map((document, index) => {
        const isActive = document.id === activeDocumentId;
        const className = [
          "tab",
          isActive ? "active" : "",
          document.id === draggingId ? "dragged" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={document.id}
            className={className}
            data-document-id={document.id}
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
  onReorderDocument: (documentId: string, toIndex: number) => void;
};

export const TopTabs = memo(TopTabsComponent);
