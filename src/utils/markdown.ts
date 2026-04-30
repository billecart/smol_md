export function normalizeMarkdownLineBreaks(markdown: string) {
  return markdown.replace(/[ \t]*<br\s*\/?>[ \t]*/gi, "\\\n");
}
