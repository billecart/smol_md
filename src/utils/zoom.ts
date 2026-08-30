export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

function roundZoom(value: number): number {
  return Math.round(value * 10) / 10;
}

export function zoomIn(level: number): number {
  return Math.min(roundZoom(level + ZOOM_STEP), MAX_ZOOM);
}

export function zoomOut(level: number): number {
  return Math.max(roundZoom(level - ZOOM_STEP), MIN_ZOOM);
}

export function zoomStyle(level: number): { zoom?: number } {
  if (level === 1) return {};
  return { zoom: level };
}
