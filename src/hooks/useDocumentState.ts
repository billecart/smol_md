import { useCallback, useMemo, useRef, useState } from "react";
import { OpenedMarkdownFile } from "../services/fileService";
import {
  addLoadedDocuments,
  createDocument,
  markDocumentSaved,
  setDocumentMarkdown,
  type OpenDocument,
} from "../utils/documentModel";

export type { OpenDocument };

export function useDocumentState() {
  const [documents, setDocuments] = useState<OpenDocument[]>(() => [
    createDocument(),
  ]);
  const [activeDocumentId, setActiveDocumentId] = useState(
    () => documents[0]!.id,
  );

  const activeDocument =
    documents.find((document) => document.id === activeDocumentId) ??
    documents[0]!;

  // Stable across keystrokes: depends only on `activeDocumentId`, which only
  // changes when the active tab changes (switch/open/close), not on
  // `documents` itself (which gets a brand-new array/object identity on every
  // keystroke via setDocumentMarkdown below). Uses the functional
  // setDocuments updater so it always operates on the latest document list
  // without needing `documents` in the dependency array.
  const setMarkdown = useCallback(
    (markdown: string) => {
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === activeDocumentId
            ? setDocumentMarkdown(document, markdown)
            : document,
        ),
      );
    },
    [activeDocumentId],
  );

  // Same pattern as setMarkdown above.
  const markSaved = useCallback(
    (markdown: string, filePath: string | null, fileName?: string) => {
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === activeDocumentId
            ? markDocumentSaved(document, markdown, filePath, fileName)
            : document,
        ),
      );
    },
    [activeDocumentId],
  );

  // No dependency on documents/activeDocument at all: creates a brand new
  // document and appends it via the functional setDocuments updater.
  const createNewDocument = useCallback(() => {
    const newDocument = createDocument();
    setDocuments((currentDocuments) => [...currentDocuments, newDocument]);
    setActiveDocumentId(newDocument.id);
  }, []);

  // Same reasoning as createNewDocument: fully self-contained.
  const resetWorkspace = useCallback(() => {
    const document = createDocument();
    setDocuments([document]);
    setActiveDocumentId(document.id);
  }, []);

  // Mirrors the latest state for loadDocuments, which has to stay stable:
  // the dock-drop listener in App re-subscribes whenever it changes, and a
  // batch whose read finished during that gap was silently dropped. macOS
  // hands a multi-file drop over in more than one batch, so the first batch
  // opening (and changing `documents`) lost the second.
  const latestRef = useRef({ documents, activeDocument });
  latestRef.current = { documents, activeDocument };

  // Two batches can land before React re-renders, so the ref is advanced by
  // hand, and the list is updated with a functional updater so an edit that
  // hasn't rendered yet is kept. Ids are fixed before the updater runs, which
  // keeps the updater pure.
  const loadDocuments = useCallback((files: OpenedMarkdownFile[]) => {
    if (files.length === 0) {
      return;
    }

    const latest = latestRef.current;
    const next = addLoadedDocuments(
      latest.documents,
      latest.activeDocument,
      files,
    );
    const latestIds = new Set(latest.documents.map((document) => document.id));
    const nextIds = new Set(next.documents.map((document) => document.id));
    const addedDocuments = next.documents.filter(
      (document) => !latestIds.has(document.id),
    );
    const removedIds = new Set(
      [...latestIds].filter((documentId) => !nextIds.has(documentId)),
    );

    latestRef.current = {
      documents: next.documents,
      activeDocument: next.documents.find(
        (document) => document.id === next.activeDocumentId,
      )!,
    };

    setDocuments((currentDocuments) => [
      ...currentDocuments.filter((document) => !removedIds.has(document.id)),
      ...addedDocuments,
    ]);
    setActiveDocumentId(next.activeDocumentId);
  }, []);

  const loadDocument = useCallback(
    (file: OpenedMarkdownFile) => loadDocuments([file]),
    [loadDocuments],
  );

  // NOTE: closeDocument is intentionally left as a plain closure (recreated
  // on every render): it reads the current `documents` to find the fallback
  // "next active" document before it knows which id becomes active.
  const closeDocument = (documentId: string) => {
    if (documents.length === 1) {
      const replacementDocument = createDocument();
      setDocuments([replacementDocument]);
      setActiveDocumentId(replacementDocument.id);
      return;
    }

    const closingIndex = documents.findIndex(
      (document) => document.id === documentId,
    );
    const nextDocuments = documents.filter(
      (document) => document.id !== documentId,
    );

    setDocuments(nextDocuments);

    if (documentId === activeDocument.id) {
      const nextActiveDocument =
        nextDocuments[Math.max(0, closingIndex - 1)] ?? nextDocuments[0]!;
      setActiveDocumentId(nextActiveDocument.id);
    }
  };

  return useMemo(() => {
    return {
      ...activeDocument,
      documents,
      activeDocumentId: activeDocument.id,
      hasDirtyDocuments: documents.some((document) => document.isDirty),
      setActiveDocumentId,
      setMarkdown,
      loadDocument,
      loadDocuments,
      markSaved,
      createNewDocument,
      closeDocument,
      resetWorkspace,
    };
  }, [
    activeDocument,
    documents,
    setMarkdown,
    loadDocument,
    loadDocuments,
    markSaved,
    createNewDocument,
    resetWorkspace,
  ]);
}
