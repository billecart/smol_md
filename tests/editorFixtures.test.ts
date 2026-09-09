import assert from "node:assert/strict";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import {
  bulletList, doc, listItem, outlineDoc, p, runCommand, stateFrom, nodes, heading,
} from "./editorFixtures";
import { isAtStartOfListItem } from "../src/utils/editorCommands";
import { test } from "./testHarness";

test("the cursor marker lands where written", () => {
  const state = stateFrom(doc(p("hel<|>lo")));
  assert.equal(state.doc.textContent, "hello");
  assert.equal(state.selection.$from.parentOffset, 3);
});

test("outline renders a readable shape", () => {
  assert.equal(outlineDoc(doc(heading(2, "T"), p("x"))), 'heading2("T") | paragraph("x")');
});

test("the backspace predicate plus lift outdents a bullet", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>hello")))));
  assert.equal(isAtStartOfListItem(state, nodes.list_item), true);
  const result = runCommand(state, liftListItem(nodes.list_item));
  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), 'paragraph("hello")');
});
