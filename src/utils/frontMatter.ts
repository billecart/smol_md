// Front matter: the YAML (`---`) or TOML (`+++`) block some tools (Obsidian,
// Jekyll, Hugo) expect at the very top of a file. The rich editor has no idea
// what it is - it read the opening `---` as a horizontal rule and the closing
// one as a heading underline, and saving wrote both back that way, so those
// tools no longer saw any front matter. So it never goes into the rich
// editor: it is split off on the way in and put back, untouched, on the way
// out. It can still be edited in Source mode.

export type SplitFrontMatter = {
  // The block exactly as it was, including the blank lines after it.
  frontMatter: string;
  body: string;
};

// The line after the opening fence must not be blank, so a file that merely
// starts with a horizontal rule, then a paragraph, then another rule is not
// mistaken for front matter.
const FRONT_MATTER =
  /^(?:\uFEFF)?(---|\+\+\+)[ \t]*\r?\n(?:[^\r\n][\s\S]*?\r?\n)?\1[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/;

export function splitFrontMatter(markdown: string): SplitFrontMatter {
  const match = FRONT_MATTER.exec(markdown);

  if (!match) {
    return { frontMatter: "", body: markdown };
  }

  return { frontMatter: match[0], body: markdown.slice(match[0].length) };
}
