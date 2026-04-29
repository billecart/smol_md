import { useEffect } from "react";

type KeyboardShortcuts = {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export function useKeyboardShortcuts({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
}: KeyboardShortcuts) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (!event.ctrlKey) {
        return;
      }

      if (key === "n") {
        event.preventDefault();
        onNew();
      }

      if (key === "o") {
        event.preventDefault();
        onOpen();
      }

      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        onSaveAs();
      } else if (key === "s") {
        event.preventDefault();
        onSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNew, onOpen, onSave, onSaveAs]);
}

