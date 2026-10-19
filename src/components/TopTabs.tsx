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
// Neighbours slide into their new slots, and a dropped tab glides into its
// own, over this long.
const SLIDE_MS = 150;

type PendingDrag = {
  documentId: string;
  pointerId: number;
  startX: number;
  isDragging: boolean;
  // Where in the tab the pointer grabbed it, so the tab keeps that spot
  // under the cursor instead of snapping its left edge to it.
  grabOffset: number;
  lastClientX: number;
};

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function findTab(strip: HTMLElement, documentId: string) {
  return Array.from(strip.querySelectorAll<HTMLElement>(".tab")).find(
    (tab) => tab.dataset.documentId === documentId,
  );
}

// The pointer's x in the strip's own content coordinates - the same space
// as a tab's offsetLeft (the strip is their offset parent), which ignores
// both scrolling and the transforms used to animate tabs.
function pointerInStrip(strip: HTMLElement, clientX: number) {
  return (
    clientX - strip.getBoundingClientRect().left - strip.clientLeft + strip.scrollLeft
  );
}

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
  // Layout positions of the tabs just before a drag reorders them, read
  // back after the re-render to slide each one from its old slot.
  const slideFromRef = useRef<Map<string, number> | null>(null);

  // Keeps the carried tab under the pointer. Its layout slot changes as it
  // passes neighbours, so the offset is recomputed from wherever that slot
  // is now, clamped so the tab never leaves the strip.
  const positionDraggedTab = useCallback(() => {
    const drag = dragRef.current;
    const strip = stripRef.current;

    if (!drag?.isDragging || !strip) {
      return;
    }

    const tab = findTab(strip, drag.documentId);

    if (!tab) {
      return;
    }

    const wanted = pointerInStrip(strip, drag.lastClientX) - drag.grabOffset;
    const clamped = Math.max(
      0,
      Math.min(wanted, strip.scrollWidth - tab.offsetWidth),
    );

    tab.style.transform = `translateX(${clamped - tab.offsetLeft}px)`;
  }, []);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const slideFrom = slideFromRef.current;
    slideFromRef.current = null;

    if (!strip || !slideFrom) {
      return;
    }

    positionDraggedTab();

    if (prefersReducedMotion()) {
      return;
    }

    strip.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
      const id = tab.dataset.documentId;
      const from = id === undefined ? undefined : slideFrom.get(id);

      if (id === dragRef.current?.documentId || from === undefined) {
        return;
      }

      const dx = from - tab.offsetLeft;

      if (dx !== 0) {
        tab.animate(
          [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
          { duration: SLIDE_MS, easing: "ease-out" },
        );
      }
    });
  }, [documents, positionDraggedTab]);

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

    // Mid-drag the pointer, not this, decides where the strip scrolls.
    if (!strip || !activeTab || dragRef.current?.isDragging) {
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

    const strip = stripRef.current;

    if (!strip) {
      return;
    }

    dragRef.current = {
      documentId: tab.dataset.documentId,
      pointerId: event.pointerId,
      startX: event.clientX,
      isDragging: false,
      grabOffset: pointerInStrip(strip, event.clientX) - tab.offsetLeft,
      lastClientX: event.clientX,
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

      // Throws if the pointer is already gone; the drag still works
      // without capture as long as the cursor stays over the strip.
      try {
        strip.setPointerCapture(event.pointerId);
      } catch {
        // Nothing to do.
      }

      setDraggingId(drag.documentId);
      onSelectDocument(drag.documentId);
    }

    drag.lastClientX = event.clientX;

    const stripBox = strip.getBoundingClientRect();

    if (event.clientX < stripBox.left + EDGE_SCROLL_PX) {
      strip.scrollLeft -= EDGE_SCROLL_PX;
    } else if (event.clientX > stripBox.right - EDGE_SCROLL_PX) {
      strip.scrollLeft += EDGE_SCROLL_PX;
    }

    positionDraggedTab();

    // The dragged tab's new index is how many of the other tabs have their
    // centre left of the dragged tab's centre. Layout positions (offsetLeft)
    // rather than on-screen boxes, so neighbours that are still sliding do
    // not make the order flicker.
    const tabs = Array.from(strip.querySelectorAll<HTMLElement>(".tab"));
    const dragged = tabs.find((tab) => tab.dataset.documentId === drag.documentId);

    if (!dragged) {
      return;
    }

    const draggedCentre =
      pointerInStrip(strip, event.clientX) - drag.grabOffset + dragged.offsetWidth / 2;
    let toIndex = 0;

    for (const tab of tabs) {
      if (
        tab !== dragged &&
        tab.offsetLeft + tab.offsetWidth / 2 < draggedCentre
      ) {
        toIndex += 1;
      }
    }

    if (tabs.indexOf(dragged) === toIndex) {
      return;
    }

    slideFromRef.current = new Map(
      tabs.map((tab) => [tab.dataset.documentId ?? "", tab.offsetLeft]),
    );
    onReorderDocument(drag.documentId, toIndex);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (!drag.isDragging) {
      return;
    }

    const strip = stripRef.current;
    if (strip?.hasPointerCapture?.(event.pointerId)) {
      strip.releasePointerCapture(event.pointerId);
    }
    setDraggingId(null);

    // Glide from wherever it was let go into its slot, rather than jumping.
    const tab = strip ? findTab(strip, drag.documentId) : undefined;

    if (!tab) {
      return;
    }

    const heldAt = tab.style.transform;
    tab.style.transform = "";

    if (heldAt && !prefersReducedMotion()) {
      tab.animate([{ transform: heldAt }, { transform: "none" }], {
        duration: SLIDE_MS,
        easing: "ease-out",
      });
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
