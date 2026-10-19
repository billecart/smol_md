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

test("ctrl+tab cycles tabs forward and ctrl+shift+tab backward", () => {
  const base = { code: "Tab", ctrlKey: true, metaKey: false };
  assert.equal(getShortcutAction({ ...base, shiftKey: false }), "nextTab");
  assert.equal(getShortcutAction({ ...base, shiftKey: true }), "previousTab");
});

test("cmd+shift+brackets cycle tabs, plain cmd+brackets do not", () => {
  const base = { ctrlKey: false, metaKey: true };
  assert.equal(
    getShortcutAction({ ...base, code: "BracketRight", shiftKey: true }),
    "nextTab",
  );
  assert.equal(
    getShortcutAction({ ...base, code: "BracketLeft", shiftKey: true }),
    "previousTab",
  );
  assert.equal(
    getShortcutAction({ ...base, code: "BracketRight", shiftKey: false }),
    null,
  );
});

test("on macOS ctrl plus the key under Esc cycles tabs", () => {
  const base = { ctrlKey: true, metaKey: false };

  for (const code of ["Backquote", "IntlBackslash"]) {
    assert.equal(getShortcutAction({ ...base, code, shiftKey: false }, true), "nextTab");
    assert.equal(getShortcutAction({ ...base, code, shiftKey: true }, true), "previousTab");
  }
});

test("on macOS cmd+backquote still toggles source", () => {
  assert.equal(
    getShortcutAction(
      { code: "Backquote", ctrlKey: false, metaKey: true, shiftKey: false },
      true,
    ),
    "toggleSource",
  );
});

test("off macOS ctrl+backquote still toggles source", () => {
  assert.equal(
    getShortcutAction(
      { code: "Backquote", ctrlKey: true, metaKey: false, shiftKey: false },
      false,
    ),
    "toggleSource",
  );
});
