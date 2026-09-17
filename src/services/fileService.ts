import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { RecentDocument } from "../utils/recentDocuments";
import { normalizeExternalUrl } from "../utils/markdownLinks";

export type OpenedMarkdownFile = {
  filePath: string | null;
  fileName: string;
  markdown: string;
};

export type SaveResult = {
  filePath: string | null;
  fileName: string;
};

export function isRunningInTauri() {
  return Boolean(window.__TAURI_INTERNALS__);
}

export async function openMarkdownFile(
  defaultPath?: string,
): Promise<OpenedMarkdownFile | null> {
  if (!isRunningInTauri()) {
    return openInBrowser();
  }

  const selected = await open({
    multiple: false,
    defaultPath,
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown"],
      },
    ],
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  return openMarkdownFileAtPath(selected);
}

export async function openStartupMarkdownFile(): Promise<
  OpenedMarkdownFile | null
> {
  if (!isRunningInTauri()) {
    return null;
  }

  const filePath = await invoke<string | null>("get_startup_markdown_file_path");

  if (!filePath) {
    return null;
  }

  return openMarkdownFileAtPath(filePath);
}

export type OpenedMarkdownFilesResult = {
  files: OpenedMarkdownFile[];
  failures: { filePath: string; error: unknown }[];
};

// Drains the paths macOS handed to the app (dock drop, Finder "Open With").
// The Rust side is the only queue: the `opened-markdown-files` event is just a
// nudge to drain it, so a batch is read exactly once no matter whether the
// listener or the startup drain gets there first.
export async function takeOpenedMarkdownFiles(): Promise<OpenedMarkdownFilesResult> {
  if (!isRunningInTauri()) {
    return { files: [], failures: [] };
  }

  const filePaths = await invoke<string[]>("take_opened_markdown_file_paths");

  return openMarkdownFilesAtPaths(filePaths);
}

export async function listenForOpenedMarkdownFiles(
  onOpened: (result: OpenedMarkdownFilesResult) => void,
  onError: (error: unknown) => void,
) {
  if (!isRunningInTauri()) {
    return () => undefined;
  }

  return listen("opened-markdown-files", () => {
    void takeOpenedMarkdownFiles().then(onOpened).catch(onError);
  });
}

export async function openMarkdownFileAtPath(
  filePath: string,
): Promise<OpenedMarkdownFile> {
  const markdown = await invoke<string>("read_markdown_file", {
    path: filePath,
  });

  return {
    filePath,
    fileName: getFileName(filePath),
    markdown,
  };
}

// Every file is read independently: one that can't be read (an online-only
// cloud file that times out, say) must not stop the others from opening.
async function openMarkdownFilesAtPaths(
  filePaths: string[],
): Promise<OpenedMarkdownFilesResult> {
  const uniqueFilePaths = [...new Set(filePaths)];
  const results = await Promise.allSettled(
    uniqueFilePaths.map(openMarkdownFileAtPath),
  );
  const files: OpenedMarkdownFile[] = [];
  const failures: OpenedMarkdownFilesResult["failures"] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      files.push(result.value);
    } else {
      failures.push({ filePath: uniqueFilePaths[index]!, error: result.reason });
    }
  });

  return { files, failures };
}

export async function saveMarkdownFile(
  filePath: string,
  markdown: string,
): Promise<SaveResult> {
  if (!isRunningInTauri()) {
    downloadMarkdown(markdown, getFileName(filePath));
    return {
      filePath,
      fileName: getFileName(filePath),
    };
  }

  await invoke("write_markdown_file", {
    path: filePath,
    contents: markdown,
  });

  return {
    filePath,
    fileName: getFileName(filePath),
  };
}

export async function saveMarkdownFileAs(
  markdown: string,
  currentFileName: string,
): Promise<SaveResult | null> {
  if (!isRunningInTauri()) {
    const fileName = ensureMarkdownExtension(currentFileName || "Untitled.md");
    downloadMarkdown(markdown, fileName);
    return {
      filePath: null,
      fileName,
    };
  }

  const selected = await save({
    defaultPath: ensureMarkdownExtension(currentFileName),
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown"],
      },
    ],
  });

  if (!selected) {
    return null;
  }

  const filePath = ensureMarkdownExtension(selected);
  const saved = await saveMarkdownFile(filePath, markdown);

  return saved;
}

function openInBrowser(): Promise<OpenedMarkdownFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown,text/plain";

    input.addEventListener("change", () => {
      const file = input.files?.[0];

      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        resolve({
          filePath: null,
          fileName: file.name,
          markdown: String(reader.result ?? ""),
        });
      });
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(file);
    });

    input.click();
  });
}

function downloadMarkdown(markdown: string, fileName: string) {
  const blob = new Blob([markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = ensureMarkdownExtension(fileName);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

export async function setUnsavedChanges(hasUnsaved: boolean): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await invoke("set_unsaved_changes", { hasUnsaved });
}

export async function forceQuit(): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await invoke("force_quit");
}

// Opens the OS print panel for the current window. On macOS/wry that panel
// has a "Save as PDF" option, so this one call covers both Print and Export
// to PDF - see print_document in src-tauri/src/lib.rs.
export async function exportPdf(path: string): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await invoke("export_pdf", { path });
}

export async function printDocument(): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await invoke("print_document");
}

// Rebuilds the native "Open Recent" submenu on macOS from the frontend's own
// recentDocuments list (see src/utils/recentDocuments.ts), which stays the
// single source of truth. A no-op off macOS, where there is no native menu.
export async function setRecentDocuments(
  documents: RecentDocument[],
): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await invoke("set_recent_documents", {
    documents: documents.map((document) => ({
      filePath: document.filePath,
      fileName: document.fileName,
    })),
  });
}

export async function openExternalUrl(url: string): Promise<void> {
  const target = normalizeExternalUrl(url);
  if (!target) {
    return;
  }

  if (isRunningInTauri()) {
    try {
      await invoke("open_url", { url: target });
      return;
    } catch (error) {
      console.error("Failed to open URL in Tauri:", error);
    }
  }

  window.open(target, "_blank", "noopener,noreferrer");
}

function ensureMarkdownExtension(path: string) {
  if (/\.(md|markdown)$/i.test(path)) {
    return path;
  }

  return `${path}.md`;
}

export function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || "Untitled.md";
}
