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

test("word counter skips markdown syntax the reader does not see", () => {
  assert.equal(countWords("# Untitled\n\n"), 1);
  assert.equal(countWords("## Two words"), 2);
  assert.equal(countWords("- one\n- two"), 2);
  assert.equal(countWords("* one\n+ two"), 2);
  assert.equal(countWords("> quote here"), 2);
  assert.equal(countWords("1. first"), 1);
  assert.equal(countWords("> 2) nested first"), 2);
  assert.equal(countWords("---"), 0);
  assert.equal(countWords("***\n___\n==="), 0);
  assert.equal(countWords("- [ ] task"), 1);
  assert.equal(countWords("- [x] done"), 1);
  assert.equal(countWords("```\ncode here\n```"), 2);
  assert.equal(countWords("| a | b |\n|---|:---:|\n| c | d |"), 4);
});

test("word counter keeps real words that contain punctuation", () => {
  assert.equal(countWords("sci-fi"), 1);
  assert.equal(countWords("e.g."), 1);
  assert.equal(countWords("C# and #hashtag"), 3);
  assert.equal(countWords("**bold** _it_"), 2);
});

test("word counter keeps numbers that are not list markers", () => {
  assert.equal(countWords("in 2024."), 2);
  assert.equal(countWords("3.14 and 10:30"), 3);
  assert.equal(countWords("42"), 1);
});

test("character counter leaves out the same syntax as the word counter", () => {
  assert.equal(countCharacters("# Untitled\n\n"), "Untitled".length);
  assert.equal(countCharacters("- one\n- two"), "one two".length);
  assert.equal(countCharacters("---"), 0);
  assert.equal(countCharacters(""), 0);
});
