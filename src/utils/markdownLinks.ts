// Rich mode had no idea what `[label](url)` meant. Typed or pasted, it stayed
// plain text, and serializing then escaped it into
// `\[label]\(https\://example.com)` - remark has to stop literal text being
// read back as a link, and has to escape the colon too or the bare URL would
// turn into an autolink. Nothing looked wrong until you opened Source.
//
// The matching lives here rather than in the editor because the editor file is
// not compiled by the test runner, and this is the part worth testing.

// A URL is everything up to the closing paren, so a trailing `)` inside the
// URL itself is not supported - the same limit CommonMark has for unbracketed
// destinations, and the reason `<...>` exists there.
const LINK_SOURCE = String.raw`\[([^\]\n]+)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)`;

// Anchored at the end, for the input rule: it fires on the closing paren.
export const MARKDOWN_LINK_INPUT = new RegExp(`${LINK_SOURCE}$`);

export type MarkdownSegment = {
  text: string;
  href?: string;
  title?: string;
};

// Splits a line into plain runs and link runs. Returns null when there is no
// link at all, so callers can leave the input completely alone rather than
// rebuilding an identical string.
export function splitMarkdownLinks(input: string): MarkdownSegment[] | null {
  const pattern = new RegExp(LINK_SOURCE, "g");
  const segments: MarkdownSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const [full, label, href, title] = match;
    if (!label || !href) continue;

    if (match.index > last) {
      segments.push({ text: input.slice(last, match.index) });
    }

    segments.push({ text: label, href, title: title ?? "" });
    last = match.index + full.length;
  }

  if (!segments.length) return null;

  if (last < input.length) {
    segments.push({ text: input.slice(last) });
  }

  return segments;
}
