import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  addRecentDocument,
  recentDocumentFromPath,
  type RecentDocument,
} from "../src/utils/recentDocuments";

test("recent documents keep newest item first", () => {
  const recentDocuments: RecentDocument[] = [
    { filePath: "/notes/one.md", fileName: "one.md" },
  ];

  const updated = addRecentDocument(recentDocuments, {
    filePath: "/notes/two.md",
    fileName: "two.md",
  });

  assert.deepEqual(updated.map((item) => item.fileName), ["two.md", "one.md"]);
});

test("recent documents move duplicates to the front", () => {
  const recentDocuments: RecentDocument[] = [
    { filePath: "/notes/one.md", fileName: "one.md" },
    { filePath: "/notes/two.md", fileName: "two.md" },
  ];

  const updated = addRecentDocument(recentDocuments, {
    filePath: "/notes/two.md",
    fileName: "two.md",
  });

  assert.deepEqual(updated.map((item) => item.filePath), [
    "/notes/two.md",
    "/notes/one.md",
  ]);
});

test("recent documents keep only five entries", () => {
  const recentDocuments = Array.from({ length: 5 }, (_item, index) => ({
    filePath: `/notes/${index}.md`,
    fileName: `${index}.md`,
  }));

  const updated = addRecentDocument(recentDocuments, {
    filePath: "/notes/new.md",
    fileName: "new.md",
  });

  assert.equal(updated.length, 5);
  assert.equal(updated[0]!.fileName, "new.md");
  assert.equal(updated.some((item) => item.fileName === "4.md"), false);
});

test("recent document names are derived from unix and windows paths", () => {
  assert.equal(recentDocumentFromPath("/notes/daily.md").fileName, "daily.md");
  assert.equal(
    recentDocumentFromPath("C:\\Notes\\weekly.markdown").fileName,
    "weekly.markdown",
  );
});
