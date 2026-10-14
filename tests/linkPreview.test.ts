import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  getLinkPreviewPosition,
  LINK_PREVIEW_MAX_WIDTH,
} from "../src/utils/linkPreview";

const viewport = { width: 1100, height: 800 };

test("link preview sits just below the link", () => {
  assert.deepEqual(
    getLinkPreviewPosition({ left: 200, top: 100, bottom: 120 }, viewport),
    { x: 200, y: 126 },
  );
});

test("link preview flips above a link at the bottom of the window", () => {
  assert.deepEqual(
    getLinkPreviewPosition({ left: 200, top: 770, bottom: 790 }, viewport),
    { x: 200, y: 736 },
  );
});

test("link preview stays inside the right edge", () => {
  const { x } = getLinkPreviewPosition(
    { left: 1000, top: 100, bottom: 120 },
    viewport,
  );
  assert.equal(x, viewport.width - LINK_PREVIEW_MAX_WIDTH - 8);
});
