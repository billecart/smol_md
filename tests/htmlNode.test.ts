import assert from "node:assert/strict";
import { htmlSchema } from "@milkdown/kit/preset/commonmark";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { remark } from "remark";
import {
  HTML_NODE_NAME,
  editableHtmlNodeSpec,
  insertLineBreakInHtml,
  removeEmptyHtmlNodes,
} from "../src/utils/htmlNode";
import { test } from "./testHarness";

// The smallest schema that can carry raw HTML through Milkdown's markdown
// parser and serializer. Doc, paragraph and text mirror Milkdown's own specs;
// the html node is the real one the editor registers.
const nodes: Record<string, NodeSchema> = {
  doc: {
    content: "block+",
    parseMarkdown: {
      match: ({ type }) => type === "root",
      runner: (state, node, type) => state.injectRoot(node, type),
    },
    toMarkdown: {
      match: (node) => node.type.name === "doc",
      runner: (state, node) => {
        state.openNode("root");
        state.next(node.content);
      },
    },
  },
  paragraph: {
    content: "inline*",
    group: "block",
    parseMarkdown: {
      match: ({ type }) => type === "paragraph",
      runner: (state, node, type) => {
        state.openNode(type);
        if (node.children) state.next(node.children);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "paragraph",
      runner: (state, node) => {
        state.openNode("paragraph");
        state.next(node.content);
        state.closeNode();
      },
    },
  },
  text: {
    group: "inline",
    parseMarkdown: {
      match: ({ type }) => type === "text",
      runner: (state, node) => state.addText(node.value as string),
    },
    toMarkdown: {
      match: (node) => node.type.name === "text",
      runner: (state, node) => state.addNode("text", undefined, node.text),
    },
  },
  [HTML_NODE_NAME]: editableHtmlNodeSpec,
};

const schema = new Schema({ nodes: nodes as any });

// Milkdown wraps block-level HTML in a paragraph before parsing (its
// remarkHtmlTransformer); the same step, for the top level.
const wrapBlockHtml = () => (tree: any) => {
  tree.children = tree.children.map((child: any) =>
    child.type === "html" ? { type: "paragraph", children: [child] } : child,
  );
};

const processor = remark().use(wrapBlockHtml) as any;
// Each create() holds one parser state, so make a fresh one per call: a
// failed parse would otherwise leave its half-built nodes for the next.
const parse = (markdown: string) => ParserState.create(schema, processor)(markdown);
const serialize = (doc: ProseNode) => SerializerState.create(schema, processor)(doc);

function htmlNodesIn(doc: ProseNode) {
  const found: { pos: number; node: ProseNode }[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === HTML_NODE_NAME) found.push({ pos, node });
  });

  return found;
}

function stateWithCaretIn(markdown: string, offsetInTag: number) {
  const doc = parse(markdown);
  const [first] = htmlNodesIn(doc);
  assert.ok(first, "expected an html node");
  const state = EditorState.create({ doc });

  return state.apply(
    state.tr.setSelection(
      TextSelection.create(state.doc, first.pos + 1 + offsetInTag),
    ),
  );
}

test("the html node name matches Milkdown's, so the override replaces it", () => {
  assert.equal((htmlSchema as any).key.name, HTML_NODE_NAME);
});

// The bug: Milkdown's html node is an atom, so the caret cannot enter it.
test("raw HTML is held as text the caret can enter, not as an atom", () => {
  const type = schema.nodes[HTML_NODE_NAME]!;

  assert.equal(type.isAtom, false);
  assert.equal(type.isLeaf, false);
  assert.equal(type.isInline, true);
  assert.equal(type.spec.code, true);
});

test("an HTML comment parses into an html node holding its source", () => {
  const doc = parse("<!-- something -->\n");
  const found = htmlNodesIn(doc);

  assert.equal(found.length, 1);
  assert.equal(found[0]!.node.textContent, "<!-- something -->");
});

test("raw HTML round-trips through Rich mode unchanged", () => {
  const samples = [
    "<!-- something -->\n",
    "Before <!-- inline note --> after\n",
    "Some <b>bold</b> and <kbd>Ctrl</kbd> text\n",
    "<div align=\"center\">\n  <img src=\"logo.png\" width=\"80\">\n</div>\n",
    "<!--\nmulti-line\ncomment\n-->\n",
    "<details>\n<summary>More</summary>\n\nBody text\n\n</details>\n",
  ];

  for (const markdown of samples) {
    assert.equal(serialize(parse(markdown)), markdown, JSON.stringify(markdown));
  }
});

test("typing inside a tag changes the HTML written back to markdown", () => {
  // Caret right after "<!-- ".
  const state = stateWithCaretIn("<!-- something -->\n", 5);
  const edited = state.apply(state.tr.insertText("edited "));

  assert.equal(serialize(edited.doc), "<!-- edited something -->\n");
});

test("Enter inside a tag adds a line to the tag", () => {
  const state = stateWithCaretIn("<div>hi</div>\n", 5);
  let next: EditorState | null = null;

  const handled = insertLineBreakInHtml(state, (tr) => {
    next = state.apply(tr);
  });

  assert.equal(handled, true);
  assert.equal(serialize(next!.doc), "<div>\nhi</div>\n");
  assert.equal(htmlNodesIn(next!.doc).length, 1);
});

test("Enter outside a tag is left to the normal handlers", () => {
  const doc = parse("Plain text\n");
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 3),
  });

  assert.equal(insertLineBreakInHtml(state), false);
});

test("emptying a tag removes it", () => {
  const state = stateWithCaretIn("Before <br> after\n", 0);
  const [tag] = htmlNodesIn(state.doc);
  const emptied = state.apply(
    state.tr.delete(tag!.pos + 1, tag!.pos + 1 + tag!.node.content.size),
  );

  assert.equal(htmlNodesIn(emptied.doc)[0]!.node.content.size, 0);

  const cleanup = removeEmptyHtmlNodes(emptied);
  assert.ok(cleanup);

  const cleaned = emptied.apply(cleanup);
  assert.equal(htmlNodesIn(cleaned.doc).length, 0);
  assert.equal(cleaned.doc.textContent, "Before  after");
});

test("nothing to clean up when every tag has text", () => {
  const state = EditorState.create({ doc: parse("A <b>b</b> c\n") });

  assert.equal(removeEmptyHtmlNodes(state), null);
});

// Found in the packaged app: macOS smart quotes turned a typed `"` inside a
// tag into `“`, which breaks the HTML. WebKit skips text substitution where
// spellcheck is off.
test("tags turn off spellcheck, and with it macOS smart quotes", () => {
  const toDOM = editableHtmlNodeSpec.toDOM as (node: unknown) => any;
  const [, attrs] = toDOM(null);

  assert.equal(attrs.spellcheck, "false");
});
