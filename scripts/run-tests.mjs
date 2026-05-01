import ts from "typescript";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const testsDir = join(root, "tests");
const sourceDir = join(root, "src", "utils");
const outDir = join(root, ".test-build");

await rm(outDir, { recursive: true, force: true });

const sourceFiles = [
  ...(await listTypeScriptFiles(sourceDir)),
  ...(await listTypeScriptFiles(testsDir)),
];

await Promise.all(sourceFiles.map(transpileFile));

const testFiles = (await readdir(join(outDir, "tests")))
  .filter((file) => file.endsWith(".test.js"))
  .map((file) => join(outDir, "tests", file));

for (const file of testFiles) {
  await import(pathToFileURL(file).href);
}

const harness = await import(pathToFileURL(join(outDir, "tests", "testHarness.js")).href);
await harness.run();
await rm(outDir, { recursive: true, force: true });

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }

      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );

  return files.flat();
}

async function transpileFile(file) {
  const source = await readFile(file, "utf8");
  const relativePath = relative(root, file).replace(/\.ts$/, ".js");
  const outputPath = join(outDir, relativePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: file,
  }).outputText;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, addJsExtensionsToRelativeImports(transpiled));
}

function addJsExtensionsToRelativeImports(source) {
  return source.replace(
    /(from\s+["'])(\.[^"']+?)(["'])/g,
    (_match, prefix, specifier, suffix) => {
      if (/\.(js|json|css|svg)$/.test(specifier)) {
        return `${prefix}${specifier}${suffix}`;
      }

      return `${prefix}${specifier}.js${suffix}`;
    },
  );
}
