import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { MarkType, Node as ProseNode } from "@milkdown/kit/prose/model";

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

// Bare URLs in a paste the editor has already parsed - whatever the clipboard
// held - become links. The packaged app's WebKit hands over its own rewrite of
// the clipboard HTML even for a URL copied on its own, so deciding from the
// raw clipboard missed it. Text that is already a link, or is code, stays.
export function linkifySlice(slice: Slice, linkType: MarkType): Slice {
  let changed = false;

  const mapFragment = (fragment: Fragment, inCode: boolean): Fragment => {
    const children: ProseNode[] = [];

    fragment.forEach((child) => {
      if (!child.isText) {
        const code = inCode || Boolean(child.type.spec.code);
        children.push(child.copy(mapFragment(child.content, code)));
        return;
      }

      const skip =
        inCode ||
        child.marks.some((mark) => mark.type === linkType || mark.type.spec.code);
      const segments: MarkdownSegment[] = [];
      if (!skip) splitBareUrls(child.text ?? "", segments);

      if (!segments.some((segment) => segment.href)) {
        children.push(child);
        return;
      }

      changed = true;
      for (const segment of segments) {
        const marks = segment.href
          ? linkType.create({ href: segment.href, title: "" }).addToSet(child.marks)
          : child.marks;
        children.push(child.type.schema.text(segment.text, marks));
      }
    });

    return Fragment.fromArray(children);
  };

  const content = mapFragment(slice.content, false);
  return changed ? new Slice(content, slice.openStart, slice.openEnd) : slice;
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

// Some apps put an HTML copy on the clipboard that is nothing but the text
// with a charset tag in front - `<meta charset='utf-8'>https://...` - so a URL
// copied that way skipped the plain-text link handling and stayed plain text.
// HTML like that carries no formatting worth keeping.
export function isPlainTextHtml(html: string): boolean {
  const body = html.replace(/<meta\b[^>]*>/gi, "");
  return !/<[a-z!/]/i.test(body);
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
