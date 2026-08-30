import ts from "typescript";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

// Shared by run-tests.mjs and run-benchmarks.mjs. Transpile only, no type
// checking and no tsconfig, so the project keeps its zero-dependency runner.
export async function transpileProject({ root, outDir, dirs }) {
  await rm(outDir, { recursive: true, force: true });

  const sourceFiles = (
    await Promise.all(dirs.map((dir) => listTypeScriptFiles(dir)))
  ).flat();

  await Promise.all(
    sourceFiles.map((file) => transpileFile(file, root, outDir)),
  );

  return sourceFiles;
}

export async function listTypeScriptFiles(dir) {
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

async function transpileFile(file, root, outDir) {
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
