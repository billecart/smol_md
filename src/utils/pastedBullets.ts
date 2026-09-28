import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";

// Text copied out of another app - a Steam "About This Game" draft, a Notes
// page, a Word file - often carries its bullets as characters, not as list
// syntax. Pasted into Rich mode they became ordinary paragraphs that happen to
// start with "•": no hanging indent, wrapped lines running back to the left
// margin, and `• item` saved to disk instead of `- item`. Beside a real list
// in the same document the two looked like two different kinds of bullet.
//
// This turns those paragraphs into a real bullet list at paste time. Files on
// disk are left as they are; only the pasted content is rewritten.

// Glyphs that mean "bullet" when they open a line and are followed by
// whitespace. The en dash is included because plain-text exports use it for
// bullets; the em dash is not, because a line opening with one is dialogue in
// a lot of prose. U+F0B7 is the private-use glyph Word's Symbol font leaves
// behind when a bulleted list is copied as text.
const BULLET_PREFIX =
  /^[ \t ]*[•◦▪▫‣⁃∙●○■□▸►–][ \t ]+/;

export type BulletListTypes = {
  bulletList: NodeType;
  listItem: NodeType;
  paragraph: NodeType;
  hardBreak?: NodeType;
};

// Length of the bullet prefix at the start of a paragraph, or 0 when it does
// not start with one. The bullet has to be followed by some text: a lone "•"
// line is left alone.
export function unicodeBulletPrefixLength(paragraph: ProseNode): number {
  const first = paragraph.firstChild;
  if (!first?.isText || !first.text) return 0;

  const match = BULLET_PREFIX.exec(first.text);
  if (!match) return 0;

  return paragraph.textContent.length > match[0].length ? match[0].length : 0;
}

function isBlankParagraph(node: ProseNode, paragraph: NodeType) {
  if (node.type !== paragraph) return false;

  let blank = true;
  node.forEach((child) => {
    if (!child.isText || /\S/.test(child.text ?? "")) blank = false;
  });

  return blank;
}

// Word and some mail clients keep a whole bulleted list in one paragraph with
// line breaks between the items. Split such a paragraph into one paragraph per
// line - but only when at least one line is a bullet, so ordinary soft-wrapped
// paragraphs keep their breaks.
function splitAtHardBreaks(node: ProseNode, types: BulletListTypes): ProseNode[] {
  const { hardBreak, paragraph } = types;
  if (!hardBreak || node.type !== paragraph) return [node];

  const lines: ProseNode[] = [];
  let start = 0;
  let offset = 0;

  node.forEach((child) => {
    if (child.type === hardBreak) {
      lines.push(node.cut(start, offset));
      start = offset + child.nodeSize;
    }
    offset += child.nodeSize;
  });

  if (!lines.length) return [node];
  lines.push(node.cut(start));

  return lines.some((line) => unicodeBulletPrefixLength(line) > 0)
    ? lines
    : [node];
}

type Block = { node: ProseNode; origin: number; kind: "bullet" | "blank" | "other" };

// Rewrites a pasted slice so that runs of top-level paragraphs starting with a
// bullet glyph become one bullet list. Blank paragraphs inside a run, and the
// ones directly around it, are dropped: they are the spacer lines rich-text
// apps put around lists, and kept they would split the list in two and save
// as `<br />` lines, which is where the tall gap next to such lists came from.
//
// Returns the same slice object when there is nothing to convert, so callers
// can tell whether to take over the paste. A single pasted line is never
// converted: it goes inline into the paragraph at the caret.
export function convertPastedBullets(slice: Slice, types: BulletListTypes): Slice {
  const blocks: Block[] = [];

  slice.content.forEach((child, _offset, index) => {
    for (const node of splitAtHardBreaks(child, types)) {
      const kind =
        node.type === types.paragraph && unicodeBulletPrefixLength(node) > 0
          ? "bullet"
          : isBlankParagraph(node, types.paragraph)
            ? "blank"
            : "other";

      blocks.push({ node, origin: index, kind });
    }
  });

  if (blocks.length < 2 || !blocks.some((block) => block.kind === "bullet")) {
    return slice;
  }

  const nearestNonBlank = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < blocks.length; i += step) {
      if (blocks[i]!.kind !== "blank") return blocks[i];
    }
    return undefined;
  };

  const kept = blocks.filter(
    (block, i) =>
      block.kind !== "blank" ||
      (nearestNonBlank(i - 1, -1)?.kind !== "bullet" &&
        nearestNonBlank(i + 1, 1)?.kind !== "bullet"),
  );

  const output: Block[] = [];
  let items: ProseNode[] = [];
  let listOrigin = 0;

  const flushList = () => {
    if (!items.length) return;
    output.push({
      node: types.bulletList.create(null, items),
      origin: listOrigin,
      kind: "bullet",
    });
    items = [];
  };

  for (const block of kept) {
    if (block.kind !== "bullet") {
      flushList();
      output.push(block);
      continue;
    }

    if (!items.length) listOrigin = block.origin;
    const text = block.node.cut(unicodeBulletPrefixLength(block.node));
    items.push(types.listItem.create(null, text));
  }
  flushList();

  // The slice's open sides only still make sense where the edge block is the
  // same kind of node it was: a paragraph there still merges into the one at
  // the caret, but a new list, or a paragraph that used to follow a dropped
  // spacer, has to go in as a block of its own.
  const first = slice.content.firstChild;
  const last = slice.content.lastChild;
  const head = output[0]!;
  const tail = output[output.length - 1]!;

  const openStart =
    head.node === first ||
    (head.kind === "other" &&
      head.origin === 0 &&
      head.node.type === types.paragraph &&
      slice.openStart === 1)
      ? slice.openStart
      : 0;

  const openEnd =
    tail.node === last ||
    (tail.kind === "other" &&
      tail.origin === slice.content.childCount - 1 &&
      tail.node.type === types.paragraph &&
      slice.openEnd === 1)
      ? slice.openEnd
      : 0;

  return new Slice(
    Fragment.fromArray(output.map((block) => block.node)),
    openStart,
    openEnd,
  );
}

// With the caret already in a list item, a pasted list that is nothing but
// bullets should add items beside that one. Left as a whole list it would be
// nested inside the item, one level deeper than the list it was pasted into.
export function fitPastedListToListItem(
  slice: Slice,
  caretInListItem: boolean,
  types: BulletListTypes,
): Slice {
  if (!caretInListItem || slice.content.childCount !== 1) return slice;

  const only = slice.content.firstChild!;
  if (only.type !== types.bulletList) return slice;

  return new Slice(only.content, 0, 0);
}
