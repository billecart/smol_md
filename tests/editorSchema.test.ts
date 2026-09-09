import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  linkSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
} from "@milkdown/kit/preset/commonmark";
import { schema } from "./editorFixtures";
import { test } from "./testHarness";

// The editor command tests run against the stand-in schema in
// editorFixtures.ts rather than Milkdown's own, because building Milkdown's
// needs a DOM. That buys fast headless tests and costs one risk: if Milkdown
// renamed a node, those tests would keep passing against names the real
// editor no longer uses, and the app would break with the suite still green.
//
// So pin the names. Milkdown exposes each node's name on the schema object's
// ctx key, which is readable without constructing an editor.
const milkdownNodeNames = {
  paragraph: paragraphSchema,
  heading: headingSchema,
  blockquote: blockquoteSchema,
  code_block: codeBlockSchema,
  bullet_list: bulletListSchema,
  ordered_list: orderedListSchema,
  list_item: listItemSchema,
};

test("the stand-in schema uses Milkdown's real node names", () => {
  const mismatched = Object.entries(milkdownNodeNames)
    .filter(([expected, milkdown]) => (milkdown as any).key.name !== expected)
    .map(([expected, milkdown]) => `${expected} is now ${(milkdown as any).key.name}`);

  assert.deepEqual(mismatched, []);
});

test("every pinned node exists in the stand-in schema", () => {
  const missing = Object.keys(milkdownNodeNames).filter(
    (name) => !schema.nodes[name],
  );

  assert.deepEqual(missing, []);
});

test("the stand-in schema uses Milkdown's real link mark name", () => {
  const name = (linkSchema as any).key.name;

  assert.equal(name, "link");
  assert.equal(Boolean(schema.marks[name]), true);
});

// liftOutOfWrappers decides what counts as a wrapper by comparing node type
// names as strings, so a rename would make it silently stop lifting rather
// than fail loudly.
test("the wrapper names liftOutOfWrappers matches on are the real ones", () => {
  const source = readFileSync(
    join(process.cwd(), "src/utils/editorCommands.ts"),
    "utf8",
  );

  const matched = Array.from(source.matchAll(/name === "([a-z_]+)"/g)).map(
    (match) => match[1]!,
  );

  assert.deepEqual(matched.sort(), ["blockquote", "list_item"]);
  assert.equal((blockquoteSchema as any).key.name, "blockquote");
  assert.equal((listItemSchema as any).key.name, "list_item");
});
