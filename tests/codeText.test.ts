import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeBlockDomAttrs, inlineCodeDomAttrs } from "../src/utils/codeText";
import { test } from "./testHarness";

// Found in the packaged macOS app: smart quotes turned a typed `"` in code into
// `“`. WebKit skips text substitution where spellcheck is off, so code blocks
// and inline code must render with it off.
test("code blocks turn off spellcheck, and with it macOS smart quotes", () => {
  const attrs = codeBlockDomAttrs();

  assert.equal(attrs.pre.spellcheck, "false");
  assert.equal(attrs.code.spellcheck, "false");
});

test("inline code turns off spellcheck, and with it macOS smart quotes", () => {
  assert.equal(inlineCodeDomAttrs().spellcheck, "false");
});

// The attributes only reach the page if the editor hands them to Milkdown.
test("the rich editor applies the code attributes", () => {
  const richEditor = readFileSync(
    join(process.cwd(), "src/components/RichEditor.tsx"),
    "utf8",
  );

  assert.match(richEditor, /ctx\.set\(codeBlockAttr\.key, codeBlockDomAttrs\)/);
  assert.match(richEditor, /ctx\.set\(inlineCodeAttr\.key, inlineCodeDomAttrs\)/);
});
