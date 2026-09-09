import { Schema } from "@milkdown/kit/prose/model";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import { addListNodes } from "@milkdown/kit/prose/schema-list";
import type { EditorLike } from "../src/utils/editorCommands";

// A stand-in for Milkdown's schema, close enough to drive the editor commands
// without a browser. Node names match the ones the commands look for by name
// (see liftOutOfWrappers), and editorSchema.test.ts pins them against the
// editor source so the two cannot drift apart silently.
const baseNodes = {
  doc: { content: "block+" },
  paragraph: {
    content: "inline*",
    group: "block",
    toDOM: () => ["p", 0] as const,
  },
  heading: {
    attrs: { level: { default: 1 } },
    content: "inline*",
    group: "block",
    defining: true,
    toDOM: (node: ProseNode) => [`h${node.attrs.level}`, 0] as const,
  },
  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    toDOM: () => ["blockquote", 0] as const,
  },
  code_block: {
    content: "text*",
    group: "block",
    code: true,
    defining: true,
    marks: "",
    toDOM: () => ["pre", ["code", 0]] as const,
  },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    toDOM: () => ["br"] as const,
  },
  text: { group: "inline" },
};

const baseMarks = {
  link: {
    attrs: { href: {}, title: { default: "" } },
    inclusive: false,
    toDOM: (mark: { attrs: Record<string, unknown> }) =>
      ["a", mark.attrs, 0] as const,
  },
  strong: { toDOM: () => ["strong", 0] as const },
  em: { toDOM: () => ["em", 0] as const },
  highlight: { toDOM: () => ["mark", 0] as const },
  code: { toDOM: () => ["code", 0] as const },
};

export const schema = new Schema({
  nodes: addListNodes(
    // addListNodes wants an OrderedMap, which is what Schema.spec exposes.
    new Schema({ nodes: baseNodes, marks: baseMarks }).spec.nodes,
    "paragraph block*",
    "block",
  ),
  marks: baseMarks,
});

export const nodes = schema.nodes;
export const marks = schema.marks;

// Where the caret goes. Written inside a text string because that reads far
// better in a test than counting document positions by hand.
export const CURSOR = "<|>";

type Content = ProseNode | string;

function normalize(content: Content[]): ProseNode[] {
  return content.map((item) =>
    typeof item === "string" ? schema.text(item) : item,
  );
}

export function doc(...content: ProseNode[]) {
  return schema.node("doc", null, content);
}

export function p(...content: Content[]) {
  return schema.node("paragraph", null, normalize(content));
}

export function heading(level: number, ...content: Content[]) {
  return schema.node("heading", { level }, normalize(content));
}

export function blockquote(...content: ProseNode[]) {
  return schema.node("blockquote", null, content);
}

export function codeBlock(text: string) {
  return schema.node("code_block", null, text ? [schema.text(text)] : []);
}

export function listItem(...content: ProseNode[]) {
  return schema.node("list_item", null, content);
}

export function bulletList(...items: ProseNode[]) {
  return schema.node("bullet_list", null, items);
}

export function orderedList(...items: ProseNode[]) {
  return schema.node("ordered_list", null, items);
}

export function link(text: string, href: string, title = "") {
  return schema.text(text, [schema.marks.link.create({ href, title })]);
}

// Builds a state from a document containing the CURSOR marker, removes the
// marker, and leaves the selection where it was. Without a marker the
// selection lands at the start of the document.
export function stateFrom(document: ProseNode): EditorState {
  let markerPos: number | null = null;

  document.descendants((child, pos) => {
    if (markerPos !== null) return false;

    if (child.isText && child.text?.includes(CURSOR)) {
      markerPos = pos + child.text.indexOf(CURSOR);
      return false;
    }

    return true;
  });

  const state = EditorState.create({ doc: document });
  if (markerPos === null) return state;

  const at: number = markerPos;
  const withoutMarker = state.apply(state.tr.delete(at, at + CURSOR.length));

  return withoutMarker.apply(
    withoutMarker.tr.setSelection(
      TextSelection.create(withoutMarker.doc, at),
    ),
  );
}

// A stand-in for EditorView carrying just what the commands use. `dispatch`
// has to be an arrow function bound to the object: the commands pass
// `view.dispatch` around unbound, and a method would lose `this` and silently
// stop applying transactions.
export function fakeView(initial: EditorState) {
  const view = {
    state: initial,
    dispatch: (tr: Transaction) => {
      view.state = view.state.apply(tr);
    },
  };

  return view satisfies EditorLike;
}

// Runs a ProseMirror command against a state and reports both whether it
// claimed the key and what the document became.
export function runCommand(
  state: EditorState,
  command: (
    state: EditorState,
    dispatch?: (tr: Transaction) => void,
  ) => boolean,
) {
  const view = fakeView(state);
  const handled = command(view.state, view.dispatch);

  return { handled, state: view.state, doc: view.state.doc };
}

// A compact one-line shape of a document, so a failing assertion says
// `bullet_list(list_item(paragraph("a")))` rather than printing a page of
// JSON. Text nodes show their content; marks are named in brackets.
export function outline(node: ProseNode): string {
  if (node.isText) {
    const names = node.marks.map((mark) => mark.type.name).sort();
    const text = JSON.stringify(node.text ?? "");
    return names.length ? `${text}[${names.join(",")}]` : text;
  }

  const children: string[] = [];
  node.forEach((child) => children.push(outline(child)));

  const label =
    node.type.name === "heading" ? `heading${node.attrs.level}` : node.type.name;

  return children.length ? `${label}(${children.join(", ")})` : label;
}

// The outline of a document's children, skipping the doc wrapper itself.
export function outlineDoc(document: ProseNode): string {
  const parts: string[] = [];
  document.forEach((child) => parts.push(outline(child)));
  return parts.join(" | ");
}
