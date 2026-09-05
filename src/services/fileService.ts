import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { RecentDocument } from "../utils/recentDocuments";

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

export async function takeOpenedMarkdownFiles(): Promise<OpenedMarkdownFile[]> {
  if (!isRunningInTauri()) {
    return [];
  }

  const filePaths = await invoke<string[]>("take_opened_markdown_file_paths");

  return openMarkdownFilesAtPaths(filePaths);
}

export async function listenForOpenedMarkdownFiles(
  onOpened: (files: OpenedMarkdownFile[]) => void,
  onError: (error: unknown) => void,
) {
  if (!isRunningInTauri()) {
    return () => undefined;
  }

  return listen<string[]>("opened-markdown-files", (event) => {
    void openMarkdownFilesAtPaths(event.payload)
      .then(onOpened)
      .catch(onError);
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

async function openMarkdownFilesAtPaths(filePaths: string[]) {
  const uniqueFilePaths = [...new Set(filePaths)];
  const files: OpenedMarkdownFile[] = [];

  for (const filePath of uniqueFilePaths) {
    files.push(await openMarkdownFileAtPath(filePath));
  }

  return files;
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

function ensureMarkdownExtension(path: string) {
  if (/\.(md|markdown)$/i.test(path)) {
    return path;
  }

  return `${path}.md`;
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || "Untitled.md";
}
