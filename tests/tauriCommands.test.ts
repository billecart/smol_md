import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "./testHarness";

// Both files are read from the repo root; the test runner is always invoked
// from there (see scripts/run-tests.mjs, which uses process.cwd() the same way).
const lib = readFileSync(join(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
const permissions = readFileSync(
  join(process.cwd(), "src-tauri/permissions/file-commands.toml"),
  "utf8",
);

// Commands passed to tauri::generate_handler!
function registeredCommands(): string[] {
  const match = lib.match(/generate_handler!\[([\s\S]*?)\]/);

  if (!match) {
    throw new Error("could not find generate_handler! in lib.rs");
  }

  return match[1]!
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

// Commands granted in the capability allowlist
function allowedCommands(): string[] {
  const match = permissions.match(/commands\.allow\s*=\s*\[([\s\S]*?)\]/);

  if (!match) {
    throw new Error("could not find commands.allow in file-commands.toml");
  }

  return Array.from(match[1]!.matchAll(/"([^"]+)"/g))
    .map((entry) => entry[1]!)
    .sort();
}

// A command registered but not allowed is refused at runtime with nothing
// visible in the UI - the invoke just rejects. This has cost this project
// several rounds of debugging, so it is worth a test rather than a comment.
test("every registered command is granted in the capability allowlist", () => {
  const missing = registeredCommands().filter(
    (command) => !allowedCommands().includes(command),
  );

  assert.deepEqual(missing, []);
});

// The other direction is quieter still: a command in the allowlist that was
// never registered simply does not exist, and calling it fails at runtime.
// Export as PDF shipped this way and could never have worked.
test("every allowed command is actually registered", () => {
  const missing = allowedCommands().filter(
    (command) => !registeredCommands().includes(command),
  );

  assert.deepEqual(missing, []);
});
