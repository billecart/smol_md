import assert from "node:assert/strict";
import { test } from "./testHarness";
import { smartDoubleQuote, smartQuote, transformText } from "../src/utils/textTransforms";
import { DEFAULT_EDITOR_PREFERENCES, loadEditorPreferences } from "../src/utils/editorPreferences";

test("transformText upper- and lower-cases, Cyrillic too", () => {
  assert.equal(transformText("Ник и Леда", "upper"), "НИК И ЛЕДА");
  assert.equal(transformText("RADIO Arctica", "lower"), "radio arctica");
});

test("transformText capitalizes each word and lowers the rest, like macOS", () => {
  assert.equal(transformText("the VANTAGE point", "capitalize"), "The Vantage Point");
  assert.equal(transformText("в центре экрана", "capitalize"), "В Центре Экрана");
  assert.equal(transformText("don't stop", "capitalize"), "Don't Stop");
});

test("transformText does not capitalize a run that starts mid-word", () => {
  assert.equal(transformText("ITALIC", "capitalize", "b"), "italic");
  assert.equal(transformText("word", "capitalize", " "), "Word");
});

test("smartQuote opens after a space or at the start and closes after a word", () => {
  assert.equal(smartQuote('"', ""), "“");
  assert.equal(smartQuote('"', " "), "“");
  assert.equal(smartQuote('"', "d"), "”");
  assert.equal(smartQuote("'", "n"), "’");
  assert.equal(smartQuote("'", "("), "‘");
});

test("editor preferences default to spelling on and substitutions off", () => {
  assert.deepEqual(DEFAULT_EDITOR_PREFERENCES, {
    checkSpellingWhileTyping: true,
    smartQuotes: false,
    smartDashes: false,
  });
  assert.deepEqual(loadEditorPreferences(), DEFAULT_EDITOR_PREFERENCES);
});

test("smartDoubleQuote uses « » for Russian and “ ” otherwise", () => {
  assert.deepEqual(smartDoubleQuote("Он сказал "), { insert: "\u00AB" });
  assert.deepEqual(smartDoubleQuote("She said "), { insert: "\u201C" });
  assert.deepEqual(smartDoubleQuote("Он сказал \u00ABпривет"), {
    insert: "\u00BB",
    opening: { index: 10, quote: "\u00AB" },
  });
});

test("smartDoubleQuote fixes the opening quote to match what was quoted", () => {
  // A line that starts with a quote has nothing to go on until it closes.
  assert.deepEqual(smartDoubleQuote("\u201C\u041F\u0440\u0438\u0432\u0435\u0442"), {
    insert: "\u00BB",
    opening: { index: 0, quote: "\u00AB" },
  });
  // English quoted inside a Russian sentence keeps English quotes.
  assert.deepEqual(smartDoubleQuote("Леда говорит \u00ABask again"), {
    insert: "\u201D",
    opening: { index: 13, quote: "\u201C" },
  });
});

test("smartDoubleQuote closes by context when no quote is open", () => {
  assert.deepEqual(smartDoubleQuote("привет"), { insert: "\u00BB" });
  assert.deepEqual(smartDoubleQuote("hello"), { insert: "\u201D" });
});
