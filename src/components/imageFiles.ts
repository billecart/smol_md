// Images in the rich editor are files beside the document (see
// utils/markdownImages.ts for the layout):
//
// - Pasting a picture writes it into `<document>.assets/` and links it with a
//   relative path. An Untitled document has no folder yet, so the picture is
//   held as a data: URL until the first save moves it out (App.tsx).
// - Any base64 data: image that reaches the document some other way (pasted
//   HTML, a file that came with one) is moved out to a file the same way, as
//   soon as the document is edited and has a folder.
// - Files dropped from Finder or Explorer are copied in. The desktop app gets
//   those drops as paths from Tauri, not as DOM drop events, so that half is
//   wired up in RichEditor.tsx; handleDrop below covers the browser preview.
// - Local images are shown through the image service, since the web view
//   can't load a file path itself.

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Fragment, Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { isRunningInTauri } from "../services/fileService";
import {
  fileToDataUrl,
  imageDisplayUrl,
  imagePathToBase64,
  isSupportedImageFile,
  saveDataImageBesideDocument,
  saveImageBesideDocument,
} from "../services/imageService";
import {
  fileNameOfPath,
  imageMimeForPath,
  isDataImageUrl,
  isImagePath,
  parseDataImageUrl,
  pastedImageFileName,
} from "../utils/markdownImages";

export type ImageFilesOptions = {
  documentPath: { current: string | null };
  // The editor changed outside the undo history (a data: URL swapped for a
  // file link) and App's copy of the text needs to catch up.
  onDocumentRewritten: () => void;
  onError: (message: string) => void;
};

function createImageView(
  initialNode: ProseNode,
  documentPath: { current: string | null },
): NodeView {
  const img = document.createElement("img");
  let node = initialNode;

  const render = () => {
    const src = String(node.attrs.src ?? "");
    img.alt = String(node.attrs.alt ?? "");
    if (node.attrs.title) img.title = String(node.attrs.title);
    else img.removeAttribute("title");
    img.dataset.src = src;

    const url = imageDisplayUrl(src, documentPath.current);

    if (typeof url === "string") {
      img.src = url;
      return;
    }

    img.removeAttribute("src");
    void url.then((resolved) => {
      if (img.dataset.src !== src) return;
      if (resolved) img.src = resolved;
      else img.classList.add("image-missing");
    });
  };

  render();

  return {
    dom: img,
    update(next) {
      if (next.type !== node.type) return false;
      if (next.attrs.src !== node.attrs.src) img.classList.remove("image-missing");
      node = next;
      render();
      return true;
    },
    ignoreMutation: () => true,
  };
}

// A screenshot on the clipboard is always called "image.png"; anything else
// (a file copied in Finder) keeps its own name.
function nameForFile(file: File, extension: string, date: Date): string {
  return file.name && !/^image\.[a-z]+$/i.test(file.name) && isImagePath(file.name)
    ? file.name
    : pastedImageFileName(date, extension);
}

export function insertImages(view: EditorView, srcs: string[], position: number | null) {
  const imageType = view.state.schema.nodes.image;

  if (!imageType || srcs.length === 0 || view.isDestroyed) return;

  const nodes = srcs.map((src) => imageType.create({ src, alt: "", title: "" }));
  const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
  const tr =
    position === null
      ? view.state.tr.replaceSelection(slice)
      : view.state.tr.replaceRange(position, position, slice);

  view.dispatch(tr.scrollIntoView().setMeta("uiEvent", "paste"));
  view.focus();
}

async function srcForImageFile(
  file: File,
  documentPath: string | null,
  date: Date,
): Promise<string> {
  const dataUrl = await fileToDataUrl(file);

  if (!documentPath || !isRunningInTauri()) return dataUrl;

  const parsed = parseDataImageUrl(dataUrl);
  if (!parsed) return dataUrl;

  return saveImageBesideDocument(documentPath, nameForFile(file, parsed.extension, date), parsed.base64);
}

async function insertImageFiles(
  view: EditorView,
  files: File[],
  position: number | null,
  options: ImageFilesOptions,
) {
  const date = new Date();
  const srcs: string[] = [];

  for (const file of files) {
    try {
      srcs.push(await srcForImageFile(file, options.documentPath.current, date));
    } catch (error) {
      options.onError(`Could not add the image: ${String(error)}`);
    }
  }

  insertImages(view, srcs, position);
}

// Image files dropped from Finder/Explorer, which Tauri hands over as paths.
export async function insertImagePaths(
  view: EditorView,
  paths: string[],
  position: number | null,
  options: ImageFilesOptions,
) {
  const srcs: string[] = [];
  const documentPath = options.documentPath.current;

  for (const path of paths.filter(isImagePath)) {
    try {
      const base64 = await imagePathToBase64(path);
      srcs.push(
        documentPath
          ? await saveImageBesideDocument(documentPath, fileNameOfPath(path), base64)
          : `data:${imageMimeForPath(path)};base64,${base64}`,
      );
    } catch (error) {
      options.onError(`Could not add ${fileNameOfPath(path)}: ${String(error)}`);
    }
  }

  insertImages(view, srcs, position);
}

function clipboardImageFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files ?? []).filter(isSupportedImageFile);

  if (files.length === 0) return [];

  // Text alongside the picture means a rich copy (a web page, a document)
  // that ProseMirror should paste as usual - unless the text is only the
  // copied file's own name, which is what Finder puts there.
  const text = data.getData("text/plain").trim();
  if (text && !files.some((file) => text.split("\n").includes(file.name))) return [];

  return files;
}

export const imageFilesPlugin = (options: ImageFilesOptions) => {
  const inFlight = new Set<string>();

  const moveDataImagesToFiles = (view: EditorView) => {
    const documentPath = options.documentPath.current;

    if (!documentPath || !isRunningInTauri()) return;

    const pending = new Set<string>();
    view.state.doc.descendants((node) => {
      const src = String(node.attrs.src ?? "");
      if (node.type.name === "image" && isDataImageUrl(src) && !inFlight.has(src)) {
        pending.add(src);
      }
    });

    const date = new Date();

    for (const dataUrl of pending) {
      inFlight.add(dataUrl);
      saveDataImageBesideDocument(documentPath, dataUrl, date)
        .then((src) => {
          if (!src || view.isDestroyed) return;

          const tr = view.state.tr;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.src === dataUrl) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, src });
            }
          });

          if (!tr.docChanged) return;

          // Out of the undo history: undoing it would put the base64 back,
          // and this would just move it out again, leaving undo stuck here.
          view.dispatch(tr.setMeta("addToHistory", false));
          options.onDocumentRewritten();
        })
        .catch((error) => options.onError(`Could not save the image as a file: ${String(error)}`))
        .finally(() => inFlight.delete(dataUrl));
    }
  };

  return $prose(
    () =>
      new Plugin({
        key: new PluginKey("smolImageFiles"),
        props: {
          nodeViews: {
            image: (node) => createImageView(node, options.documentPath),
          },
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            if (!data || view.state.selection.$from.parent.type.spec.code) return false;

            const files = clipboardImageFiles(data);
            if (files.length === 0) return false;

            event.preventDefault();
            void insertImageFiles(view, files, null, options);
            return true;
          },
          handleDrop: (view, event) => {
            const files = Array.from(event.dataTransfer?.files ?? []).filter(isSupportedImageFile);
            if (files.length === 0) return false;

            event.preventDefault();
            const position =
              view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
            void insertImageFiles(view, files, position, options);
            return true;
          },
        },
        view: () => ({
          update: (view, previousState) => {
            if (!previousState.doc.eq(view.state.doc)) moveDataImagesToFiles(view);
          },
        }),
      }),
  );
};
