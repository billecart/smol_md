import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { Command, EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { NodeSchema } from "@milkdown/kit/transformer";

// Raw HTML in markdown (`<!-- note -->`, `<br>`, `<div>…</div>`) is kept as
// an `html` node so it survives a round trip untouched. Milkdown's own version
// is an atom that stores the source in an attribute, so the caret skips over
// it and the tag cannot be edited in Rich mode. This version holds the source
// as the node's text instead: the caret can go inside and the text is edited
// like code, with no marks and no markdown shortcuts. Whatever text it holds
// is written back out verbatim.
export const HTML_NODE_NAME = "html";

export const editableHtmlNodeSpec: NodeSchema = {
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  code: true,
  selectable: false,
  // spellcheck off also stops macOS smart quotes and dashes in WebKit, which
  // would turn `alt="x"` into `alt=“x”` and break the tag.
  toDOM: () => [
    "span",
    {
      "data-type": HTML_NODE_NAME,
      class: "md-html",
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    },
    0,
  ],
  parseDOM: [
    {
      tag: `span[data-type="${HTML_NODE_NAME}"]`,
      // Keeps the tag's own line breaks and indentation. Older builds also
      // wrote the source as the span's text, so their copies paste the same.
      preserveWhitespace: "full",
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === HTML_NODE_NAME,
    runner: (state, node, type) => {
      const value = typeof node.value === "string" ? node.value : "";

      state.openNode(type);
      if (value) state.addText(value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === HTML_NODE_NAME,
    runner: (state, node) => {
      state.addNode(HTML_NODE_NAME, undefined, node.textContent);
    },
  },
};

function isInsideHtml(state: EditorState) {
  const { $from, $to } = state.selection;

  return (
    $from.parent.type.name === HTML_NODE_NAME &&
    $to.parent === $from.parent
  );
}

// Enter and Shift-Enter inside a tag add a line to the tag rather than
// splitting the paragraph around it: block HTML often spans several lines,
// and a hard break node cannot live inside the tag's text.
export const insertLineBreakInHtml: Command = (state, dispatch) => {
  if (!isInsideHtml(state)) return false;

  dispatch?.(state.tr.insertText("\n").scrollIntoView());
  return true;
};

// Deleting every character of a tag leaves an empty node the caret can no
// longer reach. Remove it, so emptying a tag removes the tag.
export function removeEmptyHtmlNodes(state: EditorState): Transaction | null {
  const empty: { pos: number; node: ProseNode }[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name === HTML_NODE_NAME) {
      if (node.content.size === 0) empty.push({ pos, node });
      return false;
    }

    return true;
  });

  if (empty.length === 0) return null;

  const tr = state.tr;

  for (const { pos, node } of empty.reverse()) {
    tr.delete(pos, pos + node.nodeSize);
  }

  return tr;
}
