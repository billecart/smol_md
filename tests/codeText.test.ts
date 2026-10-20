import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import {
  codeBlockDomAttrs,
  inlineCodeDomAttrs,
  straightenQuotesInCode,
} from "../src/utils/codeText";
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

// Smallest schema with both kinds of code: a code block node and a code mark.
const quoteSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    code_block: { content: "text*", group: "block", marks: "", code: true },
    text: { group: "inline" },
  },
  marks: { code: { code: true, inclusive: false } },
});

function typeInto(doc: ReturnType<Schema["node"]>, at: number, text: string, marks = false) {
  const state = EditorState.create({ doc });
  const tr = marks
    ? state.tr.replaceWith(at, at, quoteSchema.text(text, [quoteSchema.marks.code!.create()]))
    : state.tr.insertText(text, at);
  const typed = state.apply(tr);
  const fix = straightenQuotesInCode([tr], typed);

  return (fix ? typed.apply(fix) : typed).doc.textContent;
}

// Found in 1.1.12: an opening `"` typed in a code block still curled, because
// WebKit does not always honour spellcheck="false".
test("a curly quote typed into a code block comes out straight", () => {
  const doc = quoteSchema.node("doc", null, [
    quoteSchema.node("code_block", null, [quoteSchema.text("hi")]),
  ]);

  assert.equal(typeInto(doc, 1, "\u201c"), '"hi');
  assert.equal(typeInto(doc, 3, "\u2019"), "hi'");
});

test("a curly quote typed into inline code comes out straight", () => {
  const doc = quoteSchema.node("doc", null, [quoteSchema.node("paragraph")]);

  assert.equal(typeInto(doc, 1, "\u201cx\u201d", true), '"x"');
});

test("curly quotes in prose are left alone", () => {
  const doc = quoteSchema.node("doc", null, [quoteSchema.node("paragraph")]);

  assert.equal(typeInto(doc, 1, "\u201chi\u201d"), "\u201chi\u201d");
});

test("curly quotes already in code are left alone when typing elsewhere", () => {
  const doc = quoteSchema.node("doc", null, [
    quoteSchema.node("code_block", null, [quoteSchema.text("\u201cold\u201d")]),
  ]);

  assert.equal(typeInto(doc, 6, "x"), "\u201cold\u201dx");
});
