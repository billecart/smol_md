export type RecentDocument = {
  filePath: string;
  fileName: string;
};

const RECENT_DOCUMENTS_KEY = "smol_md.recentDocuments";
const RECENT_DOCUMENT_LIMIT = 5;

export function addRecentDocument(
  recentDocuments: RecentDocument[],
  document: RecentDocument,
) {
  return [
    document,
    ...recentDocuments.filter((item) => item.filePath !== document.filePath),
  ].slice(0, RECENT_DOCUMENT_LIMIT);
}

export function loadRecentDocuments() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const rawValue = localStorage.getItem(RECENT_DOCUMENTS_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isRecentDocument)
      .slice(0, RECENT_DOCUMENT_LIMIT);
  } catch {
    return [];
  }
}

export function saveRecentDocuments(recentDocuments: RecentDocument[]) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(
    RECENT_DOCUMENTS_KEY,
    JSON.stringify(recentDocuments.slice(0, RECENT_DOCUMENT_LIMIT)),
  );
}

export function recentDocumentFromPath(filePath: string): RecentDocument {
  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop() || "Untitled.md",
  };
}

function isRecentDocument(value: unknown): value is RecentDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecentDocument>;

  return (
    typeof candidate.filePath === "string" &&
    candidate.filePath.length > 0 &&
    typeof candidate.fileName === "string" &&
    candidate.fileName.length > 0
  );
}
