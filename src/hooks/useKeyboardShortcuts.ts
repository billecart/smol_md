import { useEffect } from "react";
import { getShortcutAction } from "../utils/keyboardShortcuts";
import { isMacOs } from "../utils/platform";

type KeyboardShortcuts = {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleSourceMode?: () => void;
  onCloseTab?: () => void;
  onCloseWindow?: () => void;
  onFind?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
};

export function useKeyboardShortcuts({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onToggleSourceMode,
  onCloseTab,
  onCloseWindow,
  onFind,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onNextTab,
  onPreviousTab,
}: KeyboardShortcuts) {
  useEffect(() => {
    const isMac = isMacOs();

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getShortcutAction(event, isMac);

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "new") {
        onNew();
      } else if (action === "open") {
        onOpen();
      } else if (action === "save") {
        onSave();
      } else if (action === "saveAs") {
        onSaveAs();
      } else if (action === "toggleSource") {
        onToggleSourceMode?.();
      } else if (action === "closeTab") {
        onCloseTab?.();
      } else if (action === "closeWindow") {
        onCloseWindow?.();
      } else if (action === "find") {
        onFind?.();
      } else if (action === "zoomIn") {
        onZoomIn?.();
      } else if (action === "zoomOut") {
        onZoomOut?.();
      } else if (action === "zoomReset") {
        onZoomReset?.();
      } else if (action === "nextTab") {
        onNextTab?.();
      } else if (action === "previousTab") {
        onPreviousTab?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onNew,
    onOpen,
    onSave,
    onSaveAs,
    onToggleSourceMode,
    onCloseTab,
    onCloseWindow,
    onFind,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onNextTab,
    onPreviousTab,
  ]);
}
