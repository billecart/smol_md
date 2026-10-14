export const LINK_PREVIEW_DELAY_MS = 350;
export const LINK_PREVIEW_MAX_WIDTH = 360;

type Rect = Pick<DOMRect, "left" | "top" | "bottom">;
type Viewport = { width: number; height: number };

// Below the link, left-aligned with it. Flips above when there's no room
// underneath, and stays clear of the right edge so long URLs don't spill
// out of the window.
export function getLinkPreviewPosition(
  linkRect: Rect,
  viewport: Viewport,
  bubbleHeight = 28,
): { x: number; y: number } {
  const gap = 6;
  const margin = 8;
  const x = Math.max(
    margin,
    Math.min(linkRect.left, viewport.width - LINK_PREVIEW_MAX_WIDTH - margin),
  );
  const below = linkRect.bottom + gap;
  const y =
    below + bubbleHeight > viewport.height - margin
      ? linkRect.top - gap - bubbleHeight
      : below;

  return { x: Math.round(x), y: Math.round(y) };
}
