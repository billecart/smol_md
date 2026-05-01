import assert from "node:assert/strict";
import { test } from "./testHarness";
import { countCharacters, countWords } from "../src/utils/editorStats";

test("word counter updates from markdown text", () => {
  assert.equal(countWords("one two"), 2);
  assert.equal(countWords("one two three"), 3);
});

test("word counter handles cyrillic text", () => {
  assert.equal(countWords("Привет мир"), 2);
});

test("character counter updates from markdown text", () => {
  assert.equal(countCharacters("abc"), 3);
  assert.equal(countCharacters("Привет"), 6);
});
