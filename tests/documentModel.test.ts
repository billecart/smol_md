import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  createDocument,
  createLoadedDocument,
  markDocumentSaved,
  requiresDiscardConfirmation,
  setDocumentMarkdown,
} from "../src/utils/documentModel";
import { normalizeMarkdownLineBreaks } from "../src/utils/markdown";
import {
  isUnsafeEmptyOverwrite,
} from "../src/utils/saveSafety";

test("dirty state becomes true after edits", () => {
  const document = createDocument({ markdown: "# A\n", originalMarkdown: "# A\n" });

  const edited = setDocumentMarkdown(document, "# A\n\nChanged");

  assert.equal(edited.isDirty, true);
});

test("dirty state becomes false after successful save", () => {
  const document = setDocumentMarkdown(
    createDocument({ markdown: "# A\n", originalMarkdown: "# A\n" }),
    "# A\n\nChanged",
  );

  const saved = markDocumentSaved(document, document.markdown, "C:\\Notes\\a.md");

  assert.equal(saved.isDirty, false);
  assert.equal(saved.originalMarkdown, "# A\n\nChanged");
});

test("save as updates the current file path and file name", () => {
  const document = createDocument({ markdown: "# Draft\n", originalMarkdown: "# Draft\n" });

  const saved = markDocumentSaved(
    document,
    document.markdown,
    "C:\\Notes\\final.md",
    "final.md",
  );

  assert.equal(saved.filePath, "C:\\Notes\\final.md");
  assert.equal(saved.fileName, "final.md");
});

test("closing a dirty tab warns the user", () => {
  assert.equal(requiresDiscardConfirmation({ isDirty: true }), true);
  assert.equal(requiresDiscardConfirmation({ isDirty: false }), false);
});

test("each tab keeps its own markdown and dirty state", () => {
  const first = createDocument({
    filePath: "C:\\Notes\\one.md",
    fileName: "one.md",
    markdown: "# One\n",
    originalMarkdown: "# One\n",
  });
  const second = createDocument({
    filePath: "C:\\Notes\\two.md",
    fileName: "two.md",
    markdown: "# Two\n",
    originalMarkdown: "# Two\n",
  });

  const editedFirst = setDocumentMarkdown(first, "# One\n\nChanged");

  assert.equal(editedFirst.markdown, "# One\n\nChanged");
  assert.equal(editedFirst.isDirty, true);
  assert.equal(second.markdown, "# Two\n");
  assert.equal(second.isDirty, false);
});

test("rich source rich shared markdown path preserves content", () => {
  const markdown = "# Title\n\nПривет `code`\n";

  const source = normalizeMarkdownLineBreaks(markdown);
  const richAgain = normalizeMarkdownLineBreaks(source);

  assert.equal(richAgain, markdown);
});

test("source rich source shared markdown path preserves content", () => {
  const markdown = "# Title\n\n```js\nconsole.log(\"hello\");\n```\n";

  const rich = normalizeMarkdownLineBreaks(markdown);
  const sourceAgain = normalizeMarkdownLineBreaks(rich);

  assert.equal(sourceAgain, markdown);
});

test("frontmatter is preserved by the app markdown normalization path", () => {
  const markdown = "---\ntitle: Test\n---\n\n# Body\n";

  const loaded = createLoadedDocument({
    filePath: "C:\\Notes\\frontmatter.md",
    fileName: "frontmatter.md",
    markdown,
  });

  assert.equal(loaded.markdown, markdown);
  assert.equal(normalizeMarkdownLineBreaks(markdown), markdown);
});

test("cyrillic text is preserved by document state", () => {
  const markdown = "# Привет\n\nТекст заметки.\n";
  const document = createDocument({ markdown, originalMarkdown: markdown });

  assert.equal(document.markdown, markdown);
  assert.equal(setDocumentMarkdown(document, `${markdown}Еще строка.`).markdown, `${markdown}Еще строка.`);
});

test("code blocks are preserved by markdown normalization", () => {
  const markdown = "```html\n<div><br /></div>\n```\n";

  assert.equal(normalizeMarkdownLineBreaks(markdown), markdown);
});

test("saving empty content over non-empty existing content is treated as unsafe", () => {
  assert.equal(isUnsafeEmptyOverwrite("", "# Existing\n", "C:\\Notes\\a.md"), true);
  assert.equal(isUnsafeEmptyOverwrite("", "", "C:\\Notes\\a.md"), false);
  assert.equal(isUnsafeEmptyOverwrite("", "# Existing\n", null), false);
});
