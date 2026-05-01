export function isUnsafeEmptyOverwrite(
  markdown: string,
  originalMarkdown: string,
  filePath: string | null,
) {
  return Boolean(filePath) && markdown.length === 0 && originalMarkdown.length > 0;
}
