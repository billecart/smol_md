import assert from "node:assert/strict";
import { test } from "./testHarness";
import { extractHeadings } from "../src/utils/tableOfContents";

test("heading entries strip inline emphasis from the navigable text", () => {
  const markdown = "# **Bold** heading\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries[0].plainText, "Bold heading");
});

test("heading entries strip inline code from the navigable text", () => {
  const markdown = "# Use `npm install` first\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries[0].plainText, "Use npm install first");
});

test("heading entries strip link syntax from the navigable text", () => {
  const markdown = "# See [Link](https://example.com) for more\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries[0].plainText, "See Link for more");
});

test("repeated heading text is distinguished by occurrence", () => {
  const markdown = "# Setup\n\nSome text\n\n# Setup\n";

  const entries = extractHeadings(markdown);

  assert.deepEqual(
    entries.map((entry) => entry.occurrence),
    [0, 1],
  );
});

test("setext headings are collected", () => {
  const markdown = "Title\n=====\n\nSubtitle\n--------\n";

  const entries = extractHeadings(markdown);

  assert.deepEqual(
    entries.map((entry) => ({ level: entry.level, plainText: entry.plainText })),
    [
      { level: 1, plainText: "Title" },
      { level: 2, plainText: "Subtitle" },
    ],
  );
});

test("a setext underline is not collected when the preceding line is blank", () => {
  const markdown = "Paragraph text.\n\n---\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries.length, 0);
});

test("trailing hashes are removed from heading text", () => {
  const markdown = "# Heading ##\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries[0].plainText, "Heading");
});

test("headings inside fenced code blocks are ignored", () => {
  const markdown = "```\n# Not a heading\n```\n\n# Real heading\n";

  const entries = extractHeadings(markdown);

  assert.deepEqual(
    entries.map((entry) => entry.plainText),
    ["Real heading"],
  );
});

test("headings inside indented code blocks are ignored", () => {
  const markdown = "    # Not a heading\n\n# Real heading\n";

  const entries = extractHeadings(markdown);

  assert.deepEqual(
    entries.map((entry) => entry.plainText),
    ["Real heading"],
  );
});

test("a hash without a following space is not a heading", () => {
  const markdown = "#NoSpace\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries.length, 0);
});

test("seven hashes are not a heading", () => {
  const markdown = "####### Seven hashes\n";

  const entries = extractHeadings(markdown);

  assert.equal(entries.length, 0);
});
