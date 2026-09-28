import assert from "node:assert/strict";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import {
  detectBulletMarker,
  listStringifyHandlers,
  spreadAsBoolean,
  type BulletMarker,
} from "../src/utils/markdownLists";
import { test } from "./testHarness";

// The bug this guards: any edit in Rich mode saved `- a\n- b` as
// `* a\n\n* b`. Milkdown's commonmark preset turns `spread` into the string
// "false"/"true" on the way in and passes it back unchanged on the way out,
// and the markdown writer ignores a `spread` that is not a boolean.

// Round-trips markdown the way the editor does: parse, stringify every list
// and list item's `spread` as Milkdown's parser does, then serialize.
function roundTrip(markdown: string, handlers?: ReturnType<typeof listStringifyHandlers>) {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  visit(tree, (node) => {
    if (node.type === "list" || node.type === "listItem") {
      (node as { spread: unknown }).spread = `${node.spread ?? false}`;
    }
  });
  return unified()
    .use(remarkStringify, handlers ? { handlers } : {})
    .stringify(tree);
}

test("without the list handlers a tight list is saved loose", () => {
  // Pins the upstream behavior the handlers work around. If this starts
  // failing, Milkdown or remark fixed it and markdownLists.ts can go.
  assert.equal(roundTrip("- a\n- b\n"), "* a\n\n* b\n");
});

test("a tight list stays tight", () => {
  assert.equal(
    roundTrip("- Real one\n- Real two\n\nEnd?\n", listStringifyHandlers()),
    "- Real one\n- Real two\n\nEnd?\n",
  );
});

test("a loose list stays loose", () => {
  assert.equal(roundTrip("- a\n\n- b\n", listStringifyHandlers()), "- a\n\n- b\n");
});

test("a tight ordered list stays tight", () => {
  assert.equal(roundTrip("1. a\n2. b\n", listStringifyHandlers()), "1. a\n2. b\n");
});

test("nested tight lists stay tight", () => {
  const markdown = "- a\n  - a1\n  - a2\n- b\n";
  assert.equal(roundTrip(markdown, listStringifyHandlers()), markdown);
});

test("task lists stay tight", () => {
  // gfm isn't loaded here, so the checkbox is plain text, but the list
  // structure is the same one Rich mode serializes.
  const markdown = "- [ ] a\n- [x] b\n";
  assert.equal(roundTrip(markdown, listStringifyHandlers()), "- \\[ ] a\n- \\[x] b\n");
});

test("the bullet marker comes from the getter on every save", () => {
  let marker: BulletMarker = "*";
  const handlers = listStringifyHandlers(() => marker);
  assert.equal(roundTrip("- a\n- b\n", handlers), "* a\n* b\n");
  marker = "+";
  assert.equal(roundTrip("- a\n- b\n", handlers), "+ a\n+ b\n");
});

test("spreadAsBoolean reads Milkdown's strings and plain booleans", () => {
  assert.equal(spreadAsBoolean("true"), true);
  assert.equal(spreadAsBoolean(true), true);
  assert.equal(spreadAsBoolean("false"), false);
  assert.equal(spreadAsBoolean(false), false);
  assert.equal(spreadAsBoolean(undefined), false);
  assert.equal(spreadAsBoolean(null), false);
});

test("detectBulletMarker finds the first bullet the document uses", () => {
  assert.equal(detectBulletMarker("# Title\n\n* a\n- b\n"), "*");
  assert.equal(detectBulletMarker("intro\n\n  + nested style\n"), "+");
  assert.equal(detectBulletMarker("> - quoted\n"), "-");
  assert.equal(detectBulletMarker("-\n"), "-");
});

test("detectBulletMarker defaults to - when there is no bullet list", () => {
  assert.equal(detectBulletMarker(""), "-");
  assert.equal(detectBulletMarker("Just text.\n\n1. ordered\n"), "-");
  assert.equal(detectBulletMarker("*emphasis* and **strong**\n"), "-");
});

test("detectBulletMarker skips thematic breaks and fenced code", () => {
  assert.equal(detectBulletMarker("* * *\n\n+ a\n"), "+");
  assert.equal(detectBulletMarker("---\n***\n- - -\n\n* a\n"), "*");
  assert.equal(detectBulletMarker("```\n* not a list\n```\n\n+ a\n"), "+");
  assert.equal(detectBulletMarker("~~~~\n* x\n~~~\n* y\n~~~~\n- a\n"), "-");
});
