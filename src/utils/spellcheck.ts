import type { Node as ProseNode } from "@milkdown/kit/prose/model";

// The rich editor's spellchecking on macOS. WebKit's own checker only looks
// at the words around the text cursor, so typos in a file that was opened
// rather than typed stayed hidden. Instead the editor sends the text of each
// paragraph to the system dictionary (the `check_spelling` command in
// src-tauri/src/lib.rs) and underlines what comes back.

export type SpellcheckBlock = {
  // Document position where the block's text starts.
  start: number;
  // The block's text, one character per document position, so an offset
  // into it plus `start` is a document position. Text that should not be
  // checked is blanked out with spaces.
  text: string;
};

// [start, length] pairs, in the same UTF-16 units as JavaScript strings.
export type MisspelledRanges = Array<[number, number]>;

const UNCHECKED_MARKS = new Set(["inlineCode", "code"]);

function isUncheckedText(node: ProseNode) {
  return node.marks.some(
    (mark) =>
      UNCHECKED_MARKS.has(mark.type.name) ||
      // A bare URL shown as a link is not a word to check.
      (mark.type.name === "link" && mark.attrs.href === node.text),
  );
}

// Every block of prose in the document: paragraphs and headings, including
// the ones inside lists and quotes. Code blocks and raw HTML are skipped,
// and so is text marked as code.
export function spellcheckBlocks(doc: ProseNode): SpellcheckBlock[] {
  const blocks: SpellcheckBlock[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    if (!node.type.spec.code) {
      let text = "";

      node.forEach((child) => {
        if (child.isText && !isUncheckedText(child)) {
          text += child.text;
        } else {
          // Images, line breaks and inline HTML take up one position; code
          // text keeps its length so the offsets after it still line up.
          text += " ".repeat(child.nodeSize);
        }
      });

      if (text.trim()) {
        blocks.push({ start: pos + 1, text });
      }
    }

    return false;
  });

  return blocks;
}

// Document ranges to underline. The word being typed at `typingAt` (the
// cursor at its end or inside it) is left alone, so a word is not flagged
// halfway through; it gets its underline once the cursor moves on.
export function misspelledDocumentRanges(
  blocks: SpellcheckBlock[],
  resultFor: (text: string) => MisspelledRanges | undefined,
  typingAt: number | null,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  for (const block of blocks) {
    for (const [offset, length] of resultFor(block.text) ?? []) {
      const from = block.start + offset;
      const to = from + length;

      if (typingAt !== null && typingAt >= from && typingAt <= to) {
        continue;
      }

      ranges.push({ from, to });
    }
  }

  return ranges;
}
