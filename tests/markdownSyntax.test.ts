import assert from "node:assert/strict";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { test } from "./testHarness";
import { listStringifyHandlers } from "../src/utils/markdownLists";
import { doc, marks, p, schema } from "./editorFixtures";
import {
  MARK_SPACE,
  handleText,
  protectMarkSpaces,
  relaxEscapes,
  remarkEmptyParagraphMarkers,
  remarkHighlight,
} from "../src/utils/markdownSyntax";

// The same parse and write steps Rich mode runs, minus the ProseMirror
// document in the middle.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkHighlight)
  .use(remarkEmptyParagraphMarkers)
  .use(remarkStringify, {
    rule: "-",
    handlers: { ...listStringifyHandlers(), text: handleText },
  } as any);

function parse(markdown: string): any {
  return processor.runSync(processor.parse(markdown));
}

function roundTrip(markdown: string) {
  return String(processor.stringify(parse(markdown)));
}

function assertStable(markdown: string) {
  assert.equal(roundTrip(markdown), markdown);
}

function firstParagraph(markdown: string) {
  return parse(markdown).children[0];
}

// <br>

test("an inline <br> survives", () => {
  assertStable("text<br>after.\n");
});

test("a <br> inside a table cell survives", () => {
  const output = roundTrip("| a | b |\n| - | - |\n| one<br>two | x |\n");
  assert.match(output, /one<br>two/);
});

test("a paragraph that is only <br /> is an empty paragraph", () => {
  const tree = parse("a\n\n<br />\n\nb\n");
  assert.equal(tree.children[1].type, "paragraph");
  assert.equal(tree.children[1].children.length, 0);
});

// ==highlight==

test("a highlight holding bold and plain text reads back as one highlight", () => {
  const paragraph = firstParagraph("A ==**bold** mark== here\n");
  assert.deepEqual(
    paragraph.children.map((child: any) => child.type),
    ["text", "highlight", "text"],
  );
  assert.equal(paragraph.children[1].children[0].type, "strong");
});

test("a highlight holding a link round-trips unchanged", () => {
  assertStable("==see [the docs](https://example.com) now==\n");
});

test("a highlight holding bold round-trips unchanged", () => {
  assertStable("A ==**bold** mark== here\n");
});

test("== with spaces around it is not a highlight", () => {
  const paragraph = firstParagraph("a == b == c\n");
  assert.deepEqual(paragraph.children.map((child: any) => child.type), ["text"]);
  assertStable("a == b == c\n");
});

test("three equals signs are not a highlight", () => {
  const paragraph = firstParagraph("a ===b=== c\n");
  assert.deepEqual(paragraph.children.map((child: any) => child.type), ["text"]);
});

test("a plain highlight still works", () => {
  assertStable("Some ==marked== words.\n");
});

test("literal == that would open a highlight stays escaped", () => {
  const tree = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: "x==y==z" }] },
    ],
  };
  const output = String(processor.stringify(tree as any));
  assert.equal(
    firstParagraph(output).children.map((c: any) => c.type).join(),
    "text",
  );
});

// Escaping

test("wikilinks are not escaped", () => {
  assertStable("See [[My Page]] for more.\n");
  assertStable("See [[My Page]]\n");
});

test("callouts are not escaped", () => {
  assertStable("> [!NOTE]\n> callout\n");
});

test("bracketed words are not escaped", () => {
  assertStable("A [TODO] here and [draft] there.\n");
});

test("snake_case and spaced operators are not escaped", () => {
  assertStable("Call get_user_by_id with 2 * 3 or 4 ~ 5.\n");
});

test("a bracket that would make a link stays escaped", () => {
  const text = "[not](a link)";
  const tree = {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
  };
  const output = String(processor.stringify(tree as any));
  assert.equal(firstParagraph(output).children[0].type, "text");
  assert.equal(firstParagraph(output).children[0].value, text);
});

test("a task box at the start of a list item stays escaped", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "list",
        ordered: false,
        spread: false,
        children: [
          {
            type: "listItem",
            spread: false,
            checked: null,
            children: [
              { type: "paragraph", children: [{ type: "text", value: "[x] done" }] },
            ],
          },
        ],
      },
    ],
  };
  const output = String(processor.stringify(tree as any));
  assert.equal(parse(output).children[0].children[0].checked, null);
});

test("emphasis-like text stays escaped where it would turn into emphasis", () => {
  for (const value of ["*not emphasis*", "_not emphasis_", "a *b* c", "~gone~", "~5 to 6~"]) {
    const tree = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value }] }],
    };
    const output = String(processor.stringify(tree as any));
    const paragraph = firstParagraph(output);
    assert.equal(paragraph.children.length, 1, value);
    assert.equal(paragraph.children[0].value, value, value);
  }
});

test("a star at the start of a line is never unescaped", () => {
  assert.equal(relaxEscapes("a\n\\* b", "a\n* b"), "a\n\\* b");
});

test("a bracket before a following link's parenthesis stays escaped", () => {
  assert.equal(relaxEscapes("\\[a]", "[a]", "("), "\\[a]");
  assert.equal(relaxEscapes("\\[a]", "[a]", "\n"), "[a]");
});

// Spaces inside a mark's run

test("a space inside a highlight run is protected, one at its edge is not", () => {
  const highlight = marks.highlight.create();
  const strong = marks.strong.create();
  const document = doc(
    p(
      schema.text("A "),
      schema.text("bold", [highlight, strong]),
      schema.text(" mark ", [highlight]),
      schema.text("here"),
    ),
  );

  const texts: string[] = [];
  protectMarkSpaces(document).descendants((node) => {
    if (node.isText) texts.push(node.text ?? "");
  });

  assert.deepEqual(texts, ["A ", "bold", `${MARK_SPACE}mark `, "here"]);
});

test("a document with nothing to protect is returned as is", () => {
  const document = doc(p("plain ", schema.text("bold", [marks.strong.create()]), " text"));
  assert.equal(protectMarkSpaces(document), document);
});

test("the placeholder is written back as a space", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "highlight",
            children: [
              { type: "strong", children: [{ type: "text", value: "bold" }] },
              { type: "text", value: `${MARK_SPACE}mark` },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(String(processor.stringify(tree as any)), "==**bold** mark==\n");
});
