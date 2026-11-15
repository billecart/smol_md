import assert from "node:assert/strict";
import { setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import { wrapInList } from "@milkdown/kit/prose/schema-list";
import {
  blockquote, bulletList, codeBlock, doc, fakeView, heading, listItem,
  nodes, orderedList, outlineDoc, p, stateFrom, stateSelecting,
} from "./editorFixtures";
import {
  liftOutOfWrappers, makeBodyText, runBlockFormat, runListFormat,
} from "../src/utils/editorCommands";
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

// The reported bug: select a whole bulleted list, choose Numbered list, and
// nothing happened. wrapInList is for paragraphs; with several items selected
// it finds nothing to wrap and fails, and the failure was silent.
const threeBullets = () =>
  doc(bulletList(listItem(p("one")), listItem(p("two")), listItem(p("three"))));

test("numbered list converts a whole selected bullet list", () => {
  const view = fakeView(stateSelecting(threeBullets(), "one", "three"));

  runListFormat(view, nodes.ordered_list);

  assert.equal(
    outlineDoc(view.state.doc),
    'ordered_list(list_item(paragraph("one")), list_item(paragraph("two")), list_item(paragraph("three")))',
  );
});

test("numbered list converts the whole list from a selection of only some items", () => {
  const view = fakeView(stateSelecting(threeBullets(), "one", "two"));

  runListFormat(view, nodes.ordered_list);

  assert.equal(
    outlineDoc(view.state.doc),
    'ordered_list(list_item(paragraph("one")), list_item(paragraph("two")), list_item(paragraph("three")))',
  );
});

// This used to nest the item under the one above it as a one-item numbered
// list, rather than converting anything.
test("numbered list with the caret in a middle bullet converts the list", () => {
  const view = fakeView(
    stateFrom(doc(bulletList(listItem(p("one")), listItem(p("t<|>wo")), listItem(p("three"))))),
  );

  runListFormat(view, nodes.ordered_list);

  assert.equal(
    outlineDoc(view.state.doc),
    'ordered_list(list_item(paragraph("one")), list_item(paragraph("two")), list_item(paragraph("three")))',
  );
});

test("a converted list keeps the caret where it was", () => {
  const view = fakeView(
    stateFrom(doc(bulletList(listItem(p("one")), listItem(p("t<|>wo"))))),
  );
  const before = view.state.selection.from;

  runListFormat(view, nodes.ordered_list);

  assert.equal(view.state.selection.from, before);
});

// Milkdown shows an item's bullet or number from attrs on the item and treats
// a bullet_list whose items say "ordered" as an ordered list, so retyping the
// list alone would be undone straight away.
test("converting to a numbered list rewrites each item's label and kind", () => {
  const view = fakeView(stateSelecting(threeBullets(), "one", "three"));

  runListFormat(view, nodes.ordered_list);

  const items: [string, string][] = [];
  view.state.doc.descendants((node) => {
    if (node.type === nodes.list_item) items.push([node.attrs.listType, node.attrs.label]);
  });

  assert.deepEqual(items, [["ordered", "1."], ["ordered", "2."], ["ordered", "3."]]);
});

test("converting to a bullet list puts the bullets back on each item", () => {
  const numbered = fakeView(stateSelecting(threeBullets(), "one", "three"));
  runListFormat(numbered, nodes.ordered_list);
  runListFormat(numbered, nodes.bullet_list);

  const items: [string, string][] = [];
  numbered.state.doc.descendants((node) => {
    if (node.type === nodes.list_item) items.push([node.attrs.listType, node.attrs.label]);
  });

  assert.equal(
    outlineDoc(numbered.state.doc),
    'bullet_list(list_item(paragraph("one")), list_item(paragraph("two")), list_item(paragraph("three")))',
  );
  assert.deepEqual(items, [["bullet", "\u2022"], ["bullet", "\u2022"], ["bullet", "\u2022"]]);
});

test("a numbered list converts to a bullet list from a selection of all of it", () => {
  const view = fakeView(
    stateSelecting(
      doc(orderedList(listItem(p("one")), listItem(p("two")))),
      "one",
      "two",
    ),
  );

  runListFormat(view, nodes.bullet_list);

  assert.equal(
    outlineDoc(view.state.doc),
    'bullet_list(list_item(paragraph("one")), list_item(paragraph("two")))',
  );
});

// Only the list the selection is in changes: the one around it, and any
// nested below, keep their kind.
test("converting a nested list leaves the list around it alone", () => {
  const view = fakeView(
    stateFrom(
      doc(
        bulletList(
          listItem(p("one"), bulletList(listItem(p("<|>a")), listItem(p("b")))),
          listItem(p("two")),
        ),
      ),
    ),
  );

  runListFormat(view, nodes.ordered_list);

  assert.equal(
    outlineDoc(view.state.doc),
    'bullet_list(list_item(paragraph("one"), ordered_list(list_item(paragraph("a")), list_item(paragraph("b")))), list_item(paragraph("two")))',
  );
});

test("converting the outer list leaves nested lists as they were", () => {
  const view = fakeView(
    stateFrom(
      doc(
        bulletList(
          listItem(p("<|>one"), bulletList(listItem(p("a")))),
          listItem(p("two")),
        ),
      ),
    ),
  );

  runListFormat(view, nodes.ordered_list);

  assert.equal(
    outlineDoc(view.state.doc),
    'ordered_list(list_item(paragraph("one"), bullet_list(list_item(paragraph("a")))), list_item(paragraph("two")))',
  );
});

// It used to nest the item under the one above it, as a list inside a list.
test("choosing the kind a list already is changes nothing", () => {
  const view = fakeView(
    stateFrom(doc(bulletList(listItem(p("one")), listItem(p("t<|>wo"))))),
  );
  const before = outlineDoc(view.state.doc);

  assert.equal(runListFormat(view, nodes.bullet_list), true);
  assert.equal(outlineDoc(view.state.doc), before);
});

test("a paragraph outside any list is still wrapped in a new list", () => {
  const view = fakeView(stateFrom(doc(p("<|>hello"))));

  runListFormat(view, nodes.ordered_list);

  assert.equal(outlineDoc(view.state.doc), 'ordered_list(list_item(paragraph("hello")))');
});

// Every other block format failed the same way on a selected list: the
// selection was a range of list items, which a plain lift cannot move out.
test("body text on a selected bullet list removes all the bullets", () => {
  const view = fakeView(stateSelecting(threeBullets(), "one", "three"));

  makeBodyText(view, nodes.paragraph);

  assert.equal(
    outlineDoc(view.state.doc),
    'paragraph("one") | paragraph("two") | paragraph("three")',
  );
});

test("a blockquote wraps every item of a selected bullet list", () => {
  const view = fakeView(stateSelecting(threeBullets(), "one", "three"));

  runBlockFormat(view, wrapIn(nodes.blockquote));

  assert.equal(
    outlineDoc(view.state.doc),
    'blockquote(paragraph("one"), paragraph("two"), paragraph("three"))',
  );
});

test("a heading applies to every item of a selected bullet list", () => {
  const view = fakeView(stateSelecting(threeBullets(), "one", "three"));

  runBlockFormat(view, setBlockType(nodes.heading, { level: 2 }));

  assert.equal(
    outlineDoc(view.state.doc),
    'heading2("one") | heading2("two") | heading2("three")',
  );
});

test("a selection across a nested list's items is formatted, not just outdented", () => {
  const view = fakeView(
    stateSelecting(
      doc(
        bulletList(
          listItem(p("one"), bulletList(listItem(p("a")), listItem(p("b")))),
          listItem(p("two")),
        ),
      ),
      "a",
      "b",
    ),
  );

  runBlockFormat(view, setBlockType(nodes.code_block));

  assert.equal(
    outlineDoc(view.state.doc),
    'bullet_list(list_item(paragraph("one"))) | code_block("a") | code_block("b") | bullet_list(list_item(paragraph("two")))',
  );
});

// A format that cannot be applied used to leave the lifting it had already
// done behind, so the menu item "did nothing" except pull the item out of its
// list. Failing now means failing cleanly.
test("a block format that cannot apply leaves the document exactly as it was", () => {
  const view = fakeView(
    stateFrom(
      doc(bulletList(listItem(p("one"), bulletList(listItem(p("<|>a")), listItem(p("b")))))),
    ),
  );
  const before = outlineDoc(view.state.doc);

  assert.equal(runBlockFormat(view, () => false), false);
  assert.equal(outlineDoc(view.state.doc), before);
});

test("a block format is a single transaction however many steps it took", () => {
  const view = fakeView(stateFrom(doc(blockquote(bulletList(listItem(p("<|>hello")))))));
  let dispatched = 0;
  const dispatch = view.dispatch;
  view.dispatch = (tr) => {
    dispatched += 1;
    dispatch(tr);
  };

  runBlockFormat(view, setBlockType(nodes.heading, { level: 1 }));

  assert.equal(outlineDoc(view.state.doc), 'heading1("hello")');
  assert.equal(dispatched, 1);
});
