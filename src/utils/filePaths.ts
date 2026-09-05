// The macOS open panel reopens whichever folder was last browsed. When that
// is a cloud-backed folder or Recents it can stall for seconds before the
// panel appears, so the app points the picker at a folder it knows is local:
// the one holding the document being edited, or failing that the most
// recently opened one.
export function getDirectory(filePath: string): string | null {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );

  if (separatorIndex < 0) {
    return null;
  }

  // Keep the leading slash for a file sitting at the filesystem root.
  if (separatorIndex === 0) {
    return filePath[0] ?? null;
  }

  return filePath.slice(0, separatorIndex);
}

export function pickDefaultDirectory(
  currentFilePath: string | null,
  recentFilePaths: string[],
): string | undefined {
  const candidates = [currentFilePath, ...recentFilePaths];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const directory = getDirectory(candidate);

    if (directory) {
      return directory;
    }
  }

  return undefined;
}
