// Images in a Markdown document live as files beside it, in a folder named
// after the document (`notes.md` -> `notes.assets/`), linked with a relative
// path. Pasting used to put the whole picture into the text as a base64
// `data:` URL - tens of thousands of characters that buried the document in
// Source mode. Everything here is pure string work; the file reading and
// writing is in services/imageService.ts.

import { getDirectory } from "./filePaths";

export type MarkdownImage = {
  start: number;
  end: number;
  alt: string;
  src: string;
  title: string;
};

// `![alt](src)` or `![alt](src "title")`, with the src optionally in <...>
// (the form for paths with spaces). Alt text may hold one level of brackets.
const IMAGE_PATTERN =
  /!\[((?:[^\[\]\\]|\\.|\[[^\[\]]*\])*)\]\(\s*(<[^<>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+("[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g;

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

// Character ranges of fenced code blocks and inline code, where image syntax
// is just text and must be left alone.
function codeRanges(markdown: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  let fence: { marker: string; start: number } | null = null;

  for (const line of markdown.split("\n")) {
    const match = FENCE_PATTERN.exec(line);

    if (fence) {
      if (match && match[1]![0] === fence.marker[0] && match[1]!.length >= fence.marker.length) {
        ranges.push([fence.start, offset + line.length]);
        fence = null;
      }
    } else if (match) {
      fence = { marker: match[1]!, start: offset };
    }

    offset += line.length + 1;
  }

  if (fence) {
    ranges.push([fence.start, markdown.length]);
  }

  for (const match of markdown.matchAll(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g)) {
    ranges.push([match.index!, match.index! + match[0].length]);
  }

  return ranges;
}

export function findMarkdownImages(markdown: string): MarkdownImage[] {
  const ranges = codeRanges(markdown);
  const insideCode = (index: number) =>
    ranges.some(([start, end]) => index >= start && index < end);
  const images: MarkdownImage[] = [];

  for (const match of markdown.matchAll(IMAGE_PATTERN)) {
    const start = match.index!;

    if (insideCode(start) || markdown[start - 1] === "\\") {
      continue;
    }

    const rawSrc = match[2] ?? "";
    const rawTitle = match[3] ?? "";

    images.push({
      start,
      end: start + match[0].length,
      alt: match[1] ?? "",
      src: rawSrc.startsWith("<") ? rawSrc.slice(1, -1) : rawSrc,
      title: rawTitle ? rawTitle.slice(1, -1) : "",
    });
  }

  return images;
}

// Swaps the src of the given images, keeping alt text and title as written.
export function replaceImageSources(
  markdown: string,
  replacements: Array<{ image: MarkdownImage; src: string }>,
): string {
  let result = markdown;

  for (const { image, src } of [...replacements].sort((a, b) => b.image.start - a.image.start)) {
    const title = image.title ? ` "${image.title.replace(/"/g, '\\"')}"` : "";
    result =
      result.slice(0, image.start) +
      `![${image.alt}](${src}${title})` +
      result.slice(image.end);
  }

  return result;
}

export function isDataImageUrl(src: string): boolean {
  return /^data:image\//i.test(src);
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

// A file on this computer: a relative path, an absolute one, or file://.
// Web addresses, data: URLs and in-page anchors are not.
export function isLocalImageSrc(src: string): boolean {
  if (!src || src.startsWith("#") || src.startsWith("//")) {
    return false;
  }

  if (/^file:/i.test(src) || /^[a-z]:[\\/]/i.test(src)) {
    return true;
  }

  return !SCHEME_PATTERN.test(src);
}

function decodePath(src: string): string {
  try {
    return decodeURI(src);
  } catch {
    return src;
  }
}

// The absolute path a local image src points at, read against the folder of
// the document. null when it can't be placed (an Untitled document with a
// relative link, or a src that isn't a local file).
export function resolveImagePath(src: string, documentPath: string | null): string | null {
  if (!isLocalImageSrc(src)) {
    return null;
  }

  if (/^file:/i.test(src)) {
    try {
      const path = decodeURIComponent(new URL(src).pathname);
      return /^\/[a-z]:\//i.test(path) ? path.slice(1) : path;
    } catch {
      return null;
    }
  }

  const path = decodePath(src.split(/[?#]/)[0] ?? src);

  if (path.startsWith("/") || /^[a-z]:[\\/]/i.test(path)) {
    return path;
  }

  const directory = documentPath ? getDirectory(documentPath) : null;

  if (!directory) {
    return null;
  }

  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  const parts = directory.split(/[\\/]/);

  for (const part of path.split(/[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join(separator) || separator;
}

// `notes.md` -> `notes.assets`
export function assetsFolderName(documentPath: string): string {
  const name = documentPath.split(/[\\/]/).pop() ?? "document";
  return `${name.replace(/\.(md|markdown)$/i, "") || "document"}.assets`;
}

// A relative path written into Markdown: spaces and brackets percent-encoded
// so the link works without <...> in every Markdown reader.
export function encodeImageSrc(relativePath: string): string {
  return relativePath
    .split("/")
    .map((part) =>
      part.replace(/[ %()<>\[\]#?"]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
      ),
    )
    .join("/");
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
};

export function imageExtensionForMime(mime: string): string | null {
  return EXTENSION_BY_MIME[mime.toLowerCase()] ?? null;
}

export function imageMimeForPath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function isImagePath(path: string): boolean {
  return imageMimeForPath(path) !== null;
}

export function parseDataImageUrl(
  url: string,
): { mime: string; extension: string; base64: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;[a-z0-9=.+-]+)*;base64,([\s\S]*)$/i.exec(url);

  if (!match) {
    return null;
  }

  const extension = imageExtensionForMime(match[1]!);

  if (!extension) {
    return null;
  }

  return { mime: match[1]!.toLowerCase(), extension, base64: match[2]!.replace(/\s+/g, "") };
}

// `image-20261124-103012.png`: sorts by time, says when it was added.
export function pastedImageFileName(date: Date, extension: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `image-${stamp}.${extension}`;
}

export function fileNameOfPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
