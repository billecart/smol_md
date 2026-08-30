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

test("word counting handles a document with no whitespace", () => {
  const markdown = "onelongwordwithnospaces";

  const words = countWords(markdown);

  assert.equal(words, 1);
});

test("word counting handles leading and trailing whitespace", () => {
  const markdown = "  \n\t one two three \t\n  ";

  const words = countWords(markdown);

  assert.equal(words, 3);
});

test("word counting does not allocate an array of every word", () => {
  const markdown = "lorem ipsum dolor sit amet ".repeat(80000);

  globalThis.gc?.();
  const before = process.memoryUsage().heapUsed;
  countWords(markdown);
  const after = process.memoryUsage().heapUsed;

  const deltaMb = (after - before) / (1024 * 1024);
  const description =
    deltaMb < 8 ? "within budget" : `${deltaMb.toFixed(2)}MB exceeds 8MB budget`;

  assert.equal(description, "within budget");
});
