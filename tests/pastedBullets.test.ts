import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { bulletList, doc, link, listItem, nodes, outline, p, stateFrom } from "./editorFixtures";
import {
  convertPastedBullets,
  fitPastedListToListItem,
  unicodeBulletPrefixLength,
} from "../src/utils/pastedBullets";
import { test } from "./testHarness";

const types = {
  bulletList: nodes.bullet_list,
  listItem: nodes.list_item,
  paragraph: nodes.paragraph,
  hardBreak: nodes.hard_break,
};

// What ProseMirror hands handlePaste for a multi-line plain-text paste: one
// paragraph per line, open on both sides so the first and last lines merge
// into the paragraph at the caret.
function pasted(...blocks: ProseNode[]) {
  return new Slice(Fragment.fromArray(blocks), 1, 1);
}

function outlineSlice(slice: Slice) {
  const children: string[] = [];
  slice.content.forEach((child) => children.push(outline(child)));
  return `${slice.openStart}|${children.join(", ")}|${slice.openEnd}`;
}

// User-reported bug: a Steam "About This Game" draft pasted from another app
// kept its "•" characters as text. Each line became a paragraph starting with
// "•", with no hanging indent, and saved as `• item` rather than `- item`.
test("pasted lines starting with • become one bullet list", () => {
  const result = convertPastedBullets(
    pasted(p("• First feature"), p("• Second feature")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '0|bullet_list(list_item(paragraph("First feature")), list_item(paragraph("Second feature")))|0',
  );
});

test("other bullet glyphs and an en dash are recognised", () => {
  const result = convertPastedBullets(
    pasted(p("◦ one"), p("▪ two"), p("– three"), p("● four"), p("\tfive")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '0|bullet_list(list_item(paragraph("one")), list_item(paragraph("two")), list_item(paragraph("three")), list_item(paragraph("four")), list_item(paragraph("five")))|0',
  );
});

test("a bullet followed by a tab or no-break space counts; one with no space does not", () => {
  assert.equal(unicodeBulletPrefixLength(p("•\tTabbed")), 2);
  assert.equal(unicodeBulletPrefixLength(p("• Nbsp")), 2);
  assert.equal(unicodeBulletPrefixLength(p("  • Indented")), 4);
  assert.equal(unicodeBulletPrefixLength(p("•Tight")), 0);
  assert.equal(unicodeBulletPrefixLength(p("• ")), 0);
  assert.equal(unicodeBulletPrefixLength(p("Mid • line")), 0);
});

// In a lot of prose a line opening with an em dash is dialogue, not a list.
test("lines starting with an em dash stay paragraphs", () => {
  const slice = pasted(p("— Where are you going?"), p("— Home."));

  assert.equal(convertPastedBullets(slice, types), slice);
});

test("paragraphs around the bullets are kept, in order", () => {
  const result = convertPastedBullets(
    pasted(p("Features:"), p("• Fast"), p("• Small"), p("That's it.")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '1|paragraph("Features:"), bullet_list(list_item(paragraph("Fast")), list_item(paragraph("Small"))), paragraph("That\'s it.")|1',
  );
});

// The tall gap reported next to a real list: rich-text apps put empty spacer
// paragraphs around lists, and Milkdown saves each one as a `<br />` line.
test("blank spacer paragraphs inside and around the bullets are dropped", () => {
  const result = convertPastedBullets(
    pasted(p("Intro"), p(), p(" "), p("• One"), p(" "), p("• Two"), p(), p("Outro")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '1|paragraph("Intro"), bullet_list(list_item(paragraph("One")), list_item(paragraph("Two"))), paragraph("Outro")|1',
  );
});

test("blank paragraphs away from any bullets are left alone", () => {
  const result = convertPastedBullets(
    pasted(p("Intro"), p(), p("Middle"), p("• One"), p("• Two")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '1|paragraph("Intro"), paragraph, paragraph("Middle"), bullet_list(list_item(paragraph("One")), list_item(paragraph("Two")))|0',
  );
});

test("a spacer that was the first block no longer leaves the slice open", () => {
  const result = convertPastedBullets(pasted(p(), p("• One"), p("• Two")), types);

  assert.equal(
    outlineSlice(result),
    '0|bullet_list(list_item(paragraph("One")), list_item(paragraph("Two")))|0',
  );
});

test("a non-bullet line between bullets splits them into two lists", () => {
  const result = convertPastedBullets(
    pasted(p("• A"), p("Heading-ish line"), p("• B")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '0|bullet_list(list_item(paragraph("A"))), paragraph("Heading-ish line"), bullet_list(list_item(paragraph("B")))|0',
  );
});

test("marks after the bullet survive", () => {
  const result = convertPastedBullets(
    pasted(p("• See ", link("the site", "https://example.com")), p("• Two")),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '0|bullet_list(list_item(paragraph("See ", "the site"[link])), list_item(paragraph("Two")))|0',
  );
});

// Word and some mail clients keep the whole list in one paragraph, with line
// breaks between the items.
test("bullet lines separated by line breaks in one paragraph become a list", () => {
  const br = () => nodes.hard_break.create();
  const result = convertPastedBullets(
    new Slice(Fragment.from(p("Includes:", br(), "• Maps", br(), "• Saves")), 0, 0),
    types,
  );

  assert.equal(
    outlineSlice(result),
    '0|paragraph("Includes:"), bullet_list(list_item(paragraph("Maps")), list_item(paragraph("Saves")))|0',
  );
});

test("a paragraph with line breaks but no bullet lines keeps its breaks", () => {
  const br = () => nodes.hard_break.create();
  const slice = new Slice(Fragment.from(p("Roses are red", br(), "Violets are blue")), 0, 0);

  assert.equal(convertPastedBullets(slice, types), slice);
});

// A single line goes inline into the paragraph at the caret, as any other
// one-line paste does.
test("a single pasted bullet line is left as text", () => {
  const slice = new Slice(Fragment.from(p("• Just one")), 1, 1);

  assert.equal(convertPastedBullets(slice, types), slice);
});

test("a paste with no bullet lines is returned untouched", () => {
  const slice = pasted(p("One"), p(), p("Two"));

  assert.equal(convertPastedBullets(slice, types), slice);
});

test("real lists in the paste are not touched", () => {
  const slice = pasted(bulletList(listItem(p("• already a list item"))), p("after"));

  assert.equal(convertPastedBullets(slice, types), slice);
});

test("pasting a converted list inside a list item adds sibling items", () => {
  const converted = convertPastedBullets(pasted(p("• A"), p("• B")), types);
  const fitted = fitPastedListToListItem(converted, true, types);

  assert.equal(
    outlineSlice(fitted),
    '0|list_item(paragraph("A")), list_item(paragraph("B"))|0',
  );

  const state = stateFrom(doc(bulletList(listItem(p("Existing<|>")))));
  const after = state.apply(state.tr.replaceSelection(fitted));

  assert.equal(
    outline(after.doc),
    'doc(bullet_list(list_item(paragraph("Existing")), list_item(paragraph("A")), list_item(paragraph("B"))))',
  );
});

test("outside a list item, or with other blocks in the paste, the list stays whole", () => {
  const onlyList = convertPastedBullets(pasted(p("• A"), p("• B")), types);
  const mixed = convertPastedBullets(pasted(p("Intro"), p("• A"), p("• B")), types);

  assert.equal(fitPastedListToListItem(onlyList, false, types), onlyList);
  assert.equal(fitPastedListToListItem(mixed, true, types), mixed);
});

test("the converted slice inserts cleanly in the middle of a paragraph", () => {
  const state = stateFrom(doc(p("before<|>after")));
  const slice = convertPastedBullets(pasted(p("• A"), p("• B")), types);
  const after = state.apply(state.tr.replaceSelection(slice));

  assert.equal(
    outline(after.doc),
    'doc(paragraph("before"), bullet_list(list_item(paragraph("A")), list_item(paragraph("B"))), paragraph("after"))',
  );
});

// The link paste plugin takes over multi-line plain text that contains
// markdown links and runs the bullet conversion on its own slice. If the
// bullet plugin came first it would claim those pastes and the links would
// land as literal `[label](url)` text.
test("the bullet paste plugin is registered after the link paste plugin", () => {
  const richEditor = readFileSync(
    join(process.cwd(), "src/components/RichEditor.tsx"),
    "utf8",
  );
  const linkAt = richEditor.indexOf(".use(markdownLinkPastePlugin)");
  const bulletAt = richEditor.indexOf(".use(unicodeBulletPastePlugin)");

  assert.equal(linkAt > -1 && bulletAt > linkAt, true);
});
