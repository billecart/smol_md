import assert from "node:assert/strict";
import { Fragment, Slice } from "@milkdown/kit/prose/model";
import { codeBlock, link, marks, p, schema } from "./editorFixtures";
import {
  isPlainTextHtml,
  linkifySlice,
  MARKDOWN_LINK_INPUT,
  normalizeExternalUrl,
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

// A URL pasted from the address bar stayed plain text in Rich mode.
test("splitting turns a pasted bare URL into a link", () => {
  const url = "https://www.youtube.com/watch?v=HZft_U4Fc-U";
  assert.deepEqual(splitMarkdownLinks(url), [{ text: url, href: url, title: "" }]);
});

test("splitting leaves sentence punctuation after a bare URL outside the link", () => {
  assert.deepEqual(splitMarkdownLinks("see https://example.com/a, then (https://b.example)."), [
    { text: "see " },
    { text: "https://example.com/a", href: "https://example.com/a", title: "" },
    { text: ", then (" },
    { text: "https://b.example", href: "https://b.example", title: "" },
    { text: ")." },
  ]);
});

test("splitting keeps a paren the URL itself opened", () => {
  const url = "https://en.wikipedia.org/wiki/Mir_(disambiguation)";
  assert.deepEqual(splitMarkdownLinks(url), [{ text: url, href: url, title: "" }]);
});

test("splitting handles a bare URL next to a markdown link", () => {
  assert.deepEqual(splitMarkdownLinks("[a](https://a.example) or https://b.example"), [
    { text: "a", href: "https://a.example", title: "" },
    { text: " or " },
    { text: "https://b.example", href: "https://b.example", title: "" },
  ]);
});

test("splitting ignores hostnames without a scheme and an empty scheme", () => {
  assert.equal(splitMarkdownLinks("example.com and www.example.com"), null);
  assert.equal(splitMarkdownLinks("https:// nothing"), null);
});

// The real clipboard from the report: an HTML copy that is just the URL.
test("html that is only a charset tag and text counts as plain text", () => {
  assert.equal(
    isPlainTextHtml("<meta charset='utf-8'>https://www.youtube.com/watch?v=HZft_U4Fc-U"),
    true,
  );
  assert.equal(isPlainTextHtml("a & b"), true);
});

test("html with real markup is left to the rich-text paste", () => {
  assert.equal(isPlainTextHtml("<meta charset='utf-8'><b>bold</b>"), false);
  assert.equal(isPlainTextHtml('<a href="https://a.example">a</a>'), false);
  assert.equal(isPlainTextHtml("line<br>line"), false);
  assert.equal(isPlainTextHtml("<!-- StartFragment -->x"), false);
});

test("normalizeExternalUrl handles schemes and bare hostnames", () => {
  assert.equal(normalizeExternalUrl("https://example.com"), "https://example.com");
  assert.equal(normalizeExternalUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeExternalUrl("mailto:contact@example.com"), "mailto:contact@example.com");
  assert.equal(normalizeExternalUrl("example.com/test"), "https://example.com/test");
  assert.equal(normalizeExternalUrl("  proz.com  "), "https://proz.com");
  assert.equal(normalizeExternalUrl(""), null);
  assert.equal(normalizeExternalUrl("   "), null);
});

test("an image is not read as a link", () => {
  assert.equal(splitMarkdownLinks("See ![diagram](img/arch.png) here"), null);
  assert.equal("![diagram](img/arch.png)".match(MARKDOWN_LINK_INPUT), null);
});

test("a link next to an image is still found", () => {
  const segments = splitMarkdownLinks("![a](a.png) and [b](https://b.example)");

  assert.deepEqual(
    segments?.filter((segment) => segment.href).map((segment) => segment.href),
    ["https://b.example"],
  );
});

// In the packaged app WebKit rewrites even a lone copied URL into its own
// HTML, so links have to be found in the parsed paste rather than the
// clipboard text.
test("a pasted slice gets its bare URLs linked", () => {
  const url = "https://www.youtube.com/watch?v=HZft_U4Fc-U";
  const slice = new Slice(Fragment.from(p(`watch ${url} now`)), 1, 1);

  const result = linkifySlice(slice, marks.link);

  assert.ok(result.content.eq(Fragment.from(p("watch ", link(url, url), " now"))));
});

test("a pasted slice with no bare URL is returned unchanged", () => {
  const slice = new Slice(Fragment.from(p("plain words")), 1, 1);
  assert.equal(linkifySlice(slice, marks.link), slice);
});

test("URLs that are already links or are code stay as they are", () => {
  const linked = new Slice(
    Fragment.from(p(link("https://a.example", "https://a.example"))),
    1,
    1,
  );
  assert.equal(linkifySlice(linked, marks.link), linked);

  const code = new Slice(Fragment.from(codeBlock("https://a.example")), 0, 0);
  assert.equal(linkifySlice(code, marks.link), code);
});

test("bold stays on a URL that gets linked", () => {
  const url = "https://a.example";
  const slice = new Slice(
    Fragment.from(p(schema.text(url, [marks.strong.create()]))),
    1,
    1,
  );

  const text = linkifySlice(slice, marks.link).content.firstChild?.firstChild;
  assert.deepEqual(text?.marks.map((mark) => mark.type.name).sort(), ["link", "strong"]);
});

