import { memo, useDeferredValue, useMemo, useState } from "react";
import {
  countCharacters,
  countWords,
  type CounterMode,
} from "../utils/editorStats";
import { getSaveState, type SaveState } from "../utils/saveState";

type StatusBarProps = {
  filePath: string | null;
  isDirty: boolean;
  lastSavedAt: Date | null;
  markdown: string;
  message: string;
};

function StatusBarComponent({
  filePath,
  isDirty,
  lastSavedAt,
  markdown,
  message,
}: StatusBarProps) {
  const [counterMode, setCounterMode] = useState<CounterMode>("words");
  // Counting scans the whole document, so keep it off the keystroke path. The
  // counter is allowed to lag a frame or two behind the text; typing is not.
  const countedMarkdown = useDeferredValue(markdown);
  const words = useMemo(() => countWords(countedMarkdown), [countedMarkdown]);
  const characters = useMemo(
    () => countCharacters(countedMarkdown),
    [countedMarkdown],
  );
  const counterValue = counterMode === "words" ? words : characters;
  const counterLabel = counterMode === "words" ? "word" : "char";
  const saveState = getSaveState({
    isDirty,
    hasSavedAt: Boolean(lastSavedAt),
    hasFilePath: Boolean(filePath),
  });
  const saveLabel = formatSaveState(saveState, lastSavedAt);
  const documentLabel = filePath ?? "untitled draft";
  const statusMessage = message === "Ready" ? "" : message;

  return (
    <footer className="status-bar">
      <span className="path-text">{documentLabel}</span>
      <span>{saveLabel}</span>
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

export const StatusBar = memo(StatusBarComponent);

function formatSaveState(saveState: SaveState, lastSavedAt: Date | null) {
  switch (saveState) {
    case "unsaved-changes":
      return "Unsaved";
    case "saved-at":
      return `saved ${lastSavedAt!.toLocaleTimeString()}`;
    case "saved":
      return "saved";
    case "new-draft":
      return "";
  }
}
