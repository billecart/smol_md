import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transpileProject } from "./transpile.mjs";

const root = process.cwd();
const outDir = join(root, ".test-build");

await transpileProject({
  root,
  outDir,
  dirs: [join(root, "src", "utils"), join(root, "tests")],
});

const testFiles = (await readdir(join(outDir, "tests")))
  .filter((file) => file.endsWith(".test.js"))
  .map((file) => join(outDir, "tests", file));

for (const file of testFiles) {
  await import(pathToFileURL(file).href);
}

const harness = await import(pathToFileURL(join(outDir, "tests", "testHarness.js")).href);

try {
  await harness.run();
} finally {
  await rm(outDir, { recursive: true, force: true });
}
