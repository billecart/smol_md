import assert from "node:assert/strict";
import {
  blockquote,
  bulletList,
  codeBlock,
  doc,
  heading,
  link,
  listItem,
  marks,
  nodes,
  fakeView,
  outlineDoc,
  p,
  runCommand,
  schema,
  stateFrom,
} from "./editorFixtures";
import {
  findLinkAt,
  makeBodyText,
  removeLinkAt,
  updateLinkAt,
} from "../src/utils/editorCommands";
import { test } from "./testHarness";

function linkedAndBold(text: string, href: string) {
  return schema.text(text, [
    marks.link.create({ href, title: "" }),
    marks.strong.create(),
  ]);
}

// Body text was the one block format with no menu item, which made a heading a
// one-way door.

test("body text turns a heading into a paragraph", () => {
  const state = stateFrom(doc(heading(1, "Title<|>")));

  const view = fakeView(state);
  makeBodyText(view, nodes.paragraph);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("Title")');
});

// A list item already contains a paragraph, so setting the block type alone
// succeeds without changing anything and the menu item looks broken. It has to
// lift out of the list first.
test("body text on a bullet removes the bullet", () => {
  const state = stateFrom(doc(bulletList(listItem(p("a bullet<|>")))));

  const view = fakeView(state);
  makeBodyText(view, nodes.paragraph);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("a bullet")');
});

test("body text lifts out of a blockquote", () => {
  const state = stateFrom(doc(blockquote(p("quoted<|>"))));

  const view = fakeView(state);
  makeBodyText(view, nodes.paragraph);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("quoted")');
});

test("body text turns a code block into a paragraph", () => {
  const state = stateFrom(doc(codeBlock("code<|>")));

  const view = fakeView(state);
  makeBodyText(view, nodes.paragraph);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("code")');
});

test("body text leaves an ordinary paragraph alone", () => {
  const state = stateFrom(doc(p("plain<|>")));

  const view = fakeView(state);
  makeBodyText(view, nodes.paragraph);

  assert.equal(outlineDoc(view.state.doc), 'paragraph("plain")');
});

test("finding a link returns its whole range and href", () => {
  const state = stateFrom(doc(p("go ", link("here", "https://example.com"), " now")));
  const inside = state.doc.resolve(1).pos + 5;

  const found = findLinkAt(state, marks.link, inside);

  assert.equal(found?.href, "https://example.com");
  assert.equal(state.doc.textBetween(found!.from, found!.to), "here");
});

// A link containing a bold word is several text nodes carrying the same mark.
// Editing has to treat them as one link, or it rewrites half of it.
test("a link split by another mark is still found as one link", () => {
  const state = stateFrom(
    doc(p(link("one ", "https://example.com"), linkedAndBold("two", "https://example.com"))),
  );

  const found = findLinkAt(state, marks.link, 2);

  assert.equal(state.doc.textBetween(found!.from, found!.to), "one two");
});

test("two different links side by side are not merged", () => {
  const state = stateFrom(
    doc(p(link("first", "https://a.example"), link("second", "https://b.example"))),
  );

  const found = findLinkAt(state, marks.link, 2);

  assert.equal(found?.href, "https://a.example");
  assert.equal(state.doc.textBetween(found!.from, found!.to), "first");
});

test("no link is found in plain text", () => {
  const state = stateFrom(doc(p("nothing here")));

  assert.equal(findLinkAt(state, marks.link, 3), null);
});

test("removing a link keeps the text", () => {
  const state = stateFrom(doc(p("go ", link("here", "https://example.com"))));

  const result = runCommand(state, (s, dispatch) =>
    removeLinkAt(s, marks.link, 5, dispatch),
  );

  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), 'paragraph("go here")');
});

test("removing a link off a link does nothing", () => {
  const state = stateFrom(doc(p("no link here")));

  const result = runCommand(state, (s, dispatch) =>
    removeLinkAt(s, marks.link, 3, dispatch),
  );

  assert.equal(result.handled, false);
});

test("updating a link changes the href and keeps the text", () => {
  const state = stateFrom(doc(p(link("here", "https://old.example"))));

  const result = runCommand(state, (s, dispatch) =>
    updateLinkAt(s, marks.link, 2, "https://new.example", dispatch),
  );

  assert.equal(result.handled, true);

  const found = findLinkAt(result.state, marks.link, 2);
  assert.equal(found?.href, "https://new.example");
  assert.equal(result.doc.textContent, "here");
});

test("updating a link rewrites all of it when it is split by another mark", () => {
  const state = stateFrom(
    doc(p(link("one ", "https://old.example"), linkedAndBold("two", "https://old.example"))),
  );

  const result = runCommand(state, (s, dispatch) =>
    updateLinkAt(s, marks.link, 2, "https://new.example", dispatch),
  );

  const found = findLinkAt(result.state, marks.link, 2);

  assert.equal(found?.href, "https://new.example");
  assert.equal(result.state.doc.textBetween(found!.from, found!.to), "one two");
});
