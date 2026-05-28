import assert from "node:assert/strict";
import { test } from "./testHarness";
import { getShortcutAction } from "../src/utils/keyboardShortcuts";

test("shortcuts use physical keys so Russian layout still saves", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyS",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    "save",
  );
});

test("shortcuts use physical keys so Russian layout still opens", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyO",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    "open",
  );
});

test("save as uses shift plus physical save key", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyS",
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
    }),
    "saveAs",
  );
});

test("source toggle uses the physical backquote key", () => {
  assert.equal(
    getShortcutAction({
      code: "Backquote",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    "toggleSource",
  );
});

test("Cmd+W closes active tab", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyW",
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    }),
    "closeTab",
  );
});

test("Cmd+Shift+W closes window", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyW",
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
    }),
    "closeWindow",
  );
});

test("Cmd+F triggers find", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyF",
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    }),
    "find",
  );
});

test("Ctrl+W closes tab on non-Mac", () => {
  assert.equal(
    getShortcutAction({
      code: "KeyW",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    "closeTab",
  );
});
