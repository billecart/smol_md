import { lift, setBlockType } from "@milkdown/kit/prose/commands";
import { liftListItem, sinkListItem, wrapInList } from "@milkdown/kit/prose/schema-list";
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

// Runs a multi-step edit against a scratch copy of the state and only touches
// the real view if every step worked, as one transaction. Block formats are
// escalating attempts (as-is, lifted out of a wrapper, flattened to a
// paragraph), and the lifting is a real edit: when the last attempt still
// failed, the earlier ones had already been applied, so the menu item did
// nothing visible except quietly outdent the selection out of its list.
function atomically(
  view: EditorLike,
  attempt: (draft: EditorLike) => boolean,
): boolean {
  const recorded: Transaction[] = [];
  const draft: EditorLike = {
    state: view.state,
    dispatch: (tr) => {
      recorded.push(tr);
      draft.state = draft.state.apply(tr);
    },
  };

  if (!attempt(draft)) return false;
  if (recorded.length === 0) return true;

  // Replaying the steps rather than the transactions keeps it one undo step,
  // and the selection follows by mapping, as it does for each command alone.
  const tr = view.state.tr;
  for (const recordedTr of recorded) {
    for (const step of recordedTr.steps) tr.step(step);
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

// Steps the selection out of any blockquote or list wrapping it. Block
// commands report failure rather than doing something sensible when the
// current block is not where the target format is allowed, and a silent
// failure reads as a menu item that does nothing.
//
// A plain lift handles one block. A selection across several items of one
// list is a range of list_items, which lift cannot move out of the list, so
// those go through liftListItem - without it a format applied to a whole
// selected list found nothing to lift out of and did nothing at all.
export function liftOutOfWrappers(view: EditorLike) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { $from } = view.state.selection;
    let wrapper: "blockquote" | "list_item" | null = null;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const name = $from.node(depth).type.name;

      if (name === "blockquote" || name === "list_item") {
        wrapper = name;
        break;
      }
    }

    if (!wrapper) return;

    const { state, dispatch } = view;
    const { bullet_list: bullet, ordered_list: ordered, list_item: item } = state.schema.nodes;
    const range = state.selection.$from.blockRange(state.selection.$to);
    const spansItems =
      !!range && (range.parent.type === bullet || range.parent.type === ordered);
    const lifted =
      wrapper === "list_item" && spansItems && item
        ? liftListItem(item)(state, dispatch)
        : lift(state, dispatch);

    if (!lifted) return;
  }
}

function attemptBlockFormat(view: EditorLike, cmd: BlockCommand) {
  if (cmd(view.state, view.dispatch)) return true;

  liftOutOfWrappers(view);
  if (cmd(view.state, view.dispatch)) return true;

  const paragraph = view.state.schema.nodes.paragraph;

  if (paragraph && view.state.selection.$from.parent.type !== paragraph) {
    setBlockType(paragraph)(view.state, view.dispatch);
  }

  return cmd(view.state, view.dispatch);
}

// Escalating attempt at a block format: as-is, then out of any wrapper, then
// flattened to a paragraph. A heading or code block cannot be the first child
// of a list item, so wrapping one in a list only works once it is a paragraph.
// All or nothing: returns false and leaves the document untouched when none
// of the attempts took.
export function runBlockFormat(view: EditorLike, cmd: BlockCommand): boolean {
  return atomically(view, (draft) => attemptBlockFormat(draft, cmd));
}

// Turns the list around the selection into another kind of list, in place.
// "Numbered list" on a bullet used to go through wrapInList, which is for
// paragraphs: with several items selected it found nothing to wrap and did
// nothing, and with the caret in one item it nested or split that item out of
// its list instead of converting the list. The list the selection sits in -
// the innermost one holding all of it - is retyped, so a nested list changes
// without touching the list around it, and items nested below keep theirs.
//
// Already the right kind: claims the command and changes nothing, rather than
// falling through to wrap the item in a second list. Returns false outside a
// list, for the caller to wrap paragraphs instead.
export function convertEnclosingList(listType: NodeType): BlockCommand {
  return (state, dispatch) => {
    const { bullet_list: bullet, ordered_list: ordered } = state.schema.nodes;
    const { $from, $to } = state.selection;

    for (let depth = $from.sharedDepth($to.pos); depth > 0; depth -= 1) {
      const list = $from.node(depth);
      if (list.type !== bullet && list.type !== ordered) continue;
      if (list.type === listType) return true;

      if (dispatch) {
        const pos = $from.before(depth);
        const tr = state.tr.setNodeMarkup(pos, listType, list.attrs);
        const isOrdered = listType === ordered;

        // Milkdown keeps what an item shows (its bullet or its number) in
        // the item itself, and re-derives an item's list from it: a bullet
        // list whose items still say "ordered" is turned straight back.
        list.forEach((item, offset, index) => {
          const declared = item.type.spec.attrs ?? {};
          if (!("listType" in declared) && !("label" in declared)) return;

          tr.setNodeMarkup(pos + 1 + offset, undefined, {
            ...item.attrs,
            listType: isOrdered ? "ordered" : "bullet",
            label: isOrdered ? `${index + 1}.` : "\u2022",
          });
        });

        dispatch(tr.scrollIntoView());
      }

      return true;
    }

    return false;
  };
}

// Bullet list / Numbered list: convert the list the selection is in, or wrap
// paragraphs in a new one.
export function runListFormat(view: EditorLike, listType: NodeType): boolean {
  return atomically(view, (draft) =>
    convertEnclosingList(listType)(draft.state, draft.dispatch) ||
    attemptBlockFormat(draft, wrapInList(listType)),
  );
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
  return atomically(view, (draft) => {
    const before = draft.state;
    liftOutOfWrappers(draft);

    // Already a paragraph once lifted is success, not failure: the lift was
    // the whole job, and setBlockType reports false when there is nothing
    // left to change.
    const typed = setBlockType(paragraph)(draft.state, draft.dispatch);

    return typed || draft.state !== before;
  });
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

// Cmd+K and the menu's Link item used toggleMark, which removes the link when
// the selection already has one - so re-pointing a link deleted it instead.
// Returns false when there is no link to re-point, and the caller toggles as
// before.
export function setLinkOnSelection(
  state: EditorState,
  linkType: MarkType,
  href: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { from, to, empty } = state.selection;

  if (empty) {
    return updateLinkAt(state, linkType, from, href, dispatch);
  }

  if (!state.doc.rangeHasMark(from, to, linkType)) return false;

  dispatch?.(
    state.tr
      .removeMark(from, to, linkType)
      .addMark(from, to, linkType.create({ href })),
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

// Depth of the list item holding the caret, or null outside a list.
function listItemDepth(state: EditorState, listItem: NodeType) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === listItem) return depth;
  }

  return null;
}

// Tab on a bullet. The first bullet of a list has nothing above it to nest
// under, so sinking fails - but a list right after another list of the same
// kind is usually one list split in two (Markdown starts a new list when the
// bullet character changes, `*` then `-`), so the two are joined and the item
// nested into the one above. Inside a list the key is always claimed: letting
// it through moves focus out of the editor to the next button.
export function indentListItem(listItem: NodeType): BlockCommand {
  return (state, dispatch) => {
    const depth = listItemDepth(state, listItem);
    if (depth === null) return false;

    if (sinkListItem(listItem)(state, dispatch)) return true;

    const { $from } = state.selection;
    const listDepth = depth - 1;
    const listStart = $from.before(listDepth);
    const previous = state.doc.resolve(listStart).nodeBefore;

    if (
      $from.index(listDepth) !== 0 ||
      !previous ||
      previous.type !== $from.node(listDepth).type ||
      !canJoin(state.doc, listStart)
    ) {
      return true;
    }

    const tr = state.tr.join(listStart);
    const joined = state.apply(tr);

    sinkListItem(listItem)(joined, (sinkTr) => {
      sinkTr.steps.forEach((step) => tr.step(step));
      tr.setSelection(sinkTr.selection.getBookmark().resolve(tr.doc));
    });
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

// Shift-Tab on a bullet. Claimed inside a list for the same focus reason.
export function outdentListItem(listItem: NodeType): BlockCommand {
  return (state, dispatch) => {
    if (listItemDepth(state, listItem) === null) return false;

    liftListItem(listItem)(state, dispatch);
    return true;
  };
}

// Runs commands in order until one claims the key, the way ProseMirror's own
// keymap chains work.
export function chainCommands(...commands: BlockCommand[]): BlockCommand {
  return (state, dispatch) =>
    commands.some((command) => command(state, dispatch));
}
