import assert from "node:assert/strict";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  bulletList, doc, heading, listItem, nodes, orderedList, outlineDoc, p, runCommand, stateFrom,
} from "./editorFixtures";
import {
  backspaceMergesHeadingAsBodyText,
  backspaceOutdentsListItem,
  chainCommands,
  enterLeavesEmptyListItem,
  isAtStartOfListItem,
  isInEmptyListItem,
} from "../src/utils/editorCommands";
import { test } from "./testHarness";

// User-reported bug: backspace at the beginning of a bullet line made the
// bullet vanish without outdenting the line.
test("backspace at the start of a bullet outdents it", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>hello")))));

  assert.equal(isAtStartOfListItem(state, nodes.list_item), true);

  const result = runCommand(state, liftListItem(nodes.list_item));
  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), 'paragraph("hello")');
});

test("caret in the middle of a bullet's text is not at the start", () => {
  const state = stateFrom(doc(bulletList(listItem(p("hel<|>lo")))));

  assert.equal(isAtStartOfListItem(state, nodes.list_item), false);
});

test("caret at the end of a bullet's text is not at the start", () => {
  const state = stateFrom(doc(bulletList(listItem(p("hello<|>")))));

  assert.equal(isAtStartOfListItem(state, nodes.list_item), false);
});

test("a non-empty selection at the start of a bullet is not at the start", () => {
  const collapsed = stateFrom(doc(bulletList(listItem(p("<|>hello")))));
  const from = collapsed.selection.from;
  const state = collapsed.apply(
    collapsed.tr.setSelection(TextSelection.create(collapsed.doc, from, from + 2)),
  );

  assert.equal(isAtStartOfListItem(state, nodes.list_item), false);
});

test("caret at the start of a plain paragraph outside a list is not at the start of a list item", () => {
  const state = stateFrom(doc(p("<|>hello")));

  assert.equal(isAtStartOfListItem(state, nodes.list_item), false);
});

test("caret in the second paragraph of a list item is not at the start", () => {
  const state = stateFrom(doc(bulletList(listItem(p("first"), p("<|>second")))));

  assert.equal(isAtStartOfListItem(state, nodes.list_item), false);
});

// User-reported bug: pressing enter at the start of an empty bullet line
// should turn it into body text instead of adding another empty bullet.
test("enter in an empty bullet lifts it out of the list", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>")))));

  assert.equal(isInEmptyListItem(state, nodes.list_item), true);

  const result = runCommand(state, liftListItem(nodes.list_item));
  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), "paragraph");
});

test("a bullet with text is not empty", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>hello")))));

  assert.equal(isInEmptyListItem(state, nodes.list_item), false);
});

test("the predicates treat an ordered list item the same as a bullet", () => {
  const atStart = stateFrom(doc(orderedList(listItem(p("<|>hello")))));
  assert.equal(isAtStartOfListItem(atStart, nodes.list_item), true);

  const empty = stateFrom(doc(orderedList(listItem(p("<|>")))));
  assert.equal(isInEmptyListItem(empty, nodes.list_item), true);
});

// Only the immediate list item should absorb the outdent - a deeper nested
// item should step out one level, not jump straight to a top-level paragraph.
test("backspace at the start of a nested list item outdents one level", () => {
  const state = stateFrom(
    doc(bulletList(listItem(p("outer"), bulletList(listItem(p("<|>inner")))))),
  );

  assert.equal(isAtStartOfListItem(state, nodes.list_item), true);

  const result = runCommand(state, liftListItem(nodes.list_item));
  assert.equal(result.handled, true);
  assert.equal(
    outlineDoc(result.doc),
    'bullet_list(list_item(paragraph("outer")), list_item(paragraph("inner")))',
  );
});

// The tests above check the predicate and the lift separately, which leaves
// the composition untested: inverting the condition in the key handler would
// keep every one of them green. These drive the handlers themselves.

test("the backspace handler declines the key away from the start of a bullet", () => {
  const state = stateFrom(doc(bulletList(listItem(p("hel<|>lo")))));

  const result = runCommand(state, backspaceOutdentsListItem(nodes.list_item));

  // Declining is the point: the default delete has to run, or backspace stops
  // deleting characters inside bullets entirely.
  assert.equal(result.handled, false);
  assert.equal(outlineDoc(result.doc), 'bullet_list(list_item(paragraph("hello")))');
});

test("the backspace handler claims the key at the start of a bullet and outdents", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>hello")))));

  const result = runCommand(state, backspaceOutdentsListItem(nodes.list_item));

  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), 'paragraph("hello")');
});

test("the enter handler declines the key in a bullet that has text", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>hello")))));

  const result = runCommand(state, enterLeavesEmptyListItem(nodes.list_item));

  assert.equal(result.handled, false);
  assert.equal(outlineDoc(result.doc), 'bullet_list(list_item(paragraph("hello")))');
});

test("the enter handler claims the key in an empty bullet and leaves the list", () => {
  const state = stateFrom(doc(bulletList(listItem(p("<|>")))));

  const result = runCommand(state, enterLeavesEmptyListItem(nodes.list_item));

  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), "paragraph");
});

test("neither handler claims a key outside a list", () => {
  const state = stateFrom(doc(p("<|>hello")));

  assert.equal(runCommand(state, backspaceOutdentsListItem(nodes.list_item)).handled, false);
  assert.equal(runCommand(state, enterLeavesEmptyListItem(nodes.list_item)).handled, false);
});

// Backspace at the start of a paragraph after a heading used to pull the whole
// paragraph into the heading, so a paragraph of body text suddenly rendered at
// heading size. It now demotes the heading instead.

test("backspace after a heading joins as body text, not as a heading", () => {
  const state = stateFrom(doc(heading(1, "Head"), p("<|>Body text")));

  const result = runCommand(
    state,
    backspaceMergesHeadingAsBodyText(nodes.heading, nodes.paragraph),
  );

  assert.equal(result.handled, true);
  assert.equal(outlineDoc(result.doc), 'paragraph("HeadBody text")');
});

// A blank line under a heading should just go away. Demoting the heading here
// would destroy it for pressing backspace on an empty line.
test("backspace on an empty line under a heading is left to the default", () => {
  const state = stateFrom(doc(heading(1, "Head"), p("<|>")));

  const result = runCommand(
    state,
    backspaceMergesHeadingAsBodyText(nodes.heading, nodes.paragraph),
  );

  assert.equal(result.handled, false);
  assert.equal(outlineDoc(result.doc), 'heading1("Head") | paragraph');
});

test("backspace mid-paragraph is left to the default", () => {
  const state = stateFrom(doc(heading(1, "Head"), p("Body<|>text")));

  assert.equal(
    runCommand(state, backspaceMergesHeadingAsBodyText(nodes.heading, nodes.paragraph)).handled,
    false,
  );
});

test("backspace after an ordinary paragraph is left to the default", () => {
  const state = stateFrom(doc(p("First"), p("<|>Second")));

  assert.equal(
    runCommand(state, backspaceMergesHeadingAsBodyText(nodes.heading, nodes.paragraph)).handled,
    false,
  );
});

test("backspace in the first block of the document is left to the default", () => {
  const state = stateFrom(doc(p("<|>Only")));

  assert.equal(
    runCommand(state, backspaceMergesHeadingAsBodyText(nodes.heading, nodes.paragraph)).handled,
    false,
  );
});

// One keystroke has to cost one undo, so the demote and the join share a
// transaction rather than being dispatched separately.
test("demoting and joining happen in a single transaction", () => {
  const state = stateFrom(doc(heading(2, "Head"), p("<|>Body")));
  let dispatches = 0;

  backspaceMergesHeadingAsBodyText(nodes.heading, nodes.paragraph)(state, () => {
    dispatches += 1;
  });

  assert.equal(dispatches, 1);
});

test("chained commands stop at the first one that claims the key", () => {
  const calls: string[] = [];
  const claim = (name: string, handled: boolean) => () => {
    calls.push(name);
    return handled;
  };

  const result = chainCommands(claim("a", false), claim("b", true), claim("c", true))(
    stateFrom(doc(p("<|>x"))),
  );

  assert.equal(result, true);
  assert.deepEqual(calls, ["a", "b"]);
});
