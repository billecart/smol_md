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
// The lookbehind leaves `![alt](src)` alone: that is an image, and turning it
// into `!` plus a link lost the image and saved as `\![alt](src)`.
const LINK_SOURCE = String.raw`(?<!!)\[([^\]\n]+)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)`;

// Anchored at the end, for the input rule: it fires on the closing paren.
export const MARKDOWN_LINK_INPUT = new RegExp(`${LINK_SOURCE}$`);

export type MarkdownSegment = {
  text: string;
  href?: string;
  title?: string;
};

// A URL pasted on its own - straight from the address bar - stayed plain text
// too, while the same URL in a file opened as a link. Only http(s) is matched:
// that is what browsers copy, and a guess at `example.com` would link things
// people meant as plain words.
const BARE_URL = /https?:\/\/[^\s<>]+/gi;

// Sentence punctuation after a URL belongs to the sentence, the same call GFM
// makes for autolinks. A closing paren is kept only when the URL opened one,
// as Wikipedia links do.
function trimUrlEnd(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (/[.,;:!?'"*_~]/.test(ch)) {
      end -= 1;
    } else if (ch === ")") {
      const body = url.slice(0, end);
      const opens = body.split("(").length - 1;
      const closes = body.split(")").length - 1;
      if (closes <= opens) break;
      end -= 1;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

function splitBareUrls(input: string, segments: MarkdownSegment[]): void {
  const pattern = new RegExp(BARE_URL.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const url = trimUrlEnd(match[0]);
    if (!/^https?:\/\/[^/]/i.test(url)) continue;

    if (match.index > last) {
      segments.push({ text: input.slice(last, match.index) });
    }

    segments.push({ text: url, href: url, title: "" });
    last = match.index + url.length;
  }

  if (last < input.length) {
    segments.push({ text: input.slice(last) });
  }
}

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
      splitBareUrls(input.slice(last, match.index), segments);
    }

    segments.push({ text: label, href, title: title ?? "" });
    last = match.index + full.length;
  }

  if (last < input.length) {
    splitBareUrls(input.slice(last), segments);
  }

  if (!segments.some((segment) => segment.href)) return null;

  return segments;
}

// Normalizes an external URL or email link before dispatching to the OS or browser.
// Bare hostnames are prefixed with https://; http://, https://, and mailto: are preserved.
export function normalizeExternalUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  return /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}
