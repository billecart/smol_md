import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  blockquote,
  bulletList,
  codeBlock,
  doc,
  heading,
  link,
  listItem,
  p,
  schema,
} from "./editorFixtures";
import { misspelledDocumentRanges, spellcheckBlocks } from "../src/utils/spellcheck";

test("every paragraph and heading is checked, including in lists and quotes", () => {
  const document = doc(
    heading(1, "Teh title"),
    p("First paragrpah"),
    bulletList(listItem(p("a list itme"))),
    blockquote(p("quoted txet")),
  );

  const texts = spellcheckBlocks(document).map((block) => block.text);

  assert.deepEqual(texts, ["Teh title", "First paragrpah", "a list itme", "quoted txet"]);
});

test("code blocks are not checked", () => {
  const document = doc(p("prose"), codeBlock("const mispeled = 1;"));

  const texts = spellcheckBlocks(document).map((block) => block.text);

  assert.deepEqual(texts, ["prose"]);
});

test("inline code and bare URLs are blanked out but keep their length", () => {
  const url = "https://exmple.com";
  const document = doc(
    p("run ", schema.text("npmx", [schema.marks.code.create()]), " then ", link(url, url)),
  );

  const [block] = spellcheckBlocks(document);

  assert.equal(block!.text, `run ${" ".repeat(4)} then ${" ".repeat(url.length)}`);
});

test("link text that is not the URL itself is checked", () => {
  const document = doc(p(link("the ocncequences", "https://example.com")));

  const [block] = spellcheckBlocks(document);

  assert.equal(block!.text, "the ocncequences");
});

test("offsets into a block's text map to document positions", () => {
  const document = doc(p("ok"), p("bad wrod", schema.node("hard_break"), "and wrod"));
  const blocks = spellcheckBlocks(document);
  const results = new Map([["bad wrod and wrod", [[4, 4], [13, 4]] as Array<[number, number]>]]);

  const ranges = misspelledDocumentRanges(blocks, (text) => results.get(text), null);

  assert.deepEqual(
    ranges.map(({ from, to }) => document.textBetween(from, to)),
    ["wrod", "wrod"],
  );
});

test("the word being typed is not underlined yet", () => {
  const document = doc(p("one wrod two wrod"));
  const blocks = spellcheckBlocks(document);
  const results = new Map([["one wrod two wrod", [[4, 4], [13, 4]] as Array<[number, number]>]]);
  const endOfSecondWord = blocks[0]!.start + 17;

  const ranges = misspelledDocumentRanges(blocks, (text) => results.get(text), endOfSecondWord);

  assert.deepEqual(ranges, [{ from: blocks[0]!.start + 4, to: blocks[0]!.start + 8 }]);
});

test("a paragraph with no result yet has no underlines", () => {
  const document = doc(p("unchecked wrod"));

  const ranges = misspelledDocumentRanges(spellcheckBlocks(document), () => undefined, null);

  assert.deepEqual(ranges, []);
});
