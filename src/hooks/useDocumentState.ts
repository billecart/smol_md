import { useMemo, useState } from "react";
import { OpenedMarkdownFile } from "../services/fileService";

export type DocumentState = {
  filePath: string | null;
  fileName: string;
  markdown: string;
  originalMarkdown: string;
  isDirty: boolean;
  lastSavedAt: Date | null;
};

const EMPTY_MARKDOWN = "# Untitled\n\n";

export function useDocumentState() {
  const [state, setState] = useState<DocumentState>({
    filePath: null,
    fileName: "Untitled.md",
    markdown: EMPTY_MARKDOWN,
    originalMarkdown: EMPTY_MARKDOWN,
    isDirty: false,
    lastSavedAt: null,
  });

  return useMemo(
    () => ({
      ...state,
      setMarkdown: (markdown: string) => {
        setState((current) => ({
          ...current,
          markdown,
          isDirty: markdown !== current.originalMarkdown,
        }));
      },
      loadDocument: (file: OpenedMarkdownFile) => {
        setState({
          filePath: file.filePath,
          fileName: file.fileName,
          markdown: file.markdown,
          originalMarkdown: file.markdown,
          isDirty: false,
          lastSavedAt: null,
        });
      },
      markSaved: (markdown: string, filePath: string | null, fileName?: string) => {
        setState((current) => ({
          ...current,
          filePath,
          fileName: fileName ?? current.fileName,
          markdown,
          originalMarkdown: markdown,
          isDirty: false,
          lastSavedAt: new Date(),
        }));
      },
      resetDocument: () => {
        setState({
          filePath: null,
          fileName: "Untitled.md",
          markdown: EMPTY_MARKDOWN,
          originalMarkdown: EMPTY_MARKDOWN,
          isDirty: false,
          lastSavedAt: null,
        });
      },
    }),
    [state],
  );
}

