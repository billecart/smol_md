import assert from "node:assert/strict";
import { test } from "./testHarness";
import {
  findAvailableUpdate,
  isNewerVersion,
  parseReleaseVersion,
} from "../src/utils/updateCheck";

test("release tags parse to a plain version", () => {
  assert.equal(parseReleaseVersion("app-v1.1.15"), "1.1.15");
  assert.equal(parseReleaseVersion("v2.0.0"), "2.0.0");
  assert.equal(parseReleaseVersion("1.1.15"), "1.1.15");
});

test("unrecognised tags are not versions", () => {
  assert.equal(parseReleaseVersion("nightly"), null);
  assert.equal(parseReleaseVersion("app-v1.2"), null);
  assert.equal(parseReleaseVersion(undefined), null);
});

test("versions compare numerically, not as text", () => {
  assert.equal(isNewerVersion("1.1.10", "1.1.9"), true);
  assert.equal(isNewerVersion("1.2.0", "1.1.15"), true);
  assert.equal(isNewerVersion("1.1.15", "1.1.15"), false);
  assert.equal(isNewerVersion("1.1.14", "1.1.15"), false);
});

test("a newer release is offered", () => {
  assert.equal(findAvailableUpdate("app-v1.1.16", "1.1.15", null), "1.1.16");
});

test("the same or an older release is not offered", () => {
  assert.equal(findAvailableUpdate("app-v1.1.15", "1.1.15", null), null);
  assert.equal(findAvailableUpdate("app-v1.1.14", "1.1.15", null), null);
});

test("a dismissed release is not offered again, but the next one is", () => {
  assert.equal(findAvailableUpdate("app-v1.1.16", "1.1.15", "1.1.16"), null);
  assert.equal(findAvailableUpdate("app-v1.1.17", "1.1.15", "1.1.16"), "1.1.17");
});
