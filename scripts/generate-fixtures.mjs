// Generates deterministic markdown fixtures for performance and UI testing.
// Output is byte-identical across runs and machines, so a benchmark taken today
// is comparable to one taken next week. Nothing here is committed; regenerate
// with `node scripts/generate-fixtures.mjs`.
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outDir = parseOutDir() ?? join(root, "test-files", "generated");
const only = parseOnly();

const written = [];

// Declared as a function so the module's `const` tables below are initialised
// before any fixture is built.
async function main() {
await rm(outDir, { recursive: true, force: true });
await mkdir(join(outDir, "tabs", "a"), { recursive: true });
await mkdir(join(outDir, "tabs", "b"), { recursive: true });

if (wanted("tiny")) {
  await emit("tiny-2kb.md", buildProse({ seed: 1, targetBytes: 2_000, headingEvery: 6, tableEvery: 0, codeEvery: 0 }));
}

if (wanted("medium")) {
  await emit("medium-100kb.md", buildProse({ seed: 2, targetBytes: 100_000, headingEvery: 8, tableEvery: 60, codeEvery: 40 }));
}

if (wanted("large")) {
  await emit("large-500kb.md", buildProse({ seed: 3, targetBytes: 500_000, headingEvery: 8, tableEvery: 60, codeEvery: 40 }));
}

if (wanted("huge")) {
  await emit("huge-2mb.md", buildProse({ seed: 4, targetBytes: 2_000_000, headingEvery: 8, tableEvery: 60, codeEvery: 40 }));
}

if (wanted("find")) {
  await emit("find-pathological-200kb.md", buildFindFixture({ seed: 5, targetBytes: 200_000, paragraphWords: 8 }));
  await emit("find-fewnodes-200kb.md", buildFindFixture({ seed: 6, targetBytes: 200_000, paragraphWords: 4_000 }));
}

if (wanted("tables")) {
  await emit("wide-tables.md", buildWideTables(7));
}

if (wanted("toc")) {
  await emit("tricky-toc.md", TRICKY_TOC);
}

if (wanted("roundtrip")) {
  await emit("roundtrip-canonical.md", ROUNDTRIP_CANONICAL);
}

if (wanted("tabs")) {
  for (let i = 1; i <= 8; i += 1) {
    const label = String(i).padStart(2, "0");
    await emit(join("tabs", `doc-${label}.md`), buildProse({ seed: 100 + i, targetBytes: 1_000, headingEvery: 4, tableEvery: 0, codeEvery: 0 }));
  }

  await emit(join("tabs", "a", "notes.md"), "# Notes from folder a\n\nFirst set of notes.\n");
  await emit(join("tabs", "b", "notes.md"), "# Notes from folder b\n\nSecond set of notes.\n");
}

console.log(`\n${written.length} fixtures written to ${outDir}`);
}

async function emit(name, contents) {
  const bytes = Buffer.byteLength(contents, "utf8");
  const sha = createHash("sha256").update(contents).digest("hex").slice(0, 12);

  await writeFile(join(outDir, name), contents, "utf8");
  written.push(name);
  console.log(`${name.padEnd(32)} ${String(bytes).padStart(9)} bytes  sha256:${sha}`);
}

function wanted(group) {
  return only.length === 0 || only.includes(group);
}

function parseOnly() {
  const flag = process.argv.find((arg) => arg.startsWith("--only="));
  return flag ? flag.slice("--only=".length).split(",") : [];
}

function parseOutDir() {
  const index = process.argv.indexOf("--out");
  return index === -1 ? null : process.argv[index + 1];
}

// mulberry32: small, fast, and identical on every platform.
function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATIN = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum praesent gravida rutrum arcu tellus lacus viverra vitae congue mauris augue neque nunc sodales quam nam aliquam vestibulum morbi blandit cursus risus feugiat pretium fusce ultrices posuere cubilia curae donec pharetra massa".split(" ");
const CYRILLIC = "текст документ страница заметка редактор строка слово абзац заголовок список таблица ссылка".split(" ");

function pickWord(random) {
  // 5% Cyrillic keeps the byte/word ratio realistic for mixed-script documents.
  const pool = random() < 0.05 ? CYRILLIC : LATIN;
  return pool[Math.floor(random() * pool.length)];
}

function buildSentence(random, wordCount) {
  const words = [];

  for (let i = 0; i < wordCount; i += 1) {
    words.push(pickWord(random));
  }

  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return `${words.join(" ")}.`;
}

function buildParagraph(random, sentenceCount) {
  const sentences = [];

  for (let i = 0; i < sentenceCount; i += 1) {
    sentences.push(buildSentence(random, 8 + Math.floor(random() * 14)));
  }

  return sentences.join(" ");
}

function buildProse({ seed, targetBytes, headingEvery, tableEvery, codeEvery }) {
  const random = createRandom(seed);
  const parts = [];
  let bytes = 0;
  let block = 0;

  while (bytes < targetBytes) {
    let chunk;

    if (block % headingEvery === 0) {
      const level = 1 + (Math.floor(block / headingEvery) % 4);
      chunk = `${"#".repeat(level)} ${buildSentence(random, 3 + Math.floor(random() * 4)).replace(/\.$/, "")}`;
    } else if (tableEvery > 0 && block % tableEvery === 0) {
      chunk = buildTable(random, 3, 4);
    } else if (codeEvery > 0 && block % codeEvery === 0) {
      chunk = buildCodeBlock(random);
    } else if (block % 11 === 0) {
      chunk = buildList(random);
    } else if (block % 17 === 0) {
      chunk = `Read more at [${pickWord(random)} reference](https://example.com/${pickWord(random)}/${pickWord(random)}) for details.`;
    } else {
      chunk = buildParagraph(random, 2 + Math.floor(random() * 4));
    }

    parts.push(chunk);
    bytes += Buffer.byteLength(chunk, "utf8") + 2;
    block += 1;
  }

  return `${parts.join("\n\n")}\n`;
}

function buildTable(random, columns, rows) {
  const header = [];

  for (let c = 0; c < columns; c += 1) {
    header.push(pickWord(random));
  }

  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];

  for (let r = 0; r < rows; r += 1) {
    const cells = [];

    for (let c = 0; c < columns; c += 1) {
      cells.push(`${pickWord(random)} ${pickWord(random)}`);
    }

    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

function buildCodeBlock(random) {
  const lines = ["```js"];

  for (let i = 0; i < 4 + Math.floor(random() * 5); i += 1) {
    lines.push(`const ${pickWord(random)} = ${Math.floor(random() * 1000)};`);
  }

  lines.push("```");
  return lines.join("\n");
}

function buildList(random) {
  const lines = [];

  for (let i = 0; i < 3 + Math.floor(random() * 4); i += 1) {
    lines.push(`- ${buildSentence(random, 5 + Math.floor(random() * 8))}`);
  }

  return lines.join("\n");
}

// Two fixtures of equal size but wildly different node counts. The delta
// between them isolates the per-node cost of the find decoration walk from
// raw document size.
function buildFindFixture({ seed, targetBytes, paragraphWords }) {
  const random = createRandom(seed);
  const parts = [];
  let bytes = 0;

  while (bytes < targetBytes) {
    const words = [];

    for (let i = 0; i < paragraphWords; i += 1) {
      words.push(pickWord(random));
    }

    const chunk = words.join(" ");
    parts.push(chunk);
    bytes += Buffer.byteLength(chunk, "utf8") + 2;
  }

  return `# Find fixture\n\n${parts.join("\n\n")}\n`;
}

function buildWideTables(seed) {
  const random = createRandom(seed);
  const columns = 14;
  const header = [];

  for (let c = 0; c < columns; c += 1) {
    header.push(`column ${c + 1}`);
  }

  const lines = [
    "# Wide table overflow",
    "",
    "A fourteen column table with unbreakable URL tokens. The editor column is",
    "740px, so this must either wrap or scroll inside its own container.",
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];

  for (let r = 0; r < 12; r += 1) {
    const cells = [];

    for (let c = 0; c < columns; c += 1) {
      cells.push(`https://example.com/${pickWord(random)}/${pickWord(random)}/${pickWord(random)}/${r}-${c}`);
    }

    lines.push(`| ${cells.join(" | ")} |`);
  }

  lines.push("", "## Control table", "", "| one | two | three |", "| --- | --- | --- |", "| a | b | c |", "");

  return lines.join("\n");
}

const TRICKY_TOC = `# Plain heading

Body text.

## **Bold** heading

Body text.

## Heading with \`inline code\`

Body text.

## [Link](https://example.com) heading

Body text.

## Heading with *em* and ~~del~~

Body text.

## Setup

First setup section.

### Nested

Nested body.

## Setup

Second setup section with the same name.

Setext H1
=========

Body text.

Setext H2
---------

Body text.

## Trailing hashes ##

Body text.

> ## Heading in a blockquote

\`\`\`
# Heading inside a fence
\`\`\`

    # Indented code heading

#NoSpace

####### Seven hashes
`;

const ROUNDTRIP_CANONICAL = `# Round trip canonical forms

*Single asterisk italic* and _underscore emphasis_ in one paragraph.

* Asterisk bullet one
* Asterisk bullet two

1) Paren ordered item
2) Another paren ordered item

Setext H2
---------

## Trailing hashes ##

A line ending in two spaces
continues as a hard break.

A [reference link][ref] and a bare <https://example.com> autolink.

[ref]: https://example.com/reference

<!-- an html comment -->

<div class="raw">Raw HTML block</div>

| left | center | right |
| :--- | :----: | ----: |
| a | b | c |
`;

await main();
