import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

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

export async function openMarkdownFile(): Promise<OpenedMarkdownFile | null> {
  if (!isRunningInTauri()) {
    return openInBrowser();
  }

  const selected = await open({
    multiple: false,
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

function ensureMarkdownExtension(path: string) {
  if (/\.(md|markdown)$/i.test(path)) {
    return path;
  }

  return `${path}.md`;
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || "Untitled.md";
}
