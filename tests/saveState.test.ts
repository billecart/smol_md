import assert from "node:assert/strict";
import { test } from "./testHarness";
import { getSaveState } from "../src/utils/saveState";

test("a new draft nobody has typed into reports no save state", () => {
  const state = getSaveState({
    isDirty: false,
    hasSavedAt: false,
    hasFilePath: false,
  });

  assert.equal(state, "new-draft");
});

test("a new draft that has been edited reports unsaved changes", () => {
  const state = getSaveState({
    isDirty: true,
    hasSavedAt: false,
    hasFilePath: false,
  });

  assert.equal(state, "unsaved-changes");
});

test("an opened file with no edits reports that it is saved", () => {
  const state = getSaveState({
    isDirty: false,
    hasSavedAt: false,
    hasFilePath: true,
  });

  assert.equal(state, "saved");
});

test("a document saved in this session reports when it was saved", () => {
  const state = getSaveState({
    isDirty: false,
    hasSavedAt: true,
    hasFilePath: true,
  });

  assert.equal(state, "saved-at");
});

test("edits outrank a previous save in the reported state", () => {
  const state = getSaveState({
    isDirty: true,
    hasSavedAt: true,
    hasFilePath: true,
  });

  assert.equal(state, "unsaved-changes");
});
