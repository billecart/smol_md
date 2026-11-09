import assert from "node:assert/strict";
import { test } from "./testHarness";
import { smartQuote, transformText } from "../src/utils/textTransforms";
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
