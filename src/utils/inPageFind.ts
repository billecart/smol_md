export function clampActiveIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  if (index < 0) return 0;
  if (index > matchCount - 1) return matchCount - 1;
  return index;
}

export function nextMatchIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  const clamped = clampActiveIndex(index, matchCount);
  return (clamped + 1) % matchCount;
}

export function previousMatchIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  const clamped = clampActiveIndex(index, matchCount);
  return (clamped - 1 + matchCount) % matchCount;
}

export function formatMatchCounter(
  query: string,
  activeIndex: number,
  matchCount: number,
): string {
  if (!query) return "";
  if (matchCount === 0) return "No results";
  const clamped = clampActiveIndex(activeIndex, matchCount);
  return `${clamped + 1} / ${matchCount}`;
}
