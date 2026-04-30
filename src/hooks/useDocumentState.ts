import { useMemo, useState } from "react";
import { OpenedMarkdownFile } from "../services/fileService";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";

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
        const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
        setState((current) => ({
          ...current,
          markdown: normalizedMarkdown,
          isDirty: normalizedMarkdown !== current.originalMarkdown,
        }));
      },
      loadDocument: (file: OpenedMarkdownFile) => {
        const normalizedMarkdown = normalizeMarkdownLineBreaks(file.markdown);
        setState({
          filePath: file.filePath,
          fileName: file.fileName,
          markdown: normalizedMarkdown,
          originalMarkdown: normalizedMarkdown,
          isDirty: false,
          lastSavedAt: null,
        });
      },
      markSaved: (markdown: string, filePath: string | null, fileName?: string) => {
        const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
        setState((current) => ({
          ...current,
          filePath,
          fileName: fileName ?? current.fileName,
          markdown: normalizedMarkdown,
          originalMarkdown: normalizedMarkdown,
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
