import assert from "node:assert/strict";
import { test } from "./testHarness";
import { getDirectory, pickDefaultDirectory } from "../src/utils/filePaths";

test("a unix path yields its containing folder", () => {
  const directory = getDirectory("/Users/nata/Documents/notes.md");

  assert.equal(directory, "/Users/nata/Documents");
});

test("a windows path yields its containing folder", () => {
  const directory = getDirectory("C:\\Users\\nata\\Documents\\notes.md");

  assert.equal(directory, "C:\\Users\\nata\\Documents");
});

test("a file at the filesystem root keeps the leading separator", () => {
  const directory = getDirectory("/notes.md");

  assert.equal(directory, "/");
});

test("a bare file name has no containing folder", () => {
  const directory = getDirectory("notes.md");

  assert.equal(directory, null);
});

test("the open dialog starts beside the document being edited", () => {
  const directory = pickDefaultDirectory("/Users/nata/work/current.md", [
    "/Users/nata/other/older.md",
  ]);

  assert.equal(directory, "/Users/nata/work");
});

test("an untitled draft falls back to the most recent document's folder", () => {
  const directory = pickDefaultDirectory(null, [
    "/Users/nata/other/older.md",
    "/Users/nata/older-still/ancient.md",
  ]);

  assert.equal(directory, "/Users/nata/other");
});

test("with nothing to go on the dialog is left to decide for itself", () => {
  const directory = pickDefaultDirectory(null, []);

  assert.equal(directory, undefined);
});
