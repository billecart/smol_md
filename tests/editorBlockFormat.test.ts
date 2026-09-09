import assert from "node:assert/strict";
import { setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import { wrapInList } from "@milkdown/kit/prose/schema-list";
import {
  blockquote, bulletList, codeBlock, doc, fakeView, heading, listItem,
  nodes, orderedList, outlineDoc, p, stateFrom,
} from "./editorFixtures";
import { liftOutOfWrappers, runBlockFormat } from "../src/utils/editorCommands";
import { test } from "./testHarness";

test("liftOutOfWrappers takes a paragraph out of a bullet list", () => {
  const view = fakeView(stateFrom(doc(bulletList(listItem(p("<|>hello"))))));

  liftOutOfWrappers(view);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("hello")');
});

test("liftOutOfWrappers takes a paragraph out of a blockquote", () => {
  const view = fakeView(stateFrom(doc(blockquote(p("<|>hello")))));

  liftOutOfWrappers(view);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("hello")');
});

// The loop has to run more than once here: the first lift only escapes the
// innermost wrapper, leaving the other one still around the paragraph.
test("liftOutOfWrappers escapes both a blockquote and a list at once", () => {
  const view = fakeView(
    stateFrom(doc(blockquote(bulletList(listItem(p("<|>hello")))))),
  );

  liftOutOfWrappers(view);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("hello")');
});

test("liftOutOfWrappers leaves a top-level paragraph alone", () => {
  const view = fakeView(stateFrom(doc(p("<|>hello"))));
  const before = outlineDoc(view.state.doc);

  liftOutOfWrappers(view);

  assert.equal(outlineDoc(view.state.doc), before);
});

// This is the reported bug: picking "Heading" from the right-click menu on a
// bullet item did nothing, because setBlockType alone can't touch a node
// that's the first (and only) child of a list_item. runBlockFormat's second
// attempt, after lifting out of the list, is what makes it work.
test("a bullet item converts to a heading", () => {
  const view = fakeView(stateFrom(doc(bulletList(listItem(p("<|>hello"))))));

  runBlockFormat(view, setBlockType(nodes.heading, { level: 1 }));

  assert.equal(outlineDoc(view.state.doc), 'heading1("hello")');
});

test("a plain paragraph converts to a heading on the first attempt", () => {
  const view = fakeView(stateFrom(doc(p("<|>hello"))));

  runBlockFormat(view, setBlockType(nodes.heading, { level: 2 }));

  assert.equal(outlineDoc(view.state.doc), 'heading2("hello")');
});

// A heading can't be the first child of a list_item (its content is
// "paragraph block*"), so wrapping one in a list only succeeds once
// runBlockFormat has flattened it to a paragraph.
test("wrapping a heading in a bullet list flattens it to a paragraph first", () => {
  const view = fakeView(stateFrom(doc(heading(1, "<|>hello"))));

  runBlockFormat(view, wrapInList(nodes.bullet_list));

  assert.equal(outlineDoc(view.state.doc), 'bullet_list(list_item(paragraph("hello")))');
});

test("a blockquote's paragraph converts to a code block", () => {
  const view = fakeView(stateFrom(doc(blockquote(p("<|>hello")))));

  runBlockFormat(view, setBlockType(nodes.code_block));

  assert.equal(outlineDoc(view.state.doc), 'blockquote(code_block("hello"))');
});

test("a code block converts back to a paragraph", () => {
  const view = fakeView(stateFrom(doc(codeBlock("<|>hello"))));

  runBlockFormat(view, setBlockType(nodes.paragraph));

  assert.equal(outlineDoc(view.state.doc), 'paragraph("hello")');
});

test("a code block converts to a heading", () => {
  const view = fakeView(stateFrom(doc(codeBlock("<|>hello"))));

  runBlockFormat(view, setBlockType(nodes.heading, { level: 3 }));

  assert.equal(outlineDoc(view.state.doc), 'heading3("hello")');
});

// Converting list type has to go through the same lift-then-wrap escalation
// as the heading case: a lone list_item can't be rewrapped in place, so it
// only becomes an ordered list once it has been lifted back out to a plain
// paragraph.
test("a bullet item converts to an ordered list item", () => {
  const view = fakeView(stateFrom(doc(bulletList(listItem(p("<|>hello"))))));

  runBlockFormat(view, wrapInList(nodes.ordered_list));

  assert.equal(outlineDoc(view.state.doc), 'ordered_list(list_item(paragraph("hello")))');
});

test("a bullet list converts to a blockquote", () => {
  const view = fakeView(stateFrom(doc(bulletList(listItem(p("<|>hello"))))));

  runBlockFormat(view, wrapIn(nodes.blockquote));

  assert.equal(outlineDoc(view.state.doc), 'blockquote(paragraph("hello"))');
});

test("an ordered list item converts to a bullet list item", () => {
  const view = fakeView(stateFrom(doc(orderedList(listItem(p("<|>hello"))))));

  runBlockFormat(view, wrapInList(nodes.bullet_list));

  assert.equal(outlineDoc(view.state.doc), 'bullet_list(list_item(paragraph("hello")))');
});
