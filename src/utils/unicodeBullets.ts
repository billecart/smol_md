import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

// Text copied out of another app - a Steam "About This Game" draft, a Notes
// page, a Word file - often carries its bullets as characters, not as list
// syntax. Pasted into Rich mode they became ordinary paragraphs that happen to
// start with "•": no hanging indent, wrapped lines running back to the left
// margin, and `• item` saved to disk instead of `- item`. Beside a real list
// in the same document the two looked like two different kinds of bullet.
//
// Pastes are converted into a real bullet list as they come in. Documents that
// already contain such lines are only converted when asked, through the
// "Convert • lines to list" command - opening a file never rewrites it.

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

// "bullet" is a paragraph opening with a bullet glyph, and after rebuilding, a
// list made from them; "list" is a bullet list that was already there.
type Block = {
  node: ProseNode;
  origin: number;
  kind: "bullet" | "blank" | "list" | "other";
};

function classify(content: Fragment, types: BulletListTypes): Block[] {
  const blocks: Block[] = [];

  content.forEach((child, _offset, index) => {
    for (const node of splitAtHardBreaks(child, types)) {
      const kind =
        node.type === types.paragraph && unicodeBulletPrefixLength(node) > 0
          ? "bullet"
          : node.type === types.bulletList
            ? "list"
            : isBlankParagraph(node, types.paragraph)
              ? "blank"
              : "other";

      blocks.push({ node, origin: index, kind });
    }
  });

  return blocks;
}

// Turns each run of bullet paragraphs into one bullet list. Blank paragraphs
// inside a run, and the ones directly around it, are dropped: they are the
// spacer lines rich-text apps put around lists, and kept they would split the
// list in two and save as `<br />` lines - which is where the tall gap next
// to such lists came from.
//
// With joinLists, a new list is also merged into a real bullet list right
// next to it, so a document where the "•" lines follow a real list (with a
// gap in between) ends up with one list rather than two stacked ones.
function rebuild(blocks: Block[], types: BulletListTypes, joinLists: boolean): Block[] {
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

  if (!joinLists) return output;

  const joined: Block[] = [];
  for (const block of output) {
    const previous = joined[joined.length - 1];
    const bothLists =
      previous?.node.type === types.bulletList &&
      block.node.type === types.bulletList;

    if (bothLists && (previous.kind === "bullet" || block.kind === "bullet")) {
      // Milkdown keeps a parsed list's `spread` as the string "false", which
      // the markdown writer only reads as tight when it is a real boolean -
      // carried over as is, the joined list would save with blank lines
      // between its items.
      const spread =
        previous.node.attrs.spread === true || previous.node.attrs.spread === "true";

      joined[joined.length - 1] = {
        node: types.bulletList.create(
          { ...previous.node.attrs, spread },
          previous.node.content.append(block.node.content),
        ),
        origin: previous.origin,
        kind: "bullet",
      };
      continue;
    }

    joined.push(block);
  }

  return joined;
}

// Rewrites a pasted slice so that runs of top-level paragraphs starting with a
// bullet glyph become bullet lists (see rebuild).
//
// Returns the same slice object when there is nothing to convert, so callers
// can tell whether to take over the paste. A single pasted line is never
// converted: it goes inline into the paragraph at the caret.
export function convertPastedBullets(slice: Slice, types: BulletListTypes): Slice {
  const blocks = classify(slice.content, types);

  if (blocks.length < 2 || !blocks.some((block) => block.kind === "bullet")) {
    return slice;
  }

  const output = rebuild(blocks, types, false);

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

// The "Convert • lines to list" command, for documents that already contain
// such lines. It works on the top-level blocks the selection touches, or on
// the whole document when nothing is selected. Returns false, and changes
// nothing, when there are no bullet lines to convert.
//
// Only the blocks that actually change are replaced, one run at a time, so
// the caret stays where it was unless it was inside a converted line.
export function convertBulletParagraphs(types: BulletListTypes) {
  return (
    state: EditorState,
    dispatch?: (tr: Transaction) => void,
  ): boolean => {
    const { doc, selection } = state;
    const startIndex = selection.empty ? 0 : doc.resolve(selection.from).index(0);
    const endIndex = selection.empty
      ? doc.childCount
      : Math.max(doc.resolve(selection.to).indexAfter(0), startIndex + 1);

    const original: ProseNode[] = [];
    for (let i = startIndex; i < endIndex; i++) original.push(doc.child(i));

    const blocks = classify(Fragment.fromArray(original), types);
    if (!blocks.some((block) => block.kind === "bullet")) return false;
    if (!dispatch) return true;

    const output = rebuild(blocks, types, true).map((block) => block.node);

    // Pair up the untouched blocks (the same node objects on both sides) and
    // collect what lies between them as the runs to replace.
    const runs: { from: number; to: number; nodes: ProseNode[] }[] = [];
    let pos = 0;
    for (let i = 0; i < startIndex; i++) pos += doc.child(i).nodeSize;

    let i = 0;
    let j = 0;
    while (i < original.length || j < output.length) {
      if (i < original.length && original[i] === output[j]) {
        pos += original[i]!.nodeSize;
        i++;
        j++;
        continue;
      }

      let k = i;
      let l = -1;
      for (; k < original.length; k++) {
        l = output.indexOf(original[k]!, j);
        if (l !== -1) break;
      }
      if (l === -1) l = output.length;

      const from = pos;
      for (let m = i; m < k; m++) pos += original[m]!.nodeSize;
      runs.push({ from, to: pos, nodes: output.slice(j, l) });
      i = k;
      j = l;
    }

    // Back to front, so earlier positions are still valid when reached.
    const tr = state.tr;
    for (const run of runs.reverse()) {
      tr.replaceWith(run.from, run.to, run.nodes);
    }

    dispatch(tr.scrollIntoView());
    return true;
  };
}
