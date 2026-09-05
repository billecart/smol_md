import assert from "node:assert/strict";
import { test } from "./testHarness";
import { findMatchOffsets, lineIndexAtOffset } from "../src/utils/findMatches";

test("finding matches ignores letter case", () => {
  const text = "Alpha alpha ALPHA";

  const offsets = findMatchOffsets(text, "alpha");

  assert.deepEqual(offsets, [0, 6, 12]);
});

test("finding matches does not overlap repeated text", () => {
  const text = "aaaa";

  const offsets = findMatchOffsets(text, "aa");

  assert.deepEqual(offsets, [0, 2]);
});

test("an empty query matches nothing", () => {
  const text = "some words here";

  const offsets = findMatchOffsets(text, "");

  assert.deepEqual(offsets, []);
});

test("a query with no matches returns no offsets", () => {
  const text = "some words here";

  const offsets = findMatchOffsets(text, "absent");

  assert.deepEqual(offsets, []);
});

test("finding matches works on cyrillic text", () => {
  const text = "Заметка заметка";

  const offsets = findMatchOffsets(text, "заметка");

  assert.deepEqual(offsets, [0, 8]);
});

test("a match on the first line reports line zero", () => {
  const text = "first\nsecond\nthird";

  const line = lineIndexAtOffset(text, 2);

  assert.equal(line, 0);
});

test("a match after two line breaks reports the third line", () => {
  const text = "first\nsecond\nthird";

  const line = lineIndexAtOffset(text, text.indexOf("third"));

  assert.equal(line, 2);
});
