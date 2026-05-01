import { useMemo, useState } from "react";
import {
  countCharacters,
  countWords,
  type CounterMode,
} from "../utils/editorStats";

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
  const [counterMode, setCounterMode] = useState<CounterMode>("words");
  const words = useMemo(() => countWords(markdown), [markdown]);
  const characters = countCharacters(markdown);
  const counterValue = counterMode === "words" ? words : characters;
  const counterLabel = counterMode === "words" ? "word" : "char";
  const saveState = getSaveState(isDirty, lastSavedAt, Boolean(filePath));
  const documentLabel = filePath ?? "untitled draft";
  const statusMessage = message === "Ready" ? "" : message;

  return (
    <footer className="status-bar">
      <span className="path-text">{documentLabel}</span>
      <span>{saveState}</span>
      <span className="status-message">{statusMessage}</span>
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

function getSaveState(
  isDirty: boolean,
  lastSavedAt: Date | null,
  hasFilePath: boolean,
) {
  if (isDirty) {
    return "Unsaved";
  }

  if (lastSavedAt) {
    return `saved ${lastSavedAt.toLocaleTimeString()}`;
  }

  return hasFilePath ? "saved" : "Unsaved";
}
