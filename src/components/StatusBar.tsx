type StatusBarProps = {
  filePath: string | null;
  isDirty: boolean;
  lastSavedAt: Date | null;
  markdown: string;
  message: string;
};

export function StatusBar({
  filePath,
  isDirty,
  lastSavedAt,
  markdown,
  message,
}: StatusBarProps) {
  const words = countWords(markdown);

  return (
    <footer className="status-bar">
      <span>{isDirty ? "Unsaved changes" : "All changes saved"}</span>
      <span>{message}</span>
      <span>{words} {words === 1 ? "word" : "words"}</span>
      <span>{lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : "Not saved yet"}</span>
      <span className="path-text">{filePath ?? "No file selected"}</span>
    </footer>
  );
}

function countWords(markdown: string) {
  const matches = markdown.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

