import { useEffect, useMemo, useState } from "react";
import { RichEditor } from "./components/RichEditor";
import { SourceEditor } from "./components/SourceEditor";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { useBeforeCloseWarning } from "./hooks/useBeforeCloseWarning";
import { useDocumentState } from "./hooks/useDocumentState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  isRunningInTauri,
  openMarkdownFile,
  saveMarkdownFile,
  saveMarkdownFileAs,
} from "./services/fileService";

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
    setMarkdown,
    loadDocument,
    markSaved,
    resetDocument,
  } = documentState;
  const [message, setMessage] = useState("Ready");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const isDesktopApp = isRunningInTauri();

  const title = useMemo(() => {
    const dirtyMark = isDirty ? "*" : "";
    return `${dirtyMark}${fileName} - smol_md`;
  }, [fileName, isDirty]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useBeforeCloseWarning(isDirty);

  const confirmDiscard = () => {
    if (!isDirty) {
      return true;
    }

    return window.confirm(
      "You have unsaved changes. Do you want to discard them?",
    );
  };

  const handleNew = () => {
    if (!confirmDiscard()) {
      return;
    }

    resetDocument();
    setMessage("New empty document");
  };

  const handleOpen = async () => {
    if (!confirmDiscard()) {
      return;
    }

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
      const result = await saveMarkdownFile(filePath, markdown, true);
      markSaved(markdown, filePath);
      setMessage(
        result.backupPath
          ? `Saved. Backup: ${result.backupPath}`
          : "Saved",
      );
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
      setMessage(
        result.backupPath
          ? `Saved as ${result.fileName}. Backup: ${result.backupPath}`
          : `Saved as ${result.fileName}`,
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleEditorModeChange = (mode: EditorMode) => {
    if (mode === "source") {
      setMarkdown(markdown);
    }

    setEditorMode(mode);
  };

  useKeyboardShortcuts({
    onNew: handleNew,
    onOpen: handleOpen,
    onSave: handleSave,
    onSaveAs: handleSaveAs,
  });

  return (
    <main className="app-shell">
      <Toolbar
        isDirty={isDirty}
        canSave={markdown !== originalMarkdown || Boolean(filePath)}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
      />

      <section className="document-frame" aria-label="Markdown editor">
        <header className="document-header">
          <div>
            <p className="eyebrow">
              {editorMode === "rich" ? "Rich Markdown" : "Markdown Source"}
            </p>
            <h1>{fileName}</h1>
          </div>
          <div className="document-controls">
            <div className="mode-toggle" aria-label="Editor mode">
              <button
                type="button"
                className={editorMode === "rich" ? "active" : ""}
                aria-pressed={editorMode === "rich"}
                onClick={() => handleEditorModeChange("rich")}
              >
                Rich
              </button>
              <button
                type="button"
                className={editorMode === "source" ? "active" : ""}
                aria-pressed={editorMode === "source"}
                onClick={() => handleEditorModeChange("source")}
              >
                Source
              </button>
            </div>
            <span className={isDirty ? "state-pill dirty" : "state-pill"}>
              {isDirty ? "Unsaved" : "Saved"}
            </span>
          </div>
        </header>

        {!isDesktopApp ? (
          <p className="preview-note">
            Browser preview: Save As downloads a Markdown file. The real Windows save dialog works in the desktop app.
          </p>
        ) : null}

        {editorMode === "rich" ? (
          <RichEditor value={markdown} onChange={setMarkdown} />
        ) : (
          <SourceEditor value={markdown} onChange={setMarkdown} />
        )}
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
