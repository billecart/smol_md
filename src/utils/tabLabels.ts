export type TabLabelDocument = {
  filePath: string | null;
  fileName: string;
};

export function getTabLabel(document: TabLabelDocument): string {
  return document.fileName.replace(/\.(md|markdown)$/i, "");
}

function parentFolderName(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  segments.pop(); // drop the file name itself
  if (segments.length === 0) return null;
  return segments[segments.length - 1];
}

export function disambiguateTabLabels(documents: TabLabelDocument[]): string[] {
  const baseLabels = documents.map((document) => getTabLabel(document));

  const counts = new Map<string, number>();
  for (const label of baseLabels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return documents.map((document, index) => {
    const label = baseLabels[index];
    const isColliding = (counts.get(label) ?? 0) > 1;
    if (!isColliding || !document.filePath) {
      return label;
    }

    const parent = parentFolderName(document.filePath);
    return parent ? `${parent}/${label}` : label;
  });
}
