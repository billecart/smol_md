// Reading and writing the image files a document links to. The rules for
// where they go and how they are linked are in utils/markdownImages.ts.

import { invoke } from "@tauri-apps/api/core";
import { isRunningInTauri } from "./fileService";
import {
  encodeImageSrc,
  fileNameOfPath,
  findMarkdownImages,
  imageExtensionForMime,
  imageMimeForPath,
  isDataImageUrl,
  isLocalImageSrc,
  parseDataImageUrl,
  pastedImageFileName,
  replaceImageSources,
  resolveImagePath,
} from "../utils/markdownImages";

async function readImageBytes(path: string): Promise<Blob> {
  const buffer = await invoke<ArrayBuffer>("read_image_file", { path });
  return new Blob([buffer], { type: imageMimeForPath(path) ?? "application/octet-stream" });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

// The web view can't load a file path directly, so the rich view shows a
// local image through a blob: URL of its bytes. Cached per path for the
// session; a picture edited outside the app shows its new version after a
// restart.
const displayUrls = new Map<string, Promise<string>>();

export function imageDisplayUrl(
  src: string,
  documentPath: string | null,
): string | Promise<string> {
  if (!isRunningInTauri() || !isLocalImageSrc(src)) {
    return src;
  }

  const path = resolveImagePath(src, documentPath);

  if (!path) {
    return src;
  }

  let url = displayUrls.get(path);

  if (!url) {
    url = readImageBytes(path)
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => {
        // Not cached: the file may turn up later (a sync client, a save).
        displayUrls.delete(path);
        return "";
      });
    displayUrls.set(path, url);
  }

  return url;
}

// Writes an image into the document's `.assets` folder and returns the src to
// link it with.
export async function saveImageBesideDocument(
  documentPath: string,
  fileName: string,
  base64: string,
): Promise<string> {
  const relativePath = await invoke<string>("save_image_file", {
    documentPath,
    fileName,
    data: base64,
  });
  return encodeImageSrc(relativePath);
}

export async function saveDataImageBesideDocument(
  documentPath: string,
  dataUrl: string,
  date = new Date(),
): Promise<string | null> {
  const parsed = parseDataImageUrl(dataUrl);

  if (!parsed) {
    return null;
  }

  return saveImageBesideDocument(
    documentPath,
    pastedImageFileName(date, parsed.extension),
    parsed.base64,
  );
}

export async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

export function isSupportedImageFile(file: File): boolean {
  return imageExtensionForMime(file.type) !== null;
}

export async function imagePathToBase64(path: string): Promise<string> {
  const dataUrl = await blobToDataUrl(await readImageBytes(path));
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

// Moves base64 `data:` images out of the text into files beside the document.
// Runs on every save, so a picture pasted into an Untitled document, or one
// that came in with a file from elsewhere, ends up as a file once the
// document has a folder to put it in.
export async function extractEmbeddedImages(
  markdown: string,
  documentPath: string,
): Promise<string> {
  if (!isRunningInTauri() || !markdown.includes("data:image/")) {
    return markdown;
  }

  const date = new Date();
  const replacements = [];

  for (const image of findMarkdownImages(markdown)) {
    if (!isDataImageUrl(image.src)) continue;
    const src = await saveDataImageBesideDocument(documentPath, image.src, date);
    if (src) replacements.push({ image, src });
  }

  return replacements.length ? replaceImageSources(markdown, replacements) : markdown;
}

// Save As into another folder: relative links would point at nothing there,
// so the images are copied into the new document's `.assets` folder.
export async function copyImagesForNewLocation(
  markdown: string,
  oldDocumentPath: string | null,
  newDocumentPath: string,
): Promise<string> {
  if (!isRunningInTauri() || !oldDocumentPath || oldDocumentPath === newDocumentPath) {
    return markdown;
  }

  const replacements = [];

  for (const image of findMarkdownImages(markdown)) {
    if (!isLocalImageSrc(image.src) || /^file:|^\/|^[a-z]:[\\/]/i.test(image.src)) continue;

    const oldPath = resolveImagePath(image.src, oldDocumentPath);
    if (!oldPath || oldPath === resolveImagePath(image.src, newDocumentPath)) continue;

    try {
      const base64 = await imagePathToBase64(oldPath);
      const src = await saveImageBesideDocument(newDocumentPath, fileNameOfPath(oldPath), base64);
      replacements.push({ image, src });
    } catch {
      // A link that was already broken stays as it was.
    }
  }

  return replacements.length ? replaceImageSources(markdown, replacements) : markdown;
}

// A copy of the document with every local image packed into the text as a
// data: URL, so it can be sent as one file. Web images stay links.
export async function inlineLocalImages(
  markdown: string,
  documentPath: string | null,
): Promise<{ markdown: string; packed: number; missing: string[] }> {
  const replacements = [];
  const missing: string[] = [];

  for (const image of findMarkdownImages(markdown)) {
    if (!isLocalImageSrc(image.src)) continue;

    const path = resolveImagePath(image.src, documentPath);

    try {
      if (!path || !isRunningInTauri()) throw new Error("unreadable");
      replacements.push({ image, src: await blobToDataUrl(await readImageBytes(path)) });
    } catch {
      missing.push(image.src);
    }
  }

  return {
    markdown: replacements.length ? replaceImageSources(markdown, replacements) : markdown,
    packed: replacements.length,
    missing,
  };
}

// What a save writes: images copied along when the document moves to another
// folder, and base64 images moved out into files.
export async function prepareImagesForSave(
  markdown: string,
  oldDocumentPath: string | null,
  newDocumentPath: string,
): Promise<string> {
  const copied = await copyImagesForNewLocation(markdown, oldDocumentPath, newDocumentPath);
  return extractEmbeddedImages(copied, newDocumentPath);
}
