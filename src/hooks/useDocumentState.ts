import { useMemo, useState } from "react";
import { OpenedMarkdownFile } from "../services/fileService";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";

export type OpenDocument = {
  id: string;
  filePath: string | null;
  fileName: string;
  markdown: string;
  originalMarkdown: string;
  isDirty: boolean;
  lastSavedAt: Date | null;
};

const EMPTY_MARKDOWN = "# Untitled\n\n";

function createDocument(
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

function createDocumentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
        const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
        updateActiveDocument((document) => ({
          ...document,
          markdown: normalizedMarkdown,
          isDirty: normalizedMarkdown !== document.originalMarkdown,
        }));
      },
      loadDocument: (file: OpenedMarkdownFile) => {
        const normalizedMarkdown = normalizeMarkdownLineBreaks(file.markdown);
        const existingDocument = file.filePath
          ? documents.find((document) => document.filePath === file.filePath)
          : null;

        if (existingDocument) {
          setActiveDocumentId(existingDocument.id);
          return;
        }

        const shouldReplaceActive =
          documents.length === 1 &&
          !activeDocument.filePath &&
          !activeDocument.isDirty &&
          activeDocument.markdown === EMPTY_MARKDOWN;

        const loadedDocument = createDocument({
          filePath: file.filePath,
          fileName: file.fileName,
          markdown: normalizedMarkdown,
          originalMarkdown: normalizedMarkdown,
          isDirty: false,
        });

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
        const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
        updateActiveDocument((document) => ({
          ...document,
          filePath,
          fileName: fileName ?? document.fileName,
          markdown: normalizedMarkdown,
          originalMarkdown: normalizedMarkdown,
          isDirty: false,
          lastSavedAt: new Date(),
        }));
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
