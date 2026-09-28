import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  DOCUMENT_FONTS,
  isDocumentFont,
} from "../src/utils/documentFont";

test("document fonts are mono, sans and serif in that order", () => {
  assert.deepEqual(DOCUMENT_FONTS, ["mono", "sans", "serif"]);
});

test("only known document fonts are accepted from storage", () => {
  assert.equal(isDocumentFont("serif"), true);
  assert.equal(isDocumentFont("comic"), false);
  assert.equal(isDocumentFont(null), false);
});
