import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "./testHarness";

// The test runner (scripts/run-tests.mjs) always runs from the repo root, so
// process.cwd() reliably points at the project root here. import.meta.url
// would instead point into the transpiled .test-build output directory.
const cssPath = join(process.cwd(), "src", "styles", "app.css");
const css = readFileSync(cssPath, "utf8");

test("every css custom property that is used is also declared", () => {
  const used = new Set(
    Array.from(css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)).map((match) => match[1]),
  );
  const declared = new Set(
    Array.from(css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)).map((match) => match[1]),
  );

  const undeclared = Array.from(used)
    .filter((name) => !declared.has(name))
    .sort();

  assert.deepEqual(undeclared, []);
});

// The fonts are self-hosted via @fontsource so the app renders identically on
// every machine and never waits on a CDN at startup. This keeps it that way.
test("the stylesheet imports no remote resources", () => {
  const remoteImports = Array.from(
    css.matchAll(/@import\s+url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/g),
  ).map((match) => match[1]);

  assert.deepEqual(remoteImports, []);
});
