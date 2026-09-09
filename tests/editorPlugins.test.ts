import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "./testHarness";

// Read from the repo root; the runner is always invoked from there.
const richEditor = readFileSync(
  join(process.cwd(), "src/components/RichEditor.tsx"),
  "utf8",
);

// Milkdown plugins declared in this file: $prose, $inputRule, $command, and
// the schema and remark factories.
function definedPlugins(): string[] {
  return Array.from(
    richEditor.matchAll(
      /^const ([A-Za-z0-9_]+) = \$(?:prose|inputRule|command|markSchema|nodeSchema|remark|view)\b/gm,
    ),
  )
    .map((match) => match[1]!)
    .sort();
}

// Everything handed to the editor through .use(...).
function registeredPlugins(): string[] {
  return Array.from(richEditor.matchAll(/\.use\(([A-Za-z0-9_]+)\)/g))
    .map((match) => match[1]!)
    .sort();
}

// A plugin that is declared but never passed to .use() is dead code that looks
// alive: the feature simply does not happen, with no error anywhere. Export as
// PDF shipped in exactly this state at the Rust layer - written, wired to a
// menu item, and never registered - so it is worth a test rather than care.
// Typing `[label](url)` in Rich mode depends on one of these registrations.
test("every editor plugin defined here is registered with .use()", () => {
  const registered = registeredPlugins();
  const missing = definedPlugins().filter(
    (plugin) => !registered.includes(plugin),
  );

  assert.deepEqual(missing, []);
});

// Guards the guard: if the declaration syntax changes and the pattern above
// stops matching, the test would pass by finding nothing to check.
test("the plugin scan finds the editor's plugins", () => {
  const defined = definedPlugins();

  assert.equal(defined.includes("linkInputRule"), true);
  assert.equal(defined.includes("markdownLinkPastePlugin"), true);
  assert.equal(defined.length >= 8, true);
});
