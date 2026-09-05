import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { FindBar } from "./components/FindBar";
import { Notice, type NoticeMessage } from "./components/Notice";
import {
  RichEditor,
  type FormatCommandId,
  type RichEditorHandle,
} from "./components/RichEditor";
import { SourceEditor } from "./components/SourceEditor";
import { StatusBar } from "./components/StatusBar";
import { TopTabs } from "./components/TopTabs";
import { Toolbar } from "./components/Toolbar";
import { useBeforeCloseWarning } from "./hooks/useBeforeCloseWarning";
import { useDocumentState } from "./hooks/useDocumentState";
import type { OpenDocument } from "./hooks/useDocumentState";
import { useInPageFind } from "./hooks/useInPageFind";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  forceQuit,
  isRunningInTauri,
  listenForOpenedMarkdownFiles,
  openMarkdownFile,
  openMarkdownFileAtPath,
  openStartupMarkdownFile,
  exportPdf,
  printDocument,
  setRecentDocuments as setNativeRecentDocuments,
  setUnsavedChanges,
  takeOpenedMarkdownFiles,
  saveMarkdownFile,
  saveMarkdownFileAs,
  type OpenedMarkdownFile,
} from "./services/fileService";
import { isMacOs } from "./utils/platform";
import {
  addRecentDocument,
  loadRecentDocuments,
  saveRecentDocuments,
  type RecentDocument,
} from "./utils/recentDocuments";
import { pickDefaultDirectory } from "./utils/filePaths";
import { isUnsafeEmptyOverwrite } from "./utils/saveSafety";
import { zoomIn, zoomOut, zoomStyle } from "./utils/zoom";

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
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const noticeIdRef = useRef(0);

  // Anything that went wrong goes through here: it still reaches the status
  // bar, but also raises a notice the user does not have to go looking for.
  const reportProblem = useCallback((text: string) => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, text });
    setMessage(text);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const find = useInPageFind();
  const hasCheckedStartupFile = useRef(false);
  const isDesktopApp = isRunningInTauri();
  const isMacDesktopApp = isDesktopApp && isMacOs();
  const richEditorRef = useRef<RichEditorHandle>(null);

  const title = useMemo(() => {
    const dirtyMark = isDirty ? "*" : "";
    return `${dirtyMark}${fileName} - smol_md`;
  }, [fileName, isDirty]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useBeforeCloseWarning(hasDirtyDocuments);

  // Cmd+Q (and other app-level quit paths) don't go through the window's
  // onCloseRequested handler in useBeforeCloseWarning - they go through
  // Tauri's app-level exit path instead. The Rust side tracks a mirror of
  // hasDirtyDocuments so it can intercept that exit and ask us to confirm
  // via the "quit-requested" event below, the same way the window close
  // path already does.
  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }

    void setUnsavedChanges(hasDirtyDocuments);
  }, [isDesktopApp, hasDirtyDocuments]);

  const hasDirtyDocumentsRef = useRef(hasDirtyDocuments);

  useEffect(() => {
    hasDirtyDocumentsRef.current = hasDirtyDocuments;
  }, [hasDirtyDocuments]);

  const isHandlingQuitRequestRef = useRef(false);

  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }

    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    listen("quit-requested", () => {
      void (async () => {
        // Guard against re-entrancy so mashing Cmd+Q can't stack multiple
        // confirmation dialogs.
        if (isHandlingQuitRequestRef.current) {
          return;
        }

        isHandlingQuitRequestRef.current = true;

        try {
          if (hasDirtyDocumentsRef.current) {
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

          await forceQuit();
        } finally {
          isHandlingQuitRequestRef.current = false;
        }
      })();
    })
      .then((cleanup) => {
        if (isCancelled) {
          cleanup();
          return;
        }

        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      unlisten?.();
    };
  }, [isDesktopApp]);

  useEffect(() => {
    if (isMacDesktopApp) {
      setRecentDocuments(loadRecentDocuments());
    }
  }, [isMacDesktopApp]);

  // Keeps the native macOS "Open Recent" submenu in sync with our own
  // recentDocuments state (backed by localStorage), which stays the single
  // source of truth. Runs once on mount (with whatever recentDocuments is
  // at that point) and again every time it changes.
  useEffect(() => {
    if (!isMacDesktopApp) {
      return;
    }

    void setNativeRecentDocuments(recentDocuments);
  }, [isMacDesktopApp, recentDocuments]);

  const rememberRecentDocument = useCallback(
    (opened: Pick<OpenedMarkdownFile, "filePath" | "fileName">) => {
      if (!isMacDesktopApp || !opened.filePath) {
        return;
      }

      setRecentDocuments((currentRecentDocuments) => {
        const nextRecentDocuments = addRecentDocument(currentRecentDocuments, {
          filePath: opened.filePath!,
          fileName: opened.fileName,
        });

        saveRecentDocuments(nextRecentDocuments);
        return nextRecentDocuments;
      });
    },
    [isMacDesktopApp],
  );

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
        rememberRecentDocument(opened);
        setMessage(`Opened ${opened.fileName}`);
      })
      .catch((error) => {
        reportProblem(getErrorMessage(error));
      });
  }, [isDesktopApp, loadDocument, rememberRecentDocument]);

  useEffect(() => {
    if (!isMacDesktopApp) {
      return;
    }

    let isSubscribed = true;

    const openFiles = (files: OpenedMarkdownFile[]) => {
      for (const file of files) {
        loadDocument(file);
        rememberRecentDocument(file);
        setMessage(`Opened ${file.fileName}`);
      }
    };

    let unlisten: (() => void) | undefined;

    // Order matters. Dropping a file on the dock icon of a closed app makes
    // macOS emit `opened-markdown-files` while the webview is still starting,
    // so the event can land in the gap between draining the queue and the
    // listener being ready - the file is then silently lost and the user sees
    // an empty draft instead. Registering the listener first closes that gap:
    // anything emitted beforehand is still queued on the Rust side, and
    // draining it afterwards is safe because the queue is drained, not copied.
    void (async () => {
      try {
        const listener = await listenForOpenedMarkdownFiles(
          (files) => {
            if (isSubscribed) {
              openFiles(files);
            }
          },
          (error) => {
            if (isSubscribed) {
              reportProblem(getErrorMessage(error));
            }
          },
        );

        if (!isSubscribed) {
          listener();
          return;
        }

        unlisten = listener;

        const files = await takeOpenedMarkdownFiles();

        if (isSubscribed) {
          openFiles(files);
        }
      } catch (error) {
        if (isSubscribed) {
          reportProblem(getErrorMessage(error));
        }
      }
    })();

    return () => {
      isSubscribed = false;
      unlisten?.();
    };
  }, [isMacDesktopApp, loadDocument, rememberRecentDocument]);

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

  const handleNew = useCallback(async () => {
    createNewDocument();
    setMessage("New empty document");
  }, [createNewDocument]);

  // NOTE: loadDocument is recreated every render (see useDocumentState.ts),
  // so handleOpen/handleOpenRecent can't be made fully stable either - their
  // dependency array is honest about that rather than omitting loadDocument
  // to fake stability.
  const handleOpen = useCallback(async () => {
    try {
      // Without this the macOS panel reopens the last folder browsed, which
      // stalls for seconds when that is a cloud folder or Recents.
      const opened = await openMarkdownFile(
        pickDefaultDirectory(
          filePath,
          recentDocuments.map((document) => document.filePath),
        ),
      );

      if (!opened) {
        setMessage("Open cancelled");
        return;
      }

      loadDocument(opened);
      rememberRecentDocument(opened);
      setMessage(`Opened ${opened.fileName}`);
    } catch (error) {
      reportProblem(getErrorMessage(error));
    }
  }, [
    filePath,
    recentDocuments,
    loadDocument,
    rememberRecentDocument,
    reportProblem,
  ]);

  const handleOpenRecent = useCallback(
    async (recentDocument: RecentDocument) => {
      try {
        const opened = await openMarkdownFileAtPath(recentDocument.filePath);

        loadDocument(opened);
        rememberRecentDocument(opened);
        setMessage(`Opened ${opened.fileName}`);
      } catch (error) {
        reportProblem(getErrorMessage(error));
      }
    },
    [loadDocument, rememberRecentDocument],
  );

  // Genuinely depends on `markdown`, changes every keystroke, left unstable
  // on purpose (see handleSave below for the matching case).
  const handleSaveAs = useCallback(async () => {
    try {
      const result = await saveMarkdownFileAs(markdown, fileName);

      if (!result) {
        setMessage("Save As cancelled");
        return;
      }

      markSaved(markdown, result.filePath, result.fileName);
      rememberRecentDocument({
        filePath: result.filePath,
        fileName: result.fileName,
      });
      setMessage(`Saved as ${result.fileName}`);
    } catch (error) {
      reportProblem(getErrorMessage(error));
    }
  }, [markdown, fileName, markSaved, rememberRecentDocument]);

  // Genuinely depends on `markdown` (and `filePath`/`originalMarkdown`,
  // which change together with it) to decide what to write and whether the
  // save is a safe overwrite - it changes every keystroke and cannot be
  // stabilized without a ref, which was explicitly out of scope for this
  // pass. (handleSaveAs is itself unstable for the same reason, so listing
  // it here doesn't lose anything.)
  const handleSave = useCallback(async () => {
    if (!filePath) {
      await handleSaveAs();
      return;
    }

    try {
      if (isUnsafeEmptyOverwrite(markdown, originalMarkdown, filePath)) {
        reportProblem("Save blocked: empty content was not written over the existing file");
        return;
      }

      await saveMarkdownFile(filePath, markdown);
      markSaved(markdown, filePath);
      setMessage("Saved");
    } catch (error) {
      reportProblem(getErrorMessage(error));
    }
  }, [filePath, markdown, originalMarkdown, markSaved, handleSaveAs]);

  // hasDirtyDocuments is a boolean derived from `documents` on every render,
  // but its *value* only flips when a document's dirty state actually
  // changes (not on every keystroke once a document is already dirty), so
  // this stays stable across most keystrokes even though it's recomputed
  // every render.
  //
  // Declared before the per-document close handlers because closing the last
  // tab falls through to closing the window.
  const handleCloseWindow = useCallback(async () => {
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
  }, [isDesktopApp, hasDirtyDocuments]);

  // Genuinely depends on `documents` (to look up the document by id) and on
  // `closeDocument`, which - like loadDocument - can't be made
  // documents-independent (see useDocumentState.ts). Left unstable on
  // purpose rather than dropping a real dependency.
  const handleCloseDocument = useCallback(
    async (documentId: string) => {
      const document = documents.find((item) => item.id === documentId);

      if (!document) {
        return;
      }

      if (!(await confirmDiscard(document))) {
        return;
      }

      closeDocument(documentId);
      setMessage(`Closed ${document.fileName}`);
    },
    [documents, closeDocument, confirmDiscard],
  );

  // Closing the last remaining tab has nowhere to go: closeDocument would
  // just swap in a fresh blank draft, so the window would appear to ignore
  // the keystroke. Close the window instead, which is what Cmd+W means on
  // macOS once the last document is gone.
  const handleCloseActiveDocument = useCallback(async () => {
    if (documents.length <= 1) {
      await handleCloseWindow();
      return;
    }

    await handleCloseDocument(activeDocumentId);
  }, [documents.length, activeDocumentId, handleCloseDocument, handleCloseWindow]);

  // Genuinely depends on `documents` (to find dirty documents) and
  // `resetWorkspace`; `documents` changes every keystroke so this can't be
  // fully stabilized either.
  const handleCloseAllDocuments = useCallback(async () => {
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
  }, [documents, isDesktopApp, resetWorkspace]);


  // Genuinely depends on `markdown`: switching to source mode snapshots the
  // current markdown via setMarkdown. Changes every keystroke, left
  // unstable on purpose (same situation as handleSave/handleSaveAs).
  const handleEditorModeChange = useCallback(
    (mode: EditorMode) => {
      if (mode === "source") {
        setMarkdown(markdown);
      }

      setEditorMode(mode);
    },
    [markdown, setMarkdown],
  );

  const toggleEditorMode = useCallback(() => {
    setEditorMode((currentMode) => {
      if (currentMode === "rich") {
        setMarkdown(markdown);
        return "source";
      }

      return "rich";
    });
  }, [markdown, setMarkdown]);

  // Writes the PDF with no print panel; the only dialog is where to put it.
  const handleExportPdf = useCallback(async () => {
    try {
      const suggested = fileName.replace(/\.(md|markdown)$/i, "");
      const path = await save({
        defaultPath: `${suggested}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (!path) {
        setMessage("Export cancelled");
        return;
      }

      await exportPdf(path);
      setMessage(`Exported ${path.split(/[\\/]/).pop()}`);
    } catch (error) {
      reportProblem(getErrorMessage(error));
    }
  }, [fileName, reportProblem]);

  const handleFind = useCallback(() => {
    if (find.isOpen) {
      // Refocus and select input
      const input = document.querySelector<HTMLInputElement>(".find-bar-input");
      input?.focus();
      input?.select();
      return;
    }
    find.open();
  }, [find]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => zoomIn(z));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => zoomOut(z));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
  }, []);

  // The ids RichEditor's context menu (and now the native Format menu) both
  // dispatch through - see FormatCommandId in RichEditor.tsx.
  const formatCommandIds = useMemo(
    () =>
      new Set<FormatCommandId>([
        "bold",
        "italic",
        "strikethrough",
        "h1",
        "h2",
        "h3",
        "bullet-list",
        "ordered-list",
        "blockquote",
        "code-block",
        "link",
        "highlight",
      ]),
    [],
  );

  // Most of these handlers are recreated often (handleOpen/handleSave/etc.
  // depend on things that change every keystroke), so the menu-action
  // listener effect below can't list them as dependencies without
  // resubscribing constantly. Mirroring the hasDirtyDocumentsRef pattern
  // above: a ref updated after every render holds the latest closures, and
  // the listener effect itself only depends on `isDesktopApp`.
  const menuActionHandlersRef = useRef({
    handleNew,
    handleOpen,
    handleOpenRecent,
    handleCloseActiveDocument,
    handleCloseAllDocuments,
    handleSave,
    handleSaveAs,
    handleFind,
    handleExportPdf,
    toggleEditorMode,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    recentDocuments,
  });

  useEffect(() => {
    menuActionHandlersRef.current = {
      handleNew,
      handleOpen,
      handleOpenRecent,
      handleCloseActiveDocument,
      handleCloseAllDocuments,
      handleSave,
      handleSaveAs,
      handleFind,
      handleExportPdf,
      toggleEditorMode,
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
      recentDocuments,
    };
  });

  // Native menu items (built in src-tauri/src/lib.rs's build_app_menu) have
  // no direct way to call back into React - Rust's on_menu_event handler
  // just emits a "menu-action" event with the item's id as payload, and this
  // dispatches each id to the same handler the equivalent hamburger-menu
  // item or keyboard shortcut already uses. macOS only in practice (that's
  // the only platform with a native menu), but this listens whenever the app
  // is running as a desktop app since nothing native ever emits the event
  // otherwise.
  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }

    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    listen<string>("menu-action", (event) => {
      const id = event.payload;
      const handlers = menuActionHandlersRef.current;

      if (id.startsWith("recent:")) {
        const index = Number(id.slice("recent:".length));
        const recentDocument = handlers.recentDocuments[index];

        if (recentDocument) {
          void handlers.handleOpenRecent(recentDocument);
        }

        return;
      }

      if (formatCommandIds.has(id as FormatCommandId)) {
        // No-op in Source mode: the rich editor (and its ref) isn't
        // mounted there.
        richEditorRef.current?.runFormatCommand(id as FormatCommandId);
        return;
      }

      switch (id) {
        case "new":
          void handlers.handleNew();
          break;
        case "open":
          void handlers.handleOpen();
          break;
        case "close-tab":
          void handlers.handleCloseActiveDocument();
          break;
        case "close-all":
          void handlers.handleCloseAllDocuments();
          break;
        case "save":
          void handlers.handleSave();
          break;
        case "save-as":
          void handlers.handleSaveAs();
          break;
        case "print":
          void printDocument();
          break;
        case "export-pdf":
          void handlers.handleExportPdf();
          break;
        case "find":
          handlers.handleFind();
          break;
        case "toggle-mode":
          handlers.toggleEditorMode();
          break;
        case "zoom-in":
          handlers.handleZoomIn();
          break;
        case "zoom-out":
          handlers.handleZoomOut();
          break;
        case "zoom-reset":
          handlers.handleZoomReset();
          break;
        default:
          break;
      }
    })
      .then((cleanup) => {
        if (isCancelled) {
          cleanup();
          return;
        }

        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      unlisten?.();
    };
  }, [isDesktopApp, formatCommandIds]);

  // The `tabs` element passed to Toolbar is an object (a React element), so
  // it's memoized per the same rule as any other object/array prop. Note
  // this still recomputes every keystroke in practice, because `documents`
  // carries each open document's live markdown text - see the report for
  // why that's a data-model limitation this pass doesn't attempt to fix.
  const tabs = useMemo(
    () => (
      <TopTabs
        documents={documents}
        activeDocumentId={activeDocumentId}
        onSelectDocument={setActiveDocumentId}
        onCloseDocument={handleCloseDocument}
      />
    ),
    [documents, activeDocumentId, handleCloseDocument],
  );

  useKeyboardShortcuts({
    onNew: handleNew,
    onOpen: handleOpen,
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onToggleSourceMode: toggleEditorMode,
    onCloseTab: handleCloseActiveDocument,
    onCloseWindow: handleCloseWindow,
    onFind: handleFind,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomReset: handleZoomReset,
  });

  return (
    <main
      className={isMacDesktopApp ? "app-shell app-shell-macos" : "app-shell"}
    >
      {find.isOpen ? (
        <FindBar
          query={find.query}
          matchCount={find.matchCount}
          activeIndex={find.activeIndex}
          onQueryChange={find.setQuery}
          onNext={find.goNext}
          onPrev={find.goPrev}
          onClose={find.close}
        />
      ) : null}
      <Notice notice={notice} onDismiss={dismissNotice} />
      <div className="top-chrome-hitbox" aria-hidden="true" />
      <div
        className={[
          "top-chrome",
          documents.length > 1 ? "top-chrome-visible" : "",
          isMacDesktopApp ? "top-chrome-macos" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Toolbar
          canSave={markdown !== originalMarkdown || Boolean(filePath)}
          editorMode={editorMode}
          tabs={tabs}
          onNew={handleNew}
          onOpen={handleOpen}
          onOpenRecent={handleOpenRecent}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onClose={handleCloseActiveDocument}
          onCloseAll={handleCloseAllDocuments}
          onCloseWindow={handleCloseWindow}
          onEditorModeChange={handleEditorModeChange}
          placeModeSwitchInAppBar={isMacDesktopApp}
          recentDocuments={recentDocuments}
          showOpenRecent={isMacDesktopApp}
          showBrandInAppBar={isMacDesktopApp}
          showCustomWindowControls={isDesktopApp && !isMacDesktopApp}
          showHamburgerMenu={!isMacDesktopApp}
        />
      </div>

      <section className="document-frame" aria-label="Markdown editor" style={zoomStyle(zoomLevel) as React.CSSProperties}>
        <div className="editor-column">
          {!isDesktopApp ? (
            <p className="preview-note">
              Browser preview: Save As downloads a Markdown file. The real Windows save dialog works in the desktop app.
            </p>
          ) : null}

          {editorMode === "rich" ? (
            <RichEditor
              key={activeDocumentId}
              ref={richEditorRef}
              value={markdown}
              onChange={setMarkdown}
              findQuery={find.isOpen ? find.query : ""}
              findActiveIndex={find.activeIndex}
              onFindMatchCount={find.setMatchCount}
            />
          ) : (
            <SourceEditor
              key={activeDocumentId}
              value={markdown}
              onChange={setMarkdown}
              findQuery={find.isOpen ? find.query : ""}
              findActiveIndex={find.activeIndex}
              onFindMatchCount={find.setMatchCount}
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
