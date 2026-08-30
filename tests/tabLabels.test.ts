import assert from "node:assert/strict";
import { test } from "./testHarness";
import { disambiguateTabLabels, getTabLabel } from "../src/utils/tabLabels";

test("tab labels drop the markdown extension", () => {
  const label = getTabLabel({ filePath: "/notes/plan.md", fileName: "plan.md" });

  assert.equal(label, "plan");
});

test("tab labels for identically named files include the parent folder", () => {
  const labels = disambiguateTabLabels([
    { filePath: "/a/notes.md", fileName: "notes.md" },
    { filePath: "/b/notes.md", fileName: "notes.md" },
  ]);

  assert.deepEqual(labels, ["a/notes", "b/notes"]);
});

test("tab labels for untitled drafts stay untitled", () => {
  const labels = disambiguateTabLabels([
    { filePath: null, fileName: "Untitled.md" },
    { filePath: null, fileName: "Untitled.md" },
  ]);

  assert.deepEqual(labels, ["Untitled", "Untitled"]);
});

test("tab labels are unchanged when file names are unique", () => {
  const labels = disambiguateTabLabels([
    { filePath: "/a/notes.md", fileName: "notes.md" },
    { filePath: "/b/plan.md", fileName: "plan.md" },
  ]);

  assert.deepEqual(labels, ["notes", "plan"]);
});
