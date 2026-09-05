// Match semantics deliberately mirror the rich editor's find decorations:
// case-insensitive, non-overlapping, left to right. Keeping them identical
// means the match counter reads the same in both editing modes.
export function findMatchOffsets(text: string, query: string): number[] {
  if (!query) {
    return [];
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const offsets: number[] = [];
  let from = 0;

  while (true) {
    const index = haystack.indexOf(needle, from);

    if (index === -1) {
      break;
    }

    offsets.push(index);
    from = index + needle.length;
  }

  return offsets;
}

// Which line a match starts on, so a plain textarea can be scrolled to it.
export function lineIndexAtOffset(text: string, offset: number): number {
  let line = 0;

  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) {
      line++;
    }
  }

  return line;
}
