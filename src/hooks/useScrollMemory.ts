import { useEffect, useLayoutEffect, useRef } from "react";

// Each tab remembers how far down it was scrolled. Switching tabs builds a
// fresh editor for the new document, so without this every switch back
// landed at the top of the page.
//
// The page itself scrolls (not the editor), so the position is read from
// the window. The rich editor fills in a moment after it mounts, so the
// position is put back once the page has grown tall enough to reach it, or
// as far down as it gets within a second.
export function useScrollMemory(documentId: string) {
  const positions = useRef(new Map<string, number>());
  const restoring = useRef(false);
  // Switched in the layout effect below, the moment the new tab's editor is
  // on the page: the browser fires a scroll event of its own when the new
  // page is shorter, and that must not overwrite the old tab's position.
  const currentId = useRef(documentId);

  useEffect(() => {
    const remember = () => {
      if (!restoring.current) {
        positions.current.set(currentId.current, window.scrollY);
      }
    };

    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  // Layout effect, so the new tab never shows the old tab's position for a
  // frame before jumping.
  useLayoutEffect(() => {
    const target = positions.current.get(documentId) ?? 0;
    const giveUpAt = performance.now() + 1000;
    let frame = 0;

    currentId.current = documentId;
    restoring.current = true;

    const restore = () => {
      const reachable = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(target, reachable));

      if (reachable >= target || performance.now() > giveUpAt) {
        restoring.current = false;
        return;
      }

      frame = requestAnimationFrame(restore);
    };

    restore();

    return () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
    };
  }, [documentId]);
}
