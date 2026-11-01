import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  addLoadedDocuments,
  applyPendingMarkdown,
  createDocument,
  createLoadedDocument,
  detachOtherDocumentsAtPath,
  isSameFileText,
  markDocumentSaved,
  moveDocument,
  requiresDiscardConfirmation,
  setDocumentMarkdown,
  toFileText,
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

test("saving keeps edits made after the save started", () => {
  const document = createLoadedDocument({
    filePath: "C:\\Notes\\a.md",
    fileName: "a.md",
    markdown: "# A\n",
  });
  const snapshot = document.markdown;
  const edited = setDocumentMarkdown(document, "# A\n\nChanged while dialog was open");

  const saved = markDocumentSaved(edited, snapshot, "C:\\Notes\\a.md");

  assert.equal(saved.markdown, "# A\n\nChanged while dialog was open");
  assert.equal(saved.originalMarkdown, snapshot);
  assert.equal(saved.isDirty, true);
});

test("saving marks the document clean when no edits landed during the save", () => {
  const document = createLoadedDocument({
    filePath: "C:\\Notes\\a.md",
    fileName: "a.md",
    markdown: "# A\n",
  });
  const snapshot = document.markdown;

  const saved = markDocumentSaved(document, snapshot, "C:\\Notes\\a.md");

  assert.equal(saved.markdown, snapshot);
  assert.equal(saved.isDirty, false);
});

test("save as keeps in-flight edits and adopts the new file name", () => {
  const document = createDocument({ markdown: "# Draft\n", originalMarkdown: "# Draft\n" });
  const snapshot = document.markdown;
  const edited = setDocumentMarkdown(document, "# Draft\n\nOne more paragraph");

  const saved = markDocumentSaved(
    edited,
    snapshot,
    "C:\\Notes\\final.md",
    "final.md",
  );

  assert.equal(saved.filePath, "C:\\Notes\\final.md");
  assert.equal(saved.fileName, "final.md");
  assert.equal(saved.markdown, "# Draft\n\nOne more paragraph");
  assert.equal(saved.isDirty, true);
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

test("several files opened into a fresh window all get a tab", () => {
  const draft = createDocument();
  const files = ["a", "b", "c"].map((name) => ({
    filePath: `/notes/${name}.md`,
    fileName: `${name}.md`,
    markdown: `# ${name}\n`,
  }));

  const next = addLoadedDocuments([draft], draft, files);

  assert.deepEqual(
    next.documents.map((document) => document.fileName),
    ["a.md", "b.md", "c.md"],
  );
  assert.equal(next.activeDocumentId, next.documents[2]!.id);
});

test("several files opened next to an open file are appended, duplicates skipped", () => {
  const open = createLoadedDocument({
    filePath: "/notes/a.md",
    fileName: "a.md",
    markdown: "# a\n",
  });
  const files = [
    { filePath: "/notes/b.md", fileName: "b.md", markdown: "# b\n" },
    { filePath: "/notes/a.md", fileName: "a.md", markdown: "# a\n" },
    { filePath: "/notes/c.md", fileName: "c.md", markdown: "# c\n" },
  ];

  const next = addLoadedDocuments([open], open, files);

  assert.deepEqual(
    next.documents.map((document) => document.fileName),
    ["a.md", "b.md", "c.md"],
  );
  assert.equal(next.documents[0], open);
  assert.equal(next.activeDocumentId, next.documents[2]!.id);
});

// The rich editor reports edits 200ms late; these cover what App does with an
// edit it pulled out of the editor early (before a save, close or quit).
test("a pending edit makes a clean document dirty before the editor reports it", () => {
  const clean = createDocument({ markdown: "# A\n", originalMarkdown: "# A\n" });
  const other = createDocument({ markdown: "# B\n", originalMarkdown: "# B\n" });

  const next = applyPendingMarkdown([clean, other], clean.id, "# A!\n");

  assert.equal(next[0]!.markdown, "# A!\n");
  assert.equal(next[0]!.isDirty, true);
  assert.equal(next[1], other);
});

test("no pending edit leaves the document list untouched", () => {
  const documents = [createDocument({ markdown: "# A\n", originalMarkdown: "# A\n" })];

  assert.equal(applyPendingMarkdown(documents, documents[0]!.id, null), documents);
});

test("a pending edit that restores the saved text leaves the document clean", () => {
  const edited = setDocumentMarkdown(
    createDocument({ markdown: "# A\n", originalMarkdown: "# A\n" }),
    "# A changed\n",
  );

  const [next] = applyPendingMarkdown([edited], edited.id, "# A\n");

  assert.equal(next!.isDirty, false);
});

test("a pending edit for a closed document is dropped", () => {
  const documents = [createDocument({ markdown: "# A\n", originalMarkdown: "# A\n" })];

  const next = applyPendingMarkdown(documents, "closed-id", "# gone\n");

  assert.deepEqual(next, documents);
});

test("moveDocument moves a tab forward and backward", () => {
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const ids = (list: { id: string }[]) => list.map((tab) => tab.id).join("");

  assert.equal(ids(moveDocument(tabs, "a", 2)), "bca");
  assert.equal(ids(moveDocument(tabs, "c", 0)), "cab");
  assert.equal(ids(moveDocument(tabs, "b", 9)), "acb");
  assert.equal(ids(tabs), "abc");
});

test("moveDocument returns the same array when nothing moves", () => {
  const tabs = [{ id: "a" }, { id: "b" }];

  assert.equal(moveDocument(tabs, "a", 0), tabs);
  assert.equal(moveDocument(tabs, "missing", 1), tabs);
});

test("saving to a path another tab has open turns that tab into an unsaved copy", () => {
  const a = createDocument({ filePath: "/notes/a.md", fileName: "a.md" });
  const b = createDocument({ filePath: "/notes/a.md", fileName: "a.md" });
  const c = createDocument({ filePath: "/notes/c.md", fileName: "c.md" });

  const result = detachOtherDocumentsAtPath([a, b, c], b.id, "/notes/a.md");

  assert.equal(result[0]!.filePath, null);
  assert.equal(result[0]!.isDirty, true);
  assert.equal(result[1], b);
  assert.equal(result[2], c);
});

test("reopening a file that is open without edits shows the text on disk now", () => {
  const open = createLoadedDocument({ filePath: "/a.md", fileName: "a.md", markdown: "old\n" });

  const result = addLoadedDocuments([open], open, [
    { filePath: "/a.md", fileName: "a.md", markdown: "new\n" },
  ]);

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0]!.id, open.id);
  assert.equal(result.documents[0]!.markdown, "new\n");
});

test("reopening a file with unsaved edits keeps the edits", () => {
  const open = { ...createLoadedDocument({ filePath: "/a.md", fileName: "a.md", markdown: "old\n" }), markdown: "edited\n", isDirty: true };

  const result = addLoadedDocuments([open], open, [
    { filePath: "/a.md", fileName: "a.md", markdown: "new\n" },
  ]);

  assert.equal(result.documents[0]!.markdown, "edited\n");
});

test("file text comparison ignores line endings and a byte-order mark", () => {
  assert.equal(isSameFileText("﻿a\r\nb\r\n", "a\nb\n"), true);
  assert.equal(isSameFileText("a\nb\n", "a\nc\n"), false);
});

test("a CRLF file with a byte-order mark is edited as plain lines and saved back the same way", () => {
  const document = createLoadedDocument({
    filePath: "/w.md",
    fileName: "w.md",
    markdown: "﻿# Title\r\n\r\nBody\r\n",
  });

  assert.equal(document.markdown, "# Title\n\nBody\n");
  assert.equal(document.isDirty, false);
  assert.equal(toFileText(document.markdown, document), "﻿# Title\r\n\r\nBody\r\n");
});

test("a typed-then-deleted character leaves a CRLF file clean", () => {
  const document = createLoadedDocument({ filePath: "/w.md", fileName: "w.md", markdown: "a\r\nb\r\n" });

  const edited = setDocumentMarkdown(setDocumentMarkdown(document, "a\nbx\n"), "a\nb\n");

  assert.equal(edited.isDirty, false);
});
