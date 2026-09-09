import { lift, setBlockType } from "@milkdown/kit/prose/commands";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { NodeType } from "@milkdown/kit/prose/model";

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
