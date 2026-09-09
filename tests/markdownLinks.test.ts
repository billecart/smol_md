import assert from "node:assert/strict";
import {
  MARKDOWN_LINK_INPUT,
  splitMarkdownLinks,
} from "../src/utils/markdownLinks";
import { test } from "./testHarness";

// The bug this guards: a typed or pasted `[label](url)` stayed plain text and
// was serialized as `\[label]\(https\://example.com)`, which never renders as
// a link and looks like corruption in Source mode.

test("input rule matches a link typed at the end of a line", () => {
  const match = "see [Test](https://example.com)".match(MARKDOWN_LINK_INPUT);

  assert.equal(match?.[1], "Test");
  assert.equal(match?.[2], "https://example.com");
});

test("input rule keeps percent escapes in the url", () => {
  const match = "[a](http://localhost:8899/Contacts%20Dashboard.html)".match(
    MARKDOWN_LINK_INPUT,
  );

  assert.equal(match?.[2], "http://localhost:8899/Contacts%20Dashboard.html");
});

test("input rule reads an optional title", () => {
  const match = '[a](https://example.com "A title")'.match(MARKDOWN_LINK_INPUT);

  assert.equal(match?.[2], "https://example.com");
  assert.equal(match?.[3], "A title");
});

test("input rule ignores a link that is not at the end of the line", () => {
  assert.equal("[a](https://example.com) trailing".match(MARKDOWN_LINK_INPUT), null);
});

test("input rule ignores brackets that are not a link", () => {
  assert.equal("[not a link] (spaced)".match(MARKDOWN_LINK_INPUT), null);
  assert.equal("[empty]()".match(MARKDOWN_LINK_INPUT), null);
  assert.equal("plain text".match(MARKDOWN_LINK_INPUT), null);
});

test("splitting returns null when there is no link to convert", () => {
  assert.equal(splitMarkdownLinks("just some words"), null);
  assert.equal(splitMarkdownLinks("[not a link] (spaced)"), null);
});

test("splitting separates a link from the text around it", () => {
  assert.deepEqual(splitMarkdownLinks("see [Test](https://example.com) here"), [
    { text: "see " },
    { text: "Test", href: "https://example.com", title: "" },
    { text: " here" },
  ]);
});

test("splitting handles several links in one paste", () => {
  assert.deepEqual(splitMarkdownLinks("[a](https://a.example) and [b](https://b.example)"), [
    { text: "a", href: "https://a.example", title: "" },
    { text: " and " },
    { text: "b", href: "https://b.example", title: "" },
  ]);
});

test("splitting keeps a title when one is given", () => {
  assert.deepEqual(splitMarkdownLinks('[a](https://example.com "T")'), [
    { text: "a", href: "https://example.com", title: "T" },
  ]);
});

test("splitting a bare link produces exactly one segment", () => {
  assert.deepEqual(splitMarkdownLinks("[Test](http://localhost:8899/a%20b.html)"), [
    { text: "Test", href: "http://localhost:8899/a%20b.html", title: "" },
  ]);
});
