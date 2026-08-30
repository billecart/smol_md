import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  clampActiveIndex,
  formatMatchCounter,
  nextMatchIndex,
  previousMatchIndex,
} from "../src/utils/inPageFind";

test("active match index clamps when the match set shrinks", () => {
  const shrunkIndex = clampActiveIndex(7, 2);

  assert.equal(shrunkIndex, 1);
});

test("active match index falls back to zero when no matches remain", () => {
  const index = clampActiveIndex(3, 0);

  assert.equal(index, 0);
});

test("next match wraps around to the first match", () => {
  const index = nextMatchIndex(2, 3);

  assert.equal(index, 0);
});

test("previous match wraps around to the last match", () => {
  const index = previousMatchIndex(0, 3);

  assert.equal(index, 2);
});

test("match counter never shows an index above the match count", () => {
  const counter = formatMatchCounter("term", 7, 2);

  assert.equal(counter, "2 / 2");
});

test("match counter reports no results for an unmatched query", () => {
  const counter = formatMatchCounter("term", 0, 0);

  assert.equal(counter, "No results");
});

test("match counter is empty when no query is entered", () => {
  const counter = formatMatchCounter("", 0, 0);

  assert.equal(counter, "");
});
