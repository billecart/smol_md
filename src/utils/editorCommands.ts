import { lift, setBlockType } from "@milkdown/kit/prose/commands";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { canJoin } from "@milkdown/kit/prose/transform";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { Mark, MarkType, NodeType } from "@milkdown/kit/prose/model";

// These live here rather than in RichEditor.tsx so the test runner compiles
// them - it only reaches src/utils. None of them touch the DOM, so they can
// be driven straight from Node against a plain ProseMirror state.

// Everything an editor command needs. EditorView satisfies this structurally,
// so callers pass a real view unchanged, while a test can pass a state and a
// dispatch that just records the transaction.
export type EditorLike = {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
};

export type BlockCommand = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) => boolean;

// True when the caret sits in the first paragraph of a list item, at its very
// start - the position where Backspace should outdent rather than merge the
// item into the one above it.
export function isAtStartOfListItem(state: EditorState, listItem: NodeType) {
  const { $from, empty } = state.selection;

  return (
    empty &&
    $from.parentOffset === 0 &&
    $from.depth > 1 &&
    $from.node(-1).type === listItem &&
    $from.index(-1) === 0
  );
}

export function isInEmptyListItem(state: EditorState, listItem: NodeType) {
  const { $from, empty } = state.selection;

  return (
    empty &&
    $from.depth > 1 &&
    $from.node(-1).type === listItem &&
    $from.node(-1).textContent.length === 0
  );
}

// Steps the selection out of any blockquote or list wrapping it. Block
// commands report failure rather than doing something sensible when the
// current block is not where the target format is allowed, and a silent
// failure reads as a menu item that does nothing.
export function liftOutOfWrappers(view: EditorLike) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { $from } = view.state.selection;
    let wrapped = false;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const name = $from.node(depth).type.name;

      if (name === "blockquote" || name === "list_item") {
        wrapped = true;
        break;
      }
    }

    if (!wrapped || !lift(view.state, view.dispatch)) {
      return;
    }
  }
}

// Escalating attempt at a block format: as-is, then out of any wrapper, then
// flattened to a paragraph. A heading or code block cannot be the first child
// of a list item, so wrapping one in a list only works once it is a paragraph.
export function runBlockFormat(view: EditorLike, cmd: BlockCommand) {
  if (cmd(view.state, view.dispatch)) return;

  liftOutOfWrappers(view);
  if (cmd(view.state, view.dispatch)) return;

  const paragraph = view.state.schema.nodes.paragraph;

  if (paragraph && view.state.selection.$from.parent.type !== paragraph) {
    setBlockType(paragraph)(view.state, view.dispatch);
  }

  cmd(view.state, view.dispatch);
}

// The two key handlers themselves, rather than just the predicates they
// consult. Keeping the whole decision here means a test can check what the
// key actually does - including whether it declines the key and lets the
// default through, which is half the behaviour and the half that used to be
// wrong.

// Only claims Backspace at the start of a list item; everywhere else the
// default delete behaviour is what you want. Without this, the default joins
// the item into the one above, which drops the bullet but leaves the text
// stranded inside the previous item.
export function backspaceOutdentsListItem(listItem: NodeType): BlockCommand {
  return (state, dispatch) => {
    if (!isAtStartOfListItem(state, listItem)) return false;

    return liftListItem(listItem)(state, dispatch);
  };
}

// Enter on an empty bullet leaves the list, the usual "press Enter twice to
// stop making a list" behaviour. A bullet with text in it still splits
// normally, so the key is declined.
export function enterLeavesEmptyListItem(listItem: NodeType): BlockCommand {
  return (state, dispatch) => {
    if (!isInEmptyListItem(state, listItem)) return false;

    return liftListItem(listItem)(state, dispatch);
  };
}

// Body text - the way back out of a heading, quote, code block or bullet.
// Every other block format had a menu item and this one did not, so a heading
// was a one-way door. It lifts first, so "Body text" on a bullet removes the
// bullet rather than succeeding trivially on the paragraph already inside it.
// Takes a view rather than a (state, dispatch) pair, like liftOutOfWrappers
// and runBlockFormat, because it is two steps and the second needs the state
// the first produced. Written as a plain command it appeared to work only
// because a real EditorView swaps its own state on dispatch; given a bare
// dispatch it lifted and then applied the block type to the stale state.
export function makeBodyText(view: EditorLike, paragraph: NodeType) {
  liftOutOfWrappers(view);

  return setBlockType(paragraph)(view.state, view.dispatch);
}

export type LinkRange = {
  from: number;
  to: number;
  href: string;
  title: string;
};

// The whole link under a position, not just the character there - editing or
// removing a link has to act on all of it, and a link is several text nodes
// whenever part of it carries another mark, such as a bold word inside it.
export function findLinkAt(
  state: EditorState,
  linkType: MarkType,
  pos: number,
): LinkRange | null {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;

  if (!parent.isTextblock) return null;

  const start = $pos.start();
  const runs: { from: number; to: number; mark: Mark }[] = [];

  parent.forEach((child, offset) => {
    const mark = linkType.isInSet(child.marks);
    if (!mark) return;

    const from = start + offset;
    const previous = runs[runs.length - 1];

    // Adjacent runs sharing the same link are one link, not several.
    if (previous && previous.to === from && previous.mark.eq(mark)) {
      previous.to = from + child.nodeSize;
      return;
    }

    runs.push({ from, to: from + child.nodeSize, mark });
  });

  const hit = runs.find((run) => pos >= run.from && pos <= run.to);
  if (!hit) return null;

  return {
    from: hit.from,
    to: hit.to,
    href: String(hit.mark.attrs.href ?? ""),
    title: String(hit.mark.attrs.title ?? ""),
  };
}

export function removeLinkAt(
  state: EditorState,
  linkType: MarkType,
  pos: number,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const link = findLinkAt(state, linkType, pos);
  if (!link) return false;

  dispatch?.(state.tr.removeMark(link.from, link.to, linkType));
  return true;
}

// Replaces the href across the whole link, keeping its text.
export function updateLinkAt(
  state: EditorState,
  linkType: MarkType,
  pos: number,
  href: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const link = findLinkAt(state, linkType, pos);
  if (!link) return false;

  dispatch?.(
    state.tr
      .removeMark(link.from, link.to, linkType)
      .addMark(link.from, link.to, linkType.create({ href, title: link.title })),
  );
  return true;
}

// Backspace at the start of a paragraph that follows a heading used to pull
// the whole paragraph up into the heading, so a paragraph of body text
// suddenly rendered at 30px. It is the conventional behaviour and it is
// alarming: the further down the paragraph the caret started, the more text
// changed size.
//
// This demotes the heading to body text instead, then joins - the text keeps
// the size it had, and what is lost is one heading rather than the appearance
// of a whole paragraph. Both are a single undo away, so the question is only
// which surprises less.
//
// An empty paragraph is deliberately left to the default: backspace on a
// blank line under a heading should remove the blank line, not destroy the
// heading. Both steps go in one transaction so one backspace costs one undo.
export function backspaceMergesHeadingAsBodyText(
  heading: NodeType,
  paragraph: NodeType,
): BlockCommand {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;

    if (!empty || $from.parentOffset !== 0) return false;
    if ($from.depth !== 1) return false;
    if ($from.parent.type !== paragraph) return false;
    if ($from.parent.content.size === 0) return false;

    const index = $from.index(-1);
    if (index === 0) return false;

    const previous = $from.node(-1).child(index - 1);
    if (previous.type !== heading) return false;

    const boundary = $from.before();
    const tr = state.tr.setNodeMarkup(boundary - previous.nodeSize, paragraph);

    if (!canJoin(tr.doc, boundary)) return false;

    dispatch?.(tr.join(boundary).scrollIntoView());
    return true;
  };
}

// Runs commands in order until one claims the key, the way ProseMirror's own
// keymap chains work.
export function chainCommands(...commands: BlockCommand[]): BlockCommand {
  return (state, dispatch) =>
    commands.some((command) => command(state, dispatch));
}
