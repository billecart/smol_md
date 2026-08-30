export type TocEntry = {
  level: number;
  rawText: string;
  plainText: string;
  id: string;
  occurrence: number;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function stripInlineMarkdown(text: string): string {
  let result = text;
  // [Link](url) -> Link
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // **bold** / __bold__
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/__([^_]+)__/g, "$1");
  // ~~strikethrough~~
  result = result.replace(/~~([^~]+)~~/g, "$1");
  // `code`
  result = result.replace(/`([^`]+)`/g, "$1");
  // *em* / _em_
  result = result.replace(/\*([^*]+)\*/g, "$1");
  result = result.replace(/_([^_]+)_/g, "$1");
  return result;
}

function isIndentedCodeLine(line: string): boolean {
  return /^( {4}|\t)/.test(line);
}

// ATX headings may end with an optional closing sequence of hashes
// (e.g. "# Heading ##"). That closing sequence is heading syntax, not
// content, so it must not show up in the rendered/navigable text.
function stripAtxClosingSequence(text: string): string {
  return text.replace(/\s+#+\s*$/, "");
}

export function extractHeadings(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = markdown.split("\n");
  let inFencedCodeBlock = false;
  const occurrenceCounts = new Map<string, number>();

  const addEntry = (level: number, rawText: string, content: string = rawText) => {
    const plainText = stripInlineMarkdown(content).trim();
    const id = slugify(rawText);
    const occurrence = occurrenceCounts.get(plainText) ?? 0;
    occurrenceCounts.set(plainText, occurrence + 1);
    entries.push({ level, rawText, plainText, id, occurrence });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    if (inFencedCodeBlock) continue;
    if (isIndentedCodeLine(line)) continue;

    const atxMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (atxMatch) {
      const level = atxMatch[1].length;
      const rawText = atxMatch[2];
      addEntry(level, rawText, stripAtxClosingSequence(rawText));
      continue;
    }

    // Setext headings: a non-blank line followed by a line of only `=` (level 1)
    // or only `-` (level 2). A `---` line is only treated as an underline when
    // the line above it is non-blank -- otherwise it's a thematic break.
    if (line.trim() !== "") {
      const nextLine = lines[i + 1];
      if (nextLine !== undefined && !isIndentedCodeLine(nextLine)) {
        if (/^=+\s*$/.test(nextLine)) {
          addEntry(1, line);
          i++;
          continue;
        }
        if (/^-+\s*$/.test(nextLine)) {
          addEntry(2, line);
          i++;
          continue;
        }
      }
    }
  }

  return entries;
}
