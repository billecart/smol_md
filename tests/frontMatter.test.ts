import assert from "node:assert/strict";
import { test } from "./testHarness";
import { splitFrontMatter } from "../src/utils/frontMatter";

test("YAML front matter is split off exactly, blank lines after it included", () => {
  const markdown = "---\ntitle: X\ntags:\n  - a\n---\n\n# Doc\n\nBody.\n";

  const { frontMatter, body } = splitFrontMatter(markdown);

  assert.equal(frontMatter, "---\ntitle: X\ntags:\n  - a\n---\n\n");
  assert.equal(body, "# Doc\n\nBody.\n");
  assert.equal(frontMatter + body, markdown);
});

test("TOML front matter and CRLF line endings are recognised too", () => {
  const markdown = "+++\r\ntitle = 'X'\r\n+++\r\n\r\nBody\r\n";

  const { frontMatter, body } = splitFrontMatter(markdown);

  assert.equal(body, "Body\r\n");
  assert.equal(frontMatter + body, markdown);
});

test("a file that starts with a rule, a paragraph and a rule has no front matter", () => {
  const markdown = "---\n\nJust a paragraph.\n\n---\n";

  assert.deepEqual(splitFrontMatter(markdown), { frontMatter: "", body: markdown });
});

test("a rule further down the file is not front matter", () => {
  const markdown = "# Doc\n\n---\n\ntext\n";

  assert.equal(splitFrontMatter(markdown).frontMatter, "");
});
