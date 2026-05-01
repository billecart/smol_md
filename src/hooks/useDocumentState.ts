import { useMemo, useState } from "react";
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

  return useMemo(() => {
    const updateActiveDocument = (
      updater: (document: OpenDocument) => OpenDocument,
    ) => {
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === activeDocument.id ? updater(document) : document,
        ),
      );
    };

    return {
      ...activeDocument,
      documents,
      activeDocumentId: activeDocument.id,
      hasDirtyDocuments: documents.some((document) => document.isDirty),
      setActiveDocumentId,
      setMarkdown: (markdown: string) => {
        updateActiveDocument((document) =>
          setDocumentMarkdown(document, markdown),
        );
      },
      loadDocument: (file: OpenedMarkdownFile) => {
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
      },
      markSaved: (
        markdown: string,
        filePath: string | null,
        fileName?: string,
      ) => {
        updateActiveDocument((document) =>
          markDocumentSaved(document, markdown, filePath, fileName),
        );
      },
      createNewDocument: () => {
        const newDocument = createDocument();
        setDocuments((currentDocuments) => [...currentDocuments, newDocument]);
        setActiveDocumentId(newDocument.id);
      },
      closeDocument: (documentId: string) => {
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
      },
      resetWorkspace: () => {
        const document = createDocument();
        setDocuments([document]);
        setActiveDocumentId(document.id);
      },
    };
  }, [activeDocument, documents]);
}
