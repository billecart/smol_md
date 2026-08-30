import { useCallback, useMemo, useState } from "react";
import { OpenedMarkdownFile } from "../services/fileService";
import {
  createDocument,
  createLoadedDocument,
  findExistingDocumentByPath,
  markDocumentSaved,
  setDocumentMarkdown,
  shouldReplaceInitialDraft,
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

  // NOTE: loadDocument and closeDocument below are intentionally left as
  // plain closures (recreated on every render), not useCallback-wrapped.
  //
  // Both need to read the *current* `documents` (and `activeDocument`) to
  // decide what to do *before* they know what to pass to the separate
  // `setActiveDocumentId` call:
  //   - loadDocument has to check whether a document with this file path is
  //     already open, and whether the lone empty starter draft should be
  //     replaced, before it knows which document id becomes active.
  //   - closeDocument has to find the closing document's index and compute
  //     the fallback "next active" document from the remaining list before
  //     it knows which document id becomes active.
  //
  // That decision can't be computed purely inside `setDocuments`'s functional
  // updater and then handed to `setActiveDocumentId`: React does not
  // guarantee synchronous, single-invocation execution of a functional
  // updater (and React's Strict Mode dev checks deliberately call it twice
  // to catch exactly this kind of impurity), so leaking a value out of one
  // updater to feed a second, independent `useState` setter is not safe.
  // Stabilizing these for real would require either a ref mirroring the
  // latest `documents` array or merging `documents`/`activeDocumentId` into
  // a single `useReducer` - both bigger structural changes than the
  // functional-updater pattern asked for here, and both carry more risk of
  // a subtle behavioral regression than leaving these two exactly as they
  // behaved before this refactor (recreated every render, always reading
  // fresh `documents`/`activeDocument` from the closure).
  const loadDocument = (file: OpenedMarkdownFile) => {
    const existingDocument = findExistingDocumentByPath(
      documents,
      file.filePath,
    );

    if (existingDocument) {
      setActiveDocumentId(existingDocument.id);
      return;
    }

    const shouldReplaceActive = shouldReplaceInitialDraft(
      documents,
      activeDocument,
    );
    const loadedDocument = createLoadedDocument(file);

    setDocuments((currentDocuments) => {
      if (shouldReplaceActive) {
        return currentDocuments.map((document) =>
          document.id === activeDocument.id ? loadedDocument : document,
        );
      }

      return [...currentDocuments, loadedDocument];
    });
    setActiveDocumentId(loadedDocument.id);
  };

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
      markSaved,
      createNewDocument,
      closeDocument,
      resetWorkspace,
    };
  }, [
    activeDocument,
    documents,
    setMarkdown,
    markSaved,
    createNewDocument,
    resetWorkspace,
  ]);
}
