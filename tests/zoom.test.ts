import assert from "node:assert/strict";
import { test } from "./testHarness";
import { MAX_ZOOM, MIN_ZOOM, zoomIn, zoomOut, zoomStyle } from "../src/utils/zoom";

test("zooming out three steps produces an exact zoom level", () => {
  const level = zoomOut(zoomOut(zoomOut(1)));

  assert.equal(level, 0.7);
});

test("zooming in twice produces an exact zoom level", () => {
  const level = zoomIn(zoomIn(1));

  assert.equal(level, 1.2);
});

test("zoom level clamps to the minimum", () => {
  const level = zoomOut(MIN_ZOOM);

  assert.equal(level, MIN_ZOOM);
});

test("zoom level clamps to the maximum", () => {
  const level = zoomIn(MAX_ZOOM);

  assert.equal(level, MAX_ZOOM);
});

test("default zoom applies no zoom style", () => {
  const style = zoomStyle(1);

  assert.deepEqual(style, {});
});
