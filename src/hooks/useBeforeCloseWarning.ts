import { useEffect } from "react";
import { isRunningInTauri } from "../services/fileService";

export function useBeforeCloseWarning(isDirty: boolean) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isRunningInTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((event) => {
          if (!isDirty) {
            return;
          }

          const shouldClose = window.confirm(
            "You have unsaved changes. Do you want to close anyway?",
          );

          if (!shouldClose) {
            event.preventDefault();
          }
        }),
      )
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, [isDirty]);
}

