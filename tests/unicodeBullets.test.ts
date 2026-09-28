import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { bulletList, doc, link, listItem, nodes, outline, p, runCommand, stateFrom } from "./editorFixtures";
import { AllSelection, TextSelection } from "@milkdown/kit/prose/state";
import {
  convertBulletParagraphs,
  convertPastedBullets,
  fitPastedListToListItem,
  unicodeBulletPrefixLength,
} from "../src/utils/unicodeBullets";
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

// Documents that already had "• item" lines are only converted on request,
// through the Format menu or the right-click menu.
const convert = convertBulletParagraphs(types);

test("the convert command turns a document's • lines into a list", () => {
  const result = runCommand(
    stateFrom(doc(p("Features:"), p("• Fast"), p("• Small"), p("Done."))),
    convert,
  );

  assert.equal(result.handled, true);
  assert.equal(
    outline(result.doc),
    'doc(paragraph("Features:"), bullet_list(list_item(paragraph("Fast")), list_item(paragraph("Small"))), paragraph("Done."))',
  );
});

// The reported document: a real list, a gap saved as `<br />` lines (empty
// paragraphs), then the "•" lines. One list comes out, with no gap.
test("the convert command joins the • lines onto the real list above them", () => {
  const result = runCommand(
    stateFrom(
      doc(
        bulletList(listItem(p("Real one")), listItem(p("Real two"))),
        p(),
        p(),
        p("• Unicode one"),
        p("• Unicode two"),
        p("After."),
      ),
    ),
    convert,
  );

  assert.equal(
    outline(result.doc),
    'doc(bullet_list(list_item(paragraph("Real one")), list_item(paragraph("Real two")), list_item(paragraph("Unicode one")), list_item(paragraph("Unicode two"))), paragraph("After."))',
  );
});

test("a single • line in a document is converted too", () => {
  const result = runCommand(stateFrom(doc(p("Intro"), p("• Only one"))), convert);

  assert.equal(
    outline(result.doc),
    'doc(paragraph("Intro"), bullet_list(list_item(paragraph("Only one"))))',
  );
});

test("the convert command does nothing when there are no • lines", () => {
  const state = stateFrom(doc(bulletList(listItem(p("Real"))), p(), p("Text")));
  const result = runCommand(state, convert);

  assert.equal(result.handled, false);
  assert.equal(result.doc, state.doc);
});

test("blank lines and lists away from the • lines are left alone", () => {
  const result = runCommand(
    stateFrom(
      doc(
        bulletList(listItem(p("Separate list"))),
        p(),
        p("Paragraph between"),
        p("• One"),
      ),
    ),
    convert,
  );

  assert.equal(
    outline(result.doc),
    'doc(bullet_list(list_item(paragraph("Separate list"))), paragraph, paragraph("Paragraph between"), bullet_list(list_item(paragraph("One"))))',
  );
});

test("with a selection, only the blocks it touches are converted", () => {
  const state = stateFrom(doc(p("• Keep one"), p("Middle"), p("• Change one"), p("• Change two")));
  const second = state.doc.child(0).nodeSize + state.doc.child(1).nodeSize;
  const selected = state.apply(
    state.tr.setSelection(
      TextSelection.create(state.doc, second + 3, state.doc.content.size - 2),
    ),
  );

  assert.equal(
    outline(runCommand(selected, convert).doc),
    'doc(paragraph("• Keep one"), paragraph("Middle"), bullet_list(list_item(paragraph("Change one")), list_item(paragraph("Change two"))))',
  );
});

test("select all converts the whole document", () => {
  const state = stateFrom(doc(p("• One"), p("Middle"), p("• Two")));
  const all = state.apply(state.tr.setSelection(new AllSelection(state.doc)));

  assert.equal(
    outline(runCommand(all, convert).doc),
    'doc(bullet_list(list_item(paragraph("One"))), paragraph("Middle"), bullet_list(list_item(paragraph("Two"))))',
  );
});

test("the caret stays in an untouched paragraph after converting", () => {
  const state = stateFrom(doc(p("• One"), p("Mid<|>dle"), p("• Two")));
  const result = runCommand(state, convert);
  const { $from } = result.state.selection;

  assert.equal($from.parent.textContent, "Middle");
  assert.equal($from.parentOffset, 3);
});

// The command is reached from the native macOS Format menu by item id, and
// the ids are kept in sync by hand across the Rust/TS boundary. An id missing
// from either side makes the menu item silently do nothing.
test("every format command id is a Format menu item and is forwarded by App", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const richEditor = read("src/components/RichEditor.tsx");
  const app = read("src/App.tsx");
  const menu = read("src-tauri/src/lib.rs");

  const union = /export type FormatCommandId =([^;]+);/.exec(richEditor)?.[1] ?? "";
  const ids = Array.from(union.matchAll(/"([a-z0-9-]+)"/g)).map((match) => match[1]!);

  assert.equal(ids.includes("convert-bullets"), true);

  const missing = ids.filter(
    (id) =>
      !new RegExp(`with_id\\(\\s*app,\\s*"${id}"`).test(menu) ||
      !app.includes(`"${id}",`),
  );

  assert.deepEqual(missing, []);
});
