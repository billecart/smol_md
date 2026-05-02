import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RichEditor } from "./components/RichEditor";
import { SourceEditor } from "./components/SourceEditor";
import { StatusBar } from "./components/StatusBar";
import { TopTabs } from "./components/TopTabs";
import { Toolbar } from "./components/Toolbar";
import { useBeforeCloseWarning } from "./hooks/useBeforeCloseWarning";
import { useDocumentState } from "./hooks/useDocumentState";
import type { OpenDocument } from "./hooks/useDocumentState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  isRunningInTauri,
  openMarkdownFile,
  openStartupMarkdownFile,
  saveMarkdownFile,
  saveMarkdownFileAs,
} from "./services/fileService";
import { isUnsafeEmptyOverwrite } from "./utils/saveSafety";

type EditorMode = "rich" | "source";

function App() {
  const documentState = useDocumentState();
  const {
    filePath,
    fileName,
    markdown,
    originalMarkdown,
    isDirty,
    lastSavedAt,
    documents,
    activeDocumentId,
    hasDirtyDocuments,
    setActiveDocumentId,
    setMarkdown,
    loadDocument,
    markSaved,
    createNewDocument,
    closeDocument,
    resetWorkspace,
  } = documentState;
  const [message, setMessage] = useState("Ready");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const hasCheckedStartupFile = useRef(false);
  const isDesktopApp = isRunningInTauri();

  const title = useMemo(() => {
    const dirtyMark = isDirty ? "*" : "";
    return `${dirtyMark}${fileName} - smol_md`;
  }, [fileName, isDirty]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useBeforeCloseWarning(hasDirtyDocuments);

  useEffect(() => {
    if (!isDesktopApp || hasCheckedStartupFile.current) {
      return;
    }

    hasCheckedStartupFile.current = true;

    void openStartupMarkdownFile()
      .then((opened) => {
        if (!opened) {
          return;
        }

        loadDocument(opened);
        setMessage(`Opened ${opened.fileName}`);
      })
      .catch((error) => {
        setMessage(getErrorMessage(error));
      });
  }, [isDesktopApp, loadDocument]);

  const confirmDiscard = async (
    targetDocument: Pick<OpenDocument, "fileName" | "isDirty"> = documentState,
  ) => {
    if (!targetDocument.isDirty) {
      return true;
    }

    if (!isDesktopApp) {
      return window.confirm(
        `${targetDocument.fileName} has unsaved changes. Do you want to discard them?`,
      );
    }

    return confirm(`${targetDocument.fileName} has unsaved changes. Discard them?`, {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard changes",
      cancelLabel: "Keep editing",
    });
  };

  const handleNew = async () => {
    createNewDocument();
    setMessage("New empty document");
  };

  const handleOpen = async () => {
    try {
      const opened = await openMarkdownFile();

      if (!opened) {
        setMessage("Open cancelled");
        return;
      }

      loadDocument(opened);
      setMessage(`Opened ${opened.fileName}`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleSave = async () => {
    if (!filePath) {
      await handleSaveAs();
      return;
    }

    try {
      if (isUnsafeEmptyOverwrite(markdown, originalMarkdown, filePath)) {
        setMessage("Save blocked: empty content was not written over the existing file");
        return;
      }

      await saveMarkdownFile(filePath, markdown);
      markSaved(markdown, filePath);
      setMessage("Saved");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleSaveAs = async () => {
    try {
      const result = await saveMarkdownFileAs(markdown, fileName);

      if (!result) {
        setMessage("Save As cancelled");
        return;
      }

      markSaved(markdown, result.filePath, result.fileName);
      setMessage(`Saved as ${result.fileName}`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleCloseDocument = async (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);

    if (!document) {
      return;
    }

    if (!(await confirmDiscard(document))) {
      return;
    }

    closeDocument(documentId);
    setMessage(`Closed ${document.fileName}`);
  };

  const handleCloseActiveDocument = async () => {
    await handleCloseDocument(activeDocumentId);
  };

  const handleCloseAllDocuments = async () => {
    const dirtyDocuments = documents.filter((document) => document.isDirty);

    if (dirtyDocuments.length > 0) {
      const message =
        dirtyDocuments.length === 1
          ? `${dirtyDocuments[0]!.fileName} has unsaved changes. Discard it and close all documents?`
          : `${dirtyDocuments.length} documents have unsaved changes. Discard them and close all documents?`;

      const shouldDiscard = !isDesktopApp
        ? window.confirm(message)
        : await confirm(message, {
            title: "Unsaved changes",
            kind: "warning",
            okLabel: "close all",
            cancelLabel: "Keep editing",
          });

      if (!shouldDiscard) {
        return;
      }
    }

    resetWorkspace();
    setMessage("Closed all documents");
  };

  const handleCloseWindow = async () => {
    if (!isDesktopApp) {
      window.close();
      return;
    }

    if (hasDirtyDocuments) {
      const shouldClose = await confirm(
        "You have unsaved changes. Close without saving?",
        {
          title: "Unsaved changes",
          kind: "warning",
          okLabel: "Close without saving",
          cancelLabel: "Keep editing",
        },
      );

      if (!shouldClose) {
        return;
      }
    }

    await getCurrentWindow().destroy();
  };

  const handleEditorModeChange = (mode: EditorMode) => {
    if (mode === "source") {
      setMarkdown(markdown);
    }

    setEditorMode(mode);
  };

  const toggleEditorMode = useCallback(() => {
    setEditorMode((currentMode) => {
      if (currentMode === "rich") {
        setMarkdown(markdown);
        return "source";
      }

      return "rich";
    });
  }, [markdown, setMarkdown]);

  useKeyboardShortcuts({
    onNew: handleNew,
    onOpen: handleOpen,
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onToggleSourceMode: toggleEditorMode,
  });

  return (
    <main className="app-shell">
      <div className="top-chrome-hitbox" aria-hidden="true" />
      <div
        className={
          documents.length > 1 ? "top-chrome top-chrome-visible" : "top-chrome"
        }
      >
        <Toolbar
          canSave={markdown !== originalMarkdown || Boolean(filePath)}
          editorMode={editorMode}
          tabs={
            <TopTabs
              documents={documents}
              activeDocumentId={activeDocumentId}
              onSelectDocument={setActiveDocumentId}
              onCloseDocument={handleCloseDocument}
            />
          }
          onNew={handleNew}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onClose={handleCloseActiveDocument}
          onCloseAll={handleCloseAllDocuments}
          onCloseWindow={handleCloseWindow}
          onEditorModeChange={handleEditorModeChange}
        />
      </div>

      <section className="document-frame" aria-label="Markdown editor">
        <div className="editor-column">
          {!isDesktopApp ? (
            <p className="preview-note">
              Browser preview: Save As downloads a Markdown file. The real Windows save dialog works in the desktop app.
            </p>
          ) : null}

          {editorMode === "rich" ? (
            <RichEditor
              key={activeDocumentId}
              value={markdown}
              onChange={setMarkdown}
            />
          ) : (
            <SourceEditor
              key={activeDocumentId}
              value={markdown}
              onChange={setMarkdown}
            />
          )}
        </div>
      </section>

      <StatusBar
        filePath={filePath}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        markdown={markdown}
        message={message}
      />
    </main>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default App;
