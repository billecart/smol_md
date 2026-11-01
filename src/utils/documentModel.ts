import type { OpenedMarkdownFile } from "../services/fileService";
import { normalizeMarkdownLineBreaks } from "./markdown";

export type OpenDocument = {
  id: string;
  filePath: string | null;
  fileName: string;
  markdown: string;
  originalMarkdown: string;
  isDirty: boolean;
  lastSavedAt: Date | null;
};

export const EMPTY_MARKDOWN = "# Untitled\n\n";

export function createDocument(
  overrides: Partial<Omit<OpenDocument, "id">> = {},
): OpenDocument {
  const markdown = normalizeMarkdownLineBreaks(
    overrides.markdown ?? EMPTY_MARKDOWN,
  );
  const originalMarkdown = normalizeMarkdownLineBreaks(
    overrides.originalMarkdown ?? markdown,
  );

  return {
    id: createDocumentId(),
    filePath: overrides.filePath ?? null,
    fileName: overrides.fileName ?? "Untitled.md",
    markdown,
    originalMarkdown,
    isDirty: overrides.isDirty ?? markdown !== originalMarkdown,
    lastSavedAt: overrides.lastSavedAt ?? null,
  };
}

export function setDocumentMarkdown(
  document: OpenDocument,
  markdown: string,
): OpenDocument {
  const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);

  return {
    ...document,
    markdown: normalizedMarkdown,
    isDirty: normalizedMarkdown !== document.originalMarkdown,
  };
}

// Applies text the rich editor had not reported yet (see RichEditor's flush)
// to the document it belongs to, so a save or an unsaved-changes check sees
// the edit before React re-renders. null means there was nothing pending.
export function applyPendingMarkdown(
  documents: OpenDocument[],
  documentId: string,
  markdown: string | null,
): OpenDocument[] {
  if (markdown === null) {
    return documents;
  }

  return documents.map((document) =>
    document.id === documentId
      ? setDocumentMarkdown(document, markdown)
      : document,
  );
}

export function markDocumentSaved(
  document: OpenDocument,
  markdown: string,
  filePath: string | null,
  fileName?: string,
): OpenDocument {
  const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);

  return {
    ...document,
    filePath,
    fileName: fileName ?? document.fileName,
    originalMarkdown: normalizedMarkdown,
    isDirty: document.markdown !== normalizedMarkdown,
    lastSavedAt: new Date(),
  };
}

// After a tab is saved to `filePath`, any other tab that had that file open
// is showing text that is no longer on disk; saving it later would silently
// put the old text back. It becomes an unsaved copy instead, so saving it asks
// where to.
export function detachOtherDocumentsAtPath(
  documents: OpenDocument[],
  savedDocumentId: string,
  filePath: string | null,
): OpenDocument[] {
  if (!filePath) return documents;

  return documents.map((document) =>
    document.id !== savedDocumentId && document.filePath === filePath
      ? { ...document, filePath: null, isDirty: true }
      : document,
  );
}

// Whether two versions of a file hold the same text, ignoring line endings and
// a byte-order mark, which the editor does not keep track of separately.
export function isSameFileText(a: string, b: string) {
  const plain = (text: string) => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return plain(a) === plain(b);
}

export function findExistingDocumentByPath(
  documents: OpenDocument[],
  filePath: string | null,
) {
  return filePath
    ? documents.find((document) => document.filePath === filePath) ?? null
    : null;
}

export function shouldReplaceInitialDraft(
  documents: OpenDocument[],
  activeDocument: OpenDocument,
) {
  return (
    documents.length === 1 &&
    !activeDocument.filePath &&
    !activeDocument.isDirty &&
    activeDocument.markdown === EMPTY_MARKDOWN
  );
}

export function createLoadedDocument(file: OpenedMarkdownFile) {
  const normalizedMarkdown = normalizeMarkdownLineBreaks(file.markdown);

  return createDocument({
    filePath: file.filePath,
    fileName: file.fileName,
    markdown: normalizedMarkdown,
    originalMarkdown: normalizedMarkdown,
    isDirty: false,
  });
}

// Opens several files in one pass so each decision sees the result of the
// previous one. Calling a single-file loader in a loop reuses the same stale
// `documents`, so every file tried to replace the one starter draft and only
// the last survived.
export function addLoadedDocuments(
  documents: OpenDocument[],
  activeDocument: OpenDocument,
  files: OpenedMarkdownFile[],
) {
  let nextDocuments = documents;
  let nextActiveDocument = activeDocument;

  for (const file of files) {
    const existingDocument = findExistingDocumentByPath(
      nextDocuments,
      file.filePath,
    );

    if (existingDocument) {
      // Opening a file that is already open used to just show the tab as it
      // was, even when another app had changed the file since. Without
      // unsaved edits in the way, show what is on disk now.
      const refreshed =
        !existingDocument.isDirty && existingDocument.markdown !== file.markdown
          ? createLoadedDocument(file)
          : null;

      if (refreshed) {
        const updated = { ...refreshed, id: existingDocument.id };
        nextDocuments = nextDocuments.map((document) =>
          document.id === existingDocument.id ? updated : document,
        );
        nextActiveDocument = updated;
      } else {
        nextActiveDocument = existingDocument;
      }

      continue;
    }

    const loadedDocument = createLoadedDocument(file);

    nextDocuments = shouldReplaceInitialDraft(nextDocuments, nextActiveDocument)
      ? nextDocuments.map((document) =>
          document.id === nextActiveDocument.id ? loadedDocument : document,
        )
      : [...nextDocuments, loadedDocument];
    nextActiveDocument = loadedDocument;
  }

  return { documents: nextDocuments, activeDocumentId: nextActiveDocument.id };
}

export function requiresDiscardConfirmation(
  document: Pick<OpenDocument, "isDirty">,
) {
  return document.isDirty;
}

function createDocumentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Moves one tab to `toIndex` (its position after the move). Returns the same
// array when nothing changes, so a drag that hovers in place re-renders nothing.
export function moveDocument<T extends { id: string }>(
  documents: T[],
  documentId: string,
  toIndex: number,
) {
  const fromIndex = documents.findIndex((document) => document.id === documentId);
  const clampedIndex = Math.max(0, Math.min(toIndex, documents.length - 1));

  if (fromIndex === -1 || fromIndex === clampedIndex) {
    return documents;
  }

  const next = documents.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedIndex, 0, moved!);
  return next;
}
