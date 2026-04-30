import { useMemo, useState } from "react";

type StatusBarProps = {
  filePath: string | null;
  isDirty: boolean;
  lastSavedAt: Date | null;
  markdown: string;
  message: string;
};

type CounterMode = "words" | "characters";

export function StatusBar({
  filePath,
  isDirty,
  lastSavedAt,
  markdown,
  message,
}: StatusBarProps) {
  const [counterMode, setCounterMode] = useState<CounterMode>("words");
  const words = useMemo(() => countWords(markdown), [markdown]);
  const characters = markdown.length;
  const counterValue = counterMode === "words" ? words : characters;
  const counterLabel = counterMode === "words" ? "word" : "char";

  return (
    <footer className="status-bar">
      <span>{isDirty ? "Unsaved" : "Saved"}</span>
      <span className="path-text">{filePath ?? "No file selected"}</span>
      <span className="status-message">{message}</span>
      <span>{lastSavedAt ? lastSavedAt.toLocaleTimeString() : "Not saved yet"}</span>
      <button
        type="button"
        className="counter-toggle"
        onClick={() =>
          setCounterMode((currentMode) =>
            currentMode === "words" ? "characters" : "words",
          )
        }
      >
        {counterValue} {counterValue === 1 ? counterLabel : `${counterLabel}s`}
      </button>
    </footer>
  );
}

function countWords(markdown: string) {
  const matches = markdown.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}
