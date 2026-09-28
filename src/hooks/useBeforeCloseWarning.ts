import { useEffect, useRef } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isRunningInTauri } from "../services/fileService";

// Takes a function rather than a flag so the check can pull in an edit the
// rich editor has not reported yet (see flushDocuments in App.tsx).
export function useBeforeCloseWarning(hasUnsavedChanges: () => boolean) {
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (isRunningInTauri()) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!isRunningInTauri()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    appWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();

        if (!hasUnsavedChangesRef.current()) {
          await appWindow.destroy();
          return;
        }

        const shouldClose = await confirm(
          "You have unsaved changes. Close without saving?",
          {
            title: "Unsaved changes",
            kind: "warning",
            okLabel: "Close without saving",
            cancelLabel: "Keep editing",
          },
        );

        if (shouldClose) {
          await appWindow.destroy();
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, []);
}
